/* tijdlijn.js — chronologische tijdbalk van de dagtekeningen.
 *
 * Installeert zich als extra tab "Tijdlijn" op elke editie die dagtekeningen
 * (@-markeringen) heeft. Toont alle gedateerde dagen op een tijdas; beweeg
 * erover voor datum (en plaats, indien de reiskaart die kent) en klik om naar
 * die dag in de tekst te springen. Hergebruikt de "Dagen"-navigatie van
 * editie.js. Dependency-vrij; doet niets zonder dagtekeningen.
 */
(function () {
  'use strict';
  var MND = { januari: 1, februari: 2, maart: 3, april: 4, mei: 5, juni: 6,
    juli: 7, augustus: 8, september: 9, oktober: 10, november: 11, december: 12 };
  var MND_KORT = ['', 'jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoVan(t) {
    var m = t.trim().match(/(\d{1,2})\s+([a-zç]+)\s+(\d{4})/i);
    if (!m) return null;
    var mn = MND[m[2].toLowerCase()];
    return mn ? m[3] + '-' + pad(mn) + '-' + pad(+m[1]) : null;
  }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function el(naam, attrs) {
    var e = document.createElementNS(SVGNS, naam);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function plaatsenUitKaart() {
    var kaart = {};
    var svg = document.querySelector('.paneel[data-paneel="reis"] svg');
    if (!svg) return kaart;
    var jaar = null;
    svg.querySelectorAll('circle').forEach(function (c) {
      var ti = c.querySelector('title'); if (!ti) return;
      var m = ti.textContent.match(/(\d{1,2})-(\d{1,2})(?:-(\d{4}))?:\s*([^·]+?)(?:\s·|$)/);
      if (!m) return;
      if (m[3]) jaar = m[3];
      if (!jaar) return;
      var iso = jaar + '-' + pad(+m[2]) + '-' + pad(+m[1]);
      var plaats = m[4].trim().split(' - ')[0].trim();
      if (plaats && !kaart[iso]) kaart[iso] = plaats;
    });
    return kaart;
  }

  function tekenTijdlijn(doel, dagen, plaatsen) {
    var W = 1000, H = 150, padL = 20, padR = 20, top = 26, basis = H - 34;
    var t0 = dagen[0].d.getTime(), t1 = dagen[dagen.length - 1].d.getTime();
    var span = Math.max(1, t1 - t0);
    function X(ms) { return padL + (ms - t0) / span * (W - padL - padR); }

    var svg = el('svg', { class: 'tl-svg', viewBox: '0 0 ' + W + ' ' + H,
      role: 'img', 'aria-label': 'Tijdlijn van de reis' });
    // as-lijn
    svg.appendChild(el('line', { class: 'tl-as', x1: padL, y1: basis, x2: W - padR, y2: basis }));

    // jaar- en maandrasters
    var y0 = dagen[0].d.getFullYear(), y1 = dagen[dagen.length - 1].d.getFullYear();
    var gr = el('g', { class: 'tl-raster' });
    if (dagen[0].d.getMonth() !== 0) {          // startjaar labelen (begint niet op 1 jan)
      var tj0 = el('text', { class: 'tl-jaarlabel', x: (padL + 2).toFixed(1), y: top - 12 });
      tj0.textContent = y0; gr.appendChild(tj0);
    }
    for (var jr = y0; jr <= y1 + 1; jr++) {
      for (var mo = 1; mo <= 12; mo++) {
        var dt = new Date(Date.UTC(jr, mo - 1, 1)).getTime();
        if (dt < t0 || dt > t1) continue;
        var x = X(dt), jaarlijn = mo === 1;
        gr.appendChild(el('line', { class: jaarlijn ? 'tl-jaar' : 'tl-maand',
          x1: x.toFixed(1), y1: jaarlijn ? top - 8 : basis - 6, x2: x.toFixed(1), y2: basis }));
        if (jaarlijn) {
          var tj = el('text', { class: 'tl-jaarlabel', x: (x + 3).toFixed(1), y: top - 12 });
          tj.textContent = jr; gr.appendChild(tj);
        } else if (span < 1000 * 3600 * 24 * 400) {
          var tm = el('text', { class: 'tl-maandlabel', x: x.toFixed(1), y: basis + 16, 'text-anchor': 'middle' });
          tm.textContent = MND_KORT[mo]; gr.appendChild(tm);
        }
      }
    }
    svg.appendChild(gr);

    // dagstreepjes
    var dg = el('g', { class: 'tl-dagen' });
    dagen.forEach(function (d) {
      var x = X(d.d.getTime());
      dg.appendChild(el('line', { class: 'tl-dag', x1: x.toFixed(1), y1: basis - 20, x2: x.toFixed(1), y2: basis }));
    });
    svg.appendChild(dg);

    // beweegbare cursor
    var cur = el('g', { class: 'tl-cursor', style: 'display:none' });
    var curLijn = el('line', { x1: 0, y1: top - 8, x2: 0, y2: basis });
    var curDot = el('circle', { cx: 0, cy: basis, r: 4 });
    cur.appendChild(curLijn); cur.appendChild(curDot); svg.appendChild(cur);

    // vangrechthoek voor muis/touch
    var vang = el('rect', { class: 'tl-vang', x: 0, y: top - 10, width: W, height: H - top + 4,
      fill: 'transparent' });
    svg.appendChild(vang);
    doel.appendChild(svg);

    var bijschrift = document.createElement('p');
    bijschrift.className = 'tl-bijschrift';
    bijschrift.innerHTML = '<span class="tl-bs-datum">Beweeg over de balk</span>';
    doel.appendChild(bijschrift);

    function dichtstbij(clientX) {
      var r = svg.getBoundingClientRect();
      var vx = (clientX - r.left) / r.width * W;      // in viewBox-coördinaten
      var beste = dagen[0], bestd = Infinity;
      for (var i = 0; i < dagen.length; i++) {
        var dx = Math.abs(X(dagen[i].d.getTime()) - vx);
        if (dx < bestd) { bestd = dx; beste = dagen[i]; }
      }
      return beste;
    }
    function toon(d) {
      var x = X(d.d.getTime());
      cur.style.display = '';
      curLijn.setAttribute('x1', x.toFixed(1)); curLijn.setAttribute('x2', x.toFixed(1));
      curDot.setAttribute('cx', x.toFixed(1));
      bijschrift.innerHTML = '<span class="tl-bs-datum">' + d.label + '</span>' +
        (plaatsen[d.iso] ? ' <span class="tl-bs-plaats">· ' + plaatsen[d.iso] + '</span>' : '');
    }
    var tekstTab = document.querySelector('.tabs [data-paneel="tekst"]');
    function ga(d) {
      if (tekstTab) tekstTab.click();
      setTimeout(function () { d.link.click(); }, 40);
    }
    vang.addEventListener('mousemove', function (e) { toon(dichtstbij(e.clientX)); });
    vang.addEventListener('click', function (e) { ga(dichtstbij(e.clientX)); });
    vang.addEventListener('touchstart', function (e) {
      if (e.touches[0]) { toon(dichtstbij(e.touches[0].clientX)); }
    }, { passive: true });
    svg.style.cursor = 'pointer';
  }

  function bouw() {
    var root = document.getElementById('editie');
    if (!root) return false;
    var dagLinks = root.querySelectorAll('.dagen-lijst a[data-spring]');
    if (!dagLinks.length) return false;
    var tabs = document.querySelector('.tabs');
    var tekstSec = document.querySelector('.paneel[data-paneel="tekst"]');
    if (!tabs || !tekstSec) return true;
    if (document.querySelector('[data-paneel="tijdlijn"]')) return true; // al gedaan

    var dagen = [];
    dagLinks.forEach(function (a) {
      var iso = isoVan(a.textContent);
      if (iso) dagen.push({ iso: iso, d: new Date(iso), link: a, label: a.textContent.trim() });
    });
    if (dagen.length < 2) return true;
    dagen.sort(function (a, b) { return a.d - b.d; });
    var plaatsen = plaatsenUitKaart();

    var knop = document.createElement('button');
    knop.setAttribute('role', 'tab');
    knop.setAttribute('data-paneel', 'tijdlijn');
    knop.setAttribute('aria-selected', 'false');
    knop.textContent = 'Tijdlijn';
    var tekstKnop = tabs.querySelector('[data-paneel="tekst"]');
    tabs.insertBefore(knop, tekstKnop ? tekstKnop.nextSibling : null);

    var sec = document.createElement('section');
    sec.className = 'paneel prozasectie';
    sec.setAttribute('data-paneel', 'tijdlijn');
    var eerste = dagen[0].label, laatste = dagen[dagen.length - 1].label;
    sec.innerHTML = '<h1>Tijdlijn</h1>' +
      '<p>Alle ' + dagen.length + ' gedateerde dagen van de reis, van ' + eerste +
      ' tot ' + laatste + '. Beweeg over de balk voor de datum' +
      (Object.keys(plaatsen).length ? ' en de plaats' : '') +
      ', en klik om naar die dag in de tekst te springen.</p>' +
      '<div class="tl-omhulsel"></div>';
    tekstSec.parentNode.insertBefore(sec, tekstSec.nextSibling);
    tekenTijdlijn(sec.querySelector('.tl-omhulsel'), dagen, plaatsen);
    return true;
  }

  var n = 0;
  (function wacht() { if (bouw() || ++n > 40) return; setTimeout(wacht, 200); })();
})();
