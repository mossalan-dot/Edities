#!/usr/bin/env python3
"""
reiskaart.py — genereer een zelfstandige SVG-routekaart voor een editie.

Uit een KMZ/KML (route-lijnen + gedateerde stops) en een kustlijn-GeoJSON
maakt dit script een statische, thema-adaptieve SVG-kaart die je in het
"Reis"-paneel van een editie plakt. Geen externe tiles of tracking: de
kaart draait volledig zelfstandig, in lijn met het platform.

Standaardwaarden reproduceren de kaart van de Van der Meersch-editie:

    python3 scripts/reiskaart.py

Of expliciet, en voor een andere editie:

    python3 scripts/reiskaart.py \\
        --kmz edities/<naam>/reis.kmz \\
        --land scripts/data/kust-nw-europa.geojson \\
        --bbox 3.4,51.6,14.2,58.6 \\
        --labels "Amsterdam,Hamborg,Coppenhagen,Malmuij" \\
        --uit edities/<naam>/kaart.svg

De meegeleverde kustlijn (scripts/data/kust-nw-europa.geojson) is een
subset van Natural Earth 1:50m land (public domain), geknipt op NW-Europa.
Zie scripts/README.md om die opnieuw of voor een andere regio te maken.

Alleen de Python-standaardbibliotheek is nodig (geen pip-installaties).
"""
import argparse
import json
import math
import sys
import zipfile
import xml.etree.ElementTree as ET

KML = "{http://www.opengis.net/kml/2.2}"

# Curatie: welke plaatsen een tekstlabel krijgen en aan welke kant
# (e=rechts, w=links, s=onder). De rest is via hover (title) te zien.
LABEL_KANT = {
    "Amsterdam": "e", "Enchuijzen": "e", "Hamborg": "e", "Breemen": "w",
    "Flensburg": "e", "Odenzee": "s", "Coppenhagen": "e", "Malmuij": "e",
    "Leewaarden": "w", "Gröeninge": "e", "Stavoren": "w", "Rensborg": "w",
}


# ---- inlezen -------------------------------------------------------------
def lees_kml(pad):
    if pad.lower().endswith(".kmz"):
        with zipfile.ZipFile(pad) as z:
            naam = next(n for n in z.namelist() if n.endswith(".kml"))
            data = z.read(naam).decode("utf-8", "replace")
    else:
        with open(pad, encoding="utf-8") as f:
            data = f.read()
    return ET.fromstring(data)


def parse_route(root):
    """Haal Point-stops en LineString-routes uit de KML."""
    stops, lijnen = [], []
    for pm in root.iter(KML + "Placemark"):
        naam = (pm.findtext(KML + "name") or "").strip()
        pt = pm.find(f".//{KML}Point/{KML}coordinates")
        ls = pm.find(f".//{KML}LineString/{KML}coordinates")
        if pt is not None and pt.text:
            lon, lat = pt.text.strip().split(",")[:2]
            stops.append({"naam": naam, "lat": float(lat), "lon": float(lon)})
        if ls is not None and ls.text:
            coords = [[float(c.split(",")[0]), float(c.split(",")[1])]
                      for c in ls.text.strip().split()]
            lijnen.append(coords)
    return stops, lijnen


def kust_ringen(pad):
    gj = json.load(open(pad, encoding="utf-8"))
    ringen = []
    for f in gj["features"]:
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "Polygon" else \
            [r for poly in g["coordinates"] for r in poly]
        for ring in polys:
            ringen.append([(p[0], p[1]) for p in ring])
    return ringen


# ---- meetkunde -----------------------------------------------------------
def clip(poly, bbox):
    """Sutherland-Hodgman: knip een ring op de bbox (lon0,lat0,lon1,lat1)."""
    lo0, la0, lo1, la1 = bbox

    def once(pts, inside, inter):
        out = []
        for i in range(len(pts)):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            ia, ib = inside(a), inside(b)
            if ia:
                out.append(a)
                if not ib:
                    out.append(inter(a, b))
            elif ib:
                out.append(inter(a, b))
        return out

    p = poly
    p = once(p, lambda q: q[0] >= lo0,
             lambda a, b: (lo0, a[1] + (b[1] - a[1]) * (lo0 - a[0]) / (b[0] - a[0])))
    if not p:
        return p
    p = once(p, lambda q: q[0] <= lo1,
             lambda a, b: (lo1, a[1] + (b[1] - a[1]) * (lo1 - a[0]) / (b[0] - a[0])))
    if not p:
        return p
    p = once(p, lambda q: q[1] >= la0,
             lambda a, b: (a[0] + (b[0] - a[0]) * (la0 - a[1]) / (b[1] - a[1]), la0))
    if not p:
        return p
    p = once(p, lambda q: q[1] <= la1,
             lambda a, b: (a[0] + (b[0] - a[0]) * (la1 - a[1]) / (b[1] - a[1]), la1))
    return p


def maak_projectie(bbox, breedte=1000.0):
    """Web-Mercator, geschaald zodat de bbox `breedte` px breed is."""
    lo0, la0, lo1, la1 = bbox

    def my(lat):
        return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))

    x0 = math.radians(lo0)
    sx = breedte / (math.radians(lo1) - math.radians(lo0))
    hoogte = (my(la1) - my(la0)) * sx

    def proj(lon, lat):
        return ((math.radians(lon) - x0) * sx, (my(la1) - my(lat)) * sx)

    return proj, breedte, hoogte


def fmt(v):
    return ("%.1f" % v).rstrip("0").rstrip(".")


def pad_d(punten, sluit=False):
    d = "M" + " ".join("%s,%s" % (fmt(x), fmt(y)) for x, y in punten)
    return d + "Z" if sluit else d


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def plaats_van(naam):
    """'21-6: Enchuijzen - annotatie' -> ('21-6', 'Enchuijzen')."""
    datum, _, rest = naam.partition(":")
    if not rest:
        datum, rest = "", naam
    plaats = rest.strip().split(" - ")[0].strip()
    return datum.strip(), plaats


# ---- SVG -----------------------------------------------------------------
def bouw_svg(stops, lijnen, ringen, bbox, labels):
    proj, W, H = maak_projectie(bbox)
    uit = [f'<svg class="reiskaart" viewBox="0 0 {fmt(W)} {fmt(H)}" '
           f'xmlns="http://www.w3.org/2000/svg" role="img" '
           f'aria-label="Routekaart van de reis">']
    uit.append(f'<rect x="0" y="0" width="{fmt(W)}" height="{fmt(H)}" class="rk-zee"/>')

    uit.append('<g class="rk-land">')
    for ring in ringen:
        c = clip(ring, bbox)
        if len(c) >= 3:
            uit.append(f'<path d="{pad_d([proj(lo, la) for lo, la in c], True)}"/>')
    uit.append('</g>')

    for i, lijn in enumerate(lijnen):
        klasse = "rk-1672" if i == 0 else "rk-1674"
        uit.append(f'<path class="rk-route {klasse}" '
                   f'd="{pad_d([proj(c[0], c[1]) for c in lijn])}"/>')

    uit.append('<g class="rk-stops">')
    for s in stops:
        x, y = proj(s["lon"], s["lat"])
        datum, plaats = plaats_van(s["naam"])
        tip = esc((datum + ": " if datum else "") + plaats)
        uit.append(f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="4.5"><title>{tip}</title></circle>')
    uit.append('</g>')

    uit.append('<g class="rk-labels">')
    gezien = set()
    for s in stops:
        _, plaats = plaats_van(s["naam"])
        if plaats in labels and plaats not in gezien:
            gezien.add(plaats)
            x, y = proj(s["lon"], s["lat"])
            kant = labels[plaats]
            dx, dy, anker = 10, 4, "start"
            if kant == "w":
                dx, dy, anker = -10, 4, "end"
            elif kant == "s":
                dx, dy, anker = 0, 20, "middle"
            uit.append(f'<text x="{fmt(x + dx)}" y="{fmt(y + dy)}" '
                       f'text-anchor="{anker}">{esc(plaats)}</text>')
    uit.append('</g>')
    uit.append('</svg>')
    return "\n".join(uit)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Genereer een SVG-routekaart uit een KMZ/KML.")
    ap.add_argument("--kmz", default="edities/van-der-meersch/reis.kmz")
    ap.add_argument("--land", default="scripts/data/kust-nw-europa.geojson")
    ap.add_argument("--bbox", default="3.4,51.6,14.2,58.6",
                    help="lon0,lat0,lon1,lat1 (weergavegebied)")
    ap.add_argument("--labels", default=",".join(LABEL_KANT),
                    help="Kommagescheiden plaatsnamen die een tekstlabel krijgen")
    ap.add_argument("--uit", default="edities/van-der-meersch/kaart.svg")
    a = ap.parse_args(argv)

    bbox = tuple(float(v) for v in a.bbox.split(","))
    labels = {naam.strip(): LABEL_KANT.get(naam.strip(), "e")
              for naam in a.labels.split(",") if naam.strip()}

    root = lees_kml(a.kmz)
    stops, lijnen = parse_route(root)
    ringen = kust_ringen(a.land)
    svg = bouw_svg(stops, lijnen, ringen, bbox, labels)

    with open(a.uit, "w", encoding="utf-8") as f:
        f.write(svg + "\n")
    print(f"{a.uit}: {len(stops)} stops, {len(lijnen)} routelijnen, "
          f"{len(ringen)} kustringen -> {len(svg)} tekens", file=sys.stderr)


if __name__ == "__main__":
    main()
