(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // One load moment: hero text, then bars and numbers as they scroll into view.
  var hero = $('#hero');
  if (hero) requestAnimationFrame(function () { hero.classList.add('load'); });

  var bars = $$('.rbar i, .track i, .hist i, .sbar i');
  function go(el) { el.classList.add('go'); }
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { go(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.2 });
    bars.forEach(function (b) { io.observe(b); });
  } else { bars.forEach(go); }

  $$('[data-count]').forEach(function (el) {
    var end = parseFloat(el.dataset.count) || 0, dec = parseInt(el.dataset.dec || '0', 10), suf = el.dataset.suffix || '';
    function fmt(v) { return v.toFixed(dec) + suf; }
    if (reduce) { el.textContent = fmt(end); return; }
    var t0 = null;
    (function step(t) {
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(end * e);
      if (p < 1) requestAnimationFrame(step);
    })(performance.now());
  });

  // Detail sheet
  var sheet = $('#sheet'), sbody = $('#sheet-body'), stitle = $('#sheet-title');
  function openItem(item) {
    var tpl = item && $('template', item);
    if (!tpl || !sheet || !sheet.showModal) return;
    var t = $('.row-title', item) || $('.tile-name', item) || $('.tile-top b', item);
    stitle.textContent = t ? t.textContent : '';
    sbody.innerHTML = '';
    sbody.appendChild(tpl.content.cloneNode(true));
    if (!sheet.open) sheet.showModal();
    sbody.scrollTop = 0;
    try { history.replaceState(null, '', '#' + item.dataset.slug); } catch (e) {}
  }
  function openHash() {
    var h = decodeURIComponent(location.hash.slice(1));
    if (!h) return;
    var it = $('[data-slug="' + h.replace(/[^\w-]/g, '') + '"]');
    if (it) openItem(it);
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-open]');
    if (b) openItem(b.closest('[data-slug]'));
    if (e.target.closest('[data-close]') && sheet) sheet.close();
    if (e.target === sheet) sheet.close();
    if (e.target === $('#palette')) $('#palette').close();
  });
  if (sheet) sheet.addEventListener('close', function () {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  });
  openHash();
  window.addEventListener('hashchange', openHash);

  // Filter, sort and search for the Ideas and Startups lists
  var list = $('#list');
  if (list) {
    var items = $$(':scope > li', list), q = $('#q'), count = $('#count'), none = $('#none');
    var st = { q: '', min: 0, region: '', sector: '', sort: list.querySelector('[data-funding]') ? 'funding' : 'rank' };
    var apply = function () {
      var shown = 0;
      items.forEach(function (li) {
        var ok = !st.q || (li.dataset.search || '').indexOf(st.q) > -1;
        if (ok && st.min) ok = parseInt(li.dataset.score || '0', 10) >= st.min;
        if (ok && st.region) ok = li.dataset.region === st.region;
        if (ok && st.sector) ok = li.dataset.sector === st.sector;
        li.hidden = !ok;
        if (ok) shown++;
      });
      if (count) count.textContent = shown;
      if (none) none.hidden = shown > 0;
    };
    var resort = function () {
      var k = st.sort, numeric = k === 'rank' || k === 'funding' || k === 'valuation';
      var desc = k === 'funding' || k === 'valuation' || k === 'added';
      items.sort(function (a, b) {
        var x = a.dataset[k], y = b.dataset[k];
        if (numeric) {
          x = (x === '' || x === undefined) ? null : parseFloat(x);
          y = (y === '' || y === undefined) ? null : parseFloat(y);
          if (x === null && y === null) return 0;
          if (x === null) return 1;
          if (y === null) return -1;
          return desc ? y - x : x - y;
        }
        return desc ? (x < y ? 1 : x > y ? -1 : 0) : (x < y ? -1 : x > y ? 1 : 0);
      });
      items.forEach(function (li) { list.appendChild(li); });
    };
    var seg = function (id, attr, fn) {
      var box = $(id);
      if (!box) return;
      box.addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        $$('button', box).forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
        fn(b.dataset[attr]);
      });
    };
    if (q) q.addEventListener('input', function () { st.q = q.value.trim().toLowerCase(); apply(); });
    seg('#sort', 'sort', function (v) { st.sort = v; resort(); });
    seg('#minseg', 'min', function (v) { st.min = parseInt(v, 10) || 0; apply(); });
    seg('#regseg', 'region', function (v) { st.region = v; apply(); });
    var sec = $('#sector'); if (sec) sec.addEventListener('change', function () { st.sector = sec.value; apply(); });
    var ss = $('#sortsel'); if (ss) ss.addEventListener('change', function () { st.sort = ss.value; resort(); });
    resort();
  }

  // Global state picker: remembered in a cookie so every page (and the server) can read it.
  var gstate = $('#gstate');
  if (gstate) {
    var pick = gstate.closest('.statepick');
    var paint = function () { if (pick) pick.classList.toggle('on', !!gstate.value); };
    paint();
    gstate.addEventListener('change', function () {
      try {
        document.cookie = 'bos_state=' + encodeURIComponent(gstate.value) + '; path=/; max-age=31536000; samesite=lax' + (location.protocol === 'https:' ? '; secure' : '');
      } catch (e) {}
      paint();
      document.dispatchEvent(new CustomEvent('bos:state', { detail: { slug: gstate.value, name: gstate.value ? gstate.options[gstate.selectedIndex].text : '' } }));
    });
  }

  // Region switch (India / US): remembered in a cookie; the state choice is cleared because states differ per country.
  var secure = location.protocol === 'https:' ? '; secure' : '';
  function setRegion(r) {
    try {
      document.cookie = 'bos_region=' + r + '; path=/; max-age=31536000; samesite=lax' + secure;
      document.cookie = 'bos_state=; path=/; max-age=0; samesite=lax' + secure;
    } catch (e) {}
    location.href = location.pathname + (location.search.replace(/[?&]tab=[^&]*/, '').replace(/^&/, '?') || '');
  }
  $$('.regsw button').forEach(function (b) {
    b.addEventListener('click', function () { if (b.getAttribute('aria-pressed') !== 'true') setRegion(b.dataset.region); });
  });
  // First visit with no saved choice and no country from the server: guess once from the browser time zone.
  if (document.body.dataset.geo === 'unknown') {
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    var usZone = /^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise|Juneau|Sitka|Nome|Adak|Metlakatla|Yakutat|Menominee|North_Dakota\/.*|Indiana\/.*|Kentucky\/.*)|US\/.*|Pacific\/Honolulu)$/.test(tz);
    try { document.cookie = 'bos_region=' + (usZone ? 'us' : 'in') + '; path=/; max-age=31536000; samesite=lax' + secure; } catch (e) {}
    if (usZone) location.reload();
  }

  // Command palette (Cmd/Ctrl+K)
  var pal = $('#palette'), pq = $('#pal-q'), pl = $('#pal-list'), data = [], sel = 0, shown = [];
  try { data = JSON.parse($('#palette-data').textContent); } catch (e) {}
  function mark() {
    $$('a', pl).forEach(function (a) { a.setAttribute('aria-selected', a.dataset.i === String(sel) ? 'true' : 'false'); });
    var cur = $('a[aria-selected=true]', pl);
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
  }
  function render() {
    var term = pq.value.trim().toLowerCase();
    shown = data.filter(function (i) { return !term || (i.t + ' ' + (i.s || '')).toLowerCase().indexOf(term) > -1; }).slice(0, 40);
    pl.innerHTML = '';
    if (!shown.length) { var n = document.createElement('li'); n.className = 'none'; n.textContent = 'No matches'; pl.appendChild(n); return; }
    var last = '';
    shown.forEach(function (it, idx) {
      if (it.k !== last) { var g = document.createElement('li'); g.className = 'grp'; g.textContent = it.k; pl.appendChild(g); last = it.k; }
      var li = document.createElement('li'), a = document.createElement('a'), t = document.createElement('b'), s = document.createElement('span');
      a.href = it.h; a.dataset.i = idx; a.setAttribute('role', 'option');
      t.textContent = it.t; t.style.fontWeight = '550'; s.textContent = it.s || '';
      a.appendChild(t); a.appendChild(s); li.appendChild(a); pl.appendChild(li);
    });
    sel = Math.min(sel, shown.length - 1); mark();
  }
  function openPalette() { if (!pal || !pal.showModal) return; if (sheet && sheet.open) sheet.close(); pq.value = ''; sel = 0; render(); if (!pal.open) pal.showModal(); pq.focus(); }
  function go2(i) { if (!shown[i]) return; pal.close(); location.href = shown[i].h; }
  if (pal) {
    pq.addEventListener('input', function () { sel = 0; render(); });
    pq.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
      else if (e.key === 'Enter') { e.preventDefault(); go2(sel); }
    });
    pl.addEventListener('mousemove', function (e) { var a = e.target.closest('a'); if (a && a.dataset.i !== String(sel)) { sel = parseInt(a.dataset.i, 10); mark(); } });
    pl.addEventListener('click', function (e) { if (e.target.closest('a')) pal.close(); });
  }
  document.addEventListener('click', function (e) { if (e.target.closest('[data-palette]')) openPalette(); });
  document.addEventListener('keydown', function (e) {
    var typing = /^(INPUT|SELECT|TEXTAREA)$/.test((document.activeElement || {}).tagName || '');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
    else if (e.key === '/' && !typing && !(pal && pal.open)) {
      var f = $('#q'); e.preventDefault(); if (f) f.focus(); else openPalette();
    }
  });
})();

/* Keep the current page's tab visible in the scrollable mobile nav */
(function () {
  var a = document.querySelector('.nav a[aria-current=page]'), n = document.querySelector('.nav');
  if (a && n && n.scrollWidth > n.clientWidth) n.scrollLeft = a.offsetLeft - (n.clientWidth - a.offsetWidth) / 2;
})();
