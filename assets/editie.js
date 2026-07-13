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
    var id = code + '-' + (ctx.noten.length + 1);
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
  function renderBody(body, config) {
    var regels = body.replace(/\r\n/g, '\n').split('\n');
    var stap = parseInt(config.meta.regelnummering, 10) || 0; // 0 = geen nummering
    var noten = [];
    var uit = [];
    var regelnr = 0;
    var inAlinea = false;

    function sluitAlinea() { if (inAlinea) { uit.push('</div>'); inAlinea = false; } }
    function openAlinea() { if (!inAlinea) { uit.push('<div class="alinea">'); inAlinea = true; } }

    for (var i = 0; i < regels.length; i++) {
      var r = regels[i];
      var t = r.trim();
      if (t === '') { sluitAlinea(); continue; }

      // koppen: #, ##, ###
      var kop = t.match(/^(#{1,3})\s+(.*)$/);
      if (kop) {
        sluitAlinea();
        var niveau = kop[1].length;         // 1, 2 of 3
        var hTag = 'h' + (niveau + 1);       // h2 / h3 / h4
        uit.push('<' + hTag + ' class="tekstkop kop-' + niveau + '">' +
                 opmaak(escapeHtml(kop[2])) + '</' + hTag + '>');
        continue;
      }

      // pagina-/foliomarkering: ~ LABEL | DOEL
      if (t.charAt(0) === '~') {
        var pm = t.slice(1).split('|').map(function (x) { return x.trim(); });
        openAlinea();
        uit.push('<span class="pb" data-doel="' + escapeHtml(pm[1] || '') +
                 '" title="Toon origineel">∣' + escapeHtml(pm[0] || '?') + '</span>');
        continue;
      }

      // gewone tekstregel
      openAlinea();
      regelnr++;
      var toonNr = stap > 0 && (regelnr % stap === 0);
      var inhoud = renderInline(r, { config: config, noten: noten, regel: regelnr });
      uit.push(
        '<span class="tregel" id="r' + regelnr + '" data-n="' + regelnr + '">' +
          '<span class="rnr">' + (toonNr ? regelnr : '') + '</span>' +
          '<span class="rtekst">' + inhoud + '</span>' +
        '</span>'
      );
    }
    sluitAlinea();
    return { html: uit.join('\n'), noten: noten, regels: regelnr };
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
  function renderWerkbalk(config, noten) {
    var aanwezig = {};
    noten.forEach(function (n) { aanwezig[n.code] = true; });
    var heeftNummers = parseInt(config.meta.regelnummering, 10) > 0;
    var uit = ['<div class="werkbalk" role="group" aria-label="Weergaveopties">'];
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

  // ---- Interacties --------------------------------------------------------
  function koppelInteracties(root, config, noten) {
    var nootIndex = {};
    noten.forEach(function (n) { nootIndex[n.id] = n; });

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
    root.innerHTML =
      kop +
      renderWerkbalk(config, body.noten) +
      '<div class="tekst">' + body.html + '</div>' +
      renderApparaten(config, body.noten, heeftNummers);

    var styleEl = document.createElement('style');
    styleEl.textContent = verbergCss;
    root.appendChild(styleEl);

    koppelInteracties(root, config, body.noten);
    return { config: config, regels: body.regels, noten: body.noten.length };
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
