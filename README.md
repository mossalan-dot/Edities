# Edities

Een lichtgewicht, statisch platform om **wetenschappelijke edities van vroegmoderne
teksten** te tonen — gedrukte werken én handschriften. Zonder bouwstap of framework:
alleen HTML, CSS en een beetje JavaScript. Klaar om te hosten op bijvoorbeeld GitHub Pages.

## Wat het kan

- **Automatische regelnummering** gekoppeld aan de bronregels (verspringt om de N regels).
- **Meerdere notenapparaten**, elk afzonderlijk aan/uit te zetten (woordverklaringen,
  toelichting/commentaar, tekstkritisch apparaat, en de **oorspronkelijke noten van de auteur**,
  apart gehouden van editeursnoten). Welke apparaten een editie heeft, bepaalt u zelf in de kop.
- **Geen nootcijfers in de tekst**: geannoteerde woorden zijn subtiel onderstreept; hover of klik
  toont de noot. Onderaan staan alle noten per apparaat verzameld.
- **Geneste noten**: een editeur kan een noot maken óp een noot van de auteur.
- **Kritische/genormaliseerde tekst** met editeursingrepen (toevoeging ⟨⟩, onzekere lezing [?],
  opgeloste afkortingen, lacunes) en een vast onderdeel *Verantwoording*.
- **Typografie**: cursief, kleinkapitaal, doorhaling, super-/subscript, drie kopniveaus.
- **Koppeling naar het origineel**: pagina-/foliomarkeringen die een pdf-pagina of een scan openen.
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
  van-der-meersch/             echte editie: Reisverhaal van Abraham van der Meersch
    index.html                 inleiding / tekst / verantwoording / origineel
    bron.txt                   transcriptie in editie-markup
    origineel/                 handschriftscan(s)
  reisjournaal-demo/           demonstratie van alle functies
    index.html
    bron.txt
    facsimile/                 voorbeeld-SVG's
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

Prototype. `van-der-meersch` is een echte editie (openingsfragment van het reisverhaal, met de
oorspronkelijke editeursnoten en de handschriftscan van pagina 1). `reisjournaal-demo` bevat
**geen echte bron** maar een voorbeeldtekst in periodestijl, bedoeld om álle functies te tonen
(geneste noten, tekstkritisch apparaat, doorhaling, facsimile-lightbox). Geplande edities: de
gedrukte satire *Apollo sergeant* van Arend Fokke Simonsz, en meer reisverslagen
(o.a. van [alanmoss.nl](https://alanmoss.nl)).
