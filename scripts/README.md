# scripts/

Hulpscripts voor het opbouwen van editie-onderdelen. Alleen de
Python-standaardbibliotheek is nodig (geen `pip install`).

## reiskaart.py — routekaart genereren

Maakt een zelfstandige, thema-adaptieve **SVG-routekaart** uit een KMZ/KML
(route-lijnen + gedateerde stops) en een kustlijn-GeoJSON. De kaart bevat
geen externe tiles of tracking en werkt offline.

De Van der Meersch-kaart (tab **Reis**) reproduceren:

```bash
python3 scripts/reiskaart.py --uit edities/van-der-meersch/kaart.svg
```

Plak de inhoud van `kaart.svg` in het `data-paneel="reis"`-paneel van
`edities/van-der-meersch/index.html` (tussen `<div class="reiskaart-omhulsel">`
en `</div>`). De styling zit in `assets/stijl.css` (`.reiskaart`, `.rk-*`,
en de variabelen `--kaart-zee` / `--kaart-land`).

Belangrijkste opties (zie `--help`):

| Optie | Standaard | Betekenis |
|---|---|---|
| `--kmz` | `edities/van-der-meersch/reis.kmz` | Bron met route + stops (KMZ of KML) |
| `--land` | `scripts/data/kust-nw-europa.geojson` | Kustlijn-GeoJSON |
| `--bbox` | `3.4,51.6,14.2,58.6` | Weergavegebied `lon0,lat0,lon1,lat1` |
| `--labels` | curatie in het script | Plaatsnamen met tekstlabel |
| `--uit` | `edities/van-der-meersch/kaart.svg` | Uitvoerbestand |

De eerste LineString in de KMZ wordt als route 1 getekend (klasse
`rk-1672`, gestippeld), de tweede als route 2 (`rk-1674`, doorgetrokken).

## controleer.py — validatie (CI)

Controleert alle edities en pagina's zonder externe afhankelijkheden: geldige
`--- … ---`-kop, gebalanceerde noten die naar een gedeclareerd apparaat
verwijzen, geen geneste `{typografie}` (die het platform niet kan weergeven),
geldige `@`-dagtekeningen en bestaande relatieve verwijzingen (src/href/
data-bron) in alle `.html`-bestanden.

```bash
python3 scripts/controleer.py       # exitcode 1 bij fouten
```

Draait automatisch bij elke push/PR via `.github/workflows/controleer.yml`.

## editiekaart.py — kustlijn-routekaart per editie

Als `reiskaart.py`, maar tekent alle routelijnen doorgetrokken in één kleur (voor
edities met meerdere KMZ-segmenten) op de West-Europa-kustlijn. Genereert de
kaarten van Ruysch, Hinlopen 1667–1668 en Geelvinck; per editie staan de KMZ,
kleur, uitsnede (`bbox`) en labels in `EDITIES` bovenin het script.

```bash
python3 scripts/editiekaart.py /tmp        # schrijft <slug>.kaart.svg
```

Plak de SVG in het `data-paneel="reis"`-paneel van de editie (tussen
`<div class="reiskaart-omhulsel">` en `</div>`).

## overzichtskaart.py — alle reizen op één kaart

Bouwt voort op `reiskaart.py` en tekent **meerdere reizen** samen, elk in een
eigen kleur, op de bredere West-Europa-kustlijn. Levert de kaart voor
`reizen.html`.

```bash
python3 scripts/overzichtskaart.py --uit /tmp/reizen.kaart.svg
```

Plak de inhoud van de SVG in `reizen.html` (tussen
`<div class="reiskaart-omhulsel ov-kaart">` en `</div>`). De reizen (slug, KMZ,
kleur, naam) staan bovenin het script in `REIZEN`; elke route wordt een
klikbare `<g class="ov-reis" data-slug="…">`, zodat `reizen.html` er hover- en
klikgedrag aan kan hangen. Elke editie heeft zijn eigen `reis.kmz` in de
editiemap.

## data/kust-west-europa.geojson

Zelfde bron als hieronder (Natural Earth 1:50m land), maar geknipt op een groter
gebied zodat óók de zuidelijke reizen (Frankrijk, Italië) een kustlijn krijgen:

```bash
python3 scripts/knip_kust.py /tmp/land50.geojson scripts/data/kust-west-europa.geojson -6,41,16,60
```

## data/kust-nw-europa.geojson

Een subset van **Natural Earth 1:50m land** (public domain,
<https://github.com/nvkelso/natural-earth-vector>), geknipt op NW-Europa
(bbox `1,50,17,60`). Zo opnieuw of voor een andere regio te maken:

```bash
# 1. brondata ophalen (~1,6 MB, niet in de repo)
curl -sSL -o /tmp/land50.geojson \
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson

# 2. knippen op een bbox met scripts/knip_kust.py
python3 scripts/knip_kust.py /tmp/land50.geojson scripts/data/kust-nw-europa.geojson 1,50,17,60
```
