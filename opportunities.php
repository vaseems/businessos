<?php
declare(strict_types=1);
require __DIR__ . '/inc/bootstrap.php';
require_login();
require __DIR__ . '/inc/data.php';
require __DIR__ . '/inc/layout.php';

try {
    $O = load_opportunities(isset($_GET['refresh']));
} catch (Throwable $e) {
    http_response_code(503);
    page_head('Opportunities', 'opportunities.php', []);
    echo '<section class="empty"><h1>Opportunities are unavailable</h1><p>Please try again in a moment.</p></section>';
    page_foot([]);
    exit;
}

$src = array_values(array_filter($O['sources'] ?? [], fn($s) => !empty($s['slug']) && !empty($s['name'])));
$kinds = ['cohort' => 'Cohorts and accelerators', 'vc' => 'VC funds', 'angel' => 'Angel networks', 'grant' => 'Grants and government', 'perk' => 'Credits and perks'];
$kindOne = ['cohort' => 'Cohort or accelerator', 'vc' => 'VC fund', 'angel' => 'Angel network', 'grant' => 'Grant or government scheme', 'perk' => 'Credits and perks'];
$stageLabels = ['idea' => 'Idea', 'pre-seed' => 'Pre-seed', 'seed' => 'Seed', 'series-a' => 'Series A', 'growth' => 'Growth'];
$statusLabel = ['open' => 'Open', 'rolling' => 'Rolling', 'upcoming' => 'Next call due', 'between' => 'Between intakes', 'closed' => 'Closed', 'indirect' => 'Via funds'];
$statusHelp = [
    'open' => 'Taking applications now.',
    'rolling' => 'No fixed window. You can approach them at any time.',
    'upcoming' => 'The next call is expected but has not opened yet.',
    'between' => 'The last intake has ended and the next one has not been announced.',
    'closed' => 'The latest intake has closed.',
    'indirect' => 'Money goes through funds or intermediaries, so founders do not apply directly.',
];
$conf = [
    'high' => 'Checked against an official page.',
    'medium' => 'Based on reputable reports and third-party listings. Confirm on the official page before you apply.',
    'low' => 'Limited or conflicting sources. Treat this as a lead and verify it yourself.',
];
$regions = state_map();
$cur = current_state();

$todayTs = strtotime(date('Y-m-d'));
$fmtDate = fn(string $d): string => date('j M Y', strtotime($d));
$fmtShort = fn(string $d): string => date('j M', strtotime($d));
$daysTo = fn(string $d): int => (int)floor((strtotime($d) - $todayTs) / 86400);
$when = function (int $n): string {
    return $n <= 0 ? 'today' : ($n === 1 ? 'tomorrow' : 'in ' . $n . ' days');
};

// A window that has a passed deadline is closed, whatever the stored status says.
foreach ($src as &$s) {
    $st = (string)$s['status'];
    if ($st === 'open' && !empty($s['deadline']) && $daysTo((string)$s['deadline']) < 0) { $st = 'closed'; }
    $s['_st'] = $st;
    $s['stages'] = is_array($s['stages'] ?? null) ? $s['stages'] : [];
}
unset($s);

$rank = ['open' => 0, 'rolling' => 1, 'upcoming' => 2, 'between' => 3, 'indirect' => 4, 'closed' => 5];
$kindRank = array_flip(array_keys($kinds));
usort($src, function ($a, $b) use ($rank, $kindRank) {
    $ra = $rank[$a['_st']] ?? 9; $rb = $rank[$b['_st']] ?? 9;
    if ($ra !== $rb) { return $ra <=> $rb; }
    if ($a['_st'] === 'open') {
        $da = $a['deadline'] ?? '9999-12-31'; $db = $b['deadline'] ?? '9999-12-31';
        if ($da !== $db) { return strcmp((string)$da, (string)$db); }
    }
    return [$kindRank[$a['kind']] ?? 9, $a['name']] <=> [$kindRank[$b['kind']] ?? 9, $b['name']];
});

$nNow = count(array_filter($src, fn($s) => in_array($s['_st'], ['open', 'rolling'], true)));
$closing = array_values(array_filter($src, fn($s) => $s['_st'] === 'open' && !empty($s['deadline'])));
usort($closing, fn($a, $b) => strcmp((string)$a['deadline'], (string)$b['deadline']));
$nClosing30 = count(array_filter($closing, fn($s) => $daysTo((string)$s['deadline']) <= 30));
$coming = array_values(array_filter($src, fn($s) => in_array($s['_st'], ['upcoming', 'between'], true)));
$total = count($src);
$updated = $O['refreshed_at'] ?? null;
$checkedMax = null;
foreach ($src as $s) { if (!empty($s['checked_on']) && ($checkedMax === null || $s['checked_on'] > $checkedMax)) { $checkedMax = $s['checked_on']; } }

$extra = [];
foreach ($src as $s) {
    $extra[] = ['k' => 'Opportunities', 't' => (string)$s['name'], 's' => ($kinds[$s['kind']] ?? '') . ' · ' . $statusLabel[$s['_st']], 'h' => 'opportunities.php#' . $s['slug']];
}

$stateLine = function (array $s) use ($statusLabel, $daysTo, $when, $fmtShort): string {
    $st = $s['_st'];
    if ($st === 'open' && !empty($s['deadline'])) {
        return 'Closes ' . $fmtShort((string)$s['deadline']) . ' · ' . $when($daysTo((string)$s['deadline']));
    }
    if ($st === 'closed' && !empty($s['deadline'])) { return 'Closed ' . $fmtShort((string)$s['deadline']); }
    return '';
};

page_head('Opportunities', 'opportunities.php', ['_extra' => $extra]);
stale_notice($O);
?>
<div id="oroot" hidden data-state="<?= h($cur) ?>" data-names="<?= h(json_encode($regions, JSON_UNESCAPED_UNICODE)) ?>"></div>

<section class="stats" aria-label="Summary">
  <div><span class="num"><?= (int)$nNow ?></span><span class="lbl">Open or rolling now</span></div>
  <div><span class="num"><?= (int)$nClosing30 ?></span><span class="lbl">Closing in the next 30 days</span></div>
  <div><span class="num"><?= (int)$total ?></span><span class="lbl">Sources tracked</span></div>
</section>

<div class="split two">
  <section class="panel">
    <div class="panel-head"><h2>Closing soon</h2><span class="muted small">Fixed deadlines</span></div>
    <?php if (!$closing): ?><p class="muted">No fixed deadlines are open right now. The rolling ones below can be approached at any time.</p><?php endif; ?>
    <ul class="olist">
      <?php foreach (array_slice($closing, 0, 6) as $s): $n = $daysTo((string)$s['deadline']); ?>
        <li><button type="button" data-jump="<?= h($s['slug']) ?>"><b><?= h($s['name']) ?></b><small class="<?= $n <= 7 ? 'hot' : '' ?>"><?= h($fmtShort((string)$s['deadline'])) ?> · <?= h($when($n)) ?></small></button></li>
      <?php endforeach; ?>
    </ul>
  </section>
  <section class="panel">
    <div class="panel-head"><h2>Coming up</h2><span class="muted small">Next intakes to watch</span></div>
    <?php if (!$coming): ?><p class="muted">Nothing is waiting on a next intake.</p><?php endif; ?>
    <ul class="olist">
      <?php foreach (array_slice($coming, 0, 6) as $s): ?>
        <li><button type="button" data-jump="<?= h($s['slug']) ?>"><b><?= h($s['name']) ?></b><small><?= h($statusLabel[$s['_st']]) ?></small></button></li>
      <?php endforeach; ?>
    </ul>
  </section>
</div>

<div class="toolbar">
  <label class="field search"><?= icon('search') ?><input id="oq" type="search" placeholder="Search funds, programs, sectors" aria-label="Search opportunities"></label>
  <label class="field select"><select id="ostage" aria-label="Stage"><option value="">Any stage</option>
    <?php foreach ($stageLabels as $k => $v): ?><option value="<?= h($k) ?>"><?= h($v) ?></option><?php endforeach; ?></select></label>
  <div class="seg" role="group" aria-label="Availability" id="owhen">
    <button type="button" data-when="now" aria-pressed="true">Open now</button>
    <button type="button" data-when="soon" aria-pressed="false">Coming up</button>
    <button type="button" data-when="all" aria-pressed="false">Everything</button>
  </div>
</div>
<div class="seg chips" role="group" aria-label="Type" id="okind">
  <button type="button" data-kind="" aria-pressed="true">All types</button>
  <?php foreach ($kinds as $k => $v): ?><button type="button" data-kind="<?= h($k) ?>" aria-pressed="false"><?= h($v) ?></button><?php endforeach; ?>
  <button type="button" id="ostate" data-mine="1" aria-pressed="false" hidden></button>
</div>
<p class="count"><span id="ocount">0</span> sources</p>

<ul class="rows" id="olistrows">
<?php foreach ($src as $s):
    $slug = (string)$s['slug'];
    $kind = (string)$s['kind'];
    $words = preg_split('/[\s.()]+/', trim((string)$s['name']), -1, PREG_SPLIT_NO_EMPTY);
    $init = mb_strtoupper(count($words) > 1 ? mb_substr($words[0], 0, 1) . mb_substr($words[1], 0, 1) : mb_substr($words[0], 0, 2));
    $stages = array_values(array_filter($s['stages'], fn($x) => isset($stageLabels[$x])));
    $stageText = $stages ? implode(', ', array_map(fn($x) => $stageLabels[$x], $stages)) : 'Not a direct route';
    $stSlug = !empty($s['state_only']) && !empty($s['hq_state']) ? state_slug((string)$s['hq_state']) : '';
    $search = strtolower(implode(' ', [$s['name'], $s['org'] ?? '', $kinds[$kind] ?? '', $s['sectors'] ?? '', $s['summary'] ?? '', $s['hq_city'] ?? '', $s['hq_state'] ?? '', $s['geography'] ?? '']));
    $apply = safe_url((string)($s['apply_url'] ?? ''));
    $source = safe_url((string)($s['source_url'] ?? ''));
    $line = $stateLine($s);
?>
  <li class="row orow" data-slug="<?= h($slug) ?>" data-kind="<?= h($kind) ?>" data-status="<?= h($s['_st']) ?>" data-stages=" <?= h(implode(' ', $stages)) ?> " data-state="<?= h($stSlug) ?>" data-search="<?= h($search) ?>">
    <button type="button" class="row-btn" data-open>
      <span class="rkb cat-<?= h(substr(md5($kind), 0, 1)) ?>"><?= h($init) ?></span>
      <span class="row-main"><b class="row-title"><?= h($s['name']) ?></b><span class="row-sub"><?= h($kinds[$kind] ?? '') ?> · <?= h($stageText) ?></span></span>
      <span class="oinfo"><span class="st st-o-<?= h($s['_st']) ?>"><?= h($statusLabel[$s['_st']]) ?></span><?php if ($line): ?><small><?= h($line) ?></small><?php endif; ?></span>
      <span class="ocheque"><?= h((string)($s['cheque_text'] ?? '')) ?></span>
    </button>
    <template>
      <p class="sheet-lead"><?= h($s['summary']) ?></p>
      <dl class="facts">
        <div><dt>Type</dt><dd><?= h($kindOne[$kind] ?? '') ?><?= !empty($s['org']) ? ' · ' . h($s['org']) : '' ?></dd></div>
        <div><dt>Status</dt><dd><b><?= h($statusLabel[$s['_st']]) ?></b><?= $line ? ' · ' . h($line) : '' ?>. <?= h($statusHelp[$s['_st']] ?? '') ?><?= !empty($s['window_note']) ? ' ' . h($s['window_note']) : '' ?></dd></div>
        <div><dt>Stage</dt><dd><?= h($stageText) ?></dd></div>
        <?php if (!empty($s['sectors'])): ?><div><dt>Sectors</dt><dd><?= h($s['sectors']) ?></dd></div><?php endif; ?>
        <?php if (!empty($s['cheque_text'])): ?><div><dt><?= region_cfg()['code'] === 'us' ? 'Check size or value' : 'Cheque or value' ?></dt><dd><?= h($s['cheque_text']) ?></dd></div><?php endif; ?>
        <?php if (!empty($s['equity_note'])): ?><div><dt>Terms</dt><dd><?= h($s['equity_note']) ?></dd></div><?php endif; ?>
        <div><dt>Where</dt><dd><?= h((string)($s['geography'] ?? region_cfg()['name'])) ?><?= $stSlug ? ' · only for startups in ' . h((string)$s['hq_state']) : '' ?></dd></div>
        <?php if (!empty($s['hq_city']) || !empty($s['hq_state'])): ?><div><dt>Based in</dt><dd><?= h(trim(($s['hq_city'] ?? '') . ', ' . ($s['hq_state'] ?? ''), ', ')) ?></dd></div><?php endif; ?>
        <?php if (!empty($s['how_to_apply'])): ?><div><dt>How to apply</dt><dd><?= h($s['how_to_apply']) ?><?php if ($apply): ?> <a href="<?= h($apply) ?>" target="_blank" rel="noopener noreferrer">Official page</a><?php endif; ?></dd></div>
        <?php elseif ($apply): ?><div><dt>Official page</dt><dd><a href="<?= h($apply) ?>" target="_blank" rel="noopener noreferrer"><?= h($apply) ?></a></dd></div><?php endif; ?>
        <?php if ($source): ?><div><dt>Source</dt><dd><a href="<?= h($source) ?>" target="_blank" rel="noopener noreferrer"><?= h($s['source_name'] ?? 'Source') ?></a></dd></div><?php endif; ?>
        <div><dt>Confidence</dt><dd><?= h($conf[$s['confidence'] ?? 'medium'] ?? '') ?><?= !empty($s['checked_on']) ? ' Last checked ' . h($fmtDate((string)$s['checked_on'])) . '.' : '' ?></dd></div>
      </dl>
    </template>
  </li>
<?php endforeach; ?>
</ul>
<section class="empty" id="onone" hidden><h1>No matches</h1><p id="onone-msg">Try another type or stage.</p></section>
<p class="muted small jnote">Funds, programs, grants and perks open to startups in <?= h(region_cfg()['name']) ?>, from official pages and reputable reports. Deadlines, <?= region_cfg()['code'] === 'us' ? 'check' : 'cheque' ?> sizes and terms change often, so confirm on the official page before you apply. Programs that take equity are marked in the detail view. Reviewed regularly<?= $checkedMax ? ', last on ' . h($fmtDate((string)$checkedMax)) : '' ?>. For information only, not investment advice.</p>

<script>
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var rows = Array.prototype.slice.call(document.querySelectorAll('#olistrows > li'));
  var root = $('#oroot'), names = {};
  try { names = JSON.parse(root.dataset.names || '{}'); } catch (e) {}
  var st = { q: '', when: 'now', kind: '', stage: '', mine: false, state: root.dataset.state || '' };
  var q = $('#oq'), stage = $('#ostage'), when = $('#owhen'), kind = $('#okind'), chip = $('#ostate');
  var cnt = $('#ocount'), none = $('#onone'), msg = $('#onone-msg');
  var sets = { now: ['open', 'rolling'], soon: ['upcoming', 'between'] };
  function chipSync() {
    if (!st.state) { chip.hidden = true; st.mine = false; chip.setAttribute('aria-pressed', 'false'); return; }
    var n = rows.filter(function (li) { return li.dataset.state === st.state; }).length;
    chip.hidden = false;
    chip.textContent = 'Only for ' + (names[st.state] || '') + ' (' + n + ')';
    chip.setAttribute('aria-pressed', st.mine ? 'true' : 'false');
  }
  function apply() {
    var t = (q.value || '').trim().toLowerCase(), n = 0;
    rows.forEach(function (li) {
      var ok = (!t || li.dataset.search.indexOf(t) > -1) &&
               (st.when === 'all' || sets[st.when].indexOf(li.dataset.status) > -1) &&
               (!st.kind || li.dataset.kind === st.kind) &&
               (!st.stage || li.dataset.stages.indexOf(' ' + st.stage + ' ') > -1) &&
               (!st.mine || li.dataset.state === st.state);
      li.hidden = !ok;
      if (ok) n++;
    });
    cnt.textContent = n;
    none.hidden = n > 0;
    if (st.mine && n === 0) msg.textContent = 'Nothing state-specific for ' + (names[st.state] || 'this state') + ' in this view. Try Everything, or switch off the state filter to see programs open to startups across the country.';
    else if (st.when !== 'all' && n === 0) msg.textContent = 'Nothing in this view. Try Everything, another type or a different stage.';
    else msg.textContent = 'Try another type or stage.';
  }
  function press(box, btn) { box.querySelectorAll('button').forEach(function (x) { if (x !== chip) x.setAttribute('aria-pressed', x === btn ? 'true' : 'false'); }); }
  function setWhen(w) { st.when = w; when.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x.dataset.when === w ? 'true' : 'false'); }); }
  when.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; setWhen(b.dataset.when); apply(); });
  kind.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b === chip) { st.mine = !st.mine; chip.setAttribute('aria-pressed', st.mine ? 'true' : 'false'); apply(); return; }
    st.kind = b.dataset.kind; press(kind, b); apply();
  });
  stage.addEventListener('change', function () { st.stage = stage.value; apply(); });
  q.addEventListener('input', apply);
  document.addEventListener('bos:state', function (e) { st.state = (e.detail && e.detail.slug) || ''; chipSync(); apply(); });
  // The two summary lists open the same detail sheet as the rows below.
  document.querySelectorAll('[data-jump]').forEach(function (b) {
    b.addEventListener('click', function () {
      var li = document.querySelector('#olistrows > li[data-slug="' + b.dataset.jump.replace(/[^\w-]/g, '') + '"]');
      if (!li) return;
      var wasHidden = li.hidden;
      if (wasHidden) li.hidden = false;
      var btn = li.querySelector('[data-open]'); if (btn) btn.click();
      if (wasHidden) li.hidden = true;
    });
  });
  // A deep link to an item outside the current view should still be visible behind the sheet.
  if (location.hash) {
    var li = document.querySelector('#olistrows > li[data-slug="' + decodeURIComponent(location.hash.slice(1)).replace(/[^\w-]/g, '') + '"]');
    if (li && st.when !== 'all' && sets[st.when].indexOf(li.dataset.status) < 0) setWhen('all');
  }
  chipSync(); apply();
})();
</script>
<?php page_foot(['_extra' => $extra]); ?>
