# Obligations — symulator obligacji

Responsywna aplikacja statyczna do symulowania wartości portfela obligacji skarbowych w czasie. Nie wymaga serwera ani konta; obliczenia działają w przeglądarce. Warunki emisji i dane portfela można edytować jako YAML, a zmiany są przechowywane wyłącznie w `localStorage` przeglądarki.

## Uruchomienie lokalne

Otwórz `index.html` w przeglądarce albo uruchom dowolny statyczny serwer HTTP w tym katalogu. Parser YAML jest pobierany z jsDelivr, więc potrzebne jest połączenie z internetem.

## Format YAML

Edytuj `emissions.yaml` oraz `portfolio.yaml` w aplikacji albo przed uruchomieniem. Wartości oprocentowania i stawki podatku podaje się jako procenty, np. `5.5` oznacza 5,5%. `annual_rates` to lista stóp dla kolejnych lat trwania obligacji; po wyczerpaniu listy używana jest ostatnia podana stopa.

```yaml
emissions:
  - id: MOJA-EMISJA
    name: Obligacje trzyletnie
    type: TOS
    term_months: 36
    price_per_bond: 100
    annual_rates: [5.5]
    accrual: annual_compound # lub simple
    redemption_fee_per_bond: 1.00
    redemption_fee_cap_per_bond: 1.00 # opcjonalny limit opłaty na obligację
    tax_rate: 19 # opcjonalnie; domyślnie 19%

holdings:
  - emission_id: MOJA-EMISJA
    quantity: 10
    purchase_date: 2025-01-15
    redemption_date: 2026-03-01 # opcjonalnie; puste/null = Target Date
  - emission_id: MOJA-EMISJA
    quantity: 5
    purchase_date: 2025-02-01
    redemption_date: "" # pusty tekst = bez wcześniejszego wykupu
```

W tabeli portfela można zmieniać emisję, ilość i daty, dodawać oraz usuwać pozycje. Zmiany aktualizują YAML i zapisują się lokalnie w przeglądarce. `redemption_date` pominięte albo `null` domyślnie przyjmuje aktualny `Target Date`; jawny pusty tekst `""` oznacza trzymanie obligacji do zapadalności. Nowe pozycje dostają ilość 1, dzisiejszą datę zakupu i aktualny `Target Date` jako datę wykupu.

Wymagane dla pozycji są `emission_id`, dodatnie całkowite `quantity` i prawidłowe `purchase_date`. Brakujące lub nieprawidłowe dane pokazują pozycję jako niekompletną; nie jest ona liczona ani rysowana. Wcześniejszy wykup musi przypadać po zakupie i nie później niż termin zapadalności.

## Zasady obliczeń

- Termin zapadalności to data zakupu powiększona o `term_months`.
- Odsetki naliczane są okresami od rocznicy zakupu; część roku jest proporcjonalna do liczby dni (`ACT/ACT` dla danego okresu). `annual_compound` kapitalizuje odsetki, a `simple` liczy je od ceny zakupu.
- `annual_rates` opisuje stopę dla kolejnych lat. Stopa nie jest automatycznie pobierana z rynku ani indeksowana inflacją — dla zmiennych emisji należy wpisać własny scenariusz stóp.
- Wartość przy wcześniejszym wykupie odejmuje opłatę za sztukę (ograniczoną opcjonalnym limitem) i szacunkowy podatek od dodatnich odsetek pozostałych po opłacie. Po wykupie wartość gotówki pozostaje stała, bez oprocentowania. Przy zapadalności opłata za wcześniejszy wykup nie jest naliczana.
- `Target Date` pokazuje wartość wykupionych do tego dnia pozycji. Koniec symulacji uwzględnia wartość całego portfela po terminie ostatniej obligacji.

Parametry demonstracyjne nie są oficjalnymi warunkami emisji. Wyniki mają charakter poglądowy i nie stanowią porady inwestycyjnej ani podatkowej.

## Publikacja na GitHub Pages

1. W ustawieniach repozytorium otwórz **Pages** i jako źródło wybierz **GitHub Actions**.
2. Wypchnij zawartość tego katalogu do gałęzi `main`. Workflow `.github/workflows/pages.yml` automatycznie publikuje pliki po każdym pushu; można go też uruchomić ręcznie w zakładce **Actions**.
3. Po zakończeniu workflow strona będzie dostępna pod adresem GitHub Pages repozytorium.

Pliki YAML zawierają wyłącznie przykładowe dane. Własne dane wpisuj w aplikacji — nie dodawaj ich do publicznego repozytorium.
