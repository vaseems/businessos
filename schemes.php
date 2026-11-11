<?php
declare(strict_types=1);
require __DIR__ . '/inc/bootstrap.php';
require_login();
require __DIR__ . '/inc/data.php';
require __DIR__ . '/inc/layout.php';

try {
    $P = load_policy(isset($_GET['refresh']));
} catch (Throwable $e) {
    http_response_code(503);
    page_head('Government schemes', 'schemes.php', []);
    echo '<section class="empty"><h1>Schemes are unavailable</h1><p>Please try again in a moment.</p></section>';
    page_foot([]);
    exit;
}

$all = $P['schemes'] ?? [];
$central = array_values(array_filter($all, fn($s) => ($s['level'] ?? 'Central') !== 'State'));
$stateSchemes = array_values(array_filter($all, fn($s) => ($s['level'] ?? '') === 'State' && !empty($s['state'])));
usort($stateSchemes, fn($a, $b) => [$a['state'], $a['category'], $a['name']] <=> [$b['state'], $b['category'], $b['name']]);

$aud = ['startup' => 'Startups', 'msme' => 'MSMEs', 'individual' => 'Individuals', 'farmer' => 'Farmers', 'women' => 'Women',
        'student' => 'Students', 'worker' => 'Workers', 'manufacturer' => 'Manufacturers', 'exporter' => 'Exporters', 'sc_st' => 'SC/ST'];
$statusLbl = ['active' => 'Active', 'new' => 'New', 'revamped' => 'Updated', 'closing' => 'Closing soon', 'closed' => 'Closed'];
$conf = ['high' => 'Verified', 'medium' => 'Partly verified', 'low' => 'Unverified'];

$catsOf = function (array $list): array { $c = array_values(array_unique(array_map(fn($s) => (string)$s['category'], $list))); sort($c); return $c; };
$isNew = fn($s) => in_array($s['status'], ['new', 'revamped'], true);
$forBiz = fn($s) => (bool)array_intersect($s['audience'] ?? [], ['startup', 'msme']);

$regions = state_map();
$cur = current_state();
$curName = $cur !== '' ? $regions[$cur] : '';
$tab = ($_GET['tab'] ?? '') === 'state' ? 'state' : 'central';
$coveredStates = array_values(array_unique(array_map(fn($s) => state_slug((string)$s['state']), $stateSchemes)));
$inScope = fn($s) => $cur === '' || state_slug((string)$s['state']) === $cur;
$scoped = array_values(array_filter($stateSchemes, $inScope));

if ($tab === 'state') {
    $n1 = count($scoped); $n2 = count($coveredStates); $n3 = count(array_filter($scoped, $isNew));
    $l1 = $cur !== '' ? 'Schemes for ' . $curName : 'State schemes listed';
    $l2 = 'States and UTs covered of ' . count($regions); $l3 = 'New or recently updated';
} else {
    $n1 = count($central); $n2 = count(array_filter($central, $forBiz)); $n3 = count(array_filter($central, $isNew));
    $l1 = 'Central schemes listed'; $l2 = 'For startups and MSMEs'; $l3 = 'New or recently updated';
}

$extra = [];
foreach ($central as $s) { $extra[] = ['k' => 'Schemes', 't' => (string)$s['name'], 's' => (string)$s['category'], 'h' => 'schemes.php#' . $s['slug']]; }
foreach ($stateSchemes as $s) { $extra[] = ['k' => 'State schemes', 't' => (string)$s['name'], 's' => $s['state'] . ' · ' . $s['category'], 'h' => 'schemes.php#' . $s['slug']]; }

/** One scheme tile plus its detail sheet. */
function scheme_tile(array $s, bool $isState, array $aud, array $statusLbl, array $conf, callable $isNew): void {
    $audiences = $s['audience'] ?? [];
    $audNames = array_map(fn($a) => $aud[$a] ?? $a, $audiences);
    $stateName = (string)($s['state'] ?? '');
    $search = strtolower(implode(' ', [$s['name'], $s['ministry'], $s['category'], $stateName, $s['highlight'], $s['benefit'], $s['eligibility'], implode(' ', $audNames)]));
    $portal = safe_url((string)($s['portal_url'] ?? ''));
    $source = $isState ? safe_url((string)($s['source_url'] ?? '')) : '';
    ?>
  <li class="tile" data-slug="<?= h($s['slug']) ?>" data-search="<?= h($search) ?>" data-cat="<?= h($s['category']) ?>" data-state="<?= h($isState ? state_slug($stateName) : '') ?>" data-new="<?= $isNew($s) ? '1' : '0' ?>" data-biz="<?= array_intersect($audiences, ['startup', 'msme']) ? '1' : '0' ?>" data-aud="<?= h(implode(' ', $audiences) . ($isNew($s) ? ' _new' : '')) ?>">
    <button type="button" class="tile-btn" data-open>
      <span class="tile-top"><span class="tag"><?= h($s['category']) ?></span><span class="st st-<?= h($s['status']) ?>"><?= h($statusLbl[$s['status']] ?? $s['status']) ?></span></span>
      <b class="tile-name"><?= h($s['name']) ?></b>
      <span class="tile-sub"><?= h((string)$s['highlight']) ?></span>
      <span class="tile-foot"><?php if ($isState): ?><span class="tile-state"><?= h($stateName) ?></span><span><?= h(implode(' · ', array_slice($audNames, 0, 2))) ?></span><?php else: ?><span><?= h(implode(' · ', array_slice($audNames, 0, 3))) ?></span><span><?= h((string)($s['outlay'] ?? '')) ?></span><?php endif; ?></span>
    </button>
    <template>
      <p class="sheet-lead"><?= h((string)$s['highlight']) ?></p>
      <dl class="facts">
        <div><dt>Benefit</dt><dd><?= h((string)$s['benefit']) ?></dd></div>
        <div><dt>Who can apply</dt><dd><?= h((string)$s['eligibility']) ?></dd></div>
        <div><dt>How to apply</dt><dd><?= h((string)$s['how_to_apply']) ?><?php if ($portal): ?><br><a class="btn sm" style="margin-top:12px" href="<?= h($portal) ?>" target="_blank" rel="noopener noreferrer">Open official portal</a><?php endif; ?></dd></div>
        <?php if (!empty($s['outlay'])): ?><div><dt>Outlay</dt><dd><?= h($s['outlay']) ?></dd></div><?php endif; ?>
        <?php if ($isState): ?><div><dt>State</dt><dd><?= h($stateName) ?></dd></div><?php endif; ?>
        <div><dt><?= $isState ? 'Department' : 'Ministry' ?></dt><dd><?= h((string)$s['ministry']) ?></dd></div>
        <div><dt>For</dt><dd><?= h(implode(', ', $audNames)) ?></dd></div>
        <div><dt>Launched</dt><dd><?= h((string)($s['launched'] ?? 'n/a')) ?> · <?= h($statusLbl[$s['status']] ?? $s['status']) ?></dd></div>
        <?php if ($source): ?><div><dt>Reference</dt><dd><a href="<?= h($source) ?>" target="_blank" rel="noopener noreferrer">Where this was checked</a></dd></div><?php endif; ?>
        <div><dt>Confidence</dt><dd><?= h($conf[$s['confidence']] ?? $s['confidence']) ?>. Limits and amounts change, so confirm on the official portal before applying.</dd></div>
      </dl>
    </template>
  </li>
<?php }

page_head('Government schemes', 'schemes.php', ['_extra' => $extra]);
stale_notice($P);
?>
<div id="sroot" hidden
     data-tab="<?= h($tab) ?>" data-state="<?= h($cur) ?>" data-regions="<?= (int)count($regions) ?>"
     data-covered="<?= (int)count($coveredStates) ?>"
     data-cats-central="<?= h(json_encode($catsOf($central), JSON_UNESCAPED_UNICODE)) ?>"
     data-cats-state="<?= h(json_encode($catsOf($stateSchemes), JSON_UNESCAPED_UNICODE)) ?>"
     data-names="<?= h(json_encode($regions, JSON_UNESCAPED_UNICODE)) ?>"></div>

<div class="stabs">
  <div class="seg" role="tablist" aria-label="Scheme level" id="stabs">
    <button type="button" role="tab" data-tab="central" aria-pressed="<?= $tab === 'central' ? 'true' : 'false' ?>">Central <i><?= count($central) ?></i></button>
    <button type="button" role="tab" data-tab="state" aria-pressed="<?= $tab === 'state' ? 'true' : 'false' ?>">State <i id="stcount"><?= count($scoped) ?></i></button>
  </div>
  <p class="sctx" id="sctx"></p>
</div>

<section class="stats" aria-label="Summary">
  <div><span class="num" id="n1" data-count="<?= $n1 ?>">0</span><span class="lbl" id="l1"><?= h($l1) ?></span></div>
  <div><span class="num" id="n2" data-count="<?= $n2 ?>">0</span><span class="lbl" id="l2"><?= h($l2) ?></span></div>
  <div><span class="num" id="n3" data-count="<?= $n3 ?>">0</span><span class="lbl" id="l3"><?= h($l3) ?></span></div>
</section>

<div class="toolbar">
  <label class="field search"><?= icon('search') ?><input id="sq" type="search" placeholder="Search schemes, benefits, departments" aria-label="Search schemes"></label>
  <label class="field select"><select id="scat" aria-label="Category"><option value="">All categories</option></select></label>
</div>
<div class="seg chips" role="group" aria-label="Who it is for" id="saud">
  <button type="button" data-aud="" aria-pressed="true">Everyone</button>
  <?php foreach (['startup', 'msme', 'individual', 'women', 'farmer', 'student', 'worker', 'manufacturer', 'sc_st'] as $a): ?>
  <button type="button" data-aud="<?= h($a) ?>" aria-pressed="false"><?= h($aud[$a]) ?></button>
  <?php endforeach; ?>
  <button type="button" data-aud="_new" aria-pressed="false">New or updated</button>
</div>
<p class="count"><span id="scount">0</span> schemes</p>

<ul class="tiles" id="slist" data-level="central"<?= $tab === 'central' ? '' : ' hidden' ?>>
<?php foreach ($central as $s) { scheme_tile($s, false, $aud, $statusLbl, $conf, $isNew); } ?>
</ul>
<ul class="tiles" id="stlist" data-level="state"<?= $tab === 'state' ? '' : ' hidden' ?>>
<?php foreach ($stateSchemes as $s) { scheme_tile($s, true, $aud, $statusLbl, $conf, $isNew); } ?>
</ul>

<section class="empty inline" id="snone" hidden><h1>No matches</h1><p>Try another audience or category.</p></section>
<section class="empty inline" id="stnone" hidden>
  <h1>No schemes added for <span id="stnone-name">this state</span> yet</h1>
  <p>State coverage grows every month. Central schemes still apply there, so start with those.</p>
  <button type="button" class="btn" data-tab-go="central">See central schemes</button>
</section>

<p class="muted small jnote">Central schemes apply across India. State schemes are listed for <?= count($coveredStates) ?> of <?= count($regions) ?> states and union territories so far, and more are added each month. Choose your state from the header to see its schemes. Checked monthly against official portals and policy documents. Last refreshed <?= h(date('j M Y', strtotime((string)($P['refreshed_at'] ?? 'now')))) ?>.</p>

<script>
(function () {
  var root = document.getElementById('sroot'), D = root.dataset;
  var q = document.getElementById('sq'), cat = document.getElementById('scat'), seg = document.getElementById('saud'), tabs = document.getElementById('stabs');
  var lists = { central: document.getElementById('slist'), state: document.getElementById('stlist') };
  var cnt = document.getElementById('scount'), none = document.getElementById('snone'), stnone = document.getElementById('stnone');
  var ctx = document.getElementById('sctx'), stc = document.getElementById('stcount');
  var cats = { central: JSON.parse(D.catsCentral || '[]'), state: JSON.parse(D.catsState || '[]') };
  var names = JSON.parse(D.names || '{}');
  var tab = D.tab, sel = D.state, aud = '';

  function slugTab(h) {
    h = decodeURIComponent((h || '').replace(/^#/, '')).replace(/[^\w-]/g, '');
    if (!h) return null;
    var el = document.querySelector('[data-slug="' + h + '"]');
    return el ? (el.closest('ul') === lists.state ? 'state' : 'central') : null;
  }
  function fillCats() {
    var c = cat.value; cat.innerHTML = '<option value="">All categories</option>';
    cats[tab].forEach(function (x) { var o = document.createElement('option'); o.value = x; o.textContent = x; cat.appendChild(o); });
    cat.value = cats[tab].indexOf(c) > -1 ? c : '';
  }
  function setStat(id, v, label) { document.getElementById('n' + id).textContent = v; if (label) document.getElementById('l' + id).textContent = label; }

  function apply() {
    var t = (q.value || '').trim().toLowerCase(), c = cat.value, n = 0, scope = 0, scopeNew = 0, scopeBiz = 0;
    var items = lists[tab].querySelectorAll(':scope > li');
    lists.central.hidden = tab !== 'central'; lists.state.hidden = tab !== 'state';
    items.forEach(function (li) {
      var inState = tab !== 'state' || !sel || li.dataset.state === sel;
      if (inState) { scope++; if (li.dataset['new'] === '1') scopeNew++; if (li.dataset.biz === '1') scopeBiz++; }
      var ok = inState && (!t || li.dataset.search.indexOf(t) > -1) && (!c || li.dataset.cat === c) && (!aud || (' ' + li.dataset.aud + ' ').indexOf(' ' + aud + ' ') > -1);
      li.hidden = !ok; if (ok) n++;
    });
    cnt.textContent = n;
    var empty = tab === 'state' && sel && scope === 0;
    stnone.hidden = !empty; none.hidden = empty || n > 0;
    if (empty) document.getElementById('stnone-name').textContent = names[sel] || 'this state';
    tabs.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.tab === tab ? 'true' : 'false'); });
    stc.textContent = lists.state.querySelectorAll(sel ? ':scope > li[data-state="' + sel + '"]' : ':scope > li').length;
    if (tab === 'state') {
      setStat(1, scope, sel ? 'Schemes for ' + (names[sel] || '') : 'State schemes listed');
      setStat(2, D.covered, 'States and UTs covered of ' + D.regions); setStat(3, scopeNew);
      ctx.innerHTML = sel ? 'Showing <b>' + (names[sel] || '') + '</b>. Change your state from the header.' : 'Showing every state. Pick your state in the header to narrow this down.';
    } else {
      setStat(1, scope, 'Central schemes listed'); setStat(2, scopeBiz, 'For startups and MSMEs'); setStat(3, scopeNew);
      ctx.innerHTML = 'Applies across India' + (sel ? '. <b>' + (names[sel] || '') + '</b> has its own schemes in the State tab.' : '.');
    }
  }
  function show(next, keep) {
    tab = next; fillCats();
    if (!keep) { try { history.replaceState(null, '', location.pathname + (tab === 'state' ? '?tab=state' : '')); } catch (e) {} }
    apply();
  }

  tabs.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) show(b.dataset.tab); });
  document.addEventListener('click', function (e) { if (e.target.closest('[data-tab-go]')) show('central'); });
  seg.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    aud = b.dataset.aud;
    seg.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
    apply();
  });
  q.addEventListener('input', apply); cat.addEventListener('change', apply);
  document.addEventListener('bos:state', function (e) { sel = e.detail.slug; apply(); });
  // A link to a specific scheme opens on the tab that holds it.
  window.addEventListener('hashchange', function () { var t = slugTab(location.hash); if (t && t !== tab) show(t, true); });

  var first = slugTab(location.hash); if (first) tab = first;
  fillCats(); apply();
})();
</script>
<?php page_foot(['_extra' => $extra]); ?>
