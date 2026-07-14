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
REGISTER_SCHEIDING = re.compile(r'^\s*={3,}\s*REGISTER\s*={3,}\s*$', re.IGNORECASE)


def parse_bestand(tekst):
    """Splits frontmatter, hoofdtekst, notenblok en registerblok.

    Retour: (frontmatter, hoofdtekst, noten, registerregels). Het registerblok
    (=== REGISTER ===) bevat regels  soort | canonieke naam | variant, variant …
    die als  register:-regels aan de frontmatter worden toegevoegd."""
    m = re.match(r'^---\s*\n(.*?)\n---\s*\n?', tekst, re.DOTALL)
    frontmatter = m.group(1) if m else ''
    rest = tekst[m.end():] if m else tekst

    tekstregels, notenregels, registerregels = [], [], []
    sectie = 'tekst'
    for regel in rest.split('\n'):
        if NOTEN_SCHEIDING.match(regel):
            sectie = 'noten'; continue
        if REGISTER_SCHEIDING.match(regel):
            sectie = 'register'; continue
        if sectie == 'noten':
            notenregels.append(regel)
        elif sectie == 'register':
            registerregels.append(regel)
        else:
            tekstregels.append(regel)

    noten = []
    for regel in notenregels:
        if not regel.strip() or regel.lstrip().startswith('#') or '|' not in regel:
            continue
        velden = [x.strip() for x in regel.split('|', 2)]
        if len(velden) == 3:
            noten.append(tuple(velden))  # (lemma, code, inhoud)

    register = []
    for regel in registerregels:
        if not regel.strip() or regel.lstrip().startswith('#') or '|' not in regel:
            continue
        register.append(regel.strip())
    return frontmatter, '\n'.join(tekstregels), noten, register


LIJST_ITEM = re.compile(r'^([-*]|\d+\.)(\s+)(.*)$')


def split_top_pipe(s):
    """Split op |-tekens die NIET binnen geneste [[ ]] staan (zie editie.js)."""
    velden, cur, depth, i = [], '', 0, 0
    while i < len(s):
        if s[i:i + 2] == '[[':
            depth += 1; cur += '[['; i += 2
        elif s[i:i + 2] == ']]':
            depth -= 1; cur += ']]'; i += 2
        elif s[i] == '|' and depth == 0:
            velden.append(cur); cur = ''; i += 1
        else:
            cur += s[i]; i += 1
    velden.append(cur)
    return velden


def tabel_cellen(rij):
    s = rij.strip()
    s = re.sub(r'^\|', '', s)
    s = re.sub(r'\|\s*$', '', s)
    return [c.strip() for c in split_top_pipe(s)]


def is_scheidingsrij(rij):
    cellen = tabel_cellen(rij)
    return bool(cellen) and all(re.match(r'^:?-{3,}:?$', c) for c in cellen)


def maak_blokken(tekst):
    """Groepeer de hoofdtekst in blokken: alinea's (samengevoegd), koppen,
    markeringen, lijsten en tabellen."""
    blokken = []
    para, lijst, tabel = [], [], []

    def flush_para():
        if para:
            blokken.append({'type': 'para', 'tekst': ' '.join(x.strip() for x in para)})
            para.clear()

    def flush_lijst():
        if lijst:
            items = []
            for s in lijst:
                m = LIJST_ITEM.match(s)
                items.append({'marker': m.group(1) + m.group(2), 'inhoud': m.group(3)})
            blokken.append({'type': 'lijst', 'items': items,
                            'geordend': bool(re.match(r'^\d', lijst[0]))})
            lijst.clear()

    def flush_tabel():
        if tabel:
            rijen = []
            for s in tabel:
                sep = is_scheidingsrij(s)
                rijen.append({'sep': sep, 'raw': s,
                              'cellen': [] if sep else tabel_cellen(s)})
            blokken.append({'type': 'tabel', 'rijen': rijen})
            tabel.clear()

    def flush():
        flush_para(); flush_lijst(); flush_tabel()

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
        elif re.match(r'^@\s', s):
            flush(); blokken.append({'type': 'dag', 'tekst': s})
        elif LIJST_ITEM.match(s):
            flush_para(); flush_tabel(); lijst.append(s)
        elif s.startswith('|'):
            flush_para(); flush_lijst(); tabel.append(s)
        else:
            flush_lijst(); flush_tabel(); para.append(s)
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


class Segment:
    """Een doorzoekbaar, muteerbaar stuk tekst: een alinea, een lijstitem of
    een tabelcel. `lees`/`schrijf` koppelen het aan zijn plek in het blok."""
    def __init__(self, lees, schrijf):
        self._lees, self._schrijf = lees, schrijf
        self.inserts = []

    @property
    def tekst(self):
        return self._lees()

    def commit(self):
        if self.inserts:
            self._schrijf(bouw_genest(self.tekst, self.inserts))


def maak_segmenten(blokken):
    """Vlakke lijst van doorzoekbare segmenten, in leesvolgorde."""
    segs = []
    for b in blokken:
        if b['type'] == 'para':
            segs.append(Segment(lambda b=b: b['tekst'],
                                lambda v, b=b: b.__setitem__('tekst', v)))
        elif b['type'] == 'lijst':
            for it in b['items']:
                segs.append(Segment(lambda it=it: it['inhoud'],
                                    lambda v, it=it: it.__setitem__('inhoud', v)))
        elif b['type'] == 'tabel':
            for rij in b['rijen']:
                if rij['sep']:
                    continue
                for ci in range(len(rij['cellen'])):
                    segs.append(Segment(
                        (lambda rij=rij, ci=ci: rij['cellen'][ci]),
                        (lambda v, rij=rij, ci=ci: rij['cellen'].__setitem__(ci, v))))
    return segs


def anker_noten(blokken, noten):
    """Verankert elke noot in het juiste segment (alinea, lijstitem of tabelcel),
    in leesvolgorde vanaf de vorige noot, met terugval naar het begin."""
    segmenten = maak_segmenten(blokken)
    rapport = []
    cur_seg, cur_pos = 0, 0

    for lemma, code, inhoud in noten:
        m = re.search(r'\((\d+)\)\s*$', lemma)
        occ = int(m.group(1)) if m else None
        if m:
            lemma = lemma[:m.start()].strip()
        delen = [d.strip() for d in re.split(r'\s*(?:…|\.\.\.)\s*', lemma)]

        gevonden = None
        si, pos = cur_seg, cur_pos
        while si < len(segmenten):
            res = zoek_span(segmenten[si].tekst, delen, pos, occ)
            if res:
                gevonden = (si, res)
                break
            si, pos = si + 1, 0
        if not gevonden:  # terugval: vanaf het begin
            for si2 in range(len(segmenten)):
                res = zoek_span(segmenten[si2].tekst, delen, 0, occ)
                if res:
                    gevonden = (si2, res)
                    break

        if not gevonden:
            rapport.append(('NIET GEVONDEN', lemma, code))
            continue
        si, (s, e) = gevonden
        seg = segmenten[si]
        seg.inserts.append(dict(s=s, e=e, code=code, inhoud=inhoud))
        cur_seg, cur_pos = si, e
        rapport.append(('ok', seg.tekst[s:e], code))
    return segmenten, rapport


def pas_toe(segmenten):
    """Wikkel de gevonden spans in [[lemma|code|inhoud]] (geneste noten worden
    correct in elkaar genest; echt kruisende noten worden gemeld)."""
    for seg in segmenten:
        seg.commit()


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
        elif b['type'] == 'dag':
            if vorig == 'para':
                uit.append('')
            uit.append(b['tekst'])
        elif b['type'] == 'fig':
            uit.append('')
            uit.append(b['tekst'])
            uit.append('')
        elif b['type'] == 'lijst':
            uit.append('')
            for it in b['items']:
                uit.append(it['marker'] + it['inhoud'])
            uit.append('')
        elif b['type'] == 'tabel':
            uit.append('')
            for rij in b['rijen']:
                uit.append(rij['raw'] if rij['sep'] else '| ' + ' | '.join(rij['cellen']) + ' |')
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

    frontmatter, hoofdtekst, noten, register = parse_bestand(tekst)
    if register:
        extra = '\n'.join('register: ' + r for r in register)
        frontmatter = frontmatter.rstrip('\n') + '\n' + extra
    blokken = maak_blokken(hoofdtekst)
    segmenten, rapport = anker_noten(blokken, noten)
    pas_toe(segmenten)
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
