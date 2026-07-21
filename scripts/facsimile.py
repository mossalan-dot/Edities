#!/usr/bin/env python3
"""
facsimile.py — webklare handschriftscans maken uit de corpusfoto's.

De originele foto's zijn 3-5 MB per stuk; een volledige facsimile weegt zo
honderden MB's. Die horen niet in Git en niet in de iCloud-map, maar kunnen
prima op de webserver staan. Dit script maakt daarom:

  * verkleinde scans + duimnagels in een tijdelijke map (standaard /tmp),
    klaar om met deploy/facsimiles.sh naar de server te rsyncen;
  * een klein manifest `edities/<slug>/facsimile.json` DAT WEL in Git gaat,
    zodat de editiepagina de galerij eruit kan opbouwen.

    python3 scripts/facsimile.py vegelin --bron "/pad/naar/Foto's" --uit /tmp/facsimile

Alleen de Python-standaardbibliotheek plus `sips` (standaard op macOS).
"""
import argparse, json, os, re, subprocess, sys

VOL = 1600      # langste zijde van de leesbare scan
DUIM = 320      # langste zijde van de duimnagel


def sips(bron, doel, grootte, draai=0):
    os.makedirs(os.path.dirname(doel), exist_ok=True)
    cmd = ["sips"]
    if draai:
        cmd += ["-r", str(draai)]
    cmd += ["-Z", str(grootte), bron, "--out", doel]
    r = subprocess.run(cmd, capture_output=True)
    return r.returncode == 0 and os.path.exists(doel)


def natuurlijk(naam):
    """Sorteersleutel die getallen in de bestandsnaam als getal behandelt."""
    return [int(t) if t.isdigit() else t.lower()
            for t in re.split(r"(\d+)", naam)]


def main():
    ap = argparse.ArgumentParser(description="Webklare facsimile bouwen.")
    ap.add_argument("slug", help="editie-slug, bv. vegelin")
    ap.add_argument("--bron", required=True, help="map met de originele foto's")
    ap.add_argument("--uit", default="/tmp/facsimile", help="werkmap voor de webscans")
    ap.add_argument("--draai", type=int, default=0, help="graden draaien (bv. 270)")
    ap.add_argument("--label", default="f. {n}", help="bijschrift, {n} = volgnummer")
    ap.add_argument("--begin", type=int, default=1, help="eerste foto meenemen (1-based)")
    ap.add_argument("--eind", type=int, default=0, help="laatste foto (0 = tot het eind)")
    a = ap.parse_args()

    fotos = sorted((f for f in os.listdir(a.bron) if f.lower().endswith((".jpg", ".jpeg"))),
                   key=natuurlijk)
    fotos = fotos[a.begin - 1: (a.eind or len(fotos))]
    if not fotos:
        sys.exit(f"geen foto's gevonden in {a.bron}")

    doelmap = os.path.join(a.uit, a.slug)
    items = []
    for i, f in enumerate(fotos, 1):
        naam = f"pagina-{i:03d}.jpg"
        bron = os.path.join(a.bron, f)
        ok1 = sips(bron, os.path.join(doelmap, naam), VOL, a.draai)
        ok2 = sips(bron, os.path.join(doelmap, "thumb", naam), DUIM, a.draai)
        if not (ok1 and ok2):
            print(f"  overgeslagen (sips faalde): {f}", file=sys.stderr)
            continue
        items.append({"b": naam, "label": a.label.replace("{n}", str(i))})
        if i % 25 == 0:
            print(f"  {i}/{len(fotos)}…", file=sys.stderr)

    manifest = {"slug": a.slug, "map": f"facsimile/{a.slug}", "aantal": len(items),
                "items": items}
    mpad = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "edities", a.slug, "facsimile.json")
    with open(mpad, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=1)

    mb = sum(os.path.getsize(os.path.join(dp, n))
             for dp, _, ns in os.walk(doelmap) for n in ns) / 1048576
    print(f"{len(items)} scans -> {doelmap} ({mb:.0f} MB)", file=sys.stderr)
    print(f"manifest -> {os.path.relpath(mpad)}", file=sys.stderr)


if __name__ == "__main__":
    main()
