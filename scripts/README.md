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
