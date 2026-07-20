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
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
  }

  // Inline typografie en editeursingrepen (noten zijn hier al afgehandeld).
  function opmaak(s) {
    s = s.replace(/\{(\w+):([\s\S]*?)\}/g, function (m, code, body) {
      switch (code) {
        case 'sc':  return '<span class="sc">' + body + '</span>';        // kleinkapitaal
        case 'sup': return '<sup>' + body + '</sup>';                     // superscript
        case 'sub': return '<sub>' + body + '</sub>';                     // subscript
        case 'del': return '<span class="ed-del">' + body + '</span>';    // doorhaling
        case 'ul':  return '<span class="ed-ul">' + body + '</span>';     // onderstreping (bron)
        case 'sp':  return '<span class="ed-sp">' + body + '</span>';     // gesperd / spatiëring
        case 'add': return '<span class="ed-add">⟨' + body + '⟩</span>'; // editeurstoevoeging
        case 'unc': return '<span class="ed-unc">' + body + '<span class="unc-teken">[?]</span></span>';
        case 'ex':  return '<span class="ed-ex">' + body + '</span>';     // opgeloste afkorting (heel woord)
        case 'ab':  return '<span class="ed-ab">' + body + '</span>';     // opgeloste letters binnen woord
        case 'gap': return '<span class="ed-gap">[' + (body || 'lacune') + ']</span>';
        case 'rood': return '<span class="ed-rood">' + body + '</span>'; // rubricatie / rode inkt
        case 'init': return '<span class="ed-init">' + body + '</span>'; // initiaal / lombarde
        case 'itl':  return '<span class="ed-itl" title="interlineaire toevoeging">' + body + '</span>';
        case 'marg': return '<span class="ed-marg" title="marginale toevoeging">' + body + '</span>';
        default:    return body;
      }
    });
    s = s.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');          // **vet**
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');                          // *cursief*
    return s;
  }

  // ---- Front-matter -------------------------------------------------------
  function parseKop(tekst) {
    var config = { apparaten: [], register: [], meta: {} };
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
        } else if (key === 'register') {
          // register: soort | canonieke naam | variant1, variant2, …
          var r = val.split('|').map(function (x) { return x.trim(); });
          var soortR = (r[0] || 'persoon').toLowerCase();
          var naam = r[1] || '';
          var varRuw = (r[2] || naam);
          var varianten = varRuw.split(',').map(function (x) { return x.trim(); })
            .filter(function (x) { return x.length; });
          if (varianten.indexOf(naam) === -1 && naam) varianten.push(naam);
          if (naam) config.register.push({ soort: soortR, naam: naam, varianten: varianten });
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
    var nest = lemma.indexOf('[[') !== -1 ? ' heeft-nest' : ''; // bevat geneste noot
    return '<span class="lemma' + nest + ' app-' + code + '" data-noot="' + id + '" tabindex="0" ' +
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
    var figuurnr = 0;
    var paginas = [];
    var koppen = [];
    var dagen = [];
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
        var kopId = 'kop-' + (koppen.length + 1);
        koppen.push({ niveau: niveau, tekst: platteKop(kop[2]), id: kopId, pagina: paginas.length + 1 });
        cur.uit.push('<' + hTag + ' class="tekstkop kop-' + niveau + '" id="' + kopId + '">' +
                     opmaak(escapeHtml(kop[2])) + '</' + hTag + '>');
        continue;
      }

      // afbeelding:  ![bijschrift](pad){breed}
      var fig = t.match(/^!\[([\s\S]*?)\]\(([^)]+)\)\s*(\{breed\})?\s*$/);
      if (fig) {
        sluit();
        figuurnr++;
        var bij = fig[1].trim(), pad = fig[2].trim(), breed = fig[3] ? ' breed' : '';
        var bijHtml = opmaak(escapeHtml(bij));
        cur.uit.push('<figure class="editie-figuur' + breed + '" data-vergroot="' + escapeHtml(pad) +
          '" data-bij="Afbeelding ' + figuurnr + '. ' + escapeHtml(bij) + '">' +
          '<img src="' + escapeHtml(pad) + '" alt="' + escapeHtml(bij) + '" loading="lazy">' +
          (bij ? '<figcaption><span class="fig-nr">Afbeelding ' + figuurnr + '.</span> ' + bijHtml + '</figcaption>' : '') +
          '</figure>');
        continue;
      }

      // dagtekening:  @ SLEUTEL [sv|sn] | LABEL  → datummarkering voor navigatie
      if (t.charAt(0) === '@' && /^@\s/.test(t)) {
        var dm = parseDag(t.slice(1).trim());
        if (dm) {
          sluit();
          var dagId = 'dag-' + (dagen.length + 1);
          dagen.push({ id: dagId, sleutel: dm.sleutel, label: dm.label, stijl: dm.stijl, pagina: paginas.length + 1 });
          cur.uit.push('<span class="db" id="' + dagId + '" data-sleutel="' + dm.sleutel + '">' +
            '<span class="db-diamant" aria-hidden="true">◈</span> ' + escapeHtml(dm.label) +
            (dm.stijl ? ' <span class="db-stijl">' + dm.stijl + '</span>' : '') + '</span>');
          continue;
        }
      }

      // pagina-/foliomarkering: ~ LABEL | DOEL  → paginagrens
      if (t.charAt(0) === '~') {
        var pm = t.slice(1).split('|').map(function (x) { return x.trim(); });
        var label = pm[0] || '?', doel = pm[1] || '';
        var pb = '<span class="pb" data-doel="' + escapeHtml(doel) +
                 '" title="Toon origineel">' + escapeHtml(label) + '</span>';
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

      // tabel:  | cel | cel |   (opeenvolgende regels; een --- rij = koprij)
      if (t.charAt(0) === '|') {
        sluit();
        var rijen = [];
        while (i < regels.length && regels[i].trim().charAt(0) === '|') {
          rijen.push(regels[i].trim());
          i++;
        }
        i--; // de for-lus verhoogt i zelf
        cur.uit.push(renderTabel(rijen, { config: config, noten: cur.noten, regel: regelnr, global: global }));
        continue;
      }

      // lijst:  - item   of   1. item   (opeenvolgende regels)
      var li = t.match(/^([-*]|\d+\.)\s+(.*)$/);
      if (li) {
        sluit();
        var geordend = /\d/.test(li[1]);
        var items = [];
        while (i < regels.length) {
          var lt = regels[i].trim();
          var lm = lt.match(/^([-*]|\d+\.)\s+(.*)$/);
          if (!lm) break;
          items.push(renderInline(lm[2], { config: config, noten: cur.noten, regel: regelnr, global: global }));
          i++;
        }
        i--;
        var tag = geordend ? 'ol' : 'ul';
        cur.uit.push('<' + tag + ' class="ed-lijst">' +
          items.map(function (it) { return '<li>' + it + '</li>'; }).join('') +
          '</' + tag + '>');
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
    return { paginas: paginas, noten: alle, regels: regelnr, koppen: koppen, dagen: dagen };
  }

  // Markup uit een kop halen voor een leesbaar inhoudsopgave-label.
  function platteKop(s) {
    return s.replace(/\{[a-z]+:([^{}]*)\}/g, '$1').replace(/\*+/g, '').trim();
  }

  // Cellen uit een tabelrij: split op top-niveau | (respecteert geneste [[ ]]).
  function tabelCellen(rij) {
    var s = rij.trim().replace(/^\|/, '').replace(/\|\s*$/, '');
    return splitTop(s).map(function (c) { return c.trim(); });
  }
  function isScheidingsrij(rij) {
    return tabelCellen(rij).every(function (c) { return /^:?-{3,}:?$/.test(c); });
  }
  function uitlijning(spec) {
    var l = spec.charAt(0) === ':', r = spec.charAt(spec.length - 1) === ':';
    if (l && r) return 'center';
    if (r) return 'right';
    if (l) return 'left';
    return '';
  }
  function renderTabel(rijen, ctx) {
    // Scheidingsrij (---) bepaalt de koprij en de uitlijning per kolom.
    var scheidingIdx = -1, uitlijn = [];
    for (var k = 0; k < rijen.length; k++) {
      if (isScheidingsrij(rijen[k])) {
        scheidingIdx = k;
        uitlijn = tabelCellen(rijen[k]).map(uitlijning);
        break;
      }
    }
    function cel(inhoud, tag, i) {
      var st = uitlijn[i] ? ' style="text-align:' + uitlijn[i] + '"' : '';
      return '<' + tag + st + '>' + renderInline(inhoud, ctx) + '</' + tag + '>';
    }
    var uit = ['<div class="ed-tabel-omhulsel"><table class="ed-tabel">'];
    rijen.forEach(function (rij, k) {
      if (k === scheidingIdx) return;
      var kop = scheidingIdx > -1 && k < scheidingIdx;
      var cellen = tabelCellen(rij);
      uit.push('<tr>' + cellen.map(function (c, i) {
        return cel(c, kop ? 'th' : 'td', i);
      }).join('') + '</tr>');
    });
    uit.push('</table></div>');
    return uit.join('');
  }

  // ---- Dagtekeningen ------------------------------------------------------
  // Sorteersleutel uit een (gedeeltelijke) datum YYYY[-MM[-DD]]. Bij stilo
  // vetus (Juliaans) wordt een volledige datum naar stilo novo (Gregoriaans)
  // omgezet, zodat de dagen chronologisch blijven kloppen.
  function dagSleutel(k, stijl) {
    var m = k.match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
    if (!m) return -1;
    var y = +m[1], mo = m[2] ? +m[2] : 0, d = m[3] ? +m[3] : 0;
    if (stijl === 'sv' && mo && d) {
      var off = y < 1700 ? 10 : (y < 1800 ? 11 : 12); // Juliaans → Gregoriaans
      var dt = new Date(Date.UTC(y, mo - 1, d + off));
      y = dt.getUTCFullYear(); mo = dt.getUTCMonth() + 1; d = dt.getUTCDate();
    }
    return y * 10000 + mo * 100 + d;
  }
  var MAANDEN = ['', 'januari', 'februari', 'maart', 'april', 'mei', 'juni',
                 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  // Maandkop uit een chronologische sleutel (YYYYMMDD): "juni 1672", of enkel
  // het jaar als er geen maand bekend is.
  function maandLabel(sleutel) {
    var y = Math.floor(sleutel / 10000);
    var mo = Math.floor(sleutel / 100) % 100;
    return (mo ? MAANDEN[mo] + ' ' : '') + y;
  }
  // Ontleedt  SLEUTEL[/SLEUTEL2] [sv|sn] | LABEL .
  function parseDag(s) {
    var pipe = s.indexOf('|');
    var links = (pipe === -1 ? s : s.slice(0, pipe)).trim();
    var label = (pipe === -1 ? '' : s.slice(pipe + 1)).trim();
    var stijl = '';
    var ms = links.match(/\s(sv|sn)$/i);
    if (ms) { stijl = ms[1].toLowerCase(); links = links.slice(0, ms.index).trim(); }
    var keyRuw = links.split('/')[0].trim(); // begin van een eventueel bereik
    if (!/^\d{4}(-\d{1,2}){0,2}$/.test(keyRuw)) return null;
    if (!label) label = keyRuw;
    return {
      sleutel: dagSleutel(keyRuw, stijl),
      key: keyRuw,
      kal: stijl,
      label: label,
      stijl: stijl === 'sv' ? 'o.s.' : (stijl === 'sn' ? 'n.s.' : '')
    };
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
      uit.push('<h3 class="apparaat-kop">' + escapeHtml(app.label) + '</h3>');
      uit.push('<ul class="nootlijst">');
      lijst.forEach(function (n) {
        var regelLink = n.regel
          ? '<a class="nr-terug" href="#r' + n.regel + '" title="Terug naar de tekst">' +
            (heeftNummers ? n.regel : '↑') + '</a> '
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
  function renderWerkbalk(config, noten, meerdere, koppen, dagen) {
    var aanwezig = {};
    noten.forEach(function (n) { aanwezig[n.code] = true; });
    var heeftNummers = parseInt(config.meta.regelnummering, 10) > 0;
    var heeftInhoud = koppen && koppen.length > 0;
    var heeftDagen = dagen && dagen.length > 0;
    var uit = ['<div class="werkbalk" role="group" aria-label="Weergaveopties">'];
    uit.push('<div class="wb-boven">');
    uit.push('<div class="wb-groep wb-zoek">');
    uit.push('<input type="search" class="zoekveld" placeholder="Zoek in de tekst…" aria-label="Zoeken in de editie">');
    uit.push('<span class="zoek-status" aria-live="polite"></span>');
    uit.push('<button type="button" class="zoek-knop" data-zoek="vorige" title="Vorige treffer" disabled hidden>‹</button>');
    uit.push('<button type="button" class="zoek-knop" data-zoek="volgende" title="Volgende treffer" disabled hidden>›</button>');
    // Spellingtolerant zoeken is de standaard (u/v, i/j/y, c/k, s/z, d/t, g(h),
    // klinkerclusters, accenten). Er is geen zichtbaar vinkje meer voor: het
    // gebeurt altijd, zodat bv. Enkhuizen ook Enchuijzen vindt.
    uit.push('</div>');
    uit.push('<div class="wb-knoppen">');
    if (heeftInhoud) {
      uit.push('<button type="button" class="wb-uitklap wb-inhoud-knop" aria-expanded="false" aria-controls="wb-inhoud">' +
               'Inhoud <span class="wb-caret">▾</span></button>');
    }
    if (heeftDagen) {
      uit.push('<button type="button" class="wb-uitklap wb-dagen-knop" aria-expanded="false" aria-controls="wb-dagen">' +
               'Dagen <span class="wb-caret">▾</span></button>');
    }
    uit.push('<button type="button" class="wb-uitklap" aria-expanded="false" aria-controls="wb-instellingen">' +
             'Weergave <span class="wb-caret">▾</span></button>');
    uit.push('</div>');
    uit.push('</div>'); // wb-boven
    // De Citeer-hulp (#wb-citeer) leeft in de editiekop, naast het type-label.
    if (heeftInhoud) {
      uit.push('<nav class="wb-inhoud" id="wb-inhoud" hidden aria-label="Inhoudsopgave">');
      uit.push('<ol class="inhoud-lijst">');
      koppen.forEach(function (k) {
        uit.push('<li class="inh-niv-' + k.niveau + '">' +
          '<a href="#" data-spring="' + k.id + '" data-pagina="' + k.pagina + '">' +
          escapeHtml(k.tekst) + '</a></li>');
      });
      uit.push('</ol></nav>');
    }
    if (heeftDagen) {
      var chron = dagen.slice().sort(function (a, b) { return a.sleutel - b.sleutel; });
      // Groepeer per maand (YYYYMM uit de chronologische sleutel), zodat een
      // lange reis eerst per maand te kiezen is en pas dan per dag.
      var groepen = [], laatste = null;
      chron.forEach(function (d) {
        var mk = Math.floor(d.sleutel / 100);   // YYYYMM
        if (!laatste || laatste.key !== mk) {
          laatste = { key: mk, label: maandLabel(d.sleutel), dagen: [] };
          groepen.push(laatste);
        }
        laatste.dagen.push(d);
      });
      var openBijStart = groepen.length <= 1;   // één maand: meteen open
      uit.push('<nav class="wb-dagen" id="wb-dagen" hidden aria-label="Dagen">');
      uit.push('<ol class="dagen-maanden">');
      groepen.forEach(function (g) {
        uit.push('<li class="dagmaand">');
        uit.push('<button type="button" class="dagmaand-knop' + (openBijStart ? ' open' : '') +
          '" aria-expanded="' + (openBijStart ? 'true' : 'false') + '">' +
          '<span class="dagmaand-naam">' + escapeHtml(g.label) + '</span>' +
          '<span class="dagmaand-tel">' + g.dagen.length + '</span>' +
          '<span class="wb-caret">▾</span></button>');
        uit.push('<ol class="dagen-lijst"' + (openBijStart ? '' : ' hidden') + '>');
        g.dagen.forEach(function (d) {
          uit.push('<li><a href="#" data-spring="' + d.id + '" data-pagina="' + d.pagina + '">' +
            escapeHtml(d.label) +
            (d.stijl ? ' <span class="db-stijl">' + d.stijl + '</span>' : '') + '</a></li>');
        });
        uit.push('</ol></li>');
      });
      uit.push('</ol></nav>');
    }
    var heeftOrigineel = !!(config.meta.origineel_afbeeldingen ||
      (config.meta.origineel_type === 'pdf' && config.meta.origineel_pdf));
    uit.push('<div class="wb-instellingen" id="wb-instellingen" hidden>');
    if (meerdere) {
      uit.push('<div class="wb-groep"><span class="wb-kop">Weergave</span>');
      uit.push('<label class="wb-opt"><input type="radio" name="modus" value="doorlopend" checked> Doorlopend</label>');
      uit.push('<label class="wb-opt"><input type="radio" name="modus" value="bladeren"> Per pagina</label>');
      uit.push('</div>');
    }
    if (heeftOrigineel) {
      uit.push('<div class="wb-groep wb-groep-origineel"><span class="wb-kop">Origineel</span>');
      uit.push(toggle('opt-origineel', 'Naast de tekst', false));
      uit.push('</div>');
    }
    uit.push('<div class="wb-groep"><span class="wb-kop">Tonen</span>');
    if (heeftNummers) uit.push(toggle('opt-regelnr', 'Regelnummers', true));
    uit.push(toggle('opt-markering', 'Geannoteerde woorden', true));
    uit.push(toggle('opt-editie', 'Paginamarkeringen', true));
    if (heeftDagen) uit.push(toggle('opt-dagen', 'Datumnotities', true));
    uit.push(toggle('opt-afkorting', 'Abbreviaturen', true));
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

    // Welke kantnoten volledig uitgeklapt zijn (id -> true). Blijft bewaard
    // over herberekeningen heen (resize, toggle).
    var uitgeklapt = Object.create(null);

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
      // Met het origineel naast de tekst is er geen ruimte voor kantnoten;
      // noten verschijnen dan als popover (zoals op een smal scherm).
      var actief = window.matchMedia('(min-width: 1100px)').matches &&
                   !root.classList.contains('met-origineel');
      root.classList.toggle('kantnoten-aan', actief);

      var links = root.querySelector(':scope > .kant-links') || maakKant('links');
      var rechts = root.querySelector(':scope > .kant-rechts') || maakKant('rechts');
      var nrs = root.querySelector(':scope > .kant-nrs') || maakKant('nrs');
      links.innerHTML = ''; rechts.innerHTML = ''; nrs.innerHTML = '';
      if (!actief) return;
      var rootTop = root.getBoundingClientRect().top;
      var perZijde = { links: [], rechts: [] };

      // Paginanummers: los in de gutter tussen tekst en zijbalk, verticaal op de
      // paginascheidingslijn (bovenrand van de tekstkolom). Niet in de
      // notenstapel, zodat ze niet meeschuiven met de noten.
      root.querySelectorAll('.pagina').forEach(function (pag) {
        if (pag.offsetParent === null) return; // verborgen (bladermodus)
        var pbInline = pag.querySelector('.tekst .pb');
        if (!pbInline) return;
        var tekstEl = pag.querySelector('.tekst');
        var nr = document.createElement('div');
        nr.className = 'pagina-nr';
        nr.textContent = pbInline.textContent.replace('∣', '');
        var doel = pbInline.getAttribute('data-doel');
        if (doel) { nr.setAttribute('data-doel', doel); nr.classList.add('klikbaar'); }
        nr.style.top = (tekstEl.getBoundingClientRect().top - rootTop) + 'px';
        nrs.appendChild(nr);
      });

      // Kantnoten
      noten.forEach(function (n) {
        if (root.classList.contains('verberg-app-' + n.code)) return;
        var anchor = root.querySelector('.tekst .lemma[data-noot="' + n.id + '"]');
        if (!anchor || anchor.offsetParent === null) return; // verborgen pagina
        var app = apparaatVan(config, n.code);
        var zijde = app.zijde === 'rechts' ? 'rechts' : 'links';
        var el = document.createElement('div');
        el.className = 'kantnoot app-' + n.code;
        el.setAttribute('data-noot', n.id);
        el.style.setProperty('--kleur', app.kleur);
        if (uitgeklapt[n.id]) el.classList.add('uitgeklapt');
        el.innerHTML = '<span class="kn-lemma">' + n.labelHtml + '</span> ' +
          '<span class="kn-inhoud">' + n.inhoudHtml + '</span>' +
          '<span class="kn-meer" aria-hidden="true"></span>';
        perZijde[zijde].push({ el: el, top: anchor.getBoundingClientRect().top - rootTop });
      });

      // Plaats per zijde van boven naar beneden, met botsingsafhandeling
      ['links', 'rechts'].forEach(function (z) {
        var cont = z === 'links' ? links : rechts;
        var lijst = perZijde[z];
        lijst.sort(function (a, b) { return a.top - b.top; });
        var laatsteBodem = 0;
        lijst.forEach(function (item) {
          cont.appendChild(item.el);
          if (item.el.classList.contains('kantnoot')) {
            // Ingekort (past niet in de standaardhoogte) -> klikbaar maken.
            var lang = item.el.classList.contains('uitgeklapt') ||
                       item.el.scrollHeight > item.el.clientHeight + 1;
            item.el.classList.toggle('inklapbaar', lang);
            if (lang) {
              var meer = item.el.querySelector('.kn-meer');
              if (meer) meer.textContent = item.el.classList.contains('uitgeklapt')
                ? '− minder' : '… meer';
            }
          }
          var top = item.top < laatsteBodem + 10 ? laatsteBodem + 10 : item.top;
          item.el.style.top = top + 'px';
          laatsteBodem = top + item.el.offsetHeight;
        });
      });

      // De kantnoten zijn zojuist opnieuw opgebouwd: markeer een actieve
      // zoekterm ook daar (de navigatie loopt via het apparaat eronder).
      if (huidigPatroon) {
        wrapMatches(links, huidigPatroon);
        wrapMatches(rechts, huidigPatroon);
      }
    }
    var herTimer;
    function herberekenLater() { clearTimeout(herTimer); herTimer = setTimeout(herbereken, 120); }
    window.addEventListener('resize', function opResize() {
      // De editor rendert herhaaldelijk in hetzelfde document; koppel
      // listeners van weggegooide renders los.
      if (!root.isConnected) { window.removeEventListener('resize', opResize); return; }
      herberekenLater();
    });

    function markeerKant(id, aan) {
      var kn = root.querySelector('.kantnoot[data-noot="' + id + '"]');
      if (kn) kn.classList.toggle('actief', aan);
    }

    // ---- Klembord + melding ----------------------------------------------
    function melding(tekst) {
      var m = document.querySelector('.editie-melding');
      if (!m) {
        m = document.createElement('div');
        m.className = 'editie-melding';
        document.body.appendChild(m);
      }
      m.textContent = tekst;
      m.classList.add('zichtbaar');
      clearTimeout(m._timer);
      m._timer = setTimeout(function () { m.classList.remove('zichtbaar'); }, 1800);
    }
    function kopieer(tekst, gelukt) {
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = tekst;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); gelukt(); } catch (e) { melding('Kopiëren mislukt'); }
        ta.remove();
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(tekst).then(gelukt, fallback);
      } else fallback();
    }

    // De pagina die de lezer nu (grofweg) in beeld heeft.
    function huidigePagina() {
      var paginasEl = root.querySelectorAll('.pagina');
      if (root.classList.contains('modus-bladeren')) {
        return root.querySelector('.pagina.actief') || paginasEl[0] || null;
      }
      var anker = window.innerHeight * 0.35;
      var beste = paginasEl[0] || null;
      for (var i = 0; i < paginasEl.length; i++) {
        if (paginasEl[i].getBoundingClientRect().top <= anker) beste = paginasEl[i];
        else break;
      }
      return beste;
    }

    // ---- Origineel naast de tekst ----------------------------------------
    var opDoel = null; // huidig getoonde scan/pdf-pagina
    function origineelPaneel() {
      var paneel = root.querySelector('.origineel-paneel');
      if (paneel) return paneel;
      paneel = document.createElement('aside');
      paneel.className = 'origineel-paneel';
      paneel.innerHTML = '<div class="op-binnen">' +
        '<div class="op-kop"><span class="op-label"></span>' +
        '<a class="op-open" target="_blank" rel="noopener" hidden>Open ↗</a></div>' +
        '<div class="op-inhoud"></div></div>';
      var houder = root.querySelector('.paginas') || root;
      houder.appendChild(paneel);
      return paneel;
    }
    function updateOrigineel(forceer) {
      if (!root.classList.contains('met-origineel')) return;
      var pag = huidigePagina();
      if (!pag) return;
      var doel = pag.getAttribute('data-doel') || '';
      if (!forceer && doel === opDoel) return;
      opDoel = doel;
      var paneel = origineelPaneel();
      var label = paneel.querySelector('.op-label');
      var open = paneel.querySelector('.op-open');
      var inhoud = paneel.querySelector('.op-inhoud');
      label.textContent = 'Origineel · ' + (pag.getAttribute('data-label') || '');
      if (!doel) {
        inhoud.innerHTML = '<p class="op-leeg">Geen scan gekoppeld aan deze pagina.</p>';
        open.hidden = true;
        return;
      }
      if (config.meta.origineel_type === 'pdf' && config.meta.origineel_pdf) {
        var pdfUrl = config.meta.origineel_pdf + '#page=' + encodeURIComponent(doel);
        var frame = inhoud.querySelector('iframe');
        if (!frame) {
          inhoud.innerHTML = '';
          frame = document.createElement('iframe');
          frame.className = 'op-pdf';
          frame.title = 'Origineel (pdf)';
          inhoud.appendChild(frame);
        }
        frame.src = pdfUrl;
        open.href = pdfUrl; open.hidden = false;
      } else if (config.meta.origineel_afbeeldingen) {
        var src = config.meta.origineel_afbeeldingen.replace('{n}', doel);
        var img = inhoud.querySelector('img');
        if (!img) {
          inhoud.innerHTML = '';
          img = document.createElement('img');
          img.className = 'op-scan';
          img.alt = 'Scan van het origineel';
          img.addEventListener('click', function () {
            toonLightbox(img.src, label.textContent);
          });
          inhoud.appendChild(img);
        }
        img.src = src;
        open.href = src; open.hidden = false;
      }
    }
    var opScrollBezig = false;
    window.addEventListener('scroll', function opScroll() {
      if (!root.isConnected) { window.removeEventListener('scroll', opScroll); return; }
      if (!root.classList.contains('met-origineel') || opScrollBezig) return;
      opScrollBezig = true;
      requestAnimationFrame(function () { opScrollBezig = false; updateOrigineel(); });
    }, { passive: true });

    // ---- Citeerhulp -------------------------------------------------------
    function citeerTekst() {
      var meta = config.meta;
      var mnd = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli',
                 'augustus', 'september', 'oktober', 'november', 'december'];
      var nu = new Date();
      var url = location.origin + location.pathname;
      var delen = [];
      if (meta.auteur) delen.push(meta.auteur);
      if (meta.titel) delen.push(meta.titel + (meta.jaar ? ' (' + meta.jaar + ')' : ''));
      var s = delen.join(', ') + '. Digitale editie, ' + url +
        ', geraadpleegd ' + nu.getDate() + ' ' + mnd[nu.getMonth()] + ' ' + nu.getFullYear() + '.';
      if (meta.bron) s += ' Origineel: ' + meta.bron + '.';
      return s;
    }
    function vulCiteer() {
      var box = document.getElementById('wb-citeer');
      if (!box) return;
      var pag = huidigePagina();
      var html = '<div class="citeer-blok"><span class="wb-kop">Verwijzing</span>' +
        '<p class="citeer-tekst">' + escapeHtml(citeerTekst()) + '</p>' +
        '<button type="button" class="wb-uitklap" data-kopieer="citaat">Kopieer verwijzing</button></div>';
      if (pag && root.querySelectorAll('.pagina').length > 1) {
        var link = location.origin + location.pathname + '#pagina-' + pag.getAttribute('data-i');
        html += '<div class="citeer-blok"><span class="wb-kop">Permalink naar ' +
          escapeHtml(pag.getAttribute('data-label') || 'deze pagina') + '</span>' +
          '<p class="citeer-tekst">' + escapeHtml(link) + '</p>' +
          '<button type="button" class="wb-uitklap" data-kopieer="pagina">Kopieer permalink</button></div>';
      }
      if (root._bron) {
        html += '<div class="citeer-blok"><span class="wb-kop">Exporteren</span>' +
          '<p class="citeer-tekst">TEI-XML voor uitwisseling met andere (DH-)gereedschappen, ' +
          'of de kale leestekst zonder noten en markup.</p>' +
          '<button type="button" class="wb-uitklap" data-export="tei">TEI-XML</button> ' +
          '<button type="button" class="wb-uitklap" data-export="tekst">Platte tekst</button></div>';
      }
      box.innerHTML = html;
    }

    // ---- Instellingen bewaren --------------------------------------------
    var OPSLAG = 'editie-opts:' + location.pathname;
    var herstelBezig = false;
    function bewaarInstellingen() {
      if (herstelBezig) return;
      var st = { opts: {}, apps: {} };
      root.querySelectorAll('.werkbalk input[id^="opt-"]').forEach(function (i) {
        st.opts[i.id] = i.checked;
      });
      root.querySelectorAll('.werkbalk input[data-app]').forEach(function (i) {
        st.apps[i.getAttribute('data-app')] = i.checked;
      });
      var modus = root.querySelector('input[name="modus"]:checked');
      if (modus) st.modus = modus.value;
      try { localStorage.setItem(OPSLAG, JSON.stringify(st)); } catch (e) {}
    }
    function herstelInstellingen() {
      var st = null;
      try { st = JSON.parse(localStorage.getItem(OPSLAG)); } catch (e) {}
      if (!st) return;
      herstelBezig = true;
      function zet(input, waarde) {
        if (!input || typeof waarde !== 'boolean' || input.checked === waarde) return;
        input.checked = waarde;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      Object.keys(st.opts || {}).forEach(function (id) {
        zet(root.querySelector('.werkbalk #' + id), st.opts[id]);
      });
      Object.keys(st.apps || {}).forEach(function (code) {
        zet(root.querySelector('.werkbalk input[data-app="' + code + '"]'), st.apps[code]);
      });
      if (st.modus) {
        var radio = root.querySelector('input[name="modus"][value="' + st.modus + '"]');
        if (radio && !radio.checked) {
          radio.checked = true;
          radio.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      herstelBezig = false;
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
      updateOrigineel();
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
        // Anders heropent een herlaad-actie de bladermodus via de hash.
        if (/^#pagina-/.test(location.hash)) {
          history.replaceState(null, '', location.pathname + location.search);
        }
      }
    }
    // Beschikbaar voor register en inhoudsopgave: toon (in bladermodus) de
    // pagina waar een element op staat.
    root._toonPagina = function (i) { if (root.classList.contains('modus-bladeren')) activeer(i); };

    // ---- Zoeken (over alle pagina's) --------------------------------------
    var veld = root.querySelector('.zoekveld');
    var zoekMarks = [];
    var zoekIdx = -1;
    var zoekTimer;
    var huidigPatroon = null; // actief zoekpatroon, ook voor kantnoten/popover

    function veldWaarde() { return veld ? veld.value.trim() : ''; }

    function updateZoekStatus() {
      var st = root.querySelector('.zoek-status');
      var vb = root.querySelector('[data-zoek="vorige"]');
      var vn = root.querySelector('[data-zoek="volgende"]');
      var heeft = zoekMarks.length > 0;
      if (st) st.textContent = veldWaarde()
        ? (heeft ? (zoekIdx + 1) + ' / ' + zoekMarks.length : 'geen treffers') : '';
      // Pijltjes alleen tonen als er treffers zijn om doorheen te bladeren.
      if (vb) { vb.disabled = !heeft; vb.hidden = !heeft; }
      if (vn) { vn.disabled = !heeft; vn.hidden = !heeft; }
    }

    function wisZoek() {
      root.querySelectorAll('.zoektreffer').forEach(function (m) {
        m.parentNode.replaceChild(document.createTextNode(m.textContent), m);
      });
      root.querySelectorAll('.pagina .tekst, .apparaat .noot-inhoud').forEach(function (c) { c.normalize(); });
      zoekMarks = []; zoekIdx = -1; huidigPatroon = null;
    }

    function wrapMatches(container, patroon) {
      var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
      var nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(function (node) {
        var text = node.nodeValue;
        patroon.lastIndex = 0;
        var frag = null, last = 0, m;
        while ((m = patroon.exec(text))) {
          if (!m[0]) { patroon.lastIndex++; continue; }
          if (!frag) frag = document.createDocumentFragment();
          if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
          var mark = document.createElement('mark');
          mark.className = 'zoektreffer';
          mark.textContent = m[0];
          frag.appendChild(mark);
          last = m.index + m[0].length;
        }
        if (!frag) return;
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
      // Treffer in een noot terwijl de apparaten verborgen zijn (kantnoot-
      // modus): klap de bijbehorende kantnoot open en laat die oplichten.
      var nootLi = mark.closest('.apparaat li[data-noot]');
      if (nootLi && root.classList.contains('kantnoten-aan')) {
        var nootId = nootLi.getAttribute('data-noot');
        uitgeklapt[nootId] = true;
        herbereken();
        var kn = root.querySelector('.kantnoot[data-noot="' + nootId + '"]');
        if (kn) {
          kn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          kn.classList.add('markeer');
          setTimeout(function () { kn.classList.remove('markeer'); }, 1800);
        }
      } else {
        mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      updateZoekStatus();
    }

    function zoek(q) {
      wisZoek();
      q = q.trim();
      if (q.length < 2) { updateZoekStatus(); return; }
      var tolerantKnop = root.querySelector('#opt-tolerant');
      var patroon = maakZoekPatroon(q, !tolerantKnop || tolerantKnop.checked);
      if (!patroon) { updateZoekStatus(); return; }
      huidigPatroon = patroon;
      root.querySelectorAll('.pagina .tekst').forEach(function (c) { wrapMatches(c, patroon); });
      // Ook de noten doorzoeken (alleen apparaten die aan staan).
      root.querySelectorAll('.pagina .apparaat').forEach(function (sectie) {
        if (root.classList.contains('verberg-app-' + sectie.getAttribute('data-code'))) return;
        sectie.querySelectorAll('.noot-inhoud').forEach(function (c) { wrapMatches(c, patroon); });
      });
      zoekMarks = [].slice.call(root.querySelectorAll('.pagina .zoektreffer'));
      // Kantnoten zijn kopieën van de noten: markeer de term daar ook.
      if (root.classList.contains('kantnoten-aan')) herbereken();
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

    // Hergebruik één popover-element, ook als render() meermaals draait
    // (zoals in het live voorbeeld van de editor).
    var pop = document.querySelector('.noot-popover');
    if (!pop) {
      pop = document.createElement('div');
      pop.className = 'noot-popover';
      document.body.appendChild(pop);
    }
    pop.hidden = true;

    function toonPopover(el) {
      var id = el.getAttribute('data-noot');
      var n = nootIndex[id];
      if (!n) return;
      if (root.classList.contains('verberg-app-' + n.code)) return;
      var app = apparaatVan(config, n.code);
      pop.innerHTML = '<span class="pop-lemma">' + n.labelHtml + '</span>' +
        '<span class="pop-inhoud">' + n.inhoudHtml + '</span>';
      if (huidigPatroon) wrapMatches(pop, huidigPatroon);
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
    // Op touch/smal scherm: tik buiten een lemma of de popover sluit hem.
    document.addEventListener('click', function buitenKlik(e) {
      if (!root.isConnected) { document.removeEventListener('click', buitenKlik); return; }
      if (root.classList.contains('kantnoten-aan')) return;
      if (e.target.closest('.tekst .lemma') || e.target.closest('.noot-popover')) return;
      verbergPopover();
    });

    // Klik op gemarkeerde tekst -> spring naar de noot in het apparaat en laat
    // die oplichten.
    root.addEventListener('click', function (e) {
      // Klik op een (ingekorte) kantnoot: uit- of inklappen en herschikken.
      var knClick = e.target.closest('.kantnoot');
      if (knClick && root.classList.contains('kantnoten-aan')) {
        if (knClick.classList.contains('inklapbaar')) {
          var knId = knClick.getAttribute('data-noot');
          if (uitgeklapt[knId]) delete uitgeklapt[knId]; else uitgeklapt[knId] = true;
          herbereken();
        }
        return;
      }
      var ex = e.target.closest('[data-export]');
      if (ex && root._bron) {
        var exNaam = (config.meta.titel || 'editie').toLowerCase()
          .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'editie';
        if (ex.getAttribute('data-export') === 'tei') {
          downloadBestand(exNaam + '.xml', naarTEI(root._bron), 'application/xml');
        } else {
          downloadBestand(exNaam + '.txt', naarTekst(root._bron), 'text/plain');
        }
        return;
      }
      var kop = e.target.closest('[data-kopieer]');
      if (kop) {
        var citeerBox = kop.closest('.citeer-blok');
        var citeerP = citeerBox && citeerBox.querySelector('.citeer-tekst');
        if (citeerP) kopieer(citeerP.textContent, function () { melding('Gekopieerd naar het klembord'); });
        return;
      }
      var up = e.target.closest('.wb-uitklap');
      if (up) {
        var panel = document.getElementById(up.getAttribute('aria-controls'));
        if (!panel) return;
        if (panel.id === 'wb-citeer' && panel.hidden) vulCiteer();
        var open = panel.hidden;
        // Sluit eventuele andere open werkbalkpanelen.
        root.querySelectorAll('.wb-uitklap').forEach(function (b) {
          if (b === up) return;
          var p = document.getElementById(b.getAttribute('aria-controls'));
          if (p && !p.hidden) { p.hidden = true; b.setAttribute('aria-expanded', 'false'); b.classList.remove('open'); }
        });
        panel.hidden = !open;
        up.setAttribute('aria-expanded', String(open));
        up.classList.toggle('open', open);
        return;
      }
      // Maand-accordeon in de Dagen-navigator: klap de dagen eronder open/dicht.
      var mk = e.target.closest('.dagmaand-knop');
      if (mk) {
        var maandLijst = mk.nextElementSibling;
        if (maandLijst) {
          var opn = maandLijst.hidden;
          maandLijst.hidden = !opn;
          mk.setAttribute('aria-expanded', String(opn));
          mk.classList.toggle('open', opn);
        }
        return;
      }
      var sl = e.target.closest('[data-spring]');
      if (sl) {
        e.preventDefault();
        if (root._toonPagina) root._toonPagina(+sl.getAttribute('data-pagina'));
        var sdoel = document.getElementById(sl.getAttribute('data-spring'));
        if (sdoel) {
          sdoel.scrollIntoView({ behavior: 'smooth', block: 'start' });
          sdoel.classList.add('spring-actief');
          setTimeout(function () { sdoel.classList.remove('spring-actief'); }, 2000);
        }
        // Sluit alle open werkbalkpanelen (Inhoud / Dagen) na een keuze.
        root.querySelectorAll('.wb-uitklap').forEach(function (b) {
          var p = document.getElementById(b.getAttribute('aria-controls'));
          if (p && p.tagName === 'NAV') { p.hidden = true; b.setAttribute('aria-expanded', 'false'); b.classList.remove('open'); }
        });
        return;
      }
      var pnr = e.target.closest('.pagina-nr[data-doel]');
      if (pnr) { openOrigineel(config, pnr.getAttribute('data-doel')); return; }
      var zb = e.target.closest('[data-zoek]');
      if (zb) { gaNaarTreffer(zoekIdx + (zb.getAttribute('data-zoek') === 'volgende' ? 1 : -1)); return; }
      var pg = e.target.closest('[data-pager]');
      if (pg) { activeer(huidig + (pg.getAttribute('data-pager') === 'volgende' ? 1 : -1)); return; }
      // Klik op een zichtbaar regelnummer: kopieer een permalink naar de regel.
      var rnr = e.target.closest('.tekst .rnr');
      if (rnr && rnr.textContent) {
        var tregel = rnr.closest('.tregel');
        if (tregel) {
          kopieer(location.origin + location.pathname + '#' + tregel.id, function () {
            melding('Link naar regel ' + tregel.getAttribute('data-n') + ' gekopieerd');
          });
        }
        return;
      }
      var lemma = e.target.closest('.tekst .lemma');
      if (lemma) {
        var id = lemma.getAttribute('data-noot');
        var n = nootIndex[id];
        if (n && root.classList.contains('verberg-app-' + n.code)) return;
        var kantAan = root.classList.contains('kantnoten-aan');
        if (!kantAan) {
          // Smal/mobiel (geen kantnoten): toon de noot als popover, net als bij
          // hover — niet springen naar het notenapparaat onderaan.
          toonPopover(lemma);
          return;
        }
        // In kantnoot-modus: de bijbehorende noot volledig openklappen en
        // opnieuw plaatsen, zodat je de hele noot ziet op ooghoogte.
        uitgeklapt[id] = true; herbereken();
        var doel = root.querySelector('.kantnoot[data-noot="' + id + '"]');
        if (doel) {
          doel.scrollIntoView({ behavior: 'smooth', block: 'center' });
          doel.classList.add('markeer');
          setTimeout(function () { doel.classList.remove('markeer'); }, 1800);
        }
        return;
      }
      var pb = e.target.closest('.pb');
      if (pb) { openOrigineel(config, pb.getAttribute('data-doel')); return; }
      var fig = e.target.closest('.editie-figuur[data-vergroot]');
      if (fig) { toonLightbox(fig.getAttribute('data-vergroot'), fig.getAttribute('data-bij') || ''); return; }
    });

    root.addEventListener('change', function (e) {
      var t = e.target;
      if (t.name === 'modus') { zetModus(t.value); herberekenLater(); bewaarInstellingen(); return; }
      if (t.classList.contains('pager-select')) { activeer(+t.value); return; }
      if (t.matches('input[data-app]')) {
        root.classList.toggle('verberg-app-' + t.getAttribute('data-app'), !t.checked);
        herberekenLater();
        // Trefferlijst bijwerken: noten van dit apparaat tellen wel/niet mee.
        if (veldWaarde().length >= 2) zoek(veld.value);
      } else if (t.id === 'opt-regelnr') {
        root.classList.toggle('geen-regelnr', !t.checked);
      } else if (t.id === 'opt-editie') {
        root.classList.toggle('geen-editiemark', !t.checked);
      } else if (t.id === 'opt-dagen') {
        root.classList.toggle('geen-dagmark', !t.checked);
      } else if (t.id === 'opt-afkorting') {
        root.classList.toggle('geen-afkorting', !t.checked);
        herberekenLater();
      } else if (t.id === 'opt-markering') {
        root.classList.toggle('geen-markering', !t.checked);
      } else if (t.id === 'opt-tolerant') {
        if (veld && veld.value.trim().length >= 2) zoek(veld.value);
      } else if (t.id === 'opt-origineel') {
        root.classList.toggle('met-origineel', t.checked);
        opDoel = null;
        if (t.checked) updateOrigineel(true);
        herberekenLater();
      }
      if (t.closest('.werkbalk')) bewaarInstellingen();
    });

    // Startmodus uit de kop: een grote editie kan met `weergave: bladeren`
    // meteen per pagina openen, zodat niet alle paginanoten tegelijk berekend
    // hoeven te worden (scheelt veel bij duizenden noten).
    if (root.classList.contains('modus-bladeren')) {
      var rbStart = root.querySelector('input[name="modus"][value="bladeren"]');
      if (rbStart) rbStart.checked = true;
      zetModus('bladeren');
      activeer(huidig);
    }

    // Bewaarde weergave-instellingen van een vorig bezoek toepassen; een
    // bewaarde modus wint van de startmodus uit de kop.
    // De hash eerst vastleggen: het herstellen kan hem overschrijven.
    var beginHash = location.hash;
    herstelInstellingen();

    // Dieplink: #pagina-N opent direct in bladermodus op die pagina
    // (een expliciete link wint van de bewaarde instellingen).
    var mh = beginHash.match(/^#pagina-(\d+)/);
    if (mh && secties.length > 1) {
      var radio = root.querySelector('input[name="modus"][value="bladeren"]');
      if (radio) radio.checked = true;
      zetModus('bladeren');
      activeer(+mh[1]);
    }

    // Dieplink: #rN springt naar (en markeert) die regel.
    var mr = beginHash.match(/^#r(\d+)$/);
    if (mr) {
      var regelEl = document.getElementById('r' + mr[1]);
      if (regelEl) {
        var regelPag = regelEl.closest('.pagina');
        if (regelPag && root.classList.contains('modus-bladeren')) {
          activeer(+regelPag.getAttribute('data-i'));
        }
        setTimeout(function () {
          regelEl.scrollIntoView({ block: 'center' });
          regelEl.classList.add('spring-actief');
          setTimeout(function () { regelEl.classList.remove('spring-actief'); }, 2500);
        }, 60);
      }
    }

    // Sneltoetsen: '/' focust het zoekveld; ←/→ bladeren (in bladermodus).
    document.addEventListener('keydown', function toetsen(e) {
      if (!root.isConnected) { document.removeEventListener('keydown', toetsen); return; }
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '/') {
        var zv = root.querySelector('.zoekveld');
        if (zv) { e.preventDefault(); zv.focus(); zv.select(); }
        return;
      }
      if (!root.classList.contains('modus-bladeren')) return;
      if (document.querySelector('.lightbox')) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); activeer(huidig - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); activeer(huidig + 1); }
    });

    herbereken(); // kantlijnnoten plaatsen (indien breed genoeg)
    updateOrigineel(true);
  }

  // ---- Spellingtolerant zoeken --------------------------------------------
  // Vroegmoderne spelling varieert sterk (jaer/jair/yaer, Enchuijzen/Enkhuizen,
  // Coppenhagen/Kopenhagen). Het tolerante zoekpatroon behandelt daarom
  // letterklassen als inwisselbaar en klinkerclusters als één geheel.
  var Z_VOCAAL = 'aeoàáâäãæèéêëòóôöõø';             // a/e/o-klinkers (clusteren onderling)
  var Z_IJY = 'ijyìíîïýÿĲĳ';                        // i/j/y (aparte klasse: jaer/iaer/yaer)
  var Z_KLASSEN = { u: 'uvùúûü', v: 'uvùúûü', s: 'sz', z: 'sz',
                    c: 'ckç', k: 'ckç', d: 'dt', t: 'dt' };
  function zoekEscape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function maakZoekPatroon(q, tolerant) {
    if (q.normalize) q = q.normalize('NFD').replace(/[̀-ͯ]/g, '');
    q = q.toLowerCase();
    if (!tolerant) {
      try { return new RegExp(zoekEscape(q), 'gi'); } catch (e) { return null; }
    }
    var stukken = [], vorige = null;
    for (var i = 0; i < q.length; i++) {
      var c = q.charAt(i);
      var stuk;
      if (Z_IJY.indexOf(c) !== -1) stuk = '[' + Z_IJY + ']+';
      else if (Z_VOCAAL.indexOf(c) !== -1) stuk = '[' + Z_VOCAAL + ']+';
      else if (Z_KLASSEN[c]) stuk = '[' + Z_KLASSEN[c] + ']+';
      else if (c === 'g') stuk = 'g+h?';           // dagh / dag
      else if (c === ' ') stuk = '\\s+';
      else if (/[a-z0-9]/.test(c)) stuk = zoekEscape(c) + '+';
      else stuk = zoekEscape(c);
      if (stuk === vorige) continue;               // klinker-/lettercluster samenvouwen
      stukken.push(stuk);
      vorige = stuk;
    }
    try { return new RegExp(stukken.join(''), 'gi'); } catch (e) { return null; }
  }

  // ---- Origineel (scan of pdf) --------------------------------------------
  function openOrigineel(config, doel) {
    if (!doel) return;
    if (config.meta.origineel_type === 'pdf' && config.meta.origineel_pdf) {
      window.open(config.meta.origineel_pdf + '#page=' + encodeURIComponent(doel), '_blank', 'noopener');
    } else if (config.meta.origineel_afbeeldingen) {
      toonLightbox(config.meta.origineel_afbeeldingen.replace('{n}', doel), 'Origineel · ' + doel);
    }
  }
  function toonLightbox(src, bijschrift) {
    var box = document.createElement('div');
    box.className = 'lightbox';
    box.innerHTML = '<div class="lb-binnen"><button class="lb-sluit" aria-label="Sluiten">×</button>' +
      '<div class="lb-knoppen">' +
      '<button class="lb-zoomknop" data-lb="uit" title="Uitzoomen (−)">−</button>' +
      '<button class="lb-zoomknop" data-lb="in" title="Inzoomen (+)">+</button>' +
      '<button class="lb-zoomknop" data-lb="reset" title="Herstel (0)">⟲</button>' +
      '</div>' +
      '<div class="lb-canvas"><img src="' + escapeHtml(src) + '" alt="' + escapeHtml(bijschrift) + '" draggable="false"></div>' +
      '<div class="lb-bijschrift">' + escapeHtml(bijschrift) + '</div></div>';

    var canvas = box.querySelector('.lb-canvas');
    var img = box.querySelector('.lb-canvas img');
    var schaal = 1, tx = 0, ty = 0;
    function pasToe() {
      img.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + schaal + ')';
      canvas.classList.toggle('gezoomd', schaal > 1);
    }
    // Zoom naar een punt (px,py in canvas-coördinaten t.o.v. het midden).
    function zoomNaar(px, py, nieuw) {
      nieuw = Math.max(1, Math.min(8, nieuw));
      if (nieuw === 1) { tx = 0; ty = 0; }
      else {
        tx = px - (px - tx) * (nieuw / schaal);
        ty = py - (py - ty) * (nieuw / schaal);
      }
      schaal = nieuw;
      pasToe();
    }
    function midden(e) {
      var r = canvas.getBoundingClientRect();
      return [e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2];
    }
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var p = midden(e);
      zoomNaar(p[0], p[1], schaal * (e.deltaY < 0 ? 1.18 : 1 / 1.18));
    }, { passive: false });
    canvas.addEventListener('dblclick', function (e) {
      var p = midden(e);
      zoomNaar(p[0], p[1], schaal > 1.5 ? 1 : 2.5);
    });
    // Slepen (pan) met pointer events; werkt ook op touch.
    var sleep = null;
    canvas.addEventListener('pointerdown', function (e) {
      if (schaal <= 1) return;
      sleep = { x: e.clientX - tx, y: e.clientY - ty };
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add('sleept');
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!sleep) return;
      tx = e.clientX - sleep.x;
      ty = e.clientY - sleep.y;
      pasToe();
    });
    function sleepKlaar() { sleep = null; canvas.classList.remove('sleept'); }
    canvas.addEventListener('pointerup', sleepKlaar);
    canvas.addEventListener('pointercancel', sleepKlaar);

    function sluit() { box.remove(); document.removeEventListener('keydown', toetsen); }
    function toetsen(e) {
      if (e.key === 'Escape') sluit();
      else if (e.key === '+' || e.key === '=') zoomNaar(0, 0, schaal * 1.4);
      else if (e.key === '-') zoomNaar(0, 0, schaal / 1.4);
      else if (e.key === '0') zoomNaar(0, 0, 1);
    }
    box.addEventListener('click', function (e) {
      var knop = e.target.closest('[data-lb]');
      if (knop) {
        var wat = knop.getAttribute('data-lb');
        if (wat === 'in') zoomNaar(0, 0, schaal * 1.4);
        else if (wat === 'uit') zoomNaar(0, 0, schaal / 1.4);
        else zoomNaar(0, 0, 1);
        return;
      }
      if (e.target === box || e.target.closest('.lb-sluit')) sluit();
    });
    document.addEventListener('keydown', toetsen);
    document.body.appendChild(box);
  }

  // ---- Register van namen & plaatsen --------------------------------------
  function regEscape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // Eén verwijzing per pagina (naar het eerste voorkomen), in paginavolgorde.
  function dedupLabels(voorkomens) {
    var gezien = {}, uit = [];
    voorkomens.forEach(function (v) {
      var sleutel = v.label || v.id;
      if (gezien[sleutel]) return;
      gezien[sleutel] = true;
      uit.push(v);
    });
    return uit;
  }

  function bouwRegister(root, config) {
    var doel = document.getElementById('register');
    if (!doel || !config.register || !config.register.length) return;

    // Alle varianten met verwijzing naar hun ingang, langste eerst zodat
    // 'Tycho Brahe' vóór 'Tycho' matcht.
    var alle = [];
    config.register.forEach(function (ing, i) {
      ing._voorkomens = [];
      ing.varianten.forEach(function (v) { alle.push({ v: v, i: i }); });
    });
    alle.sort(function (a, b) { return b.v.length - a.v.length; });
    if (!alle.length) return;

    var perVariant = {};
    alle.forEach(function (a) { perVariant[a.v.toLowerCase()] = a.i; });
    var patroon;
    try {
      patroon = new RegExp(
        '(?<![\\p{L}\\p{N}])(' +
        alle.map(function (a) { return regEscape(a.v); }).join('|') +
        ')(?![\\p{L}\\p{N}])', 'giu');
    } catch (e) {
      // Oudere browser zonder lookbehind/unicode-props: sla het register over.
      return;
    }

    var teller = 0;
    root.querySelectorAll('.pagina .tekst').forEach(function (tekstEl) {
      var pagina = tekstEl.closest('.pagina');
      var label = pagina ? pagina.getAttribute('data-label') : '';
      // Verzamel eerst de tekstknopen; wijzig de DOM daarna.
      var knopen = [];
      var loper = document.createTreeWalker(tekstEl, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          // Sla bijschriften van afbeeldingen over.
          if (n.parentNode.closest('figure')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      var n;
      while ((n = loper.nextNode())) knopen.push(n);

      knopen.forEach(function (node) {
        var tekst = node.nodeValue;
        patroon.lastIndex = 0;
        if (!patroon.test(tekst)) return;
        patroon.lastIndex = 0;
        var frag = document.createDocumentFragment();
        var laatst = 0, mm;
        while ((mm = patroon.exec(tekst))) {
          var woord = mm[1];
          var start = mm.index;
          if (start > laatst) frag.appendChild(document.createTextNode(tekst.slice(laatst, start)));
          var id = 'reg-' + (++teller);
          var span = document.createElement('span');
          span.className = 'register-anker';
          span.id = id;
          span.textContent = woord;
          frag.appendChild(span);
          laatst = start + woord.length;
          var ing = config.register[perVariant[woord.toLowerCase()]];
          if (ing) ing._voorkomens.push({ id: id, label: label });
        }
        if (laatst < tekst.length) frag.appendChild(document.createTextNode(tekst.slice(laatst)));
        node.parentNode.replaceChild(frag, node);
      });
    });

    // Groepeer per soort en render alfabetisch.
    var groepen = {
      persoon: { titel: 'Personen', items: [] },
      plaats:  { titel: 'Plaatsen', items: [] }
    };
    config.register.forEach(function (ing) {
      if (!ing._voorkomens.length) return;
      var g = groepen[ing.soort] || (groepen[ing.soort] = { titel: ing.soort, items: [] });
      g.items.push(ing);
    });

    var html = '<h1>Register</h1>' +
      '<p class="reg-uitleg">Namen van personen en plaatsen, met hun spelvarianten in het ' +
      'handschrift. Klik op een vindplaats om die in de tekst op te zoeken.</p>';
    var volgorde = ['persoon', 'plaats'];
    Object.keys(groepen).forEach(function (k) { if (volgorde.indexOf(k) === -1) volgorde.push(k); });
    var iets = false;
    volgorde.forEach(function (k) {
      var g = groepen[k];
      if (!g || !g.items.length) return;
      iets = true;
      g.items.sort(function (a, b) { return a.naam.localeCompare(b.naam, 'nl'); });
      html += '<section class="reg-groep"><h2>' + escapeHtml(g.titel) + '</h2><dl class="register-lijst">';
      g.items.forEach(function (ing) {
        var varTekst = ing.varianten.filter(function (v) { return v !== ing.naam; });
        html += '<dt>' + escapeHtml(ing.naam) +
          (varTekst.length ? ' <span class="reg-var">(' + escapeHtml(varTekst.join(', ')) + ')</span>' : '') +
          '</dt><dd>' +
          dedupLabels(ing._voorkomens).map(function (v, j) {
            return '<a class="reg-link" data-doel="' + v.id + '" href="#">' +
              escapeHtml(v.label || ('§' + (j + 1))) + '</a>';
          }).join('<span class="reg-sep">·</span>') +
          '</dd>';
      });
      html += '</dl></section>';
    });
    if (!iets) html += '<p>Nog geen vindplaatsen gevonden.</p>';
    doel.innerHTML = html;

    doel.addEventListener('click', function (e) {
      var link = e.target.closest('.reg-link');
      if (!link) return;
      e.preventDefault();
      var id = link.getAttribute('data-doel');
      var tab = document.querySelector('.tabs [data-paneel="tekst"]');
      if (tab) tab.click();
      var mikpunt = document.getElementById(id);
      if (!mikpunt) return;
      // Zorg dat de pagina zichtbaar is in de per-pagina modus.
      var pag = mikpunt.closest('.pagina');
      if (pag && root._toonPagina) root._toonPagina(+pag.getAttribute('data-i'));
      root.querySelectorAll('.reg-actief').forEach(function (x) { x.classList.remove('reg-actief'); });
      mikpunt.classList.add('reg-actief');
      mikpunt.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(function () { mikpunt.classList.remove('reg-actief'); }, 2600);
    });
  }

  // ---- Export: TEI-XML en platte tekst ------------------------------------
  function xmlEsc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
  }
  // Typografie en editeursingrepen naar TEI-elementen (invoer is al ge-escaped).
  function teiOpmaak(s) {
    s = s.replace(/\{(\w+):([\s\S]*?)\}/g, function (m, code, body) {
      switch (code) {
        case 'sc':   return '<hi rend="smallcaps">' + body + '</hi>';
        case 'sup':  return '<hi rend="superscript">' + body + '</hi>';
        case 'sub':  return '<hi rend="subscript">' + body + '</hi>';
        case 'del':  return '<del>' + body + '</del>';
        case 'ul':   return '<hi rend="underline">' + body + '</hi>';
        case 'sp':   return '<hi rend="letterspace">' + body + '</hi>';
        case 'add':  return '<supplied resp="#editeur">' + body + '</supplied>';
        case 'unc':  return '<unclear>' + body + '</unclear>';
        case 'ex':   return '<expan>' + body + '</expan>';
        case 'ab':   return '<ex>' + body + '</ex>';
        case 'gap':  return '<gap reason="' + (body || 'onleesbaar') + '"/>';
        case 'rood': return '<hi rend="rubricated">' + body + '</hi>';
        case 'init': return '<hi rend="initial">' + body + '</hi>';
        case 'itl':  return '<add place="above">' + body + '</add>';
        case 'marg': return '<add place="margin">' + body + '</add>';
        default:     return body;
      }
    });
    s = s.replace(/\*\*([\s\S]+?)\*\*/g, '<hi rend="bold">$1</hi>');
    s = s.replace(/\*([^*]+)\*/g, '<hi rend="italic">$1</hi>');
    return s;
  }
  // Noten ([[lemma|code|inhoud]], genest) naar seg/note.
  function teiSegment(s, config) {
    var out = '', i = 0;
    while (i < s.length) {
      var open = s.indexOf('[[', i);
      if (open === -1) { out += teiOpmaak(s.slice(i)); break; }
      out += teiOpmaak(s.slice(i, open));
      var close = matchClose(s, open + 2);
      if (close === -1) { out += teiOpmaak(s.slice(open)); break; }
      var velden = splitTop(s.slice(open + 2, close));
      var lemma = (velden[0] || '').trim();
      var code = (velden[1] || '').trim();
      var inhoud = velden.slice(2).join('|').trim();
      var app = apparaatVan(config, code);
      if (!app) {
        out += teiSegment(lemma, config);
      } else {
        out += '<seg>' + teiSegment(lemma, config) +
          '<note type="' + xmlEsc(code) + '" resp="' +
          (app.soort === 'origineel' ? '#auteur' : '#editeur') + '">' +
          teiSegment(inhoud, config) + '</note></seg>';
      }
      i = close + 2;
    }
    return out;
  }
  function naarTEI(tekst) {
    var parsed = parseKop(tekst);
    var config = parsed.config, meta = config.meta;
    var regels = parsed.body.replace(/\r\n/g, '\n').split('\n');
    var stap = parseInt(meta.regelnummering, 10) || 0;
    var uit = [], inP = false, regelnr = 0;
    function sluitP() { if (inP) { uit.push('</p>'); inP = false; } }

    for (var i = 0; i < regels.length; i++) {
      var t = regels[i].trim();
      if (t === '') { sluitP(); continue; }
      var kop = t.match(/^(#{1,3})\s+(.*)$/);
      if (kop) {
        sluitP();
        uit.push('<head type="niveau-' + kop[1].length + '">' +
          teiSegment(xmlEsc(kop[2]), config) + '</head>');
        continue;
      }
      var fig = t.match(/^!\[([\s\S]*?)\]\(([^)]+)\)\s*(\{breed\})?\s*$/);
      if (fig) {
        sluitP();
        uit.push('<figure><graphic url="' + xmlEsc(fig[2].trim()) + '"/>' +
          (fig[1].trim() ? '<figDesc>' + teiOpmaak(xmlEsc(fig[1].trim())) + '</figDesc>' : '') +
          '</figure>');
        continue;
      }
      if (/^@\s/.test(t)) {
        var dm = parseDag(t.slice(1).trim());
        if (dm) {
          sluitP();
          uit.push('<milestone unit="day" when="' + xmlEsc(dm.key) + '"' +
            (dm.kal === 'sv' ? ' style="julian"' : '') +
            ' n="' + xmlEsc(dm.label) + '"/>');
          continue;
        }
      }
      if (t.charAt(0) === '~') {
        var pm = t.slice(1).split('|').map(function (x) { return x.trim(); });
        sluitP();
        uit.push('<pb n="' + xmlEsc(pm[0] || '') + '"' +
          (pm[1] ? ' facs="' + xmlEsc(pm[1]) + '"' : '') + '/>');
        continue;
      }
      if (t.charAt(0) === '|') {
        sluitP();
        var rijen = [];
        while (i < regels.length && regels[i].trim().charAt(0) === '|') { rijen.push(regels[i].trim()); i++; }
        i--;
        uit.push('<table>');
        rijen.forEach(function (rij) {
          if (isScheidingsrij(rij)) return;
          uit.push('<row>' + tabelCellen(rij).map(function (c) {
            return '<cell>' + teiSegment(xmlEsc(c), config) + '</cell>';
          }).join('') + '</row>');
        });
        uit.push('</table>');
        continue;
      }
      var li = t.match(/^([-*]|\d+\.)\s+(.*)$/);
      if (li) {
        sluitP();
        uit.push('<list rend="' + (/\d/.test(li[1]) ? 'numbered' : 'bulleted') + '">');
        while (i < regels.length) {
          var lm = regels[i].trim().match(/^([-*]|\d+\.)\s+(.*)$/);
          if (!lm) break;
          uit.push('<item>' + teiSegment(xmlEsc(lm[2]), config) + '</item>');
          i++;
        }
        i--;
        uit.push('</list>');
        continue;
      }
      // gewone tekstregel
      regelnr++;
      if (!inP) { uit.push('<p>'); inP = true; }
      uit.push((stap > 0 ? '<lb n="' + regelnr + '"/>' : '') +
        teiSegment(xmlEsc(regels[i]), config));
    }
    sluitP();

    var kopj = [];
    kopj.push('<?xml version="1.0" encoding="UTF-8"?>');
    kopj.push('<TEI xmlns="http://www.tei-c.org/ns/1.0">');
    kopj.push('<teiHeader><fileDesc><titleStmt>');
    kopj.push('<title>' + xmlEsc(meta.titel || 'Editie') + '</title>');
    if (meta.auteur) kopj.push('<author>' + xmlEsc(meta.auteur) + '</author>');
    kopj.push('<respStmt xml:id="editeur"><resp>editeursnoten</resp><name>de editeur</name></respStmt>');
    kopj.push('<respStmt xml:id="auteur"><resp>oorspronkelijke noten</resp><name>' +
      xmlEsc(meta.auteur || 'de auteur') + '</name></respStmt>');
    kopj.push('</titleStmt>');
    kopj.push('<publicationStmt><p>Automatische TEI-export uit het Edities-platform.</p></publicationStmt>');
    kopj.push('<sourceDesc><p>' + xmlEsc([meta.bron, meta.jaar, meta.type]
      .filter(function (x) { return x; }).join(' · ') || 'Onbekende bron') + '</p></sourceDesc>');
    kopj.push('</fileDesc>');
    if (config.apparaten.length) {
      kopj.push('<encodingDesc><editorialDecl>');
      kopj.push('<p>Notenapparaten (het type-attribuut van elke note): ' +
        xmlEsc(config.apparaten.map(function (a) {
          return a.code + ' = ' + a.label + ' (' + a.soort + ')';
        }).join('; ')) + '.</p>');
      kopj.push('</editorialDecl></encodingDesc>');
    }
    kopj.push('</teiHeader>');
    var personen = config.register.filter(function (r) { return r.soort === 'persoon'; });
    var plaatsen = config.register.filter(function (r) { return r.soort === 'plaats'; });
    if (personen.length || plaatsen.length) {
      kopj.push('<standOff>');
      function naamlijst(items, lijstTag, itemTag, naamTag) {
        var u = ['<' + lijstTag + '>'];
        items.forEach(function (ing) {
          u.push('<' + itemTag + '><' + naamTag + '>' + xmlEsc(ing.naam) + '</' + naamTag + '>' +
            ing.varianten.filter(function (v) { return v !== ing.naam; }).map(function (v) {
              return '<' + naamTag + ' type="variant">' + xmlEsc(v) + '</' + naamTag + '>';
            }).join('') + '</' + itemTag + '>');
        });
        u.push('</' + lijstTag + '>');
        return u.join('\n');
      }
      if (personen.length) kopj.push(naamlijst(personen, 'listPerson', 'person', 'persName'));
      if (plaatsen.length) kopj.push(naamlijst(plaatsen, 'listPlace', 'place', 'placeName'));
      kopj.push('</standOff>');
    }
    return kopj.join('\n') + '\n<text><body>\n' + uit.join('\n') + '\n</body></text>\n</TEI>\n';
  }

  // Kale leestekst: noten worden hun lemma, markup verdwijnt.
  function naarTekst(tekst) {
    var parsed = parseKop(tekst);
    var regels = parsed.body.replace(/\r\n/g, '\n').split('\n');
    var uit = [];
    regels.forEach(function (r) {
      var t = r.trim();
      if (/^!\[/.test(t) || t.charAt(0) === '~' || /^@\s/.test(t)) return;
      var kop = t.match(/^(#{1,3})\s+(.*)$/);
      var inhoud = kop ? kop[2] : r;
      var vorig;
      do { // binnenste noten eerst, tot alles is teruggebracht tot het lemma
        vorig = inhoud;
        inhoud = inhoud.replace(/\[\[((?:(?!\[\[)[\s\S])*?)\]\]/g, function (m, p) {
          return splitTop(p)[0];
        });
      } while (inhoud !== vorig);
      do {
        vorig = inhoud;
        inhoud = inhoud.replace(/\{\w+:([^{}]*)\}/g, '$1');
      } while (inhoud !== vorig);
      inhoud = inhoud.replace(/\*+/g, '');
      uit.push(inhoud.replace(/\s+$/, ''));
    });
    return uit.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  function downloadBestand(naam, inhoud, mime) {
    var blob = new Blob([inhoud], { type: mime + ';charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = naam;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  // ---- Publiek ------------------------------------------------------------
  function render(root, tekst) {
    root._bron = tekst; // voor export (TEI / platte tekst)
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
        '<span class="editie-onderregel">' +
          (meta.type ? '<span class="editie-bron">' + escapeHtml(meta.type.charAt(0).toUpperCase() + meta.type.slice(1)) + '</span>' : '') +
          '<button type="button" class="editie-citeer wb-uitklap" aria-expanded="false" aria-controls="wb-citeer" title="Citeerhulp, permalink en export">❝ Citeer</button>' +
        '</span>' +
      '</p>' +
      '<div class="wb-citeer" id="wb-citeer" hidden></div>' +
      '</header>';

    var verbergCss = config.apparaten.map(function (a) {
      var c = a.code;
      return '.verberg-app-' + c + ' .lemma.app-' + c + '{border-bottom:none;cursor:text;background:none}' +
             '.verberg-app-' + c + ' .apparaat[data-code="' + c + '"]{display:none}';
    }).join('\n');

    var heeftNummers = parseInt(meta.regelnummering, 10) > 0;
    var meerdere = body.paginas.length > 1;
    var paginasHtml = body.paginas.map(function (p, idx) {
      return '<section class="pagina" data-i="' + (idx + 1) + '" data-doel="' + escapeHtml(p.doel || '') +
        '" data-label="' + escapeHtml(p.label || ('[' + (idx + 1) + ']')) + '">' +
        '<div class="tekst">' + p.uit.join('\n') + '</div>' +
        renderApparaten(config, p.noten, heeftNummers) +
        '</section>';
    }).join('');

    root.innerHTML =
      kop +
      renderWerkbalk(config, body.noten, meerdere, body.koppen, body.dagen) +
      (meerdere ? bouwPager(body.paginas) : '') +
      '<div class="paginas">' + paginasHtml + '</div>';
    var startBladeren = body.paginas.length > 1 && meta.weergave === 'bladeren';
    root.classList.add(startBladeren ? 'modus-bladeren' : 'modus-doorlopend');
    if (!heeftNummers) root.classList.add('geen-regelnr'); // geen lege nummer-goot

    var styleEl = document.createElement('style');
    styleEl.textContent = verbergCss;
    root.appendChild(styleEl);

    koppelInteracties(root, config, body.noten);
    bouwRegister(root, config);
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

  global.Editie = {
    laad: laad, render: render, parseKop: parseKop,
    naarTEI: naarTEI, naarTekst: naarTekst
  };
})(window);
