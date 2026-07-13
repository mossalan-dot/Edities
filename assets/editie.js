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
        case 'ex':  return '<span class="ed-ex">' + body + '</span>';     // opgeloste afkorting
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
          config.apparaten.push({ code: d[0], label: d[1] || d[0], soort: d[2] || 'editeur' });
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
    var noot = { id: id, code: code, regel: ctx.regel, lemmaHtml: opmaak(lemma), inhoudHtml: '' };
    ctx.noten.push(noot);
    noot.inhoudHtml = parseSegment(inhoud, ctx); // recursief: geneste noten
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
                 '<span class="noot-lemma">' + n.lemmaHtml + '</span>] ' +
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
    uit.push(toggle('opt-afkorting', 'Opgeloste afkortingen cursief', true));
    uit.push('</div>');
    uit.push('<div class="wb-groep"><span class="wb-kop">Apparaten</span>');
    config.apparaten.forEach(function (app) {
      if (!aanwezig[app.code]) return;
      uit.push('<label class="wb-app" style="--kleur:' + app.kleur + '">' +
               '<input type="checkbox" data-app="' + app.code + '" checked> ' +
               '<span class="wb-stip"></span>' + escapeHtml(app.label) + '</label>');
    });
    uit.push('</div></div>');
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
        '<span class="pop-lemma">' + n.lemmaHtml + '</span>' +
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

    root.addEventListener('mouseover', function (e) {
      var el = e.target.closest('.lemma');
      if (el) toonPopover(el);
    });
    root.addEventListener('mouseout', function (e) {
      if (e.target.closest('.lemma')) verbergPopover();
    });
    root.addEventListener('focusin', function (e) {
      var el = e.target.closest('.lemma');
      if (el) toonPopover(el);
    });
    root.addEventListener('focusout', verbergPopover);

    // Klik op gemarkeerde tekst -> spring naar de noot in het apparaat en laat
    // die oplichten.
    root.addEventListener('click', function (e) {
      var pg = e.target.closest('[data-pager]');
      if (pg) { activeer(huidig + (pg.getAttribute('data-pager') === 'volgende' ? 1 : -1)); return; }
      var lemma = e.target.closest('.lemma');
      if (lemma) {
        var id = lemma.getAttribute('data-noot');
        var n = nootIndex[id];
        if (n && root.classList.contains('verberg-app-' + n.code)) return;
        var doel = document.getElementById('n-' + id);
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
      if (t.name === 'modus') { zetModus(t.value); return; }
      if (t.classList.contains('pager-select')) { activeer(+t.value); return; }
      if (t.matches('input[data-app]')) {
        root.classList.toggle('verberg-app-' + t.getAttribute('data-app'), !t.checked);
      } else if (t.id === 'opt-regelnr') {
        root.classList.toggle('geen-regelnr', !t.checked);
      } else if (t.id === 'opt-editie') {
        root.classList.toggle('geen-editiemark', !t.checked);
      } else if (t.id === 'opt-afkorting') {
        root.classList.toggle('geen-afkorting', !t.checked);
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
