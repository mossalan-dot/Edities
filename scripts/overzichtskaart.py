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

# Reizen: (slug, kmz, kleur, naam, ondertitel, editie).
# `editie` = pad naar de editie, of None voor een route uit het corpus waarvan
# nog geen editie bestaat: die wordt wél getekend (ingetogener) maar is niet
# klikbaar. Volgorde = tekenvolgorde; routes zonder editie eerst, zodat de
# ontsloten edities er bovenop liggen.
REIZEN = [
    # --- routes uit het corpus, nog zonder editie -------------------------
    ("lieshoud-1652", "reizen/lieshoud-1652.kmz", "#1d4ed8",
     "Johannes Lieshoud", "Italië · 1652", None),
    ("de-witt-1645", "reizen/de-witt-1645.kmz", "#15803d",
     "Johan de Witt", "Frankrijk · 1645–1647", None),
    ("jordens-1684", "reizen/jordens-1684.kmz", "#a21caf",
     "Hendrik Jordens", "Frankrijk · 1684–1685", None),
    ("boelen-1621", "reizen/boelen-1621.kmz", "#ca8a04",
     "Paul Boelen", "Frankrijk · 1621–1624", None),
    ("l-huygens-1651", "reizen/l-huygens-1651.kmz", "#0891b2",
     "Lodewijk Huygens", "Engeland · 1651–1652", None),
    ("hinlopen-1683", "reizen/hinlopen-1683.kmz", "#db2777",
     "Gerard Hinlopen", "de Nederlanden · 1683", None),
    ("vegelin-1708", "reizen/vegelin-1708.kmz", "#4d7c0f",
     "Johan Vegelin van Claerbergen", "de Nederlanden · 1708", None),
    ("de-mey-1651", "reizen/de-mey-1651.kmz", "#7c2d12",
     "George de Mey", "Engeland · 1651–1652", None),
    ("radermacher-1712", "reizen/radermacher-1712.kmz", "#475569",
     "Samuel Radermacher", "de Nederlanden · 1712", None),
    # --- ontsloten edities -------------------------------------------------
    ("van-der-meersch", "edities/van-der-meersch/reis.kmz", "#0f766e",
     "Abraham van der Meersch", "Denemarken en Zweden · 1672–1674",
     "edities/van-der-meersch/index.html"),
    ("geelvinck", "edities/geelvinck/reis.kmz", "#be123c",
     "Joan Geelvinck", "Frankrijk · 1663–1664", "edities/geelvinck/index.html"),
    ("hinlopen-1667", "edities/hinlopen-1667/reis.kmz", "#b45309",
     "Gerard Hinlopen", "Frankrijk en Engeland · 1667–1668",
     "edities/hinlopen-1667/index.html"),
    ("ruysch", "edities/ruysch/reis.kmz", "#7c3aed",
     "Coenraad Ruysch", "Italië en Frankrijk · 1674–1677",
     "edities/ruysch/index.html"),
]

# Oriëntatielabels: zoekterm -> (weergavenaam, kant e/w/s).
LABELS = [
    ("amsterdam", "Amsterdam", "e"), ("hambor", "Hamburg", "e"),
    ("gottenburg", "Göteborg", "e"), ("coppenhagen", "Kopenhagen", "e"),
    ("london", "Londen", "w"), ("parijs", "Parijs", "e"), ("paris", "Parijs", "e"),
    ("geneve", "Genève", "e"), ("livorno", "Livorno", "e"),
    ("marseille", "Marseille", "s"), ("bourdeaux", "Bordeaux", "w"),
    ("nantes", "Nantes", "w"), ("lions", "Lyon", "w"), ("breemen", "Bremen", "w"),
    ("rome", "Rome", "e"), ("napels", "Napels", "e"), ("tolouse", "Toulouse", "w"),
]


def norm(s):
    """Kleine letters, alleen letters en spaties (accenten blijven staan)."""
    return re.sub(r"[^a-z ]", "", s.lower())


def past(term, plaats):
    """Matcht als een woord in `plaats` met `term` begint.

    Bewust niet 'term ergens in plaats': dan matchte 'hambor' (Hamburg) ook op
    'Chambord' in de Loire, waardoor het label in Frankrijk belandde.
    """
    t = norm(term).strip()
    return any(w.startswith(t) for w in norm(plaats).split() if t)


def kies_stop(term, stops):
    """De stop die het best bij een labelterm past.

    Eerst een exacte plaatsnaam, pas daarna een woord dat ermee begint. Anders
    won een tussenstop als 'Between Rome and Napels' het van het echte 'Rome'.
    """
    t = norm(term).strip()
    for exact in (True, False):
        for s in stops:
            _, plaats = rk.plaats_van(s["naam"])
            if (norm(plaats).strip() == t) if exact else past(term, plaats):
                return s
    return None


def main(argv=None):
    ap = argparse.ArgumentParser(description="Overzichtskaart van alle reizen.")
    ap.add_argument("--land", default="scripts/data/kust-west-europa.geojson")
    ap.add_argument("--bbox", default="-5,40,15,59", help="lon0,lat0,lon1,lat1")
    ap.add_argument("--uit", default="reizen.kaart.svg")
    a = ap.parse_args(argv)
    bbox = tuple(float(v) for v in a.bbox.split(","))
    proj, W, H = rk.maak_projectie(bbox, 1180.0)
    ringen = rk.kust_ringen(a.land)

    reizen = []
    for slug, kmz, kleur, naam, sub, editie in REIZEN:
        stops, lijnen = rk.parse_route(rk.lees_kml(kmz))
        reizen.append((slug, kleur, naam, sub, stops, lijnen, editie))

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

    # per reis: routes + stops in de eigen kleur. Reizen zonder editie krijgen
    # een dunnere lijn en kleinere stippen, zodat de ontsloten edities visueel
    # voorrang houden.
    for slug, kleur, naam, sub, stops, lijnen, editie in reizen:
        klas = "ov-reis" + ("" if editie else " ov-geen-editie")
        dikte, dekking, straal = (2.1, 0.85, 2.6) if editie else (1.5, 0.6, 2.0)
        streep = '' if editie else ' stroke-dasharray="5 4"'
        out.append(f'<g class="{klas}" data-slug="{slug}" style="--kleur:{kleur}">')
        for lijn in lijnen:
            out.append(f'<path class="ov-route" d="{rk.pad_d([proj(c[0], c[1]) for c in lijn])}" '
                       f'fill="none" stroke="{kleur}" stroke-width="{dikte}"{streep} '
                       f'stroke-linejoin="round" stroke-linecap="round" opacity="{dekking}"/>')
        for s in stops:
            x, y = proj(s["lon"], s["lat"])
            datum, plaats = rk.plaats_van(s["naam"])
            tip = rk.esc(naam + " — " + (datum + ": " if datum else "") + plaats)
            out.append(f'<circle cx="{rk.fmt(x)}" cy="{rk.fmt(y)}" r="{straal}" fill="{kleur}" '
                       f'stroke="var(--papier)" stroke-width="0.7" opacity="{dekking - 0.05:.2f}">'
                       f'<title>{tip}</title></circle>')
        out.append('</g>')

    # oriëntatielabels (eerste match over alle reizen)
    allstops = [s for reis in reizen for s in reis[4]]   # reis[4] = stops
    out.append('<g class="rk-labels">')
    gedaan = set()
    for term, disp, kant in LABELS:
        if disp in gedaan:
            continue
        s = kies_stop(term, allstops)
        if not s:
            continue
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
    out.append('</g>')
    out.append('</svg>')

    svg = "\n".join(out)
    with open(a.uit, "w", encoding="utf-8") as f:
        f.write(svg + "\n")
    print(f"{a.uit}: {len(reizen)} reizen, {len(ringen)} kustringen, "
          f"{len(gedaan)} labels -> {len(svg)} tekens", file=sys.stderr)


if __name__ == "__main__":
    main()
