/*
 * editie.js — motor voor wetenschappelijke edities van vroegmoderne teksten
 * ----------------------------------------------------------------------------
 * Dependency-vrij. Leest een bronbestand in de eenvoudige editie-markup
 * (zie SPELREGELS.md), en rendert:
 *   - de tekst met automatische regelnummering (elke N regels)
 *   - meerdere togglebare notenapparaten (editeur- en auteursnoten)
 *   - typografische bijzonderheden (kleinkapitaal, cursief, superscript, ...)
 *   - editeursingrepen (toevoeging, onzekere lezing, opgeloste afkorting)
 *   - pagina-/foliomarkeringen gekoppeld aan facsimile (pdf-pagina of afbeelding)
 *
 * Gebruik in HTML:
 *   <div id="editie" data-bron="bron.txt"></div>
 *   <script src="../../assets/editie.js"></script>
 *   <script>Editie.laad(document.getElementById('editie'));</script>
 */
(function (global) {
  'use strict';

  // Toegankelijk kleurenpalet; per apparaat één kleur, cyclisch toegewezen.
  var PALET = ['#0f766e', '#7c3aed', '#b45309', '#be123c', '#1d4ed8', '#4d7c0f'];

  // ---- Hulpfuncties -------------------------------------------------------

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Inline typografie en editeursingrepen (GEEN noten; die zijn al vervangen
  // door plaatshouders voordat dit draait).
  function opmaak(s) {
    // {code:inhoud} — typografische commando's en editeursingrepen
    s = s.replace(/\{(\w+):([\s\S]*?)\}/g, function (m, code, body) {
      switch (code) {
        case 'sc':  return '<span class="sc">' + body + '</span>';        // kleinkapitaal
        case 'sup': return '<sup>' + body + '</sup>';                     // superscript
        case 'sub': return '<sub>' + body + '</sub>';                     // subscript
        case 'add': return '<span class="ed-add">⟨' + body + '⟩</span>'; // editeurstoevoeging ⟨⟩
        case 'unc': return '<span class="ed-unc">' + body + '<span class="unc-teken">[?]</span></span>'; // onzekere lezing
        case 'ex':  return '<span class="ed-ex">' + body + '</span>';     // opgeloste afkorting
        case 'gap': return '<span class="ed-gap">[' + (body || 'lacune') + ']</span>'; // lacune
        default:    return body;
      }
    });
    // *cursief*
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return s;
  }

  // ---- Front-matter parser ------------------------------------------------
  // Platte key: value-regels tussen twee `---`-regels.
  // Meervoudige `apparaat:`-regels in de vorm  code | label | soort
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
    // kleur per apparaat
    config.apparaten.forEach(function (a, i) { a.kleur = PALET[i % PALET.length]; });
    return { config: config, body: rest };
  }

  // ---- Body parser + renderer --------------------------------------------

  function apparaatVan(config, code) {
    for (var i = 0; i < config.apparaten.length; i++) {
      if (config.apparaten[i].code === code) return config.apparaten[i];
    }
    return null;
  }

  function renderInline(raw, config, noten, tellers) {
    // 1. escape
    var esc = escapeHtml(raw);
    // 2. noten [[lemma|code|inhoud]] -> plaatshouder
    var plaats = [];
    esc = esc.replace(/\[\[([\s\S]*?)\]\]/g, function (m, payload) {
      var stukken = payload.split('|');
      var lemma = (stukken.shift() || '').trim();
      var code = (stukken.shift() || '').trim();
      var inhoud = stukken.join('|').trim();
      var app = apparaatVan(config, code);
      if (!app) {
        // onbekend apparaat: toon lemma ongemarkeerd
        return lemma;
      }
      tellers[code] = (tellers[code] || 0) + 1;
      var seq = tellers[code];
      var id = code + '-' + seq;
      noten.push({ id: id, code: code, seq: seq, lemma: lemma, inhoud: inhoud, regel: null });
      var token = '' + (plaats.length) + '';
      plaats.push({ id: id, code: code, seq: seq, lemma: lemma, kleur: app.kleur });
      return token;
    });
    // 3. typografie op de rest
    var html = opmaak(esc);
    // 4. plaatshouders terug -> lemma-span + markeringsteken
    html = html.replace(/(\d+)/g, function (m, i) {
      var p = plaats[+i];
      var lemmaHtml = opmaak(p.lemma);
      return '<span class="lemma app-' + p.code + '" data-noot="' + p.id + '" tabindex="0" ' +
             'style="--kleur:' + p.kleur + '">' + lemmaHtml +
             '<sup class="nootteken app-' + p.code + '" data-noot="' + p.id + '" ' +
             'style="--kleur:' + p.kleur + '">' + p.seq + '</sup></span>';
    });
    return html;
  }

  function renderBody(body, config) {
    var regels = body.replace(/\r\n/g, '\n').split('\n');
    var stap = parseInt(config.meta.regelnummering, 10) || 5;
    var noten = [];
    var tellers = {};
    var uit = [];
    var regelnr = 0;
    var inAlinea = false;

    function sluitAlinea() {
      if (inAlinea) { uit.push('</div>'); inAlinea = false; }
    }
    function openAlinea() {
      if (!inAlinea) { uit.push('<div class="alinea">'); inAlinea = true; }
    }

    for (var i = 0; i < regels.length; i++) {
      var r = regels[i];
      var t = r.trim();

      if (t === '') { sluitAlinea(); continue; }

      // kop:  ## Tekst
      if (/^#{2,3}\s+/.test(t)) {
        sluitAlinea();
        var niveau = t.indexOf('### ') === 0 ? 3 : 2;
        var kt = t.replace(/^#{2,3}\s+/, '');
        uit.push('<h' + niveau + ' class="tekstkop">' + opmaak(escapeHtml(kt)) + '</h' + niveau + '>');
        continue;
      }

      // pagina-/foliomarkering:  ~ LABEL | DOEL
      if (t.charAt(0) === '~') {
        var pm = t.slice(1).split('|').map(function (x) { return x.trim(); });
        var label = pm[0] || '?';
        var doel = pm[1] || '';
        openAlinea();
        uit.push('<span class="pb" data-doel="' + escapeHtml(doel) + '" title="Open facsimile">' +
                 '∣' + escapeHtml(label) + '</span>');
        continue;
      }

      // gewone tekstregel
      openAlinea();
      regelnr++;
      var toonNr = (regelnr % stap === 0);
      var startNoten = noten.length;
      var inhoud = renderInline(r, config, noten, tellers);
      // koppel regelnummer aan de zojuist toegevoegde noten
      for (var n = startNoten; n < noten.length; n++) noten[n].regel = regelnr;

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

  // ---- Apparaat-lijsten onderaan -----------------------------------------

  function renderApparaten(config, noten) {
    var perCode = {};
    noten.forEach(function (n) { (perCode[n.code] = perCode[n.code] || []).push(n); });
    var uit = ['<div class="apparaten">'];
    config.apparaten.forEach(function (app) {
      var lijst = perCode[app.code];
      if (!lijst || !lijst.length) return;
      uit.push('<section class="apparaat app-' + app.code + '" data-code="' + app.code +
               '" style="--kleur:' + app.kleur + '">');
      uit.push('<h3 class="apparaat-kop">' + escapeHtml(app.label) +
               '<span class="apparaat-soort">' + (app.soort === 'origineel' ? 'oorspronkelijk' : 'editeur') +
               '</span></h3>');
      uit.push('<ol class="nootlijst">');
      lijst.forEach(function (n) {
        uit.push('<li id="n-' + n.id + '" data-noot="' + n.id + '">' +
                 '<a class="nr-terug" href="#r' + n.regel + '" title="Naar regel ' + n.regel + '">' +
                 n.regel + '</a> ' +
                 '<span class="noot-lemma">' + opmaak(escapeHtml(n.lemma)) + '</span>] ' +
                 '<span class="noot-inhoud">' + opmaak(escapeHtml(n.inhoud)) + '</span></li>');
      });
      uit.push('</ol></section>');
    });
    uit.push('</div>');
    return uit.join('\n');
  }

  // ---- Werkbalk (toggles) -------------------------------------------------

  function renderWerkbalk(config, noten) {
    var aanwezig = {};
    noten.forEach(function (n) { aanwezig[n.code] = true; });
    var uit = ['<div class="werkbalk" role="group" aria-label="Weergaveopties">'];
    uit.push('<div class="wb-groep"><span class="wb-kop">Tonen</span>');
    uit.push(toggle('opt-regelnr', 'Regelnummers', true));
    uit.push(toggle('opt-facsimile', 'Facsimilemarkeringen', true));
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

    // Popover
    var pop = document.createElement('div');
    pop.className = 'noot-popover';
    pop.hidden = true;
    document.body.appendChild(pop);

    function toonPopover(el) {
      var id = el.getAttribute('data-noot');
      var n = nootIndex[id];
      if (!n) return;
      if (root.classList.contains('verberg-app-' + n.code)) return; // apparaat uit

      var app = apparaatVan(config, n.code);
      pop.innerHTML = '<span class="pop-label" style="color:' + app.kleur + '">' +
        escapeHtml(app.label) + ' · regel ' + n.regel + '</span>' +
        '<span class="pop-lemma">' + opmaak(escapeHtml(n.lemma)) + '</span>' +
        '<span class="pop-inhoud">' + opmaak(escapeHtml(n.inhoud)) + '</span>';
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
      var el = e.target.closest('.lemma, .nootteken');
      if (el) toonPopover(el);
    });
    root.addEventListener('mouseout', function (e) {
      var el = e.target.closest('.lemma, .nootteken');
      if (el && !pop.contains(e.relatedTarget)) verbergPopover();
    });
    root.addEventListener('focusin', function (e) {
      var el = e.target.closest('.lemma');
      if (el) toonPopover(el);
    });
    root.addEventListener('focusout', verbergPopover);

    // Klik op lemma -> scroll naar apparaatingang
    root.addEventListener('click', function (e) {
      var lemma = e.target.closest('.lemma, .nootteken');
      if (lemma) {
        var id = lemma.getAttribute('data-noot');
        var doel = document.getElementById('n-' + id);
        if (doel) {
          doel.scrollIntoView({ behavior: 'smooth', block: 'center' });
          doel.classList.add('markeer');
          setTimeout(function () { doel.classList.remove('markeer'); }, 1600);
        }
        return;
      }
      // Klik op pagina-/foliomarkering -> facsimile
      var pb = e.target.closest('.pb');
      if (pb) openFacsimile(config, pb.getAttribute('data-doel'));
    });

    // Toggles
    root.addEventListener('change', function (e) {
      var t = e.target;
      if (t.matches('input[data-app]')) {
        root.classList.toggle('verberg-app-' + t.getAttribute('data-app'), !t.checked);
      } else if (t.id === 'opt-regelnr') {
        root.classList.toggle('geen-regelnr', !t.checked);
      } else if (t.id === 'opt-facsimile') {
        root.classList.toggle('geen-facsimile', !t.checked);
      } else if (t.id === 'opt-afkorting') {
        root.classList.toggle('geen-afkorting', !t.checked);
      }
    });
  }

  // ---- Facsimile ----------------------------------------------------------

  function openFacsimile(config, doel) {
    if (!doel) return;
    var type = config.meta.facsimile_type;
    if (type === 'pdf' && config.meta.facsimile_pdf) {
      var url = config.meta.facsimile_pdf + '#page=' + encodeURIComponent(doel);
      window.open(url, '_blank', 'noopener');
    } else if (config.meta.facsimile_afbeeldingen) {
      var src = config.meta.facsimile_afbeeldingen.replace('{n}', doel);
      toonLightbox(src, doel);
    }
  }

  function toonLightbox(src, label) {
    var box = document.createElement('div');
    box.className = 'lightbox';
    box.innerHTML = '<div class="lb-binnen"><button class="lb-sluit" aria-label="Sluiten">×</button>' +
      '<img src="' + src + '" alt="Facsimile ' + escapeHtml(label) + '">' +
      '<div class="lb-bijschrift">Facsimile · ' + escapeHtml(label) + '</div></div>';
    function sluit() { box.remove(); document.removeEventListener('keydown', esc); }
    function esc(e) { if (e.key === 'Escape') sluit(); }
    box.addEventListener('click', function (e) {
      if (e.target === box || e.target.closest('.lb-sluit')) sluit();
    });
    document.addEventListener('keydown', esc);
    document.body.appendChild(box);
  }

  // ---- Publieke API -------------------------------------------------------

  function render(root, tekst) {
    var parsed = parseKop(tekst);
    var config = parsed.config;
    var body = renderBody(parsed.body, config);
    var meta = config.meta;

    var kop = '<header class="editie-kop">' +
      (meta.titel ? '<h1>' + escapeHtml(meta.titel) + '</h1>' : '') +
      '<p class="editie-sub">' +
        (meta.auteur ? '<span>' + escapeHtml(meta.auteur) + '</span>' : '') +
        (meta.jaar ? '<span>' + escapeHtml(meta.jaar) + '</span>' : '') +
        (meta.bron ? '<span class="editie-bron">' + escapeHtml(meta.bron) + '</span>' : '') +
      '</p></header>';

    // Dynamisch stijlblok: per apparaat een verberg-regel (codes zijn variabel)
    var verbergCss = config.apparaten.map(function (a) {
      var c = a.code;
      return '.verberg-app-' + c + ' .nootteken.app-' + c + '{display:none}' +
             '.verberg-app-' + c + ' .lemma.app-' + c + '{border-bottom:none;cursor:text;background:none}' +
             '.verberg-app-' + c + ' .apparaat[data-code="' + c + '"]{display:none}';
    }).join('\n');
    root.innerHTML =
      kop +
      renderWerkbalk(config, body.noten) +
      '<div class="tekst">' + body.html + '</div>' +
      renderApparaten(config, body.noten);

    var styleEl = document.createElement('style');
    styleEl.textContent = verbergCss;
    root.appendChild(styleEl);

    koppelInteracties(root, config, body.noten);
    root._editieConfig = config;
    return { config: config, regels: body.regels, noten: body.noten.length };
  }

  function laad(root) {
    var bron = root.getAttribute('data-bron');
    if (!bron) { console.error('Editie: geen data-bron opgegeven'); return; }
    fetch(bron)
      .then(function (r) {
        if (!r.ok) throw new Error('kon bron niet laden: ' + r.status);
        return r.text();
      })
      .then(function (tekst) { render(root, tekst); })
      .catch(function (err) {
        root.innerHTML = '<p class="fout">Kon de editie niet laden (' + escapeHtml(err.message) +
          ').<br>Draai de site via een lokale server, bijv. <code>python3 -m http.server</code>.</p>';
      });
  }

  global.Editie = { laad: laad, render: render, parseKop: parseKop };
})(window);
