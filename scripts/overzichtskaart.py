#!/usr/bin/env python3
"""
overzichtskaart.py — één SVG-kaart met alle reizen samen.

Bouwt voort op reiskaart.py (Web-Mercator + kustlijn uit Natural Earth), maar
tekent meerdere reizen, elk in een eigen kleur. Bedoeld voor reizen.html.

    python3 scripts/overzichtskaart.py --uit reizen.kaart.svg

De kustlijn (scripts/data/kust-west-europa.geojson) dekt West-Europa; zie
scripts/README.md om die opnieuw of voor een andere regio te maken.
Alleen de Python-standaardbibliotheek is nodig.
"""
import argparse, math, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import reiskaart as rk

# Reizen: (slug, kmz, kleur, naam, ondertitel). Volgorde = tekenvolgorde.
REIZEN = [
    ("van-der-meersch", "edities/van-der-meersch/reis.kmz", "#0f766e",
     "Abraham van der Meersch", "Denemarken en Zweden · 1672–1674"),
    ("geelvinck", "edities/geelvinck/reis.kmz", "#be123c",
     "Joan Geelvinck", "Frankrijk · 1663–1664"),
    ("hinlopen-1667", "edities/hinlopen-1667/reis.kmz", "#b45309",
     "Gerard Hinlopen", "Frankrijk en Engeland · 1667–1668"),
    ("ruysch", "edities/ruysch/reis.kmz", "#7c3aed",
     "Coenraad Ruysch", "heenreis naar Italië · 1674"),
]

# Oriëntatielabels: zoekterm -> (weergavenaam, kant e/w/s).
LABELS = [
    ("amsterdam", "Amsterdam", "e"), ("hambor", "Hamburg", "e"),
    ("gottenburg", "Göteborg", "e"), ("coppenhagen", "Kopenhagen", "e"),
    ("london", "Londen", "w"), ("parijs", "Parijs", "e"), ("paris", "Parijs", "e"),
    ("geneve", "Genève", "e"), ("livorno", "Livorno", "e"),
    ("marseille", "Marseille", "s"), ("bourdeaux", "Bordeaux", "w"),
    ("nantes", "Nantes", "w"), ("lions", "Lyon", "w"), ("breemen", "Bremen", "w"),
]


def norm(s):
    return re.sub(r"[^a-z]", "", s.lower())


def main(argv=None):
    ap = argparse.ArgumentParser(description="Overzichtskaart van alle reizen.")
    ap.add_argument("--land", default="scripts/data/kust-west-europa.geojson")
    ap.add_argument("--bbox", default="-5,42,15,59", help="lon0,lat0,lon1,lat1")
    ap.add_argument("--uit", default="reizen.kaart.svg")
    a = ap.parse_args(argv)
    bbox = tuple(float(v) for v in a.bbox.split(","))
    proj, W, H = rk.maak_projectie(bbox, 1180.0)
    ringen = rk.kust_ringen(a.land)

    reizen = []
    for slug, kmz, kleur, naam, sub in REIZEN:
        stops, lijnen = rk.parse_route(rk.lees_kml(kmz))
        reizen.append((slug, kleur, naam, sub, stops, lijnen))

    out = [f'<svg class="reiskaart" viewBox="0 0 {rk.fmt(W)} {rk.fmt(H)}" '
           f'xmlns="http://www.w3.org/2000/svg" role="img" '
           f'aria-label="Overzichtskaart van alle reizen">']
    out.append(f'<rect x="0" y="0" width="{rk.fmt(W)}" height="{rk.fmt(H)}" class="rk-zee"/>')
    out.append('<g class="rk-land">')
    for ring in ringen:
        c = rk.clip(ring, bbox)
        if len(c) >= 3:
            out.append(f'<path d="{rk.pad_d([proj(lo, la) for lo, la in c], True)}"/>')
    out.append('</g>')

    # per reis: routes + stops, in de eigen kleur, als klikbare groep.
    for slug, kleur, naam, sub, stops, lijnen in reizen:
        out.append(f'<g class="ov-reis" data-slug="{slug}" style="--kleur:{kleur}">')
        for lijn in lijnen:
            out.append(f'<path class="ov-route" d="{rk.pad_d([proj(c[0], c[1]) for c in lijn])}" '
                       f'fill="none" stroke="{kleur}" stroke-width="2.1" '
                       f'stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>')
        for s in stops:
            x, y = proj(s["lon"], s["lat"])
            datum, plaats = rk.plaats_van(s["naam"])
            tip = rk.esc(naam + " — " + (datum + ": " if datum else "") + plaats)
            out.append(f'<circle cx="{rk.fmt(x)}" cy="{rk.fmt(y)}" r="2.6" fill="{kleur}" '
                       f'stroke="var(--papier)" stroke-width="0.7" opacity="0.8"><title>{tip}</title></circle>')
        out.append('</g>')

    # oriëntatielabels (eerste match over alle reizen)
    allstops = [s for *_r, stops, _l in reizen for s in stops]
    out.append('<g class="rk-labels">')
    gedaan = set()
    for term, disp, kant in LABELS:
        if disp in gedaan:
            continue
        for s in allstops:
            _, plaats = rk.plaats_van(s["naam"])
            if norm(term) in norm(plaats):
                x, y = proj(s["lon"], s["lat"])
                dx, dy, anker = (10, 4, "start")
                if kant == "w":
                    dx, dy, anker = -10, 4, "end"
                elif kant == "s":
                    dx, dy, anker = 0, 20, "middle"
                out.append(f'<circle cx="{rk.fmt(x)}" cy="{rk.fmt(y)}" r="3" '
                           f'fill="var(--inkt)" opacity="0.85"/>')
                out.append(f'<text x="{rk.fmt(x + dx)}" y="{rk.fmt(y + dy)}" '
                           f'text-anchor="{anker}">{rk.esc(disp)}</text>')
                gedaan.add(disp)
                break
    out.append('</g>')
    out.append('</svg>')

    svg = "\n".join(out)
    with open(a.uit, "w", encoding="utf-8") as f:
        f.write(svg + "\n")
    print(f"{a.uit}: {len(reizen)} reizen, {len(ringen)} kustringen, "
          f"{len(gedaan)} labels -> {len(svg)} tekens", file=sys.stderr)


if __name__ == "__main__":
    main()
