/* kaartkoppeling.js — koppelt de reiskaart aan de tekst.
 *
 * Op een editie met zowel een routekaart (Reis-tab, stops met een <title>
 * "D-M[-JJJJ]: plaats") als dagtekeningen (@-markeringen), maakt dit script de
 * kaartstippen klikbaar: klik een stip -> ga naar de Tekst-tab en spring naar
 * de bijbehorende dag. Hergebruikt de bestaande "Dagen"-navigatie van editie.js.
 * Dependency-vrij; doet niets als een van beide onderdelen ontbreekt.
 */
(function () {
  'use strict';
  var MND = {
    januari: 1, februari: 2, maart: 3, april: 4, mei: 5, juni: 6, juli: 7,
    augustus: 8, september: 9, oktober: 10, november: 11, december: 12
  };
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // "3 mei 1674" -> "1674-05-03"
  function labelIso(t) {
    var m = t.trim().match(/(\d{1,2})\s+([a-zç]+)\s+(\d{4})/i);
    if (!m) return null;
    var mnd = MND[m[2].toLowerCase()];
    return mnd ? m[3] + '-' + pad(mnd) + '-' + pad(+m[1]) : null;
  }

  function koppel() {
    var root = document.getElementById('editie');
    if (!root) return;
    var reis = document.querySelector('.paneel[data-paneel="reis"]');
    var svg = reis && reis.querySelector('svg');
    var stops = svg ? svg.querySelectorAll('.rk-stops circle, circle') : [];
    var dagLinks = root.querySelectorAll('.dagen-lijst a[data-spring]');
    if (!stops.length || !dagLinks.length) return false;

    var perIso = {};
    dagLinks.forEach(function (a) {
      var iso = labelIso(a.textContent);
      if (iso && !perIso[iso]) perIso[iso] = a;
    });

    var tekstTab = document.querySelector('.tabs [data-paneel="tekst"]');
    var jaar = null, gekoppeld = 0;
    stops.forEach(function (c) {
      var titel = c.querySelector('title');
      if (!titel) return;
      var dm = titel.textContent.match(/(\d{1,2})-(\d{1,2})(?:-(\d{4}))?/);
      if (!dm) return;                       // stop zonder datum (bv. monument)
      if (dm[3]) jaar = dm[3];
      if (!jaar) return;
      var iso = jaar + '-' + pad(+dm[2]) + '-' + pad(+dm[1]);
      var link = perIso[iso];
      if (!link) return;
      c.style.cursor = 'pointer';
      c.classList.add('rk-klikbaar');
      if (titel.textContent.indexOf('klik') === -1) titel.textContent += ' · klik voor de tekst';
      c.addEventListener('click', function () {
        if (tekstTab) tekstTab.click();
        setTimeout(function () { link.click(); }, 40);
      });
      gekoppeld++;
    });
    return gekoppeld > 0;
  }

  // De editie wordt asynchroon geladen (fetch); wacht tot de dagenlijst er is.
  var pogingen = 0;
  (function wacht() {
    if (koppel() || ++pogingen > 40) return;
    setTimeout(wacht, 200);
  })();
})();
