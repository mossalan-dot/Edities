/*
 * editie.js — motor voor wetenschappelijke edities van vroegmoderne teksten
 * ----------------------------------------------------------------------------
 * Dependency-vrij. Leest een bronbestand in de eenvoudige editie-markup
 * (zie spelregels.html) en rendert:
 *   - de tekst met (optionele) regelnummering
 *   - meerdere togglebare notenapparaten (editeur- en auteursnoten)
 *   - GENESTE noten: een editeur kan een noot maken op een auteursnoot
 *   - geen markeringstekens in de tekst; geannoteerde woorden zijn subtiel
 *     onderstreept en tonen hun noot bij hover of klik
 *   - typografie (kleinkapitaal, cursief, doorhaling, super-/subscript, koppen)
 *   - editeursingrepen (toevoeging, onzekere lezing, opgeloste afkorting, lacune)
 *   - pagina-/foliomarkeringen gekoppeld aan het origineel (pdf-pagina of scan)
 */
(function (global) {
  'use strict';

  var PALET = ['#0f766e', '#7c3aed', '#b45309', '#be123c', '#1d4ed8', '#4d7c0f'];

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Inline typografie en editeursingrepen (noten zijn hier al afgehandeld).
  function opmaak(s) {
    s = s.replace(/\{(\w+):([\s\S]*?)\}/g, function (m, code, body) {
      switch (code) {
        case 'sc':  return '<span class="sc">' + body + '</span>';        // kleinkapitaal
        case 'sup': return '<sup>' + body + '</sup>';                     // superscript
        case 'sub': return '<sub>' + body + '</sub>';                     // subscript
        case 'del': return '<span class="ed-del">' + body + '</span>';    // doorhaling
        case 'add': return '<span class="ed-add">⟨' + body + '⟩</span>'; // editeurstoevoeging
        case 'unc': return '<span class="ed-unc">' + body + '<span class="unc-teken">[?]</span></span>';
        case 'ex':  return '<span class="ed-ex">' + body + '</span>';     // opgeloste afkorting (heel woord)
        case 'ab':  return '<span class="ed-ab">' + body + '</span>';     // opgeloste letters binnen woord: (…)
        case 'gap': return '<span class="ed-gap">[' + (body || 'lacune') + ']</span>';
        default:    return body;
      }
    });
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return s;
  }

  // ---- Front-matter -------------------------------------------------------
  function parseKop(tekst) {
    var config = { apparaten: [], meta: {} };
    var m = tekst.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
    var rest = tekst;
    if (m) {
      rest = tekst.slice(m[0].length);
      m[1].split('\n').forEach(function (regel) {
        var idx = regel.indexOf(':');
        if (idx === -1) return;
        var key = regel.slice(0, idx).trim();
        var val = regel.slice(idx + 1).trim();
        if (key === 'apparaat') {
          var d = val.split('|').map(function (x) { return x.trim(); });
          var soort = d[2] || 'editeur';
          var zijde = d[3] || (soort === 'origineel' ? 'rechts' : 'links');
          config.apparaten.push({ code: d[0], label: d[1] || d[0], soort: soort, zijde: zijde });
        } else if (key) {
          config.meta[key] = val;
        }
      });
    }
    config.apparaten.forEach(function (a, i) { a.kleur = PALET[i % PALET.length]; });
    return { config: config, body: rest };
  }

  function apparaatVan(config, code) {
    for (var i = 0; i < config.apparaten.length; i++) {
      if (config.apparaten[i].code === code) return config.apparaten[i];
    }
    return null;
  }

  // ---- Noten: gebalanceerde [[ ]]-parser (ondersteunt nesting) ------------

  // Zoek de sluitende ]] die hoort bij een [[, met inachtneming van nesting.
  function matchClose(s, from) {
    var depth = 1, i = from;
    while (i < s.length) {
      if (s.charAt(i) === '[' && s.charAt(i + 1) === '[') { depth++; i += 2; }
      else if (s.charAt(i) === ']' && s.charAt(i + 1) === ']') {
        depth--; if (depth === 0) return i; i += 2;
      } else i++;
    }
    return -1;
  }

  // Splits een payload op pipes die NIET binnen geneste [[ ]] staan.
  function splitTop(payload) {
    var velden = [], cur = '', depth = 0, i = 0;
    while (i < payload.length) {
      if (payload.charAt(i) === '[' && payload.charAt(i + 1) === '[') { depth++; cur += '[['; i += 2; }
      else if (payload.charAt(i) === ']' && payload.charAt(i + 1) === ']') { depth--; cur += ']]'; i += 2; }
      else if (payload.charAt(i) === '|' && depth === 0) { velden.push(cur); cur = ''; i++; }
      else { cur += payload.charAt(i); i++; }
    }
    velden.push(cur);
    return velden;
  }

  // Reduceer een lemma tot platte woorden (voor het ingekorte label): strip
  // geneste noten (hou hun lemma), typografiecommando's en cursiefsterren.
  function plattekst(s) {
    s = s.replace(/\[\[([\s\S]*?)\]\]/g, function (m, p) { return splitTop(p)[0]; });
    s = s.replace(/\{\w+:([\s\S]*?)\}/g, '$1');
    return s.replace(/\*/g, '');
  }

  // Label voor apparaat/kantnoot: bij lange lemma's "eerste … laatste woord".
  var LEMMA_MAX_WOORDEN = 5;
  function maakLabel(lemma, lemmaHtml) {
    var woorden = plattekst(lemma).replace(/\s+/g, ' ').trim().split(' ');
    if (woorden.length > LEMMA_MAX_WOORDEN) {
      return woorden[0] + ' … ' + woorden[woorden.length - 1];
    }
    return lemmaHtml;
  }

  // Verwerk een (reeds ge-escapete) tekst: wissel typografie en noten af.
  // ctx = { config, noten, regel }.
  function parseSegment(s, ctx) {
    var out = '', i = 0;
    while (i < s.length) {
      var open = s.indexOf('[[', i);
      if (open === -1) { out += opmaak(s.slice(i)); break; }
      out += opmaak(s.slice(i, open));
      var close = matchClose(s, open + 2);
      if (close === -1) { out += opmaak(s.slice(open)); break; }
      out += emitNote(s.slice(open + 2, close), ctx);
      i = close + 2;
    }
    return out;
  }

  function emitNote(payload, ctx) {
    var velden = splitTop(payload);
    var lemma = (velden[0] || '').trim();
    var code = (velden[1] || '').trim();
    var inhoud = velden.slice(2).join('|').trim();
    var app = apparaatVan(ctx.config, code);
    if (!app) return opmaak(lemma); // onbekend apparaat: lemma ongemarkeerd tonen
    var id = code + '-' + (++ctx.global.n);
    var noot = { id: id, code: code, regel: ctx.regel, lemmaHtml: '', inhoudHtml: '' };
    ctx.noten.push(noot);
    noot.inhoudHtml = parseSegment(inhoud, ctx); // geneste noot in de inhoud
    noot.lemmaHtml = parseSegment(lemma, ctx);   // geneste noot in het lemma (hoofdtekst)
    noot.labelHtml = maakLabel(lemma, noot.lemmaHtml); // ingekort label voor apparaat/kantnoot
    return '<span class="lemma app-' + code + '" data-noot="' + id + '" tabindex="0" ' +
           'role="button" aria-label="Toon noot" style="--kleur:' + app.kleur + '">' +
           noot.lemmaHtml + '</span>';
  }

  function renderInline(raw, ctx) {
    return parseSegment(escapeHtml(raw), ctx);
  }

  // ---- Body ---------------------------------------------------------------
  // Splitst de tekst in "pagina's" op de ~-paginamarkeringen, zodat de lezer
  // kan wisselen tussen doorlopend lezen en per pagina doorbladeren.
  function renderBody(body, config) {
    var regels = body.replace(/\r\n/g, '\n').split('\n');
    var stap = parseInt(config.meta.regelnummering, 10) || 0; // 0 = geen nummering
    var global = { n: 0 };   // globale nootteller (uniek over alle pagina's)
    var regelnr = 0;
    var paginas = [];
    var cur = { label: null, doel: null, uit: [], noten: [], inAlinea: false };

    function sluit() { if (cur.inAlinea) { cur.uit.push('</div>'); cur.inAlinea = false; } }
    function open() { if (!cur.inAlinea) { cur.uit.push('<div class="alinea">'); cur.inAlinea = true; } }

    for (var i = 0; i < regels.length; i++) {
      var r = regels[i];
      var t = r.trim();
      if (t === '') { sluit(); continue; }

      // koppen: #, ##, ###
      var kop = t.match(/^(#{1,3})\s+(.*)$/);
      if (kop) {
        sluit();
        var niveau = kop[1].length;         // 1, 2 of 3
        var hTag = 'h' + (niveau + 1);       // h2 / h3 / h4
        cur.uit.push('<' + hTag + ' class="tekstkop kop-' + niveau + '">' +
                     opmaak(escapeHtml(kop[2])) + '</' + hTag + '>');
        continue;
      }

      // pagina-/foliomarkering: ~ LABEL | DOEL  → paginagrens
      if (t.charAt(0) === '~') {
        var pm = t.slice(1).split('|').map(function (x) { return x.trim(); });
        var label = pm[0] || '?', doel = pm[1] || '';
        var pb = '<span class="pb" data-doel="' + escapeHtml(doel) +
                 '" title="Toon origineel">∣' + escapeHtml(label) + '</span>';
        sluit();
        if (cur.label === null) {
          // eerste markering: label de huidige (eventueel voorafgaande) inhoud
          cur.label = label; cur.doel = doel; cur.uit.push(pb);
        } else {
          paginas.push(cur);
          cur = { label: label, doel: doel, uit: [pb], noten: [], inAlinea: false };
        }
        continue;
      }

      // gewone tekstregel
      open();
      regelnr++;
      var toonNr = stap > 0 && (regelnr % stap === 0);
      var inhoud = renderInline(r, { config: config, noten: cur.noten, regel: regelnr, global: global });
      cur.uit.push(
        '<span class="tregel" id="r' + regelnr + '" data-n="' + regelnr + '">' +
          '<span class="rnr">' + (toonNr ? regelnr : '') + '</span>' +
          '<span class="rtekst">' + inhoud + '</span>' +
        '</span>'
      );
    }
    sluit();
    paginas.push(cur);
    var alle = [];
    paginas.forEach(function (p) { alle = alle.concat(p.noten); });
    return { paginas: paginas, noten: alle, regels: regelnr };
  }

  // ---- Apparaten onderaan -------------------------------------------------
  function renderApparaten(config, noten, heeftNummers) {
    var perCode = {};
    noten.forEach(function (n) { (perCode[n.code] = perCode[n.code] || []).push(n); });
    var uit = ['<div class="apparaten">'];
    config.apparaten.forEach(function (app) {
      var lijst = perCode[app.code];
      if (!lijst || !lijst.length) return;
      uit.push('<section class="apparaat app-' + app.code + '" data-code="' + app.code +
               '" style="--kleur:' + app.kleur + '">');
      uit.push('<h3 class="apparaat-kop">' + escapeHtml(app.label) +
               '<span class="apparaat-soort">' +
               (app.soort === 'origineel' ? 'oorspronkelijk' : 'editeur') + '</span></h3>');
      uit.push('<ul class="nootlijst">');
      lijst.forEach(function (n) {
        var regelLink = n.regel
          ? '<a class="nr-terug" href="#r' + n.regel + '" title="Terug naar de tekst">' +
            (heeftNummers ? n.regel : '↩') + '</a> '
          : '';
        uit.push('<li id="n-' + n.id + '" data-noot="' + n.id + '">' + regelLink +
                 '<span class="noot-lemma">' + n.labelHtml + '</span><span class="l-scheid"> | </span>' +
                 '<span class="noot-inhoud">' + n.inhoudHtml + '</span></li>');
      });
      uit.push('</ul></section>');
    });
    uit.push('</div>');
    return uit.join('\n');
  }

  // ---- Werkbalk -----------------------------------------------------------
  function renderWerkbalk(config, noten, meerdere) {
    var aanwezig = {};
    noten.forEach(function (n) { aanwezig[n.code] = true; });
    var heeftNummers = parseInt(config.meta.regelnummering, 10) > 0;
    var uit = ['<div class="werkbalk" role="group" aria-label="Weergaveopties">'];
    uit.push('<div class="wb-boven">');
    uit.push('<div class="wb-groep wb-zoek">');
    uit.push('<input type="search" class="zoekveld" placeholder="Zoek in de tekst…" aria-label="Zoeken in de editie">');
    uit.push('<span class="zoek-status" aria-live="polite"></span>');
    uit.push('<button type="button" class="zoek-knop" data-zoek="vorige" title="Vorige treffer" disabled>‹</button>');
    uit.push('<button type="button" class="zoek-knop" data-zoek="volgende" title="Volgende treffer" disabled>›</button>');
    uit.push('</div>');
    uit.push('<button type="button" class="wb-uitklap" aria-expanded="false" aria-controls="wb-instellingen">' +
             'Weergave <span class="wb-caret">▾</span></button>');
    uit.push('</div>'); // wb-boven
    uit.push('<div class="wb-instellingen" id="wb-instellingen" hidden>');
    if (meerdere) {
      uit.push('<div class="wb-groep"><span class="wb-kop">Weergave</span>');
      uit.push('<label class="wb-opt"><input type="radio" name="modus" value="doorlopend" checked> Doorlopend</label>');
      uit.push('<label class="wb-opt"><input type="radio" name="modus" value="bladeren"> Per pagina</label>');
      uit.push('</div>');
    }
    uit.push('<div class="wb-groep"><span class="wb-kop">Tonen</span>');
    if (heeftNummers) uit.push(toggle('opt-regelnr', 'Regelnummers', true));
    uit.push(toggle('opt-markering', 'Markeer geannoteerde woorden', true));
    uit.push(toggle('opt-editie', 'Paginamarkeringen', true));
    uit.push(toggle('opt-afkorting', 'Opgeloste afkortingen markeren', true));
    uit.push('</div>');
    uit.push('<div class="wb-groep"><span class="wb-kop">Apparaten</span>');
    config.apparaten.forEach(function (app) {
      if (!aanwezig[app.code]) return;
      uit.push('<label class="wb-app" style="--kleur:' + app.kleur + '">' +
               '<input type="checkbox" data-app="' + app.code + '" checked> ' +
               '<span class="wb-stip"></span>' + escapeHtml(app.label) + '</label>');
    });
    uit.push('</div>');   // Apparaten-groep
    uit.push('</div>');   // wb-instellingen
    uit.push('</div>');   // werkbalk
    return uit.join('');
  }
  function toggle(id, label, aan) {
    return '<label class="wb-opt"><input type="checkbox" id="' + id + '"' +
           (aan ? ' checked' : '') + '> ' + label + '</label>';
  }

  function bouwPager(paginas) {
    var opts = paginas.map(function (p, i) {
      return '<option value="' + (i + 1) + '">' + escapeHtml(p.label || ('[' + (i + 1) + ']')) + '</option>';
    }).join('');
    return '<div class="pager" hidden>' +
      '<button type="button" data-pager="vorige">‹ Vorige</button>' +
      '<span class="pager-midden">pagina <select class="pager-select">' + opts + '</select> van ' + paginas.length + '</span>' +
      '<button type="button" data-pager="volgende">Volgende ›</button></div>';
  }

  // ---- Interacties --------------------------------------------------------
  function koppelInteracties(root, config, noten) {
    var nootIndex = {};
    noten.forEach(function (n) { nootIndex[n.id] = n; });

    // ---- Kantlijnnoten (sidenotes) ---------------------------------------
    // De margekolommen zijn GLOBAAL (kinderen van de editie-root), zodat noten
    // over paginagrenzen heen netjes onder elkaar blijven staan.
    function maakKant(zijde) {
      var d = document.createElement('div');
      d.className = 'kant-' + zijde;
      root.appendChild(d);
      return d;
    }
    function herbereken() {
      var actief = window.matchMedia('(min-width: 1100px)').matches;
      root.classList.toggle('kantnoten-aan', actief);
      var links = root.querySelector(':scope > .kant-links') || maakKant('links');
      var rechts = root.querySelector(':scope > .kant-rechts') || maakKant('rechts');
      links.innerHTML = ''; rechts.innerHTML = '';
      if (!actief) return;
      var rootTop = root.getBoundingClientRect().top;
      var bezetRechts = [];  // door paginanummers bezette stukken (top,bodem)

      // Paginanummers in de rechtermarge, op de hoogte van elke paginastart
      root.querySelectorAll('.pagina').forEach(function (pag) {
        if (pag.offsetParent === null) return; // verborgen (bladermodus)
        var pbInline = pag.querySelector('.tekst .pb');
        if (!pbInline) return;
        var nr = document.createElement('div');
        nr.className = 'pagina-nr';
        nr.textContent = pbInline.textContent.replace('∣', '');
        var doel = pbInline.getAttribute('data-doel');
        if (doel) { nr.setAttribute('data-doel', doel); nr.classList.add('klikbaar'); }
        rechts.appendChild(nr);
        var top = pag.getBoundingClientRect().top - rootTop;
        nr.style.top = top + 'px';
        bezetRechts.push([top, top + nr.offsetHeight]);
      });

      var perZijde = { links: [], rechts: [] };
      noten.forEach(function (n) {
        if (root.classList.contains('verberg-app-' + n.code)) return;
        var anchor = root.querySelector('.tekst .lemma[data-noot="' + n.id + '"]');
        if (!anchor || anchor.offsetParent === null) return; // verborgen pagina
        var app = apparaatVan(config, n.code);
        var zijde = app.zijde === 'rechts' ? 'rechts' : 'links';
        perZijde[zijde].push({ n: n, anchor: anchor, app: app });
      });

      ['links', 'rechts'].forEach(function (z) {
        var cont = z === 'links' ? links : rechts;
        var lijst = perZijde[z];
        lijst.sort(function (a, b) {
          return a.anchor.getBoundingClientRect().top - b.anchor.getBoundingClientRect().top;
        });
        var laatsteBodem = 0;
        lijst.forEach(function (item) {
          var el = document.createElement('div');
          el.className = 'kantnoot app-' + item.n.code;
          el.setAttribute('data-noot', item.n.id);
          el.style.setProperty('--kleur', item.app.kleur);
          el.innerHTML = '<span class="kn-lemma">' + item.n.labelHtml + '</span> ' +
            '<span class="kn-inhoud">' + item.n.inhoudHtml + '</span>';
          cont.appendChild(el);
          var top = item.anchor.getBoundingClientRect().top - rootTop;
          if (top < laatsteBodem + 10) top = laatsteBodem + 10;
          // wijk uit voor paginanummers aan de rechterkant
          if (z === 'rechts') {
            bezetRechts.forEach(function (b) {
              if (top < b[1] && top + 20 > b[0]) top = b[1] + 6;
            });
          }
          el.style.top = top + 'px';
          laatsteBodem = top + el.offsetHeight;
        });
      });
    }
    var herTimer;
    function herberekenLater() { clearTimeout(herTimer); herTimer = setTimeout(herbereken, 120); }
    window.addEventListener('resize', herberekenLater);

    function markeerKant(id, aan) {
      var kn = root.querySelector('.kantnoot[data-noot="' + id + '"]');
      if (kn) kn.classList.toggle('actief', aan);
    }

    // Weergavemodus (doorlopend / per pagina) + pager
    var pager = root.querySelector('.pager');
    var secties = root.querySelectorAll('.pagina');
    var select = root.querySelector('.pager-select');
    var huidig = 1;
    function activeer(i) {
      i = Math.max(1, Math.min(secties.length, i));
      secties.forEach(function (s) { s.classList.toggle('actief', +s.getAttribute('data-i') === i); });
      if (select) select.value = i;
      var vb = root.querySelector('[data-pager="vorige"]');
      var vn = root.querySelector('[data-pager="volgende"]');
      if (vb) vb.disabled = i <= 1;
      if (vn) vn.disabled = i >= secties.length;
      huidig = i;
      history.replaceState(null, '', '#pagina-' + i);
    }
    function zetModus(m) {
      if (m === 'bladeren') {
        root.classList.add('modus-bladeren');
        root.classList.remove('modus-doorlopend');
        if (pager) pager.hidden = false;
        activeer(huidig);
      } else {
        root.classList.add('modus-doorlopend');
        root.classList.remove('modus-bladeren');
        if (pager) pager.hidden = true;
      }
    }

    // ---- Zoeken (over alle pagina's) --------------------------------------
    var veld = root.querySelector('.zoekveld');
    var zoekMarks = [];
    var zoekIdx = -1;
    var zoekTimer;

    function veldWaarde() { return veld ? veld.value.trim() : ''; }

    function updateZoekStatus() {
      var st = root.querySelector('.zoek-status');
      var vb = root.querySelector('[data-zoek="vorige"]');
      var vn = root.querySelector('[data-zoek="volgende"]');
      var heeft = zoekMarks.length > 0;
      if (st) st.textContent = veldWaarde()
        ? (heeft ? (zoekIdx + 1) + ' / ' + zoekMarks.length : 'geen treffers') : '';
      if (vb) vb.disabled = !heeft;
      if (vn) vn.disabled = !heeft;
    }

    function wisZoek() {
      root.querySelectorAll('.zoektreffer').forEach(function (m) {
        m.parentNode.replaceChild(document.createTextNode(m.textContent), m);
      });
      root.querySelectorAll('.pagina .tekst').forEach(function (c) { c.normalize(); });
      zoekMarks = []; zoekIdx = -1;
    }

    function wrapMatches(container, q) {
      var ql = q.toLowerCase();
      var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
      var nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(function (node) {
        var text = node.nodeValue, lower = text.toLowerCase(), idx = lower.indexOf(ql);
        if (idx === -1) return;
        var frag = document.createDocumentFragment(), last = 0;
        while (idx !== -1) {
          if (idx > last) frag.appendChild(document.createTextNode(text.slice(last, idx)));
          var mark = document.createElement('mark');
          mark.className = 'zoektreffer';
          mark.textContent = text.slice(idx, idx + q.length);
          frag.appendChild(mark);
          last = idx + q.length;
          idx = lower.indexOf(ql, last);
        }
        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
        node.parentNode.replaceChild(frag, node);
      });
    }

    function gaNaarTreffer(i) {
      if (!zoekMarks.length) return;
      i = (i % zoekMarks.length + zoekMarks.length) % zoekMarks.length;
      zoekMarks.forEach(function (m) { m.classList.remove('actief'); });
      var mark = zoekMarks[i];
      mark.classList.add('actief');
      zoekIdx = i;
      var sec = mark.closest('.pagina');
      if (sec && root.classList.contains('modus-bladeren')) activeer(+sec.getAttribute('data-i'));
      mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      updateZoekStatus();
    }

    function zoek(q) {
      wisZoek();
      q = q.trim();
      if (q.length < 2) { updateZoekStatus(); return; }
      root.querySelectorAll('.pagina .tekst').forEach(function (c) { wrapMatches(c, q); });
      zoekMarks = [].slice.call(root.querySelectorAll('.zoektreffer'));
      updateZoekStatus();
      if (zoekMarks.length) gaNaarTreffer(0);
    }

    if (veld) {
      veld.addEventListener('input', function () {
        clearTimeout(zoekTimer);
        zoekTimer = setTimeout(function () { zoek(veld.value); }, 180);
      });
      veld.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); gaNaarTreffer(zoekIdx + (e.shiftKey ? -1 : 1)); }
      });
    }

    var pop = document.createElement('div');
    pop.className = 'noot-popover';
    pop.hidden = true;
    document.body.appendChild(pop);

    function toonPopover(el) {
      var id = el.getAttribute('data-noot');
      var n = nootIndex[id];
      if (!n) return;
      if (root.classList.contains('verberg-app-' + n.code)) return;
      var app = apparaatVan(config, n.code);
      pop.innerHTML = '<span class="pop-label" style="color:' + app.kleur + '">' +
        escapeHtml(app.label) + (n.regel ? ' · regel ' + n.regel : '') + '</span>' +
        '<span class="pop-lemma">' + n.labelHtml + '</span>' +
        '<span class="pop-inhoud">' + n.inhoudHtml + '</span>';
      pop.style.setProperty('--kleur', app.kleur);
      pop.hidden = false;
      var rect = el.getBoundingClientRect();
      var top = rect.bottom + window.scrollY + 6;
      var left = rect.left + window.scrollX;
      left = Math.min(left, window.scrollX + document.documentElement.clientWidth - pop.offsetWidth - 12);
      pop.style.top = top + 'px';
      pop.style.left = Math.max(8, left) + 'px';
    }
    function verbergPopover() { pop.hidden = true; }

    // Alleen de eerste (hoofdtekst-)lemma van een noot reageert; geneste
    // lemma's in een kantnoot niet.
    function hoofdLemma(e) {
      var el = e.target.closest('.tekst .lemma');
      return el || null;
    }
    root.addEventListener('mouseover', function (e) {
      var el = hoofdLemma(e);
      if (!el) return;
      if (root.classList.contains('kantnoten-aan')) markeerKant(el.getAttribute('data-noot'), true);
      else toonPopover(el);
    });
    root.addEventListener('mouseout', function (e) {
      var el = hoofdLemma(e);
      if (!el) return;
      if (root.classList.contains('kantnoten-aan')) markeerKant(el.getAttribute('data-noot'), false);
      else verbergPopover();
    });
    root.addEventListener('focusin', function (e) {
      var el = hoofdLemma(e);
      if (el && !root.classList.contains('kantnoten-aan')) toonPopover(el);
    });
    root.addEventListener('focusout', verbergPopover);

    // Klik op gemarkeerde tekst -> spring naar de noot in het apparaat en laat
    // die oplichten.
    root.addEventListener('click', function (e) {
      var up = e.target.closest('.wb-uitklap');
      if (up) {
        var panel = root.querySelector('.wb-instellingen');
        var open = panel.hidden;
        panel.hidden = !open;
        up.setAttribute('aria-expanded', String(open));
        up.classList.toggle('open', open);
        return;
      }
      var pnr = e.target.closest('.pagina-nr[data-doel]');
      if (pnr) { openOrigineel(config, pnr.getAttribute('data-doel')); return; }
      var zb = e.target.closest('[data-zoek]');
      if (zb) { gaNaarTreffer(zoekIdx + (zb.getAttribute('data-zoek') === 'volgende' ? 1 : -1)); return; }
      var pg = e.target.closest('[data-pager]');
      if (pg) { activeer(huidig + (pg.getAttribute('data-pager') === 'volgende' ? 1 : -1)); return; }
      var lemma = e.target.closest('.tekst .lemma');
      if (lemma) {
        var id = lemma.getAttribute('data-noot');
        var n = nootIndex[id];
        if (n && root.classList.contains('verberg-app-' + n.code)) return;
        var doel = root.classList.contains('kantnoten-aan')
          ? root.querySelector('.kantnoot[data-noot="' + id + '"]')
          : document.getElementById('n-' + id);
        if (doel) {
          doel.scrollIntoView({ behavior: 'smooth', block: 'center' });
          doel.classList.add('markeer');
          setTimeout(function () { doel.classList.remove('markeer'); }, 1800);
        }
        return;
      }
      var pb = e.target.closest('.pb');
      if (pb) { openOrigineel(config, pb.getAttribute('data-doel')); return; }
    });

    root.addEventListener('change', function (e) {
      var t = e.target;
      if (t.name === 'modus') { zetModus(t.value); herberekenLater(); return; }
      if (t.classList.contains('pager-select')) { activeer(+t.value); return; }
      if (t.matches('input[data-app]')) {
        root.classList.toggle('verberg-app-' + t.getAttribute('data-app'), !t.checked);
        herberekenLater();
      } else if (t.id === 'opt-regelnr') {
        root.classList.toggle('geen-regelnr', !t.checked);
      } else if (t.id === 'opt-editie') {
        root.classList.toggle('geen-editiemark', !t.checked);
      } else if (t.id === 'opt-afkorting') {
        root.classList.toggle('geen-afkorting', !t.checked);
        herberekenLater();
      } else if (t.id === 'opt-markering') {
        root.classList.toggle('geen-markering', !t.checked);
      }
    });

    // Dieplink: #pagina-N opent direct in bladermodus op die pagina
    var mh = location.hash.match(/^#pagina-(\d+)/);
    if (mh && secties.length > 1) {
      var radio = root.querySelector('input[name="modus"][value="bladeren"]');
      if (radio) radio.checked = true;
      zetModus('bladeren');
      activeer(+mh[1]);
    }

    herbereken(); // kantlijnnoten plaatsen (indien breed genoeg)
  }

  // ---- Origineel (scan of pdf) --------------------------------------------
  function openOrigineel(config, doel) {
    if (!doel) return;
    if (config.meta.origineel_type === 'pdf' && config.meta.origineel_pdf) {
      window.open(config.meta.origineel_pdf + '#page=' + encodeURIComponent(doel), '_blank', 'noopener');
    } else if (config.meta.origineel_afbeeldingen) {
      toonLightbox(config.meta.origineel_afbeeldingen.replace('{n}', doel), doel);
    }
  }
  function toonLightbox(src, label) {
    var box = document.createElement('div');
    box.className = 'lightbox';
    box.innerHTML = '<div class="lb-binnen"><button class="lb-sluit" aria-label="Sluiten">×</button>' +
      '<img src="' + src + '" alt="Origineel ' + escapeHtml(label) + '">' +
      '<div class="lb-bijschrift">Origineel · ' + escapeHtml(label) + '</div></div>';
    function sluit() { box.remove(); document.removeEventListener('keydown', esc); }
    function esc(e) { if (e.key === 'Escape') sluit(); }
    box.addEventListener('click', function (e) {
      if (e.target === box || e.target.closest('.lb-sluit')) sluit();
    });
    document.addEventListener('keydown', esc);
    document.body.appendChild(box);
  }

  // ---- Publiek ------------------------------------------------------------
  function render(root, tekst) {
    var parsed = parseKop(tekst);
    var config = parsed.config;
    // achterwaartse compatibiliteit: facsimile_* -> origineel_*
    ['type', 'pdf', 'afbeeldingen'].forEach(function (k) {
      if (config.meta['facsimile_' + k] && !config.meta['origineel_' + k])
        config.meta['origineel_' + k] = config.meta['facsimile_' + k];
    });
    var body = renderBody(parsed.body, config);
    var meta = config.meta;

    var kop = '<header class="editie-kop">' +
      (meta.titel ? '<h1>' + escapeHtml(meta.titel) + '</h1>' : '') +
      '<p class="editie-sub">' +
        (meta.auteur ? '<span>' + escapeHtml(meta.auteur) + '</span>' : '') +
        (meta.jaar ? '<span>' + escapeHtml(meta.jaar) + '</span>' : '') +
        (meta.bron ? '<span class="editie-bron">' + escapeHtml(meta.bron) + '</span>' : '') +
      '</p></header>';

    var verbergCss = config.apparaten.map(function (a) {
      var c = a.code;
      return '.verberg-app-' + c + ' .lemma.app-' + c + '{border-bottom:none;cursor:text;background:none}' +
             '.verberg-app-' + c + ' .apparaat[data-code="' + c + '"]{display:none}';
    }).join('\n');

    var heeftNummers = parseInt(meta.regelnummering, 10) > 0;
    var meerdere = body.paginas.length > 1;
    var paginasHtml = body.paginas.map(function (p, idx) {
      return '<section class="pagina" data-i="' + (idx + 1) + '" data-label="' +
        escapeHtml(p.label || ('[' + (idx + 1) + ']')) + '">' +
        '<div class="tekst">' + p.uit.join('\n') + '</div>' +
        renderApparaten(config, p.noten, heeftNummers) +
        '</section>';
    }).join('');

    root.innerHTML =
      kop +
      renderWerkbalk(config, body.noten, meerdere) +
      (meerdere ? bouwPager(body.paginas) : '') +
      paginasHtml;
    root.classList.add('modus-doorlopend');

    var styleEl = document.createElement('style');
    styleEl.textContent = verbergCss;
    root.appendChild(styleEl);

    koppelInteracties(root, config, body.noten);
    return { config: config, regels: body.regels, noten: body.noten.length, paginas: body.paginas.length };
  }

  function laad(root) {
    var bron = root.getAttribute('data-bron');
    if (!bron) { console.error('Editie: geen data-bron opgegeven'); return; }
    fetch(bron)
      .then(function (r) { if (!r.ok) throw new Error('status ' + r.status); return r.text(); })
      .then(function (tekst) { render(root, tekst); })
      .catch(function (err) {
        root.innerHTML = '<p class="fout">Kon de editie niet laden (' + escapeHtml(err.message) +
          ').<br>Draai de site via een lokale server, bijv. <code>python3 -m http.server</code>.</p>';
      });
  }

  global.Editie = { laad: laad, render: render, parseKop: parseKop };
})(window);
