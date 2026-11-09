# Obligations — symulator obligacji

Responsywna aplikacja statyczna do symulowania wartości portfela obligacji skarbowych w czasie. Nie wymaga serwera ani konta; obliczenia działają w przeglądarce. Warunki emisji i dane portfela można edytować jako YAML, a zmiany są przechowywane wyłącznie w `localStorage` przeglądarki.

## Uruchomienie lokalne

Aby automatycznie wczytać prywatne `portfolio.local.yaml`, uruchom lokalny serwer HTTP w tym katalogu, np. `python3 -m http.server 8000`, a następnie otwórz `http://localhost:8000`. Samo otwarcie `index.html` jako `file://` nie pozwala przeglądarce wczytać lokalnego YAML. Parser YAML jest pobierany z jsDelivr, więc potrzebne jest połączenie z internetem.

## Format YAML

Edytuj `emissions.yaml` oraz `portfolio.local.yaml` przed uruchomieniem albo w polach YAML aplikacji (zmiany w aplikacji zapisują się w `localStorage`; pobrany portfel ma nazwę `portfolio.local.yaml`). Ten prywatny plik jest ignorowany przez Git i automatycznie wczytywany lokalnie, jeśli istnieje; opublikowana strona używa wyłącznie pustego `portfolio.yaml`. Wartości oprocentowania i stawki podatku podaje się jako procenty, np. `5.5` oznacza 5,5%. `annual_rates` to lista stóp dla kolejnych lat trwania obligacji; po wyczerpaniu listy używana jest ostatnia podana stopa.

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
    redemption_fee_first_period_cap_to_interest: true # opcjonalnie
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
- `annual_rates` opisuje stopy roczne, a `period_rates` — stopy dla okresów kuponowych, np. miesięcznych ROR. Stopy zmienne nie są automatycznie pobierane z rynku ani indeksowane inflacją — przyszłe okresy są scenariuszem.
- Emisje z `interest_payment_frequency` wypłacają odsetki w podanym rytmie. Symulacja nalicza stopę roczną proporcjonalnie do liczby dni (ACT/365), dolicza wcześniej wypłacone kupony po podatku do wartości portfela, a podatek od bieżącego kuponu szacuje przy wycenie. `redemption_fee_first_period_cap_to_interest: true` ogranicza opłatę do odsetek tylko w pierwszym okresie; `redemption_fee_cap_to_interest: true` stosuje ten limit w każdym okresie.
- Wartość przy wcześniejszym wykupie odejmuje opłatę za sztukę i szacunkowy podatek od dodatnich odsetek pozostałych po opłacie. Po wykupie wartość gotówki pozostaje stała, bez oprocentowania. Przy zapadalności opłata za wcześniejszy wykup nie jest naliczana.
- `Target Date` jest terminem, do którego trzeba pozyskać zadaną kwotę netto (`Target Amount`). Karta podsumowania pokazuje środki z pozycji zaplanowanych do wykupu do tej daty oraz naturalnych zapadalności.
- Planer dobiera całe pozycje do wcześniejszego wykupu w `Target Date`, minimalizując szacowaną utratę wartości wobec trzymania ich do końca symulacji. Uwzględnia kwoty netto z naturalnych wykupów przed terminem celu, a pozycje kupione po dacie celu pomija. Wyznaczoną rekomendację można zastosować do portfela; nadpisuje daty wykupu kompletnych pozycji.
- Ranking likwidacji w tabeli jest heurystyką. Sortuje po szacowanej wartości netto utraconych przyszłych odsetek na każde 1 000 zł dostępne przy wykupie w `Target Date`; niższy koszt oznacza wcześniejszego kandydata, wyższy — pozycję do zostawienia na koniec. Wynik 0–100 to `100 - zaokrąglony koszt w zł na 1 000 zł`, ograniczony do tego zakresu. Kupony COI po podatku i koszt wykupu są uwzględniane w obliczeniu. To ranking pozycji pojedynczo, nie zamiennik dokładnego planera portfelowego.
- Koniec symulacji uwzględnia wartość całego portfela po terminie ostatniej obligacji.

Wpisana kwota domyślna wynosi 1 000 000 zł i można ją zmienić. Planer jest dokładny dla analizowanych kombinacji, ale dla bardzo dużych portfeli może odmówić wyliczenia zamiast zwrócić przybliżony plan. Wyniki zależą od poprawności wpisanych stóp, opłat i zasad naliczania; mają charakter poglądowy i nie stanowią porady inwestycyjnej ani podatkowej.

## Zweryfikowane emisje COI

`emissions.yaml` zawiera tylko emisje z przekazanych danych: TOS0627, TOS0827, TOS0927, TOS1127, TOS0128, TOS0328, TOS0428; COI0628, COI0828, COI0928, COI1028, COI0129, COI0229, COI0429, COI0529, COI0729, COI0829, COI0929, COI1029; oraz ROR0327. Dane pierwszego okresu, ceny i opłaty pochodzą z oficjalnych listów emisyjnych. Stopy przyszłych okresów COI (4%) i ROR (powtarzane 4,25%) są założeniami scenariusza, a nie przyszłą znaną stopą inflacji lub NBP — zmień je przed interpretacją wyników.

Prywatne pozycje i ilości przechowuj wyłącznie w `portfolio.local.yaml` albo w lokalnej pamięci przeglądarki. Nie wpisuj ich do `portfolio.yaml`, który jest publikowany w repozytorium. Przed commitem sprawdź `git check-ignore portfolio.local.yaml` i `git status --short`.

## Publikacja na GitHub Pages

1. W ustawieniach repozytorium otwórz **Pages** i jako źródło wybierz **GitHub Actions**.
2. Wypchnij zawartość tego katalogu do gałęzi `main`. Workflow `.github/workflows/pages.yml` automatycznie publikuje pliki po każdym pushu; można go też uruchomić ręcznie w zakładce **Actions**.
3. Po zakończeniu workflow strona będzie dostępna pod adresem GitHub Pages repozytorium.

`portfolio.yaml` jest pustym plikiem startowym publikowanym w repozytorium. Prywatne dane znajdują się w ignorowanym przez Git `portfolio.local.yaml` i nie wolno go dodawać do commita.
