/*
 * importeer.js — browserversie van importeer.py
 * ----------------------------------------------------------------------------
 * Zet een Obsidian-vriendelijk schrijfbestand (editie.md) om naar het
 * runtime-formaat (bron.txt), volledig client-side. Dezelfde logica als
 * importeer.py: schone hoofdtekst + een === NOTEN ===-blok met  lemma | code |
 * inhoud , dat per lemma in de tekst wordt verankerd; plus een optioneel
 * === REGISTER ===-blok dat als register:-regels aan de frontmatter komt.
 *
 * Gebruik:  var res = Importeer.naarBron(editieMdTekst);
 *           res.bron      -> de bron.txt-tekst
 *           res.rapport   -> [{status:'ok'|'mis', tekst, code}]
 */
(function (global) {
  'use strict';

  var NOTEN = /^\s*={3,}\s*NOTEN\s*={3,}\s*$/i;
  var REGISTER = /^\s*={3,}\s*REGISTER\s*={3,}\s*$/i;
  var LIJST_ITEM = /^([-*]|\d+\.)(\s+)(.*)$/;

  // ---- Frontmatter / hoofdtekst / noten / register ------------------------
  function parseBestand(tekst) {
    var m = tekst.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
    var frontmatter = m ? m[1] : '';
    var rest = m ? tekst.slice(m[0].length) : tekst;

    var tekstregels = [], notenregels = [], registerregels = [];
    var sectie = 'tekst';
    rest.split('\n').forEach(function (regel) {
      if (NOTEN.test(regel)) { sectie = 'noten'; return; }
      if (REGISTER.test(regel)) { sectie = 'register'; return; }
      if (sectie === 'noten') notenregels.push(regel);
      else if (sectie === 'register') registerregels.push(regel);
      else tekstregels.push(regel);
    });

    var noten = [];
    notenregels.forEach(function (regel) {
      if (!regel.trim() || regel.trimStart().charAt(0) === '#' || regel.indexOf('|') === -1) return;
      var velden = splitPipe(regel, 3).map(function (x) { return x.trim(); });
      if (velden.length === 3) noten.push(velden);
    });

    var register = [];
    registerregels.forEach(function (regel) {
      if (!regel.trim() || regel.trimStart().charAt(0) === '#' || regel.indexOf('|') === -1) return;
      register.push(regel.trim());
    });
    return { frontmatter: frontmatter, hoofdtekst: tekstregels.join('\n'), noten: noten, register: register };
  }

  // Split op de eerste (max-1) pipes — als str.split met limiet, maar de rest
  // van de string blijft in het laatste veld (zoals Python split('|', 2)).
  function splitPipe(s, max) {
    var out = [], i = 0, start = 0;
    while (out.length < max - 1) {
      var p = s.indexOf('|', start);
      if (p === -1) break;
      out.push(s.slice(i, p));
      i = p + 1; start = p + 1;
    }
    out.push(s.slice(i));
    return out;
  }

  // Split op top-niveau | (respecteert geneste [[ ]]).
  function splitTopPipe(s) {
    var velden = [], cur = '', depth = 0, i = 0;
    while (i < s.length) {
      if (s.substr(i, 2) === '[[') { depth++; cur += '[['; i += 2; }
      else if (s.substr(i, 2) === ']]') { depth--; cur += ']]'; i += 2; }
      else if (s.charAt(i) === '|' && depth === 0) { velden.push(cur); cur = ''; i++; }
      else { cur += s.charAt(i); i++; }
    }
    velden.push(cur);
    return velden;
  }

  function tabelCellen(rij) {
    var s = rij.trim().replace(/^\|/, '').replace(/\|\s*$/, '');
    return splitTopPipe(s).map(function (c) { return c.trim(); });
  }
  function isScheidingsrij(rij) {
    var cellen = tabelCellen(rij);
    return cellen.length > 0 && cellen.every(function (c) { return /^:?-{3,}:?$/.test(c); });
  }

  // ---- Blokken ------------------------------------------------------------
  function maakBlokken(tekst) {
    var blokken = [];
    var para = [], lijst = [], tabel = [];

    function flushPara() {
      if (para.length) {
        blokken.push({ type: 'para', tekst: para.map(function (x) { return x.trim(); }).join(' ') });
        para = [];
      }
    }
    function flushLijst() {
      if (lijst.length) {
        var items = lijst.map(function (s) {
          var m = s.match(LIJST_ITEM);
          return { marker: m[1] + m[2], inhoud: m[3] };
        });
        blokken.push({ type: 'lijst', items: items, geordend: /^\d/.test(lijst[0]) });
        lijst = [];
      }
    }
    function flushTabel() {
      if (tabel.length) {
        var rijen = tabel.map(function (s) {
          var sep = isScheidingsrij(s);
          return { sep: sep, raw: s, cellen: sep ? [] : tabelCellen(s) };
        });
        blokken.push({ type: 'tabel', rijen: rijen });
        tabel = [];
      }
    }
    function flush() { flushPara(); flushLijst(); flushTabel(); }

    tekst.split('\n').forEach(function (regel) {
      var s = regel.trim();
      if (s === '') flush();
      else if (/^#{1,3}\s/.test(s)) { flush(); blokken.push({ type: 'kop', tekst: s }); }
      else if (/^!\[.*\]\(.*\)/.test(s)) { flush(); blokken.push({ type: 'fig', tekst: s }); }
      else if (s.charAt(0) === '~') { flush(); blokken.push({ type: 'mark', tekst: s }); }
      else if (/^@\s/.test(s)) { flush(); blokken.push({ type: 'dag', tekst: s }); }
      else if (LIJST_ITEM.test(s)) { flushPara(); flushTabel(); lijst.push(s); }
      else if (s.charAt(0) === '|') { flushPara(); flushLijst(); tabel.push(s); }
      else { flushLijst(); flushTabel(); para.push(s); }
    });
    flush();
    return blokken;
  }

  // ---- Lemma opzoeken -----------------------------------------------------
  function zoekSpan(tekst, delen, start, occ) {
    var lo = tekst.toLowerCase();
    if (delen.length === 1) {
      var deel = delen[0].toLowerCase();
      if (!deel) return null;
      if (occ) {
        var pos = 0, idx = -1;
        for (var n = 0; n < occ; n++) {
          idx = lo.indexOf(deel, pos);
          if (idx === -1) return null;
          pos = idx + deel.length;
        }
        return [idx, idx + deel.length];
      }
      var i = lo.indexOf(deel, start);
      return i === -1 ? null : [i, i + deel.length];
    }
    var kop = delen[0].toLowerCase(), staart = delen[delen.length - 1].toLowerCase();
    var hi = lo.indexOf(kop, start);
    if (hi === -1) return null;
    var ti = lo.indexOf(staart, hi + kop.length);
    if (ti === -1) return null;
    return [hi, ti + staart.length];
  }

  // ---- Segmenten (alinea / lijstitem / tabelcel) --------------------------
  function maakSegmenten(blokken) {
    var segs = [];
    blokken.forEach(function (b) {
      if (b.type === 'para') {
        segs.push({ lees: function () { return b.tekst; }, schrijf: function (v) { b.tekst = v; }, inserts: [] });
      } else if (b.type === 'lijst') {
        b.items.forEach(function (it) {
          segs.push({ lees: function () { return it.inhoud; }, schrijf: function (v) { it.inhoud = v; }, inserts: [] });
        });
      } else if (b.type === 'tabel') {
        b.rijen.forEach(function (rij) {
          if (rij.sep) return;
          rij.cellen.forEach(function (_c, ci) {
            segs.push({ lees: function () { return rij.cellen[ci]; }, schrijf: function (v) { rij.cellen[ci] = v; }, inserts: [] });
          });
        });
      }
    });
    return segs;
  }

  // ---- Verankeren ---------------------------------------------------------
  function ankerNoten(blokken, noten) {
    var segmenten = maakSegmenten(blokken);
    var rapport = [];
    var curSeg = 0, curPos = 0;

    noten.forEach(function (drietal) {
      var lemma = drietal[0], code = drietal[1], inhoud = drietal[2];
      var mm = lemma.match(/\((\d+)\)\s*$/);
      var occ = mm ? parseInt(mm[1], 10) : null;
      if (mm) lemma = lemma.slice(0, mm.index).trim();
      var delen = lemma.split(/\s*(?:…|\.\.\.)\s*/).map(function (d) { return d.trim(); });

      var gevonden = null;
      var si = curSeg, pos = curPos;
      while (si < segmenten.length) {
        var res = zoekSpan(segmenten[si].lees(), delen, pos, occ);
        if (res) { gevonden = [si, res]; break; }
        si++; pos = 0;
      }
      if (!gevonden) {
        for (var s2 = 0; s2 < segmenten.length; s2++) {
          var r2 = zoekSpan(segmenten[s2].lees(), delen, 0, occ);
          if (r2) { gevonden = [s2, r2]; break; }
        }
      }
      if (!gevonden) { rapport.push({ status: 'mis', tekst: lemma, code: code }); return; }
      var idx = gevonden[0], span = gevonden[1];
      var seg = segmenten[idx];
      seg.inserts.push({ s: span[0], e: span[1], code: code, inhoud: inhoud });
      curSeg = idx; curPos = span[1];
      rapport.push({ status: 'ok', tekst: seg.lees().slice(span[0], span[1]), code: code });
    });
    return { segmenten: segmenten, rapport: rapport };
  }

  // ---- Geneste [[ ]] bouwen -----------------------------------------------
  function bouwGenest(tekst, items) {
    items = items.slice().sort(function (a, b) { return a.s - b.s || b.e - a.e; });
    var roots = [], stack = [];
    items.forEach(function (it) {
      while (stack.length && it.s >= stack[stack.length - 1].e) stack.pop();
      if (stack.length) {
        var ouder = stack[stack.length - 1];
        if (it.e > ouder.e) return; // kruist de ouder: niet nestbaar
        (ouder.kids || (ouder.kids = [])).push(it);
      } else {
        roots.push(it);
      }
      stack.push(it);
    });
    function render(s, e, kids) {
      var uit = [], pos = s;
      (kids || []).slice().sort(function (a, b) { return a.s - b.s; }).forEach(function (k) {
        uit.push(tekst.slice(pos, k.s));
        var binnen = render(k.s, k.e, k.kids);
        uit.push('[[' + binnen + '|' + k.code + '|' + k.inhoud + ']]');
        pos = k.e;
      });
      uit.push(tekst.slice(pos, e));
      return uit.join('');
    }
    return render(0, tekst.length, roots);
  }

  function pasToe(segmenten) {
    segmenten.forEach(function (seg) {
      if (seg.inserts.length) seg.schrijf(bouwGenest(seg.lees(), seg.inserts));
    });
  }

  // ---- Bron opbouwen ------------------------------------------------------
  function bouwBron(frontmatter, blokken) {
    var uit = ['---', frontmatter, '---', ''];
    var vorig = null;
    blokken.forEach(function (b) {
      if (b.type === 'kop') {
        if (vorig !== null) uit.push('');
        uit.push(b.tekst); uit.push('');
      } else if (b.type === 'mark') {
        if (vorig === 'para') uit.push('');
        uit.push(b.tekst);
      } else if (b.type === 'dag') {
        if (vorig === 'para') uit.push('');
        uit.push(b.tekst);
      } else if (b.type === 'fig') {
        uit.push(''); uit.push(b.tekst); uit.push('');
      } else if (b.type === 'lijst') {
        uit.push('');
        b.items.forEach(function (it) { uit.push(it.marker + it.inhoud); });
        uit.push('');
      } else if (b.type === 'tabel') {
        uit.push('');
        b.rijen.forEach(function (rij) {
          uit.push(rij.sep ? rij.raw : '| ' + rij.cellen.join(' | ') + ' |');
        });
        uit.push('');
      } else {
        uit.push(b.tekst);
      }
      vorig = b.type;
    });
    return uit.join('\n').replace(/\s+$/, '') + '\n';
  }

  // ---- Hoofdfunctie -------------------------------------------------------
  function naarBron(editieMd) {
    var tekst = editieMd.replace(/%%[\s\S]*?%%/g, ''); // Obsidian-commentaar weg
    var p = parseBestand(tekst);
    var frontmatter = p.frontmatter;
    if (p.register.length) {
      var extra = p.register.map(function (r) { return 'register: ' + r; }).join('\n');
      frontmatter = frontmatter.replace(/\n+$/, '') + '\n' + extra;
    }
    var blokken = maakBlokken(p.hoofdtekst);
    var res = ankerNoten(blokken, p.noten);
    pasToe(res.segmenten);
    var bron = bouwBron(frontmatter, blokken);
    return { bron: bron, rapport: res.rapport };
  }

  global.Importeer = { naarBron: naarBron };
})(window);
