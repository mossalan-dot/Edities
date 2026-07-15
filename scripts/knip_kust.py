#!/usr/bin/env python3
"""
knip_kust.py — knip een land-GeoJSON op een bbox tot een compacte kustlijn.

Bedoeld om uit de volledige Natural Earth 1:50m land-laag (public domain)
een klein regio-bestand te maken dat in de repo kan en dat reiskaart.py als
achtergrond gebruikt.

    python3 scripts/knip_kust.py <in.geojson> <uit.geojson> lon0,lat0,lon1,lat1

Alleen de Python-standaardbibliotheek is nodig.
"""
import json
import sys


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


def ringen(geom):
    if geom["type"] == "Polygon":
        return geom["coordinates"]
    if geom["type"] == "MultiPolygon":
        return [r for poly in geom["coordinates"] for r in poly]
    return []


def main():
    if len(sys.argv) != 4:
        sys.exit("gebruik: knip_kust.py <in.geojson> <uit.geojson> lon0,lat0,lon1,lat1")
    bron, doel, bbox_s = sys.argv[1:]
    bbox = tuple(float(v) for v in bbox_s.split(","))
    lo0, la0, lo1, la1 = bbox
    land = json.load(open(bron, encoding="utf-8"))

    feats = []
    for f in land["features"]:
        for ring in ringen(f["geometry"]):
            xs = [p[0] for p in ring]
            ys = [p[1] for p in ring]
            if max(xs) < lo0 or min(xs) > lo1 or max(ys) < la0 or min(ys) > la1:
                continue
            c = clip([(p[0], p[1]) for p in ring], bbox)
            if len(c) >= 3:
                feats.append({
                    "type": "Feature",
                    "geometry": {"type": "Polygon",
                                 "coordinates": [[[round(x, 4), round(y, 4)] for x, y in c]]},
                    "properties": {},
                })

    gj = {
        "type": "FeatureCollection",
        "bron": f"Natural Earth 1:50m land (public domain), geknipt op {bbox}",
        "features": feats,
    }
    json.dump(gj, open(doel, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"{doel}: {len(feats)} ringen")


if __name__ == "__main__":
    main()
