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
- **Origineel naast de tekst**: togglebare gesplitste weergave waarin de scan (of pdf-pagina)
  van de pagina die u leest meescrollend naast de transcriptie staat.
- **Dagtekeningen** (`@ 1674-02-23 | 23 februari 1674`): navigatie per dag, met
  stilo-vetus/novo-normalisatie; op de Van der Meersch-editie gekoppeld aan de routekaart
  (klik op een stip → die dag in de tekst, en andersom).
- **Citeerhulp en permalinks**: een Citeer-knop in de werkbalk (verwijzing + permalink naar
  de huidige pagina), klikbare regelnummers die een `#rN`-link kopiëren, en dieplinks
  `#pagina-N` / `#rN` die direct naar de juiste plaats springen.
- **Bewaarde weergave-instellingen**: apparaat-toggles, leesmodus en weergaveopties blijven
  per editie bewaard (localStorage).
- **Spellingtolerant zoeken** (aan/uit te zetten): vroegmoderne spellingvariatie wordt
  meegezocht — u/v, i/j/y, c/k, s/z, d/t, g(h), klinkerclusters en accenten. Zo vindt
  *Enkhuizen* ook *Enchuijzen*, en *jaar* ook *jaer*. Het zoeken beslaat ook de
  **noten** (van de aanstaande apparaten); een treffer in een noot opent de
  bijbehorende kantnoot.
- **Facsimile-zoom**: in de lightbox kan met scrollwiel, dubbelklik, knoppen of toetsen
  (+/−/0) worden gezoomd en gesleept.
- **Export**: TEI-XML (voor uitwisseling met andere DH-gereedschappen) en platte leestekst,
  te downloaden via de Citeer-knop in de werkbalk.
- **Sneltoetsen**: `/` focust het zoekveld; `←`/`→` bladeren in de paginaweergave.
- Licht/donker thema, afdrukvriendelijk, description/Open-Graph-metadata per pagina.

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

## Schrijven in Obsidian (aanbevolen werkwijze)

Je hoeft niet rechtstreeks in het runtime-formaat (`bron.txt`) te schrijven. Prettiger is
een schoon **`editie.md`** dat je in Obsidian kunt bewerken:

- de **hoofdtekst** blijft schoon (geen nootmarkeringen), met alinea's, koppen (`#`/`##`/`###`),
  paginamarkeringen (`~ label | doel`) en typografie (`{sc:}`, `{ab:}`, …);
- daaronder, na een regel `=== NOTEN ===`, een **notenblok** met per regel
  `lemma | code | inhoud`. Het lemma is het woord of de woordgroep waar de noot bij hoort;
  voor een lange passage: `eerste woord … laatste woord`. Komt een lemma meer dan eens voor,
  kies dan het n-de met `lemma (2)`.

Omdat de hoofdtekst schoon blijft, botst niets met Obsidians eigen `[[ ]]`-links, en zijn
overlappende/geneste annotaties geen probleem. De importer vindt elk lemma terug en genereert
`bron.txt`:

```
python3 importeer.py edities/<slug>/editie.md
```

*Nesting werkt:* een commentaarnoot over een hele passage met daarbinnen losse
woordverklaringen wordt correct in elkaar genest. Alleen echt **kruisende** annotaties
(twee spans die elkaar overlappen zonder dat de ene de andere bevat) kan het inline-formaat
niet weergeven; de importer meldt zo'n zeldzaam geval.

## Een nieuwe editie toevoegen (rechtstreeks in bron.txt)

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

Prototype. `van-der-meersch` is een echte editie: het **volledige reisverhaal** (38
handschriftpagina’s, ±486 oorspronkelijke editeursnoten), geautomatiseerd uit de bestaande
PDF-uitgave overgezet met `edities/van-der-meersch/uit-pdf.py` en verankerd door de importer
(±96% automatisch; de rest is proefleeswerk). `reisjournaal-demo` bevat
**geen echte bron** maar een voorbeeldtekst in periodestijl, bedoeld om álle functies te tonen
(geneste noten, tekstkritisch apparaat, doorhaling, facsimile-lightbox). Geplande edities: de
gedrukte satire *Apollo sergeant* van Arend Fokke Simonsz, en meer reisverslagen
(o.a. van [alanmoss.nl](https://alanmoss.nl)).
