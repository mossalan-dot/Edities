# -*- coding: utf-8 -*-
"""
uit-pdf.py — extraheert de editie van Abraham van der Meersch uit de PDF-uitgave
naar het editie.md-schrijfformaat (schone hoofdtekst + === NOTEN ===-blok).

Afgestemd op de lay-out van deze specifieke PDF: body = 12pt, notenblok = 9.8pt,
voetnootcijfers in de tekst = 7.9pt (superscript), nootnummers = 6.5pt,
kapitalen in kopjes = 9.4pt. Vereist pymupdf (fitz).

Gebruik:  python3 uit-pdf.py <bron.pdf> <editie.md>
Draai daarna:  python3 importeer.py edities/van-der-meersch/editie.md
"""
import fitz, re
import sys
PDF = sys.argv[1] if len(sys.argv) > 1 else "Reisverslag_Van_der_Meersch.pdf"
UIT = sys.argv[2] if len(sys.argv) > 2 else "editie.md"
d = fitz.open(PDF)

def norm(s):
    s=re.sub(r'[\x80-\x9f\ue000-\uf8ff]','',s)
    s=s.replace('­','').replace('‐','-').replace('‘',"'").replace('’',"'")
    s=re.sub(r'[\t\r\xa0]+',' ',s)
    s=re.sub(r'\s*-{2,}\s*','–',s)
    s=re.sub(r' +',' ',s)
    return s

def is_marker(sp):
    sz=round(sp["size"],1); t=sp["text"].strip()
    return 7.0<=sz<=8.6 and not t.isalpha()   # cijfers + balk-glyphs weg, ordinalen blijven
def titlecase(s):
    return ' '.join(w[:1].upper()+w[1:].lower() if w else w for w in s.split(' '))

body=[]      # tokens: ('para',text) ('kop',text) ('pb',num or None)
footnotes=[] # {'num':int,'text':str}
cur_fn=None
prev_y=None; prev_page=None

for pi in range(16,53):   # PDF-pagina's 17..53
    lines=[]
    for b in d[pi].get_text("dict")["blocks"]:
        for l in b.get("lines",[]):
            if l["spans"]:
                lines.append((round(l["bbox"][1],1), round(l["bbox"][0],1), l["spans"]))
    lines.sort(key=lambda t:(t[0],t[1]))
    for (y,x,spans) in lines:
        sizes=[round(s["size"],1) for s in spans if s["text"].strip()]
        if not sizes: continue
        has_body=any(sz>=11 for sz in sizes)
        if has_body:
            txt=''.join(s["text"] for s in spans if not is_marker(s))
            txt=norm(txt).strip()
            if not txt: continue
            if re.fullmatch(r'\d+',txt): continue          # paginanummer bovenaan
            if txt.startswith('Afbeelding'): continue       # bijschrift
            # paragraafbreuk op grote y-sprong binnen dezelfde pagina
            if prev_page==pi and prev_y is not None and (y-prev_y)>22:
                body.append(('gap',None))
            prev_y=y; prev_page=pi
            iskop = bool(re.search(r'[A-Z]',txt)) and txt==txt.upper() and len(txt)<=60
            body.append(('kopcand' if iskop else 'line', txt))
        else:
            first=spans[0]
            if round(first["size"],1)<=7.0 and first["text"].strip().isdigit():
                cur_fn={'num':int(first["text"].strip()),
                        'text':norm(''.join(s["text"] for s in spans[1:])).strip()}
                footnotes.append(cur_fn)
            elif cur_fn is not None:
                cur_fn['text']+=' '+norm(''.join(s["text"] for s in spans)).strip()
    prev_page=pi

# ---- body opschonen: regels samenvoegen tot alinea's, |N| -> paginagrens,
#      groepen opeenvolgende kopregels: 1 regel = kop, meerdere = versblok
toks=[]
i=0
while i<len(body):
    t=body[i]
    if t[0]=='gap':
        toks.append(('gap',None)); i+=1; continue
    if t[0]=='kopcand':
        j=i
        while j<len(body) and body[j][0]=='kopcand': j+=1
        groep=[body[k][1] for k in range(i,j)]
        if len(groep)==1:
            toks.append(('kop',groep[0]))
        else:
            for g in groep: toks.append(('line',g))
            toks.append(('gap',None))
        i=j; continue
    toks.append(t); i+=1

# bouw alinea's en splits op |N|
paras=[]   # list of ('para',text)/('kop',text)/('pb',num)
buf=[]
def flush():
    global buf
    if buf:
        paras.append(('para',' '.join(buf))); buf=[]
for t in toks:
    if t[0]=='gap': flush()
    elif t[0]=='kop': flush(); paras.append(('kop',t[1]))
    else:
        # splits op |N| paginagrenzen binnen de regel
        parts=re.split(r'\|\s*(\d+)\s*\|', t[1])
        for k,seg in enumerate(parts):
            if k%2==1:
                flush(); paras.append(('pb',int(seg)))
            else:
                seg=seg.strip()
                if seg: buf.append(seg)
flush()

# ---- footnotes -> NOTEN-regels
def split_lemma(text):
    text=text.strip()
    if text[:1] in '“"':
        close={'“':'”','"':'"'}[text[0]]
        idx=text.find(close,1)
        if idx!=-1:
            lemma=text[:idx+1].strip(); inhoud=text[idx+1:].strip()
        else:
            lemma,inhoud=text,''
    else:
        m=re.search(r'\. ',text)
        if m: lemma,inhoud=text[:m.start()].strip(),text[m.end():].strip()
        else: lemma,inhoud=text,''
    lemma=re.sub(r'\s*(?:\.\.\.|…)\s*',' … ',lemma)
    return lemma,inhoud

noten=[]
for fn in footnotes:
    lemma,inhoud=split_lemma(fn['text'])
    wc=len(inhoud.split())
    code='w' if wc<=6 else 'comm'
    noten.append((lemma,code,inhoud))

# ---- schrijf editie.md
out=[]
out.append("""---
titel: Reisverhaal van Abraham van der Meersch
auteur: Abraham van der Meersch
jaar: 1672–1674
bron: Handschrift, Bijzondere Collecties Universiteit van Amsterdam, Ex. W 75 (38 pagina's)
type: handschrift
transcriptie: kritisch
origineel_type: afbeelding
origineel_afbeeldingen: origineel/pagina-{n}.jpg
apparaat: w      | Woordverklaringen          | editeur   | links
apparaat: comm   | Toelichting en commentaar  | editeur   | rechts
apparaat: auteur | Noten van de auteur        | origineel | rechts
---
""")
out.append("# Reisverhaal van Abraham van der Meersch\n")
out.append("~ p. 1 | 1")
first_pb=True
for kind,val in paras:
    if kind=='pb':
        out.append(f"\n~ p. {val} |")
    elif kind=='kop':
        out.append(f"\n## {{sc:{titlecase(val)}}}\n")
    else:
        out.append(val+"\n")
out.append("\n=== NOTEN ===")
for lemma,code,inhoud in noten:
    out.append(f"{lemma} | {code} | {inhoud}")

open(UIT,"w").write('\n'.join(out)+'\n')
print("body alinea's:",sum(1 for k,_ in paras if k=='para'),
      "| koppen:",sum(1 for k,_ in paras if k=='kop'),
      "| paginagrenzen:",sum(1 for k,_ in paras if k=='pb'),
      "| noten:",len(noten))
print("laatste nootnummer:",footnotes[-1]['num'] if footnotes else None,
      "| aantal footnotes:",len(footnotes))
