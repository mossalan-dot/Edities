/* site.js — thema-schakelaar en tabbladen (dependency-vrij) */
(function () {
  'use strict';

  // ---- Licht/donker -------------------------------------------------------
  var opgeslagen = null;
  try { opgeslagen = localStorage.getItem('thema'); } catch (e) {}
  if (opgeslagen) document.documentElement.setAttribute('data-thema', opgeslagen);

  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-thema-knop]')) {
      var huidig = document.documentElement.getAttribute('data-thema');
      var nieuw;
      if (huidig === 'dark') nieuw = 'light';
      else if (huidig === 'light') nieuw = 'dark';
      else {
        // nog niets gezet: kies het tegenovergestelde van het systeem
        var donkerSysteem = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        nieuw = donkerSysteem ? 'light' : 'dark';
      }
      document.documentElement.setAttribute('data-thema', nieuw);
      try { localStorage.setItem('thema', nieuw); } catch (err) {}
    }
  });

  // ---- Tabbladen ----------------------------------------------------------
  var tablist = document.querySelector('.tabs');
  if (tablist) {
    tablist.addEventListener('click', function (e) {
      var knop = e.target.closest('[data-paneel]');
      if (!knop) return;
      var naam = knop.getAttribute('data-paneel');
      tablist.querySelectorAll('[role=tab]').forEach(function (t) {
        t.setAttribute('aria-selected', String(t === knop));
      });
      document.querySelectorAll('.paneel[data-paneel]').forEach(function (p) {
        p.classList.toggle('actief', p.getAttribute('data-paneel') === naam);
      });
      if (location.hash.slice(1) !== naam) history.replaceState(null, '', '#' + naam);
    });
    // Open paneel uit de URL-hash
    var hash = location.hash.slice(1);
    if (hash) {
      var doelknop = tablist.querySelector('[data-paneel="' + hash + '"]');
      if (doelknop) doelknop.click();
    }
  }
})();
