#!/usr/bin/env python3
"""
controleer.py — valideer de edities en pagina's van het platform.

Controleert, zonder externe afhankelijkheden:
  * elke editie heeft index.html + het bron.txt waar index.html naar verwijst;
  * elk bron.txt heeft een geldige `--- … ---`-kop;
  * noten [[lemma|code|…]] zijn gebalanceerd en verwijzen naar een gedeclareerd
    apparaat; geen geneste {typografie} (die het platform niet kan weergeven);
  * @-dagtekeningen hebben een geldige datum (JJJJ[-MM[-DD]]);
  * alle relatieve verwijzingen (src/href/data-bron) in .html-bestanden bestaan.

Exitcode 1 bij fouten (0 bij enkel waarschuwingen), zodat het als CI-stap dienst
kan doen:  python3 scripts/controleer.py
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fouten, waarschuwingen = [], []
def fout(waar, msg): fouten.append((waar, msg))
def waarschuw(waar, msg): waarschuwingen.append((waar, msg))


# ---- noten-parser (poort van editie.js) ---------------------------------
def match_close(s, i):
    diepte = 1
    while i < len(s):
        if s[i:i + 2] == '[[': diepte += 1; i += 2
        elif s[i:i + 2] == ']]':
            diepte -= 1
            if diepte == 0: return i
            i += 2
        else: i += 1
    return -1

def split_top(payload):
    velden, cur, diepte, i = [], '', 0, 0
    while i < len(payload):
        if payload[i:i + 2] == '[[': diepte += 1; cur += '[['; i += 2
        elif payload[i:i + 2] == ']]': diepte -= 1; cur += ']]'; i += 2
        elif payload[i] == '|' and diepte == 0: velden.append(cur); cur = ''; i += 1
        else: cur += payload[i]; i += 1
    velden.append(cur)
    return velden

def verzamel_codes(s, uit):
    i = 0
    while i < len(s):
        open_ = s.find('[[', i)
        if open_ == -1: break
        close = match_close(s, open_ + 2)
        if close == -1: return False
        velden = split_top(s[open_ + 2:close])
        if len(velden) >= 2:
            uit.append(velden[1].strip())
        verzamel_codes('|'.join(velden[2:]), uit)   # geneste noten in de inhoud
        i = close + 2
    return True


# ---- bron.txt ------------------------------------------------------------
def controleer_bron(pad, rel):
    tekst = open(pad, encoding='utf-8').read()
    m = re.match(r'^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)', tekst)
    if not m:
        fout(rel, 'geen geldige --- … ----kop')
        return
    codes = set()
    for regel in m.group(1).split('\n'):
        mm = re.match(r'\s*apparaat\s*:\s*([^|]+)', regel)
        if mm: codes.add(mm.group(1).strip())
    body = tekst[m.end():]

    if body.count('[[') != body.count(']]'):
        fout(rel, 'ongebalanceerde noten: %d× [[ vs %d× ]]' % (body.count('[['), body.count(']]')))
    gebruikt = []
    if not verzamel_codes(body, gebruikt):
        fout(rel, 'noot zonder sluitende ]]')
    for c in set(gebruikt):
        if c and c not in codes:
            fout(rel, 'noot verwijst naar niet-gedeclareerd apparaat: %r' % c)

    for mm in re.finditer(r'\{[a-z]+:[^{}]*\{', body):
        fout(rel, 'geneste {typografie} rond positie %d (kan niet weergegeven worden)' % mm.start())

    for i, regel in enumerate(body.split('\n'), 1):
        if regel.startswith('@ '):
            links = regel[1:].split('|')[0].strip()
            links = re.sub(r'\s+(sv|sn)$', '', links, flags=re.I)   # stilo-aanduiding
            sleutel = links.split('/')[0].strip()                   # begin van een bereik
            if not re.match(r'^\d{4}(-\d{1,2}){0,2}$', sleutel):
                fout(rel, 'ongeldige dagtekening op regel %d: %r' % (i, sleutel))


# ---- html-verwijzingen ---------------------------------------------------
REF = re.compile(r'(?:src|href|data-bron)\s*=\s*"([^"]+)"')
def controleer_html(pad, rel):
    tekst = open(pad, encoding='utf-8').read()
    basis = os.path.dirname(pad)
    for ref in REF.findall(tekst):
        if re.match(r'^(https?:|//|#|mailto:|data:|tel:)', ref): continue
        doel = os.path.normpath(os.path.join(basis, ref.split('#')[0].split('?')[0]))
        if not os.path.exists(doel):
            fout(rel, 'verwijzing bestaat niet: %s' % ref)


def main():
    edir = os.path.join(ROOT, 'edities')
    n_ed = 0
    for slug in sorted(os.listdir(edir)):
        d = os.path.join(edir, slug)
        if not os.path.isdir(d): continue
        idx = os.path.join(d, 'index.html')
        if not os.path.exists(idx):
            fout('edities/' + slug, 'geen index.html'); continue
        n_ed += 1
        html = open(idx, encoding='utf-8').read()
        m = re.search(r'data-bron="([^"]+)"', html)
        if m:
            bron = os.path.normpath(os.path.join(d, m.group(1)))
            if not os.path.exists(bron):
                fout('edities/' + slug, 'bron ontbreekt: %s' % m.group(1))
            else:
                controleer_bron(bron, 'edities/%s/%s' % (slug, m.group(1)))

    for dirpad, _, bestanden in os.walk(ROOT):
        if '/.git' in dirpad: continue
        for b in bestanden:
            if b.endswith('.html'):
                pad = os.path.join(dirpad, b)
                controleer_html(pad, os.path.relpath(pad, ROOT))

    for waar, msg in waarschuwingen:
        print('  waarschuwing  %s: %s' % (waar, msg))
    for waar, msg in fouten:
        print('  FOUT          %s: %s' % (waar, msg))
    print('\n%d edities gecontroleerd — %d fout(en), %d waarschuwing(en).'
          % (n_ed, len(fouten), len(waarschuwingen)))
    sys.exit(1 if fouten else 0)


if __name__ == '__main__':
    main()
