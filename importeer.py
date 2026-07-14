#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
importeer.py — zet een Obsidian-vriendelijk schrijfbestand (editie.md) om naar
het runtime-formaat van de site (bron.txt).

Schrijfmodel (editie.md):
  - Frontmatter tussen ---, identiek aan de kop van bron.txt (titel, apparaat: ...).
  - Schone hoofdtekst: gewone alinea's (zachte regelafbrekingen worden samengevoegd),
    koppen (#/##/###), paginamarkeringen (~ label | doel) en typografie ({sc:}, {ab:} ...).
    GEEN nootmarkeringen in de tekst.
  - Een notenblok, ingeleid door een regel  === NOTEN ===  , met per regel:
        lemma | code | inhoud
    * lemma  = het woord of de woordgroep waar de noot bij hoort. Voor een lange
               passage: eerste woord … laatste woord  (met … of ...).
               Komt het lemma meer dan eens voor, kies dan met  lemma (2)  het
               tweede voorkomen, enzovoort.
    * code   = apparaatcode uit de kop (w, comm, krit, auteur, ...).
    * inhoud = de noottekst.

De importer zoekt elk lemma op in de hoofdtekst (in leesvolgorde, vanaf de vorige
noot) en schrijft er onze inline-noot [[lemma|code|inhoud]] van, in bron.txt.

Gebruik:  python3 importeer.py edities/van-der-meersch/editie.md
          (schrijft bron.txt naast het invoerbestand)
"""
import re
import sys
import os

NOTEN_SCHEIDING = re.compile(r'^\s*={3,}\s*NOTEN\s*={3,}\s*$', re.IGNORECASE)


def parse_bestand(tekst):
    """Splits frontmatter, hoofdtekst en notenblok."""
    m = re.match(r'^---\s*\n(.*?)\n---\s*\n?', tekst, re.DOTALL)
    frontmatter = m.group(1) if m else ''
    rest = tekst[m.end():] if m else tekst

    tekstregels, notenregels = [], []
    in_noten = False
    for regel in rest.split('\n'):
        if NOTEN_SCHEIDING.match(regel):
            in_noten = True
            continue
        (notenregels if in_noten else tekstregels).append(regel)

    noten = []
    for regel in notenregels:
        if not regel.strip() or regel.lstrip().startswith('#') or '|' not in regel:
            continue
        velden = [x.strip() for x in regel.split('|', 2)]
        if len(velden) == 3:
            noten.append(tuple(velden))  # (lemma, code, inhoud)
    return frontmatter, '\n'.join(tekstregels), noten


def maak_blokken(tekst):
    """Groepeer de hoofdtekst in blokken: alinea's (samengevoegd), koppen, markeringen."""
    blokken = []
    para = []

    def flush():
        if para:
            blokken.append({'type': 'para', 'tekst': ' '.join(x.strip() for x in para)})
            para.clear()

    for regel in tekst.split('\n'):
        s = regel.strip()
        if s == '':
            flush()
        elif re.match(r'^#{1,3}\s', s):
            flush(); blokken.append({'type': 'kop', 'tekst': s})
        elif re.match(r'^!\[.*\]\(.*\)', s):
            flush(); blokken.append({'type': 'fig', 'tekst': s})
        elif s.startswith('~'):
            flush(); blokken.append({'type': 'mark', 'tekst': s})
        else:
            para.append(s)
    flush()
    return blokken


def zoek_span(tekst, delen, start, occ):
    """Vind de positie van een lemma in `tekst` vanaf `start` (hoofdletter-
    ongevoelig; de oorspronkelijke schrijfwijze in de tekst blijft behouden).
    `delen` = [heel] of [eerste, laatste] (bij een … in het lemma).
    `occ`   = gewenst voorkomen (1-based) of None."""
    lo = tekst.lower()
    if len(delen) == 1:
        deel = delen[0].lower()
        if occ:
            pos, idx = 0, -1
            for _ in range(occ):
                idx = lo.find(deel, pos)
                if idx == -1:
                    return None
                pos = idx + len(deel)
            return (idx, idx + len(deel))
        idx = lo.find(deel, start)
        return (idx, idx + len(deel)) if idx != -1 else None
    # eerste … laatste
    kop, staart = delen[0].lower(), delen[-1].lower()
    hi = lo.find(kop, start)
    if hi == -1:
        return None
    ti = lo.find(staart, hi + len(kop))
    if ti == -1:
        return None
    return (hi, ti + len(staart))


def anker_noten(blokken, noten):
    """Bepaal voor elke noot de plek in de alineablokken (zonder de tekst nog te wijzigen)."""
    para = [b for b in blokken if b['type'] == 'para']
    inserts = {i: [] for i in range(len(para))}
    rapport = []
    cur_blok, cur_pos = 0, 0

    for lemma, code, inhoud in noten:
        m = re.search(r'\((\d+)\)\s*$', lemma)
        occ = int(m.group(1)) if m else None
        if m:
            lemma = lemma[:m.start()].strip()
        delen = [d.strip() for d in re.split(r'\s*(?:…|\.\.\.)\s*', lemma)]

        gevonden = None
        bi, pos = cur_blok, cur_pos
        while bi < len(para):
            res = zoek_span(para[bi]['tekst'], delen, pos, occ)
            if res:
                gevonden = (bi, res)
                break
            bi, pos = bi + 1, 0
        if not gevonden:  # terugval: vanaf het begin
            for bi2 in range(len(para)):
                res = zoek_span(para[bi2]['tekst'], delen, 0, occ)
                if res:
                    gevonden = (bi2, res)
                    break

        if not gevonden:
            rapport.append(('NIET GEVONDEN', lemma, code))
            continue
        bi, (s, e) = gevonden
        inserts[bi].append((s, e, para[bi]['tekst'][s:e], code, inhoud))
        cur_blok, cur_pos = bi, e
        rapport.append(('ok', para[bi]['tekst'][s:e], code))
    return para, inserts, rapport


def pas_toe(para, inserts):
    """Wikkel de gevonden spans in [[lemma|code|inhoud]]. Bevatte (geneste) noten
    worden correct in elkaar genest; alleen echt kruisende (overlappende) noten
    kunnen inline niet en worden gemeld."""
    for i, blok in enumerate(para):
        items = [dict(s=s, e=e, code=code, inhoud=inhoud)
                 for (s, e, _lem, code, inhoud) in inserts[i]]
        blok['tekst'] = bouw_genest(blok['tekst'], items)


def bouw_genest(tekst, items):
    # Sorteer: buitenste eerst (kleinste start, grootste eind).
    items = sorted(items, key=lambda x: (x['s'], -x['e']))
    roots, stack = [], []
    for it in items:
        while stack and it['s'] >= stack[-1]['e']:
            stack.pop()
        if stack:
            ouder = stack[-1]
            if it['e'] > ouder['e']:  # kruist de ouder: niet nestbaar
                sys.stderr.write(f"  ! kruisende (overlappende) noot overgeslagen: "
                                 f"{tekst[it['s']:it['e']]!r}\n")
                continue
            ouder.setdefault('kids', []).append(it)
        else:
            roots.append(it)
        stack.append(it)

    def render(s, e, kids):
        uit, pos = [], s
        for k in sorted(kids, key=lambda x: x['s']):
            uit.append(tekst[pos:k['s']])
            binnen = render(k['s'], k['e'], k.get('kids', []))
            uit.append(f"[[{binnen}|{k['code']}|{k['inhoud']}]]")
            pos = k['e']
        uit.append(tekst[pos:e])
        return ''.join(uit)

    return render(0, len(tekst), roots)


def bouw_bron(frontmatter, blokken):
    uit = ['---', frontmatter, '---', '']
    vorig = None
    for b in blokken:
        if b['type'] == 'kop':
            if vorig is not None:
                uit.append('')
            uit.append(b['tekst'])
            uit.append('')
        elif b['type'] == 'mark':
            if vorig == 'para':
                uit.append('')
            uit.append(b['tekst'])
        elif b['type'] == 'fig':
            uit.append('')
            uit.append(b['tekst'])
            uit.append('')
        else:  # para
            uit.append(b['tekst'])
        vorig = b['type']
    return '\n'.join(uit).rstrip() + '\n'


def main():
    if len(sys.argv) < 2:
        sys.exit('gebruik: python3 importeer.py <editie.md>')
    invoer = sys.argv[1]
    with open(invoer, encoding='utf-8') as f:
        tekst = f.read()

    # Obsidian-commentaar %% ... %% wordt genegeerd (bv. voor een legenda).
    tekst = re.sub(r'%%[\s\S]*?%%', '', tekst)

    frontmatter, hoofdtekst, noten = parse_bestand(tekst)
    blokken = maak_blokken(hoofdtekst)
    para, inserts, rapport = anker_noten(blokken, noten)
    pas_toe(para, inserts)
    bron = bouw_bron(frontmatter, blokken)

    uitvoer = os.path.join(os.path.dirname(invoer), 'bron.txt')
    with open(uitvoer, 'w', encoding='utf-8') as f:
        f.write(bron)

    ok = sum(1 for r in rapport if r[0] == 'ok')
    mis = [r for r in rapport if r[0] != 'ok']
    print(f'{ok}/{len(rapport)} noten verankerd  ->  {uitvoer}')
    for r in mis:
        print(f'  NIET GEVONDEN: {r[1]!r} ({r[2]})')


if __name__ == '__main__':
    main()
