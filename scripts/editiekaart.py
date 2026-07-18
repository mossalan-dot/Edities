#!/usr/bin/env python3
"""
editiekaart.py — routekaart met kustlijn voor één editie (in kleur).

Als reiskaart.py, maar tekent alle routelijnen doorgetrokken in één kleur
(geschikt voor edities met meerdere KMZ-segmenten) op de West-Europa-kustlijn.
Genereert de kaarten voor Ruysch, Hinlopen 1667–1668 en Geelvinck.

    python3 scripts/editiekaart.py            # schrijft *.kaart.svg naar /tmp

Alleen de Python-standaardbibliotheek is nodig.
"""
import os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import reiskaart as rk

LAND = "scripts/data/kust-west-europa.geojson"

# per editie: kmz, kleur, bbox, labels (term, weergavenaam, kant e/w/s)
EDITIES = {
    "ruysch": dict(
        kmz="edities/ruysch/reis.kmz", kleur="#7c3aed", bbox=(3.4, 42.4, 15.0, 54.6),
        labels=[("amsterdam", "Amsterdam", "e"), ("hambor", "Hamburg", "e"),
                ("breemen", "Bremen", "w"), ("augsburg", "Augsburg", "e"),
                ("ulm", "Ulm", "w"), ("bazel", "Bazel", "w"), ("bern", "Bern", "w"),
                ("geneve", "Genève", "w"), ("turijn", "Turijn", "w"),
                ("milaan", "Milaan", "e"), ("bologna", "Bologna", "e"),
                ("florence", "Florence", "e"), ("livorno", "Livorno", "w")]),
    "hinlopen-1667": dict(
        kmz="edities/hinlopen-1667/reis.kmz", kleur="#b45309", bbox=(-3.2, 46.0, 6.6, 53.4),
        labels=[("hoorn", "Hoorn", "e"), ("amsterdam", "Amsterdam", "e"),
                ("rotterdam", "Rotterdam", "w"), ("vlissingen", "Vlissingen", "w"),
                ("cales", "Calais", "w"), ("paris", "Parijs", "e"),
                ("orleans", "Orléans", "e"), ("tours", "Tours", "w"),
                ("angiers", "Angers", "w"), ("nantes", "Nantes", "w"),
                ("roan", "Rouen", "e"), ("london", "Londen", "w")]),
    "geelvinck": dict(
        kmz="edities/geelvinck/reis.kmz", kleur="#be123c", bbox=(-3.2, 42.2, 7.6, 53.4),
        labels=[("antwerpen", "Antwerpen", "e"), ("brussel", "Brussel", "w"),
                ("parijs", "Parijs", "e"), ("orleans", "Orléans", "w"),
                ("tours", "Tours", "w"), ("nantes", "Nantes", "w"),
                ("bourdeaux", "Bordeaux", "w"), ("thoulouse", "Toulouse", "w"),
                ("narbonne", "Narbonne", "e"), ("montpelliers", "Montpellier", "e"),
                ("marseille", "Marseille", "s"), ("avignon", "Avignon", "e"),
                ("grenoble", "Grenoble", "e"), ("lions", "Lyon", "w"),
                ("geneve", "Genève", "e"), ("dijon", "Dijon", "e")]),
}


def norm(s):
    return re.sub(r"[^a-z]", "", s.lower())


def bouw(slug, cfg, ringen):
    proj, W, H = rk.maak_projectie(cfg["bbox"], 1000.0)
    stops, lijnen = rk.parse_route(rk.lees_kml(cfg["kmz"]))
    kleur = cfg["kleur"]
    o = [f'<svg class="reiskaart" viewBox="0 0 {rk.fmt(W)} {rk.fmt(H)}" '
         f'xmlns="http://www.w3.org/2000/svg" role="img" '
         f'aria-label="Routekaart van de reis">']
    o.append(f'<rect x="0" y="0" width="{rk.fmt(W)}" height="{rk.fmt(H)}" class="rk-zee"/>')
    o.append('<g class="rk-land">')
    for ring in ringen:
        c = rk.clip(ring, cfg["bbox"])
        if len(c) >= 3:
            o.append(f'<path d="{rk.pad_d([proj(lo, la) for lo, la in c], True)}"/>')
    o.append('</g>')
    for lijn in lijnen:
        o.append(f'<path d="{rk.pad_d([proj(c[0], c[1]) for c in lijn])}" fill="none" '
                 f'stroke="{kleur}" stroke-width="2.3" stroke-linejoin="round" '
                 f'stroke-linecap="round" opacity="0.85"/>')
    o.append('<g class="rk-stops">')
    for s in stops:
        x, y = proj(s["lon"], s["lat"])
        datum, plaats = rk.plaats_van(s["naam"])
        tip = rk.esc((datum + ": " if datum else "") + plaats)
        o.append(f'<circle cx="{rk.fmt(x)}" cy="{rk.fmt(y)}" r="3.4" fill="{kleur}" '
                 f'stroke="var(--papier)" stroke-width="0.8" opacity="0.82"><title>{tip}</title></circle>')
    o.append('</g>')
    o.append('<g class="rk-labels">')
    gedaan = set()
    for term, disp, kant in cfg["labels"]:
        if disp in gedaan:
            continue
        for s in stops:
            _, plaats = rk.plaats_van(s["naam"])
            if norm(term) in norm(plaats):
                x, y = proj(s["lon"], s["lat"])
                dx, dy, anker = (10, 4, "start")
                if kant == "w":
                    dx, dy, anker = -10, 4, "end"
                elif kant == "s":
                    dx, dy, anker = 0, 20, "middle"
                o.append(f'<circle cx="{rk.fmt(x)}" cy="{rk.fmt(y)}" r="3" '
                         f'fill="var(--inkt)" opacity="0.85"/>')
                o.append(f'<text x="{rk.fmt(x + dx)}" y="{rk.fmt(y + dy)}" '
                         f'text-anchor="{anker}">{rk.esc(disp)}</text>')
                gedaan.add(disp)
                break
    o.append('</g>')
    o.append('</svg>')
    return "\n".join(o), len(stops), len(lijnen), len(gedaan)


def main():
    ringen = rk.kust_ringen(LAND)
    uitmap = sys.argv[1] if len(sys.argv) > 1 else "/tmp"
    for slug, cfg in EDITIES.items():
        svg, ns, nl, nlab = bouw(slug, cfg, ringen)
        pad = os.path.join(uitmap, slug + ".kaart.svg")
        open(pad, "w", encoding="utf-8").write(svg + "\n")
        print(f"{pad}: {ns} stops, {nl} routelijnen, {nlab} labels", file=sys.stderr)


if __name__ == "__main__":
    main()
