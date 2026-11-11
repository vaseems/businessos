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

$schemes = $P['schemes'] ?? [];
$aud = ['startup' => 'Startups', 'msme' => 'MSMEs', 'individual' => 'Individuals', 'farmer' => 'Farmers', 'women' => 'Women',
        'student' => 'Students', 'worker' => 'Workers', 'manufacturer' => 'Manufacturers', 'exporter' => 'Exporters', 'sc_st' => 'SC/ST'];
$statusLbl = ['active' => 'Active', 'new' => 'New', 'revamped' => 'Updated', 'closing' => 'Closing soon', 'closed' => 'Closed'];
$conf = ['high' => 'Verified', 'medium' => 'Partly verified', 'low' => 'Unverified'];

$cats = array_values(array_unique(array_map(fn($s) => $s['category'], $schemes)));
sort($cats);
$isNew = fn($s) => in_array($s['status'], ['new', 'revamped'], true);
$forBiz = fn($s) => (bool)array_intersect($s['audience'] ?? [], ['startup', 'msme']);

$extra = [];
foreach ($schemes as $s) { $extra[] = ['k' => 'Schemes', 't' => (string)$s['name'], 's' => (string)$s['category'], 'h' => 'schemes.php#' . $s['slug']]; }

page_head('Government schemes', 'schemes.php', ['_extra' => $extra]);
stale_notice($P);
?>
<section class="stats" aria-label="Summary">
  <div><span class="num" data-count="<?= count($schemes) ?>">0</span><span class="lbl">Central schemes listed</span></div>
  <div><span class="num" data-count="<?= count(array_filter($schemes, $forBiz)) ?>">0</span><span class="lbl">For startups and MSMEs</span></div>
  <div><span class="num" data-count="<?= count(array_filter($schemes, $isNew)) ?>">0</span><span class="lbl">New or recently updated</span></div>
</section>

<div class="toolbar">
  <label class="field search"><?= icon('search') ?><input id="sq" type="search" placeholder="Search schemes, benefits, ministries" aria-label="Search schemes"></label>
  <label class="field select"><select id="scat" aria-label="Category"><option value="">All categories</option>
    <?php foreach ($cats as $c): ?><option value="<?= h($c) ?>"><?= h($c) ?></option><?php endforeach; ?></select></label>
</div>
<div class="seg chips" role="group" aria-label="Who it is for" id="saud">
  <button type="button" data-aud="" aria-pressed="true">Everyone</button>
  <?php foreach (['startup', 'msme', 'individual', 'women', 'farmer', 'student', 'worker', 'manufacturer'] as $a): ?>
  <button type="button" data-aud="<?= h($a) ?>" aria-pressed="false"><?= h($aud[$a]) ?></button>
  <?php endforeach; ?>
  <button type="button" data-aud="_new" aria-pressed="false">New or updated</button>
</div>
<p class="count"><span id="scount"><?= count($schemes) ?></span> schemes</p>

<ul class="tiles" id="slist">
<?php foreach ($schemes as $s):
    $audiences = $s['audience'] ?? [];
    $search = strtolower(implode(' ', [$s['name'], $s['ministry'], $s['category'], $s['highlight'], $s['benefit'], $s['eligibility'], implode(' ', array_map(fn($a) => $aud[$a] ?? $a, $audiences))]));
    $portal = safe_url((string)$s['portal_url']);
?>
  <li class="tile" data-slug="<?= h($s['slug']) ?>" data-search="<?= h($search) ?>" data-cat="<?= h($s['category']) ?>" data-aud="<?= h(implode(' ', $audiences) . ($isNew($s) ? ' _new' : '')) ?>">
    <button type="button" class="tile-btn" data-open>
      <span class="tile-top"><span class="tag"><?= h($s['category']) ?></span><span class="st st-<?= h($s['status']) ?>"><?= h($statusLbl[$s['status']] ?? $s['status']) ?></span></span>
      <b class="tile-name"><?= h($s['name']) ?></b>
      <span class="tile-sub"><?= h((string)$s['highlight']) ?></span>
      <span class="tile-foot"><span><?= h(implode(' · ', array_map(fn($a) => $aud[$a] ?? $a, array_slice($audiences, 0, 3)))) ?></span><span><?= h((string)($s['outlay'] ?? '')) ?></span></span>
    </button>
    <template>
      <p class="sheet-lead"><?= h((string)$s['highlight']) ?></p>
      <dl class="facts">
        <div><dt>Benefit</dt><dd><?= h((string)$s['benefit']) ?></dd></div>
        <div><dt>Who can apply</dt><dd><?= h((string)$s['eligibility']) ?></dd></div>
        <div><dt>How to apply</dt><dd><?= h((string)$s['how_to_apply']) ?><?php if ($portal): ?><br><a class="btn sm" style="margin-top:12px" href="<?= h($portal) ?>" target="_blank" rel="noopener noreferrer">Open official portal</a><?php endif; ?></dd></div>
        <?php if (!empty($s['outlay'])): ?><div><dt>Outlay</dt><dd><?= h($s['outlay']) ?></dd></div><?php endif; ?>
        <div><dt>Ministry</dt><dd><?= h((string)$s['ministry']) ?></dd></div>
        <div><dt>For</dt><dd><?= h(implode(', ', array_map(fn($a) => $aud[$a] ?? $a, $audiences))) ?></dd></div>
        <div><dt>Launched</dt><dd><?= h((string)$s['launched']) ?> · <?= h($statusLbl[$s['status']] ?? $s['status']) ?></dd></div>
        <div><dt>Confidence</dt><dd><?= h($conf[$s['confidence']] ?? $s['confidence']) ?>. Limits and amounts change, so confirm on the official portal before applying.</dd></div>
      </dl>
    </template>
  </li>
<?php endforeach; ?>
</ul>
<section class="empty" id="snone" hidden><h1>No matches</h1><p>Try another audience or category.</p></section>
<p class="muted small jnote">Central government schemes only; state schemes will be added later. Checked monthly against official portals and the Union Budget. Last refreshed <?= h(date('j M Y', strtotime((string)($P['refreshed_at'] ?? 'now')))) ?>.</p>

<script>
(function () {
  var q = document.getElementById('sq'), cat = document.getElementById('scat'), seg = document.getElementById('saud');
  var items = document.querySelectorAll('#slist > li'), cnt = document.getElementById('scount'), none = document.getElementById('snone');
  var aud = '';
  function apply() {
    var t = (q.value || '').trim().toLowerCase(), c = cat.value, n = 0;
    items.forEach(function (li) {
      var ok = (!t || li.dataset.search.indexOf(t) > -1) && (!c || li.dataset.cat === c) && (!aud || (' ' + li.dataset.aud + ' ').indexOf(' ' + aud + ' ') > -1);
      li.hidden = !ok; if (ok) n++;
    });
    cnt.textContent = n; none.hidden = n > 0;
  }
  seg.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    aud = b.dataset.aud;
    seg.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
    apply();
  });
  q.addEventListener('input', apply); cat.addEventListener('change', apply);
})();
</script>
<?php page_foot(['_extra' => $extra]); ?>
