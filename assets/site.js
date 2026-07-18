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

/* ---- Leesinstellingen --------------------------------------------------- */
(function () {
  'use strict';
  if (document.body.classList.contains('editor-body')) return;
  var nav = document.querySelector('.sitehoofd nav');
  if (!nav) return;

  var STAND = { schaal: 1, regel: 1.6, letter: 'serif', breedte: 42 };
  var inst = Object.assign({}, STAND);
  try { inst = Object.assign(inst, JSON.parse(localStorage.getItem('leesinstellingen') || '{}')); } catch (e) {}

  function bewaar() { try { localStorage.setItem('leesinstellingen', JSON.stringify(inst)); } catch (e) {} }
  function toepassen(herbereken) {
    var r = document.documentElement.style;
    r.setProperty('--lees-schaal', inst.schaal);
    r.setProperty('--lees-regel', inst.regel);
    r.setProperty('--leesbreedte', inst.breedte + 'rem');
    if (inst.letter === 'sans') r.setProperty('--leesletter', 'var(--sans)');
    else r.removeProperty('--leesletter');
    if (herbereken) window.dispatchEvent(new Event('resize'));
  }
  toepassen(false);

  var knop = document.createElement('button');
  knop.type = 'button'; knop.className = 'lees-knop'; knop.textContent = 'Aa';
  knop.title = 'Leesinstellingen'; knop.setAttribute('aria-expanded', 'false');
  nav.insertBefore(knop, nav.querySelector('.thema-knop'));

  var paneel = document.createElement('div');
  paneel.className = 'lees-paneel'; paneel.hidden = true;
  paneel.innerHTML =
    '<div class="lees-groep"><span class="lees-kop">Tekstgrootte</span><div class="lees-rij">' +
      '<button class="lees-opt" data-act="kleiner" title="Kleiner" style="flex:0 0 2.4rem">A−</button>' +
      '<span class="lees-grootte" data-grootte></span>' +
      '<button class="lees-opt" data-act="groter" title="Groter" style="flex:0 0 2.4rem">A+</button>' +
    '</div></div>' +
    '<div class="lees-groep"><span class="lees-kop">Regelafstand</span><div class="lees-rij">' +
      '<button class="lees-opt" data-regel="1.6">Normaal</button>' +
      '<button class="lees-opt" data-regel="1.95">Ruim</button>' +
    '</div></div>' +
    '<div class="lees-groep"><span class="lees-kop">Letter</span><div class="lees-rij">' +
      '<button class="lees-opt" data-letter="serif">Serif</button>' +
      '<button class="lees-opt" data-letter="sans">Schreefloos</button>' +
    '</div></div>' +
    '<div class="lees-groep"><span class="lees-kop">Leesbreedte</span><div class="lees-rij">' +
      '<button class="lees-opt" data-breedte="38">Smal</button>' +
      '<button class="lees-opt" data-breedte="42">Normaal</button>' +
      '<button class="lees-opt" data-breedte="52">Breed</button>' +
    '</div></div>' +
    '<button class="lees-herstel" type="button">Standaard herstellen</button>';
  nav.appendChild(paneel);

  function verversUI() {
    paneel.querySelector('[data-grootte]').textContent = Math.round(inst.schaal * 100) + '%';
    paneel.querySelectorAll('[data-regel]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(Math.abs(+b.dataset.regel - inst.regel) < 0.001));
    });
    paneel.querySelectorAll('[data-letter]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.letter === inst.letter));
    });
    paneel.querySelectorAll('[data-breedte]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(+b.dataset.breedte === inst.breedte));
    });
  }
  verversUI();

  knop.addEventListener('click', function (e) {
    e.stopPropagation();
    paneel.hidden = !paneel.hidden;
    knop.setAttribute('aria-expanded', String(!paneel.hidden));
  });
  document.addEventListener('click', function (e) {
    if (!paneel.hidden && !paneel.contains(e.target) && e.target !== knop) {
      paneel.hidden = true; knop.setAttribute('aria-expanded', 'false');
    }
  });
  paneel.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('lees-herstel')) { inst = Object.assign({}, STAND); }
    else if (b.dataset.act === 'groter') { inst.schaal = Math.min(1.5, +(inst.schaal + 0.05).toFixed(2)); }
    else if (b.dataset.act === 'kleiner') { inst.schaal = Math.max(0.85, +(inst.schaal - 0.05).toFixed(2)); }
    else if (b.dataset.regel) { inst.regel = +b.dataset.regel; }
    else if (b.dataset.letter) { inst.letter = b.dataset.letter; }
    else if (b.dataset.breedte) { inst.breedte = +b.dataset.breedte; }
    else return;
    toepassen(true); bewaar(); verversUI();
  });
})();

/* ---- "Verder waar je was" ----------------------------------------------- */
(function () {
  'use strict';
  var SLEUTEL = 'leespositie:' + location.pathname;

  function ankers(root) {
    return root.querySelectorAll('.db[id], .tekstkop[id]');
  }
  function start() {
    var root = document.getElementById('editie');
    if (!root || !root.querySelector('.tekst')) return false;

    function huidigePagina() {
      var a = root.querySelector('.pagina.actief');
      return a ? a.getAttribute('data-i') : null;
    }
    function bovensteAnker() {
      var lijst = ankers(root), gekozen = null;
      for (var i = 0; i < lijst.length; i++) {
        var el = lijst[i];
        if (el.offsetParent === null) continue;         // verborgen pagina
        var top = el.getBoundingClientRect().top;
        if (top < 140) gekozen = el; else break;
      }
      return gekozen;
    }
    var opslaanTimer;
    function bewaarPositie() {
      var el = bovensteAnker();
      var data = { pagina: huidigePagina(), id: el ? el.id : null,
        label: el ? el.textContent.replace(/^◈\s*/, '').trim().slice(0, 40) : null,
        y: Math.round(window.scrollY) };
      try { localStorage.setItem(SLEUTEL, JSON.stringify(data)); } catch (e) {}
    }
    window.addEventListener('scroll', function () {
      clearTimeout(opslaanTimer); opslaanTimer = setTimeout(bewaarPositie, 400);
    }, { passive: true });

    // Aanbod om te hervatten
    var opgeslagen = null;
    try { opgeslagen = JSON.parse(localStorage.getItem(SLEUTEL) || 'null'); } catch (e) {}
    if (!opgeslagen) return true;
    var beginnetje = (!opgeslagen.pagina || opgeslagen.pagina === '1') &&
      (!opgeslagen.id) && (opgeslagen.y || 0) < 200;
    if (beginnetje) return true;

    var toast = document.createElement('div');
    toast.className = 'lees-hervat';
    toast.innerHTML = '<span>Verder waar je was' +
      (opgeslagen.label ? ' — <strong>' + opgeslagen.label.replace(/</g, '&lt;') + '</strong>' : '') +
      '</span><button class="lh-ga" type="button">Ga verder</button>' +
      '<button class="lh-sluit" type="button" aria-label="Sluiten">×</button>';
    document.body.appendChild(toast);
    var weg = setTimeout(sluit, 9000);
    function sluit() { clearTimeout(weg); toast.remove(); }
    toast.querySelector('.lh-sluit').addEventListener('click', sluit);
    toast.querySelector('.lh-ga').addEventListener('click', function () {
      if (opgeslagen.pagina && root._toonPagina) root._toonPagina(+opgeslagen.pagina);
      setTimeout(function () {
        var el = opgeslagen.id && document.getElementById(opgeslagen.id);
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          el.classList.add('spring-actief');
          setTimeout(function () { el.classList.remove('spring-actief'); }, 2000); }
        else window.scrollTo({ top: opgeslagen.y || 0, behavior: 'smooth' });
      }, 60);
      sluit();
    });
    return true;
  }
  var n = 0;
  (function wacht() { if (start() || ++n > 40) return; setTimeout(wacht, 200); })();
})();
