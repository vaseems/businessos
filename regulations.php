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
    page_head('Regulations', 'regulations.php', []);
    echo '<section class="empty"><h1>Regulations are unavailable</h1><p>Please try again in a moment.</p></section>';
    page_foot([]);
    exit;
}

$regs = $P['regulations'] ?? [];
$ms = $P['milestones'] ?? [];
$byReg = [];
foreach ($ms as $m) { $byReg[$m['reg_slug']][] = $m; }
$names = [];
foreach ($regs as $r) { $names[$r['slug']] = $r['short_name'] ?: $r['name']; }

$statusLbl = ['in_force' => 'In force', 'phased' => 'Phased rollout', 'partly_in_force' => 'Partly in force',
              'pending_rules' => 'Rules pending', 'draft' => 'Draft', 'guidance' => 'Guidance'];
$conf = ['high' => 'Verified', 'medium' => 'Partly verified', 'low' => 'Unverified'];
$cats = array_values(array_unique(array_map(fn($r) => $r['category'], $regs)));
sort($cats);

$today = date('Y-m-d');
$upcoming = array_values(array_filter($ms, fn($m) => $m['on_date'] >= $today));
$recent = array_reverse(array_values(array_filter($ms, fn($m) => $m['on_date'] < $today && $m['on_date'] >= date('Y-m-d', strtotime('-12 months')))));
$fmt = fn(?string $d) => $d ? date('j M Y', strtotime($d)) : '';
$days = fn(string $d) => (int)round((strtotime($d) - strtotime($today)) / 86400);

$rc = region_cfg();
$cur = current_state();
$hasStateLaws = (bool)array_filter($regs, fn($r) => !empty($r['state']));
$extra = [];
foreach ($regs as $r) { $extra[] = ['k' => 'Regulations', 't' => (string)$r['name'], 's' => (string)$r['category'], 'h' => 'regulations.php#' . $r['slug']]; }

page_head('Regulations', 'regulations.php', ['_extra' => $extra]);
stale_notice($P);
?>
<div class="split two">
  <section class="panel">
    <div class="panel-head"><h2>Coming up</h2><span class="muted small">Dates to prepare for</span></div>
    <?php if (!$upcoming): ?><p class="muted">No upcoming dates recorded.</p><?php endif; ?>
    <ol class="tl">
      <?php foreach ($upcoming as $m): $n = $days($m['on_date']); ?>
      <li><a href="#<?= h($m['reg_slug']) ?>" class="tl-item">
        <span class="tl-when"><b><?= $n === 0 ? 'Today' : ($n < 60 ? 'In ' . $n . ' days' : h($fmt($m['on_date']))) ?></b><small><?= h($fmt($m['on_date'])) ?></small></span>
        <span class="tl-what"><span class="tag"><?= h($names[$m['reg_slug']] ?? $m['reg_slug']) ?></span><b><?= h($m['title']) ?></b><?php if ($m['detail']): ?><small><?= h($m['detail']) ?></small><?php endif; ?></span>
      </a></li>
      <?php endforeach; ?>
    </ol>
  </section>
  <section class="panel">
    <div class="panel-head"><h2>Changed in the last 12 months</h2></div>
    <ol class="tl past">
      <?php foreach (array_slice($recent, 0, 6) as $m): ?>
      <li><a href="#<?= h($m['reg_slug']) ?>" class="tl-item">
        <span class="tl-when"><small><?= h($fmt($m['on_date'])) ?></small></span>
        <span class="tl-what"><span class="tag"><?= h($names[$m['reg_slug']] ?? $m['reg_slug']) ?></span><b><?= h($m['title']) ?></b></span>
      </a></li>
      <?php endforeach; ?>
    </ol>
  </section>
</div>

<div class="toolbar">
  <label class="field search"><?= icon('search') ?><input id="rq" type="search" placeholder="Search laws, duties, <?= $rc['code'] === 'us' ? 'agencies' : 'regulators' ?>" aria-label="Search regulations"></label>
</div>
<div class="seg chips" role="group" aria-label="Area" id="rcat">
  <button type="button" data-cat="" aria-pressed="true">All areas</button>
  <?php foreach ($cats as $c): ?><button type="button" data-cat="<?= h($c) ?>" aria-pressed="false"><?= h($c) ?></button><?php endforeach; ?>
</div>
<p class="count"><span id="rcount"><?= count($regs) ?></span> laws and rules</p>

<ul class="rows" id="rlist" data-state="<?= h($cur) ?>" data-names="<?= h(json_encode(state_map(), JSON_UNESCAPED_UNICODE)) ?>">
<?php foreach ($regs as $r):
    $search = strtolower(implode(' ', [$r['name'], $r['short_name'], $r['category'], $r['regulator'], $r['summary'], $r['applies_to'], implode(' ', $r['key_obligations'] ?? [])]));
    $url = safe_url((string)$r['official_url']);
    $words = preg_split('/\s+/', trim((string)($r['short_name'] ?: $r['name'])));
    $init = count($words) > 1 ? mb_substr($words[0], 0, 1) . mb_substr($words[1], 0, 1) : mb_substr($words[0], 0, 2);
    $init = mb_strtoupper($init);
?>
  <li class="row rrow" data-slug="<?= h($r['slug']) ?>" data-search="<?= h($search) ?>" data-cat="<?= h($r['category']) ?>" data-state="<?= h(!empty($r['state']) ? state_slug((string)$r['state']) : '') ?>">
    <button type="button" class="row-btn" data-open>
      <span class="rkb cat-<?= h(substr(md5($r['category']), 0, 1)) ?>"><?= h($init) ?></span>
      <span class="row-main"><b class="row-title"><?= h($r['name']) ?></b><span class="row-sub"><?= !empty($r['state']) ? h((string)$r['state']) . ' · ' : '' ?><?= h((string)$r['regulator']) ?><?= $r['effective_from'] ? ' · effective ' . h($fmt($r['effective_from'])) : '' ?></span></span>
      <span class="st st-<?= h($r['status']) ?>"><?= h($statusLbl[$r['status']] ?? $r['status']) ?></span>
      <span class="glyph"><span class="tag"><?= h($r['category']) ?></span></span>
    </button>
    <template>
      <div class="sheet-meta"><span class="st st-<?= h($r['status']) ?>"><?= h($statusLbl[$r['status']] ?? $r['status']) ?></span><div class="facts-inline">
        <?php if ($r['enacted_on']): ?><span>Enacted <b><?= h($fmt($r['enacted_on'])) ?></b></span><?php endif; ?>
        <?php if ($r['effective_from']): ?><span>Effective <b><?= h($fmt($r['effective_from'])) ?></b></span><?php endif; ?></div></div>
      <p class="sheet-lead"><?= h((string)$r['summary']) ?></p>
      <dl class="facts">
        <div><dt>Applies to</dt><dd><?= h((string)$r['applies_to']) ?></dd></div>
        <div><dt><?= $rc['code'] === 'us' ? 'Enforced by' : 'Regulator' ?></dt><dd><?= h((string)$r['regulator']) ?></dd></div>
        <?php if (!empty($r['state'])): ?><div><dt>Jurisdiction</dt><dd><?= h((string)$r['state']) ?> (state law)</dd></div><?php endif; ?>
      </dl>
      <?php if (!empty($r['key_obligations'])): ?>
      <h3 class="sheet-h" style="margin-top:22px">Key obligations</h3>
      <ul class="checks"><?php foreach ($r['key_obligations'] as $o): ?><li><?= h($o) ?></li><?php endforeach; ?></ul>
      <?php endif; ?>
      <?php if (!empty($r['startup_actions'])): ?>
      <h3 class="sheet-h" style="margin-top:22px">What a startup should do</h3>
      <ul class="checks todo"><?php foreach ($r['startup_actions'] as $o): ?><li><?= h($o) ?></li><?php endforeach; ?></ul>
      <?php endif; ?>
      <?php if (!empty($r['penalties'])): ?>
      <h3 class="sheet-h" style="margin-top:22px">Penalties</h3><p class="pen"><?= h($r['penalties']) ?></p>
      <?php endif; ?>
      <?php if (!empty($byReg[$r['slug']])): ?>
      <h3 class="sheet-h" style="margin-top:22px">Timeline</h3>
      <ol class="vtl"><?php foreach ($byReg[$r['slug']] as $m): ?>
        <li class="<?= $m['on_date'] >= $today ? 'up' : 'done' ?>"><small><?= h($fmt($m['on_date'])) ?></small><b><?= h($m['title']) ?></b><?php if ($m['detail']): ?><span><?= h($m['detail']) ?></span><?php endif; ?></li>
      <?php endforeach; ?></ol>
      <?php endif; ?>
      <?php if (!empty($r['related'])): ?>
      <h3 class="sheet-h" style="margin-top:22px">Related</h3>
      <p class="rel"><?php foreach ($r['related'] as $rs): if (!isset($names[$rs])) continue; ?><a class="tag" href="#<?= h($rs) ?>"><?= h($names[$rs]) ?></a> <?php endforeach; ?></p>
      <?php endif; ?>
      <?php if ($url): ?><p style="margin-top:22px"><a class="btn sm" href="<?= h($url) ?>" target="_blank" rel="noopener noreferrer">Official source</a></p><?php endif; ?>
      <p class="muted small" style="margin-top:18px"><?= h($conf[$r['confidence']] ?? '') ?>. A plain-language summary, not legal advice; check the official text before acting.</p>
    </template>
  </li>
<?php endforeach; ?>
</ul>
<section class="empty" id="rnone" hidden><h1>No matches</h1><p>Try another area or search term.</p></section>
<p class="muted small jnote"><?= $rc['code'] === 'us' ? 'Federal laws and rules, plus the state laws that matter most to startups and small businesses. Choose your state in the header to see its laws next to the federal ones.' : 'Central laws and rules that matter most to startups and small businesses.' ?> Reviewed monthly. Last refreshed <?= h(date('j M Y', strtotime((string)($P['refreshed_at'] ?? 'now')))) ?>.</p>

<script>
(function () {
  var q = document.getElementById('rq'), seg = document.getElementById('rcat'), rl = document.getElementById('rlist');
  var sel = rl.dataset.state || '';
  var items = document.querySelectorAll('#rlist > li'), cnt = document.getElementById('rcount'), none = document.getElementById('rnone');
  var cat = '';
  function apply() {
    var t = (q.value || '').trim().toLowerCase(), n = 0;
    items.forEach(function (li) {
      var ok = (!t || li.dataset.search.indexOf(t) > -1) && (!cat || li.dataset.cat === cat) && (!sel || !li.dataset.state || li.dataset.state === sel);
      li.hidden = !ok; if (ok) n++;
    });
    cnt.textContent = n; none.hidden = n > 0;
  }
  seg.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    cat = b.dataset.cat;
    seg.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
    apply();
  });
  q.addEventListener('input', apply);
  document.addEventListener('bos:state', function (e) { sel = (e.detail && e.detail.slug) || ''; apply(); });
  apply();
})();
</script>
<?php page_foot(['_extra' => $extra]); ?>
