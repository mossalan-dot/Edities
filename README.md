# Edities

Een lichtgewicht, statisch platform om **wetenschappelijke edities van vroegmoderne
teksten** te tonen — gedrukte werken én handschriften. Zonder bouwstap of framework:
alleen HTML, CSS en een beetje JavaScript. Klaar om te hosten op bijvoorbeeld GitHub Pages.

## Wat het kan

- **Automatische regelnummering** gekoppeld aan de bronregels (verspringt om de N regels).
- **Meerdere notenapparaten**, elk afzonderlijk aan/uit te zetten:
  woordverklaringen, toelichting/commentaar, bronverwijzingen, tekstkritisch apparaat,
  en de **oorspronkelijke voet- en eindnoten van de auteur** (apart gehouden van editeursnoten).
- **Kritische/genormaliseerde tekst** met editeursingrepen (toevoeging ⟨⟩, onzekere lezing [?],
  opgeloste afkortingen, lacunes) en een vast onderdeel *Verantwoording*.
- **Typografie**: cursief, kleinkapitaal, super-/subscript.
- **Facsimilekoppeling**: pagina-/foliomarkeringen die een pdf-pagina of een scan openen.
- **Inleiding / Tekst / Verantwoording / Facsimile** als tabbladen per editie.
- Licht/donker thema, afdrukvriendelijk.

## Structuur

```
index.html                     overzichtspagina met alle edities
spelregels.html                documentatie van de markup
assets/
  editie.js                    parser + renderer van de editie-markup
  site.js                      thema-schakelaar en tabbladen
  stijl.css                    vormgeving
edities/
  reisjournaal-demo/
    index.html                 editiepagina (inleiding/tekst/verantwoording/facsimile)
    bron.txt                   de tekst in editie-markup
    facsimile/                 scans (hier voorbeeld-SVG's)
```

## Een nieuwe editie toevoegen

1. Maak een map onder `edities/`.
2. Schrijf `bron.txt` volgens de [spelregels](spelregels.html).
3. Kopieer een `index.html` van een bestaande editie en pas inleiding + verantwoording aan.
4. Zet de scans in `facsimile/` (of verwijs naar een pdf).
5. Voeg een kaart toe op `index.html` in de hoofdmap.

## Lokaal bekijken

De tekst wordt met `fetch()` geladen, dus open de site via een webserver:

```
python3 -m http.server
# open http://localhost:8000/
```

## Status

Prototype. De demonstratie-editie (`reisjournaal-demo`) bevat **geen echte bron** maar
een voorbeeldtekst in periodestijl, bedoeld om alle functies te tonen. Geplande echte
edities: de gedrukte satire *Apollo sergeant* van Arend Fokke Simonsz, en handschriftelijke
reisverslagen (o.a. van [alanmoss.nl](https://alanmoss.nl)).
