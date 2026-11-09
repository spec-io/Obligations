(() => {
  "use strict";

  const STORAGE = {
    emissions: "obligacje-symulator-emissions",
    portfolio: "obligacje-symulator-portfolio"
  };
  const COLORS = ["#35845d", "#527f9d", "#c48643", "#8175a7", "#4d9b91", "#bb6971", "#80934f", "#5476b4"];
  const $ = (id) => document.getElementById(id);
  const els = {
    emissions: $("emissions-input"),
    portfolio: $("portfolio-input"),
    emissionStatus: $("emissions-status"),
    portfolioStatus: $("portfolio-status"),
    positions: $("positions-body"),
    chart: $("portfolio-chart"),
    chartWrap: $("chart-wrap"),
    tooltip: $("chart-tooltip"),
    legend: $("chart-legend"),
    empty: $("chart-empty"),
    targetDate: $("target-date")
  };

  let emissionRows = [];
  let holdings = [];
  let validPositions = [];
  let chartState = null;
  let parseReady = false;

  const todayISO = () => {
    const now = new Date();
    return dateISO(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
  };
  const dateISO = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  const parseDate = (value) => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
    }
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
  };
  const addMonths = (date, months) => {
    const targetMonth = date.getUTCMonth() + months;
    const year = date.getUTCFullYear() + Math.floor(targetMonth / 12);
    const month = ((targetMonth % 12) + 12) % 12;
    const day = Math.min(date.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
    return new Date(Date.UTC(year, month, day));
  };
  const daysBetween = (start, end) => (end.getTime() - start.getTime()) / 86400000;
  const money = (value) => new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);
  const shortDate = (date) => new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
  const percent = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;

  function setStatus(element, text, kind = "") {
    element.textContent = text;
    element.className = `editor-status${kind ? ` ${kind}` : ""}`;
  }

  function displayDate(value) {
    const date = parseDate(value);
    return date ? shortDate(date) : "—";
  }

  function getYaml(text, label) {
    if (!window.jsyaml) throw new Error("Nie udało się załadować parsera YAML. Sprawdź połączenie z internetem i odśwież stronę.");
    try {
      return window.jsyaml.load(text, { schema: window.jsyaml.DEFAULT_SCHEMA });
    } catch (error) {
      const location = error.mark ? ` (wiersz ${error.mark.line + 1})` : "";
      throw new Error(`${label}: ${error.message.split("\n")[0]}${location}`);
    }
  }

  function validateEmission(row, index) {
    const problems = [];
    if (!row || typeof row !== "object" || Array.isArray(row)) return { problems: ["nieprawidłowy opis emisji"] };
    if (typeof row.id !== "string" || !row.id.trim()) problems.push("brak identyfikatora emisji");
    if (typeof row.name !== "string" || !row.name.trim()) problems.push("brak nazwy emisji");
    if (!Number.isInteger(row.term_months) || row.term_months < 1) problems.push("term_months musi być dodatnią liczbą całkowitą");
    if (typeof row.price_per_bond !== "number" || !Number.isFinite(row.price_per_bond) || row.price_per_bond <= 0) problems.push("price_per_bond musi być dodatnią kwotą");
    if (!Array.isArray(row.annual_rates) || row.annual_rates.length === 0 || !row.annual_rates.every(percent)) problems.push("annual_rates musi zawierać stopy procentowe od 0 do 100");
    if (row.accrual !== undefined && !["annual_compound", "simple"].includes(row.accrual)) problems.push("accrual: użyj annual_compound lub simple");
    if (row.redemption_fee_per_bond !== undefined && (typeof row.redemption_fee_per_bond !== "number" || !Number.isFinite(row.redemption_fee_per_bond) || row.redemption_fee_per_bond < 0)) problems.push("redemption_fee_per_bond nie może być ujemne");
    if (row.redemption_fee_cap_per_bond !== undefined && (typeof row.redemption_fee_cap_per_bond !== "number" || !Number.isFinite(row.redemption_fee_cap_per_bond) || row.redemption_fee_cap_per_bond < 0)) problems.push("redemption_fee_cap_per_bond nie może być ujemne");
    if (row.tax_rate !== undefined && !percent(row.tax_rate)) problems.push("tax_rate musi być procentem od 0 do 100");
    return { problems, index };
  }

  function readEmissions() {
    const data = getYaml(els.emissions.value, "Emisje");
    if (!data || !Array.isArray(data.emissions)) throw new Error("Emisje: oczekiwano listy `emissions`.");
    const ids = new Set();
    const rows = data.emissions.map((row, index) => {
      const result = validateEmission(row, index);
      if (row && typeof row.id === "string" && ids.has(row.id)) result.problems.push(`powtórzony identyfikator ${row.id}`);
      if (row && typeof row.id === "string") ids.add(row.id);
      return { data: row, problems: result.problems };
    });
    emissionRows = rows;
  }

  function readHoldings() {
    const data = getYaml(els.portfolio.value, "Portfel");
    if (!data || !Array.isArray(data.holdings)) throw new Error("Portfel: oczekiwano listy `holdings`.");
    holdings = data.holdings.map((row, index) => {
      const problems = [];
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        return { data: {}, problems: ["nieprawidłowy opis pozycji"], index };
      }
      if (typeof row.emission_id !== "string" || !row.emission_id.trim()) problems.push("brak identyfikatora emisji");
      if (!Number.isInteger(row.quantity) || row.quantity <= 0) problems.push("ilość musi być dodatnią liczbą całkowitą");
      const purchase = parseDate(row.purchase_date);
      if (!purchase) problems.push("brak lub nieprawidłowa data zakupu");
      const redemptionMissing = row.redemption_date === null || row.redemption_date === undefined || row.redemption_date === "";
      const redemption = redemptionMissing ? null : parseDate(row.redemption_date);
      if (!redemptionMissing && !redemption) problems.push("nieprawidłowa data wykupu");
      const emissionRecord = emissionRows.find((candidate) => candidate.data && candidate.data.id === row.emission_id);
      if (!emissionRecord) problems.push(`nieznana emisja: ${row.emission_id || "brak"}`);
      else if (emissionRecord.problems.length) problems.push(`niekompletne warunki emisji ${row.emission_id}`);
      if (purchase && redemption && redemption <= purchase) problems.push("wykup musi być po dacie zakupu");
      if (purchase && emissionRecord && !emissionRecord.problems.length && redemption) {
        const maturity = addMonths(purchase, emissionRecord.data.term_months);
        if (redemption > maturity) problems.push("wykup przypada po terminie zapadalności");
      }
      return { data: row, problems, purchase, redemption, emission: emissionRecord && emissionRecord.data, index };
    });
  }

  function calculateGross(emission, purchase, date) {
    const maturity = addMonths(purchase, emission.term_months);
    const end = date > maturity ? maturity : date;
    if (end <= purchase) return { principal: emission.price_per_bond, interest: 0, maturity };
    const principal = emission.price_per_bond;
    let balance = principal;
    let simpleInterest = 0;
    let cursor = purchase;
    let yearIndex = 0;
    while (cursor < end) {
      const nextAnniversary = addMonths(purchase, 12 * (yearIndex + 1));
      const periodEnd = nextAnniversary < maturity ? nextAnniversary : maturity;
      const actualEnd = end < periodEnd ? end : periodEnd;
      const fraction = Math.max(0, daysBetween(cursor, actualEnd) / daysBetween(cursor, nextAnniversary));
      const ratePercent = emission.annual_rates[Math.min(yearIndex, emission.annual_rates.length - 1)];
      const rate = ratePercent / 100;
      if (emission.accrual === "simple") simpleInterest += principal * rate * fraction;
      else balance *= Math.pow(1 + rate, fraction);
      cursor = periodEnd;
      yearIndex++;
      if (yearIndex > 100) throw new Error(`Emisja ${emission.id}: okres naliczania jest zbyt długi.`);
    }
    const interest = emission.accrual === "simple" ? simpleInterest : balance - principal;
    return { principal, interest: Math.max(0, interest), maturity };
  }

  function positionValue(position, date) {
    const { emission, purchase, redemption } = position;
    const maturity = addMonths(purchase, emission.term_months);
    const earlyRedemption = redemption && redemption < maturity;
    const payoutDate = earlyRedemption ? redemption : maturity;
    if (date < purchase) return { value: 0, interest: 0, fee: 0, tax: 0, paidOut: false, maturity, payoutDate };
    const valuedAt = date < payoutDate ? date : payoutDate;
    const gross = calculateGross(emission, purchase, valuedAt);
    const feePerBond = earlyRedemption && valuedAt >= redemption
      ? Math.min(emission.redemption_fee_per_bond || 0, emission.redemption_fee_cap_per_bond ?? Infinity)
      : 0;
    const fee = feePerBond * position.data.quantity;
    const interest = gross.interest * position.data.quantity;
    const taxableInterest = Math.max(0, interest - fee);
    const tax = taxableInterest * ((emission.tax_rate ?? 19) / 100);
    const net = Math.max(0, gross.principal * position.data.quantity + interest - fee - tax);
    return { value: net, interest, fee, tax, paidOut: date >= payoutDate, maturity, payoutDate };
  }

  function renderTable() {
    els.positions.replaceChildren();
    validPositions = [];
    holdings.forEach((position) => {
      const { data, problems, emission, purchase, redemption, index } = position;
      if (!problems.length) validPositions.push(position);
      const row = document.createElement("tr");
      if (problems.length) row.className = "incomplete-row";
      const issue = document.createElement("td");
      const issueName = document.createElement("span");
      issueName.className = "issue-name";
      issueName.textContent = emission?.name || data.emission_id || "Nieuzupełniona pozycja";
      const issueCode = document.createElement("span");
      issueCode.className = "issue-code";
      issueCode.textContent = data.emission_id && emission ? `${data.emission_id} · ${emission.type || "Obligacja"}` : data.emission_id || "Brak ID emisji";
      issue.append(issueName, issueCode);
      const quantity = document.createElement("td");
      quantity.textContent = Number.isInteger(data.quantity) && data.quantity > 0 ? `${data.quantity} szt.` : "—";
      const purchaseCell = document.createElement("td");
      purchaseCell.textContent = displayDate(data.purchase_date);
      const redemptionCell = document.createElement("td");
      redemptionCell.textContent = redemption ? shortDate(redemption) : "Do zapadalności";
      const status = document.createElement("td");
      const chip = document.createElement("span");
      chip.className = `status-chip${problems.length ? " status-incomplete" : ""}`;
      chip.textContent = problems.length ? "Do uzupełnienia" : "W symulacji";
      status.append(chip);
      if (problems.length) {
        const details = document.createElement("div");
        details.className = "missing-details";
        details.textContent = problems.join(" · ");
        details.title = `Pozycja ${index + 1}: ${problems.join("; ")}`;
        status.append(details);
      }
      row.append(issue, quantity, purchaseCell, redemptionCell, status);
      els.positions.append(row);
    });
    $("position-badge").textContent = `${holdings.length} ${holdings.length === 1 ? "pozycja" : "pozycji"}`;
    $("position-count").textContent = String(validPositions.length);
    $("position-caption").textContent = holdings.length === validPositions.length
      ? "kompletne pozycje w symulacji"
      : `${holdings.length - validPositions.length} niekompletnych · pominiętych`;
  }

  function updateSummary() {
    if (!validPositions.length) {
      $("current-value").textContent = "—";
      $("target-value").textContent = "—";
      $("end-value").textContent = "—";
      $("current-caption").textContent = "brak kompletnych pozycji";
      $("target-caption").textContent = "brak wykupionych pozycji";
      $("end-caption").textContent = "uzupełnij dane portfela";
      return;
    }
    const endDate = validPositions.reduce((latest, position) => {
      const maturity = addMonths(position.purchase, position.emission.term_months);
      return !latest || maturity > latest ? maturity : latest;
    }, null);
    const today = parseDate(todayISO());
    const currentTotal = validPositions.reduce((sum, position) => sum + positionValue(position, today).value, 0);
    const target = parseDate(els.targetDate.value);
    const redeemedByTarget = target ? validPositions.reduce((sum, position) => {
      return position.redemption && position.redemption <= target
        ? sum + positionValue(position, target).value
        : sum;
    }, 0) : 0;
    const endTotal = validPositions.reduce((sum, position) => sum + positionValue(position, endDate).value, 0);
    $("current-value").textContent = money(currentTotal);
    $("current-caption").textContent = `na ${shortDate(today)}`;
    $("target-value").textContent = money(redeemedByTarget);
    $("target-caption").textContent = target ? `wykupione pozycje do ${shortDate(target)}` : "wybierz datę docelową";
    $("end-value").textContent = money(endTotal);
    $("end-caption").textContent = `na ${shortDate(endDate)}`;
    $("chart-range").textContent = `Zakres: ${shortDate(chartState?.start || today)} — ${shortDate(endDate)}`;
  }

  function svgNode(name, attrs = {}) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    return node;
  }

  function renderChart() {
    els.chart.replaceChildren();
    els.legend.replaceChildren();
    els.tooltip.hidden = true;
    chartState = null;
    if (!validPositions.length) {
      els.empty.hidden = false;
      updateSummary();
      return;
    }
    els.empty.hidden = true;
    const start = validPositions.reduce((earliest, p) => !earliest || p.purchase < earliest ? p.purchase : earliest, null);
    const end = validPositions.reduce((latest, p) => {
      const maturity = addMonths(p.purchase, p.emission.term_months);
      return !latest || maturity > latest ? maturity : latest;
    }, null);
    const duration = Math.max(1, daysBetween(start, end));
    const count = Math.min(220, Math.max(48, Math.ceil(duration / 16)));
    const dates = new Map();
    for (let i = 0; i <= count; i++) {
      const offset = Math.round(duration * i / count);
      const date = new Date(start.getTime() + offset * 86400000);
      dates.set(dateISO(date), date);
    }
    validPositions.forEach((p) => {
      dates.set(dateISO(p.purchase), p.purchase);
      dates.set(dateISO(addMonths(p.purchase, p.emission.term_months)), addMonths(p.purchase, p.emission.term_months));
      if (p.redemption) dates.set(dateISO(p.redemption), p.redemption);
    });
    const timeline = [...dates.values()].sort((a, b) => a - b);
    const series = validPositions.map((position, index) => ({
      position,
      color: COLORS[index % COLORS.length],
      values: timeline.map((date) => positionValue(position, date).value)
    }));
    const maxValue = Math.max(1, ...series.flatMap((item) => item.values));
    const width = 900, height = 320;
    const margin = { top: 14, right: 18, bottom: 40, left: 67 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const x = (date) => margin.left + daysBetween(start, date) / duration * plotWidth;
    const y = (value) => margin.top + (1 - value / (maxValue * 1.12)) * plotHeight;
    els.chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
    els.chart.setAttribute("preserveAspectRatio", "none");

    for (let i = 0; i <= 4; i++) {
      const value = maxValue * 1.12 * i / 4;
      const yy = y(value);
      els.chart.append(svgNode("line", { x1: margin.left, x2: width - margin.right, y1: yy, y2: yy, stroke: "#edf0ed", "stroke-width": 1 }));
      const label = svgNode("text", { x: margin.left - 10, y: yy + 3, "text-anchor": "end", fill: "#98a199", "font-size": 9, "font-family": "DM Sans, sans-serif" });
      label.textContent = compactMoney(value);
      els.chart.append(label);
    }
    const monthStep = duration > 1500 ? 12 : duration > 700 ? 6 : duration > 260 ? 3 : 1;
    let monthDate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    if (monthDate < start) monthDate = addMonths(monthDate, monthStep);
    for (let i = 0; i < 16 && monthDate <= end; i++, monthDate = addMonths(monthDate, monthStep)) {
      const xx = x(monthDate);
      const label = svgNode("text", { x: xx, y: height - 12, "text-anchor": "middle", fill: "#98a199", "font-size": 9, "font-family": "DM Sans, sans-serif" });
      label.textContent = new Intl.DateTimeFormat("pl-PL", { month: "short", year: "2-digit", timeZone: "UTC" }).format(monthDate);
      els.chart.append(label);
    }

    series.forEach((item, index) => {
      const points = timeline.map((date, i) => `${x(date).toFixed(2)},${y(item.values[i]).toFixed(2)}`).join(" ");
      const path = svgNode("polyline", { points, fill: "none", stroke: item.color, "stroke-width": index === 0 ? 2.8 : 2.4, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: .92 });
      els.chart.append(path);
      const position = item.position;
      const legend = document.createElement("span");
      legend.className = "legend-item";
      const swatch = document.createElement("i");
      swatch.className = "legend-swatch";
      swatch.style.backgroundColor = item.color;
      const text = document.createElement("span");
      text.textContent = position.emission.name || position.emission.id;
      legend.append(swatch, text);
      els.legend.append(legend);
    });

    const hoverLine = svgNode("line", { x1: margin.left, x2: margin.left, y1: margin.top, y2: height - margin.bottom, stroke: "#9aa99d", "stroke-dasharray": "3 4", "stroke-width": 1, visibility: "hidden" });
    const hoverPoints = series.map((item) => svgNode("circle", { cx: margin.left, cy: margin.top, r: 4, fill: item.color, stroke: "white", "stroke-width": 2, visibility: "hidden" }));
    els.chart.append(hoverLine, ...hoverPoints);
    const overlay = svgNode("rect", { x: margin.left, y: margin.top, width: plotWidth, height: plotHeight, fill: "transparent", "pointer-events": "all", "data-chart-overlay": "true", tabindex: "0", "aria-label": "Interaktywny wykres. Użyj klawiszy strzałek, aby zmienić datę." });
    els.chart.append(overlay);
    chartState = { start, end, duration, timeline, series, x, y, margin, width, height, plotWidth, plotHeight, hoverLine, hoverPoints };
    const showAt = (clientX, clientY) => {
      const rect = els.chart.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, ((clientX - rect.left) / rect.width * width - margin.left) / plotWidth));
      const date = new Date(start.getTime() + Math.round(duration * fraction) * 86400000);
      updateTooltip(date, clientX, clientY);
    };
    overlay.addEventListener("pointermove", (event) => showAt(event.clientX, event.clientY));
    overlay.addEventListener("pointerdown", (event) => showAt(event.clientX, event.clientY));
    overlay.addEventListener("pointerleave", () => {
      els.tooltip.hidden = true;
      hoverLine.setAttribute("visibility", "hidden");
      hoverPoints.forEach((point) => point.setAttribute("visibility", "hidden"));
    });
    overlay.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const step = Math.max(1, Math.round(duration / 100));
      const current = els.tooltip.dataset.date ? parseDate(els.tooltip.dataset.date) : start;
      const next = new Date(current.getTime() + (event.key === "ArrowRight" ? step : -step) * 86400000);
      updateTooltip(next < start ? start : next > end ? end : next, rectCenter(els.chart).x, rectCenter(els.chart).y);
    });
    updateSummary();
  }

  function compactMoney(value) {
    if (value >= 1000000) return `${(value / 1000000).toLocaleString("pl-PL", { maximumFractionDigits: 1 })} mln`;
    if (value >= 1000) return `${(value / 1000).toLocaleString("pl-PL", { maximumFractionDigits: 0 })} tys.`;
    return `${Math.round(value)} zł`;
  }

  function rectCenter(element) {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + 10 };
  }

  function updateTooltip(date, clientX, clientY) {
    if (!chartState) return;
    const clampedDate = date < chartState.start ? chartState.start : date > chartState.end ? chartState.end : date;
    const dateKey = dateISO(clampedDate);
    const { series, x, y, hoverLine, hoverPoints } = chartState;
    const px = x(clampedDate);
    hoverLine.setAttribute("x1", px);
    hoverLine.setAttribute("x2", px);
    hoverLine.setAttribute("visibility", "visible");
    let total = 0;
    const values = series.map((item, index) => {
      const value = positionValue(item.position, clampedDate).value;
      total += value;
      hoverPoints[index].setAttribute("cx", px);
      hoverPoints[index].setAttribute("cy", y(value));
      hoverPoints[index].setAttribute("visibility", clampedDate < item.position.purchase ? "hidden" : "visible");
      return { item, value, position: item.position };
    });
    const tip = els.tooltip;
    tip.replaceChildren();
    const title = document.createElement("div");
    title.className = "tooltip-date";
    title.textContent = shortDate(clampedDate);
    tip.append(title);
    values.forEach(({ item, value, position }) => {
      const row = document.createElement("div");
      row.className = "tooltip-row";
      const name = document.createElement("span");
      name.className = "tooltip-name";
      name.textContent = position.emission.name || position.emission.id;
      name.style.color = item.color;
      const amount = document.createElement("strong");
      amount.textContent = money(value);
      row.append(name, amount);
      tip.append(row);
    });
    const totalRow = document.createElement("div");
    totalRow.className = "tooltip-total";
    const totalLabel = document.createElement("span");
    totalLabel.textContent = "Suma portfela";
    const totalAmount = document.createElement("strong");
    totalAmount.textContent = money(total);
    totalRow.append(totalLabel, totalAmount);
    tip.append(totalRow);
    tip.dataset.date = dateKey;
    tip.hidden = false;
    const wrapRect = els.chartWrap.getBoundingClientRect();
    const localX = clientX - wrapRect.left;
    const localY = clientY - wrapRect.top;
    tip.style.left = `${Math.max(7, Math.min(wrapRect.width - 205, localX + 14))}px`;
    tip.style.top = `${Math.max(6, Math.min(wrapRect.height - 155, localY - 24))}px`;
  }

  function runSimulation() {
    if (!parseReady) return;
    try {
      readEmissions();
      setStatus(els.emissionStatus, `${emissionRows.length} emisji · poprawny YAML`);
    } catch (error) {
      setStatus(els.emissionStatus, error.message, "error");
      return;
    }
    try {
      readHoldings();
      const incomplete = holdings.filter((position) => position.problems.length).length;
      setStatus(els.portfolioStatus, incomplete ? `${holdings.length} pozycji · ${incomplete} do uzupełnienia` : `${holdings.length} pozycji · poprawny YAML`, incomplete ? "warning" : "");
      renderTable();
      renderChart();
    } catch (error) {
      setStatus(els.portfolioStatus, error.message, "error");
    }
  }

  function loadSavedOrExample(key, filename) {
    const saved = localStorage.getItem(STORAGE[key]);
    if (saved !== null) return Promise.resolve(saved);
    return fetch(`./${filename}`).then((response) => {
      if (!response.ok) throw new Error(`Nie udało się wczytać ${filename} (${response.status}).`);
      return response.text();
    });
  }

  function save(key, text) {
    try {
      localStorage.setItem(STORAGE[key], text);
    } catch (error) {
      console.error("Nie udało się zapisać danych lokalnie.", error);
      setStatus(key === "emissions" ? els.emissionStatus : els.portfolioStatus, "Błąd zapisu lokalnego — sprawdź ustawienia przeglądarki", "error");
    }
  }

  function downloadYaml(key) {
    const text = key === "emissions" ? els.emissions.value : els.portfolio.value;
    const blob = new Blob([text], { type: "text/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = key === "emissions" ? "emissions.yaml" : "portfolio.yaml";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function initialize() {
    if (!window.jsyaml) {
      setStatus(els.emissionStatus, "Parser YAML niedostępny — sprawdź połączenie z internetem", "error");
      setStatus(els.portfolioStatus, "Parser YAML niedostępny — sprawdź połączenie z internetem", "error");
      return;
    }
    Promise.all([
      loadSavedOrExample("emissions", "emissions.yaml"),
      loadSavedOrExample("portfolio", "portfolio.yaml")
    ]).then(([emissions, portfolio]) => {
      els.emissions.value = emissions;
      els.portfolio.value = portfolio;
      parseReady = true;
      if (!els.targetDate.value) els.targetDate.value = todayISO();
      runSimulation();
    }).catch((error) => {
      setStatus(els.emissionStatus, error.message, "error");
      setStatus(els.portfolioStatus, "Nie udało się wczytać danych przykładowych", "error");
    });
  }

  els.emissions.addEventListener("input", () => {
    save("emissions", els.emissions.value);
    runSimulation();
  });
  els.portfolio.addEventListener("input", () => {
    save("portfolio", els.portfolio.value);
    runSimulation();
  });
  els.targetDate.addEventListener("change", updateSummary);
  document.querySelectorAll("[data-download]").forEach((button) => {
    button.addEventListener("click", () => downloadYaml(button.dataset.download));
  });
  $("reset-data").addEventListener("click", () => {
    if (!window.confirm("Przywrócić przykładowe dane? Zastąpią one zapisane dane w tej przeglądarce.")) return;
    localStorage.removeItem(STORAGE.emissions);
    localStorage.removeItem(STORAGE.portfolio);
    window.location.reload();
  });
  initialize();
})();
