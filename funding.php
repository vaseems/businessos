<?php
declare(strict_types=1);
require __DIR__ . '/inc/bootstrap.php';
require_login();
require __DIR__ . '/inc/data.php';
require __DIR__ . '/inc/layout.php';

try {
    $F = load_funding(isset($_GET['refresh']));
} catch (Throwable $e) {
    http_response_code(503);
    page_head('Funding', 'funding.php', []);
    echo '<section class="empty"><h1>Funding data is unavailable</h1><p>Please try again in a moment.</p></section>';
    page_foot([]);
    exit;
}

$deals = array_values(array_filter($F['deals'] ?? [], fn($d) => !empty($d['company']) && !empty($d['announced_on'])));
$totalDeals = count($deals);
$deals = array_slice($deals, 0, 400);

$groupOf = ['Pre-Seed' => 'early', 'Seed' => 'early', 'Pre-Series A' => 'early',
            'Series A' => 'mid', 'Pre-Series B' => 'mid', 'Series B' => 'mid',
            'Pre-Series C' => 'late', 'Series C' => 'late', 'Series D' => 'late', 'Series E' => 'late', 'Series F or later' => 'late'];
$conf = ['high' => 'Taken from a published weekly funding table', 'medium' => 'Partly verified', 'low' => 'Unverified'];
$regions = state_map();
$cur = current_state();

$todayTs = strtotime(date('Y-m-d'));
$ageOf = fn(string $d): int => max(0, (int)floor(($todayTs - strtotime($d)) / 86400));
$fmtDate = fn(string $d): string => date('j M Y', strtotime($d));

// Headline numbers for the default window (last 30 days).
$sum30 = 0.0; $n30 = 0; $big = null;
foreach ($deals as $d) {
    if ($ageOf($d['announced_on']) <= 30) {
        $n30++;
        $a = (float)($d['amount_usd_m'] ?? 0);
        $sum30 += $a;
        if ($big === null || $a > (float)$big['amount_usd_m']) { $big = $d; }
    }
}

// Weekly totals for the last 8 weeks. Weeks with very few tracked rounds are shown as not yet covered.
$weeks = [];
$monday = strtotime('-' . ((int)date('N', $todayTs) - 1) . ' days', $todayTs);
for ($i = 7; $i >= 0; $i--) {
    $ws = strtotime('-' . ($i * 7) . ' days', $monday);
    $weeks[date('Y-m-d', $ws)] = ['ts' => $ws, 'sum' => 0.0, 'n' => 0];
}
foreach ($deals as $d) {
    $ts = strtotime($d['announced_on']);
    $wk = date('Y-m-d', strtotime('-' . ((int)date('N', $ts) - 1) . ' days', $ts));
    if (isset($weeks[$wk])) { $weeks[$wk]['sum'] += (float)($d['amount_usd_m'] ?? 0); $weeks[$wk]['n']++; }
}
$wmax = 1.0;
foreach ($weeks as $w) { if ($w['n'] >= 5) { $wmax = max($wmax, $w['sum']); } }

// Most active investors in the last 90 days (institutions only; people and family offices are left out).
$inv = [];
foreach ($deals as $d) {
    if ($ageOf($d['announced_on']) > 90 || empty($d['investors'])) { continue; }
    $seen = [];
    foreach (explode(',', (string)$d['investors']) as $name) {
        $name = trim($name);
        if ($name === '' || str_contains($name, '(') || stripos($name, 'family office') !== false || stripos($name, 'angel') !== false
            || stripos($name, 'existing investors') !== false || stripos($name, 'others') !== false) { continue; }
        $key = strtolower(preg_replace('/[^a-z0-9]/i', '', $name));
        if ($key === '' || isset($seen[$key])) { continue; }
        $seen[$key] = true;
        $inv[$key] ??= ['name' => $name, 'n' => 0];
        $inv[$key]['n']++;
    }
}
uasort($inv, fn($a, $b) => [$b['n'], $a['name']] <=> [$a['n'], $b['name']]);
$topInv = array_slice(array_values($inv), 0, 8);
$imax = max(1, $topInv[0]['n'] ?? 1);

$sectors = array_values(array_unique(array_filter(array_map(fn($d) => (string)($d['sector'] ?? ''), $deals))));
sort($sectors);
$hqKnown = count(array_filter($deals, fn($d) => !empty($d['hq_state'])));
$updated = $F['refreshed_at'] ?? null;

$extra = [];
foreach (array_slice($deals, 0, 300) as $d) {
    $extra[] = ['k' => 'Funding', 't' => (string)$d['company'], 's' => money($d['amount_usd_m']) . ($d['stage'] ? ' · ' . $d['stage'] : ''), 'h' => 'funding.php#' . $d['slug']];
}

page_head('Funding', 'funding.php', ['_extra' => $extra]);
stale_notice($F);
?>
<div id="froot" hidden data-state="<?= h($cur) ?>" data-names="<?= h(json_encode($regions, JSON_UNESCAPED_UNICODE)) ?>"></div>

<section class="stats" aria-label="Summary">
  <div><span class="num" id="f1"><?= h(money($sum30)) ?></span><span class="lbl" id="f1l">Raised in the last 30 days</span></div>
  <div><span class="num" id="f2"><?= (int)$n30 ?></span><span class="lbl" id="f2l">Rounds announced</span></div>
  <div><span class="num" id="f3"><?= $big ? h(money($big['amount_usd_m'])) : '—' ?></span><span class="lbl" id="f3l"><?= $big ? 'Largest: ' . h($big['company']) : 'Largest round' ?></span></div>
</section>

<div class="split two">
  <section class="panel">
    <div class="panel-head"><h2>Funding by week</h2><span class="muted small">Total disclosed, USD</span></div>
    <div class="hist fhist" role="img" aria-label="Total disclosed funding in each of the last eight weeks">
      <?php foreach ($weeks as $w): $ok = $w['n'] >= 5; ?>
        <div class="<?= $ok ? '' : 'na' ?>" title="<?= $ok ? h($w['n'] . ' rounds') : 'Not fully covered yet' ?>">
          <i style="--h:<?= $ok ? max(4, round(100 * $w['sum'] / $wmax)) : 0 ?>%"></i>
          <b><?= $ok ? h(money($w['sum'])) : '—' ?></b>
          <span><?= h(date('j M', $w['ts'])) ?></span>
        </div>
      <?php endforeach; ?>
    </div>
    <p class="muted small">Bars show the week starting on the date below. Weeks that are still being collected show a dash.</p>
  </section>
  <section class="panel">
    <div class="panel-head"><h2>Most active investors</h2><span class="muted small">Rounds in the last 90 days</span></div>
    <?php if (!$topInv): ?><p class="muted">No investor data yet.</p><?php endif; ?>
    <ul class="sectors invs">
      <?php foreach ($topInv as $i): ?>
        <li><span class="sn" title="<?= h($i['name']) ?>"><?= h($i['name']) ?></span>
          <span class="sbar"><i class="k-in" style="--w:<?= round(100 * $i['n'] / $imax, 1) ?>%"></i></span>
          <span class="sv"><?= (int)$i['n'] ?></span></li>
      <?php endforeach; ?>
    </ul>
    <p class="muted small">Funds and companies only. Angels and family offices are not counted.</p>
  </section>
</div>

<div class="toolbar">
  <label class="field search"><?= icon('search') ?><input id="fq" type="search" placeholder="Search startups, investors, sectors" aria-label="Search funding rounds"></label>
  <label class="field select"><select id="fsec" aria-label="Sector"><option value="">All sectors</option>
    <?php foreach ($sectors as $s): ?><option value="<?= h($s) ?>"><?= h($s) ?></option><?php endforeach; ?></select></label>
  <div class="seg" role="group" aria-label="Period" id="fper">
    <button type="button" data-days="30" aria-pressed="true">30 days</button>
    <button type="button" data-days="90" aria-pressed="false">90 days</button>
    <button type="button" data-days="0" aria-pressed="false">All tracked</button>
  </div>
</div>
<div class="seg chips" role="group" aria-label="Stage" id="fgrp">
  <button type="button" data-grp="" aria-pressed="true">All stages</button>
  <button type="button" data-grp="early" aria-pressed="false">Early (seed to pre-Series A)</button>
  <button type="button" data-grp="mid" aria-pressed="false">Series A to B</button>
  <button type="button" data-grp="late" aria-pressed="false">Series C and later</button>
  <button type="button" data-grp="na" aria-pressed="false">Stage not stated</button>
  <button type="button" id="fstate" data-mine="1" aria-pressed="false" hidden></button>
</div>
<p class="count"><span id="fcount">0</span> rounds</p>

<ul class="rows" id="flist">
<?php foreach ($deals as $d):
    $slug = (string)$d['slug'];
    $stage = (string)($d['stage'] ?? '');
    $grp = $groupOf[$stage] ?? 'na';
    $words = preg_split('/[\s.]+/', trim((string)$d['company']));
    $init = mb_strtoupper(count($words) > 1 ? mb_substr($words[0], 0, 1) . mb_substr($words[1], 0, 1) : mb_substr($words[0], 0, 2));
    $sub = array_filter([(string)($d['sector'] ?? ''), (string)($d['subsector'] ?? '')]);
    $src = safe_url((string)($d['source_url'] ?? ''));
    $hqSlug = !empty($d['hq_state']) ? state_slug((string)$d['hq_state']) : '';
    $search = strtolower(implode(' ', [$d['company'], $d['sector'] ?? '', $d['subsector'] ?? '', $stage, $d['investors'] ?? '', $d['lead_investors'] ?? '', $d['hq_city'] ?? '', $d['hq_state'] ?? '']));
    $amt = $d['amount_usd_m'] !== null ? (float)$d['amount_usd_m'] : 0.0;
?>
  <li class="row frow" data-slug="<?= h($slug) ?>" data-company="<?= h($d['company']) ?>" data-search="<?= h($search) ?>" data-age="<?= $ageOf($d['announced_on']) ?>"
      data-group="<?= h($grp) ?>" data-sector="<?= h((string)($d['sector'] ?? '')) ?>" data-amt="<?= h((string)$amt) ?>" data-hq="<?= h($hqSlug) ?>">
    <button type="button" class="row-btn" data-open>
      <span class="rkb cat-<?= h(substr(md5((string)($d['sector'] ?? '')), 0, 1)) ?>"><?= h($init) ?></span>
      <span class="row-main"><b class="row-title"><?= h($d['company']) ?></b><span class="row-sub"><?= h(implode(' · ', $sub)) ?><?= $sub ? ' · ' : '' ?><?= h($fmtDate($d['announced_on'])) ?></span></span>
      <span class="famt"><b><?= $d['amount_usd_m'] !== null ? h(money($d['amount_usd_m'])) : 'Undisclosed' ?></b><small><?= h($stage !== '' ? $stage : 'Stage not stated') ?></small></span>
      <span class="flead"><?= !empty($d['lead_investors']) ? 'Led by ' . h($d['lead_investors']) : '' ?></span>
    </button>
    <template>
      <p class="sheet-lead"><b><?= $d['amount_usd_m'] !== null ? h(money($d['amount_usd_m'])) : 'Amount not disclosed' ?></b><?= $stage !== '' ? ' · ' . h($stage) : '' ?> · <?= h($fmtDate($d['announced_on'])) ?></p>
      <dl class="facts">
        <div><dt>Sector</dt><dd><?= h(implode(' · ', $sub)) ?: 'Not stated' ?><?= !empty($d['model']) ? ' · ' . h($d['model']) : '' ?></dd></div>
        <?php if (!empty($d['lead_investors'])): ?><div><dt>Led by</dt><dd><?= h($d['lead_investors']) ?></dd></div><?php endif; ?>
        <?php if (!empty($d['investors'])): ?><div><dt>Investors</dt><dd><?= h($d['investors']) ?></dd></div><?php endif; ?>
        <?php if (!empty($d['amount_note'])): ?><div><dt>About the amount</dt><dd><?= h(ucfirst((string)$d['amount_note'])) ?>.</dd></div><?php endif; ?>
        <?php if (!empty($d['hq_state'])): ?><div><dt>Based in</dt><dd><?= h(trim(($d['hq_city'] ?? '') . ', ' . $d['hq_state'], ', ')) ?></dd></div><?php endif; ?>
        <?php if ($src): ?><div><dt>Source</dt><dd><a href="<?= h($src) ?>" target="_blank" rel="noopener noreferrer"><?= h($d['source_name'] ?? 'Source') ?></a></dd></div><?php endif; ?>
        <div><dt>Confidence</dt><dd><?= h($conf[$d['confidence'] ?? 'high'] ?? '') ?>. Amounts are in US dollars as reported and can change when later filings come in.</dd></div>
      </dl>
    </template>
  </li>
<?php endforeach; ?>
</ul>
<section class="empty" id="fnone" hidden><h1>No matches</h1><p id="fnonemsg">Try a wider period or another sector.</p></section>
<p class="muted small jnote"><?= region_cfg()['code'] === 'us' ? 'The largest US startup funding rounds each week, taken from public weekly roundups. Smaller rounds are not listed, so weekly totals understate all US funding.' : 'Funding rounds of about US$0.5 million and above reported in weekly roundups of Indian startup funding. Undisclosed amounts are not listed.' ?> Headquarters are known for <?= (int)$hqKnown ?> of <?= (int)$totalDeals ?> rounds so far and are filled in as they are checked. Updated weekly<?= $updated ? ', last on ' . h(date('j M Y', strtotime((string)$updated))) : '' ?>. For information only, not investment advice.</p>

<script>
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var rows = Array.prototype.slice.call(document.querySelectorAll('#flist > li'));
  var root = $('#froot'), names = {};
  try { names = JSON.parse(root.dataset.names || '{}'); } catch (e) {}
  var st = { q: '', days: 30, grp: '', sector: '', mine: false, state: root.dataset.state || '' };
  var q = $('#fq'), sec = $('#fsec'), per = $('#fper'), grp = $('#fgrp'), chip = $('#fstate');
  var cnt = $('#fcount'), none = $('#fnone'), nonemsg = $('#fnonemsg');
  function money(m) {
    if (m >= 1000) return '$' + (Math.round(m / 100) / 10).toString().replace(/\.0$/, '') + 'B';
    return '$' + (Math.round(m * 10) / 10).toString().replace(/\.0$/, '') + 'M';
  }
  function chipSync() {
    if (!st.state) { chip.hidden = true; st.mine = false; chip.setAttribute('aria-pressed', 'false'); return; }
    var n = rows.filter(function (li) { return li.dataset.hq === st.state; }).length;
    chip.hidden = false;
    chip.textContent = 'Based in ' + (names[st.state] || '') + ' (' + n + ')';
    chip.setAttribute('aria-pressed', st.mine ? 'true' : 'false');
  }
  function apply() {
    var t = (q.value || '').trim().toLowerCase(), n = 0, sum = 0, big = null;
    rows.forEach(function (li) {
      var ok = (!t || li.dataset.search.indexOf(t) > -1) &&
               (st.days === 0 || +li.dataset.age <= st.days) &&
               (!st.grp || li.dataset.group === st.grp) &&
               (!st.sector || li.dataset.sector === st.sector) &&
               (!st.mine || li.dataset.hq === st.state);
      li.hidden = !ok;
      if (ok) { n++; var a = +li.dataset.amt || 0; sum += a; if (!big || a > big.a) big = { a: a, c: li.dataset.company }; }
    });
    cnt.textContent = n;
    none.hidden = n > 0;
    if (st.mine && n === 0) nonemsg.textContent = 'No tracked rounds from startups based in ' + (names[st.state] || 'this state') + ' yet. Headquarters are only known for some rounds, and more are filled in each week.';
    else nonemsg.textContent = 'Try a wider period or another sector.';
    $('#f1').textContent = money(sum);
    $('#f1l').textContent = 'Raised ' + (st.days ? 'in the last ' + st.days + ' days' : 'across all tracked rounds');
    $('#f2').textContent = n;
    $('#f3').textContent = big ? money(big.a) : '—';
    $('#f3l').textContent = big ? 'Largest: ' + big.c : 'Largest round';
  }
  function press(box, btn) { box.querySelectorAll('button').forEach(function (x) { if (x !== chip) x.setAttribute('aria-pressed', x === btn ? 'true' : 'false'); }); }
  per.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; st.days = +b.dataset.days; press(per, b); apply(); });
  grp.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b === chip) { st.mine = !st.mine; chip.setAttribute('aria-pressed', st.mine ? 'true' : 'false'); apply(); return; }
    st.grp = b.dataset.grp; press(grp, b); apply();
  });
  sec.addEventListener('change', function () { st.sector = sec.value; apply(); });
  q.addEventListener('input', apply);
  document.addEventListener('bos:state', function (e) { st.state = (e.detail && e.detail.slug) || ''; chipSync(); apply(); });
  // A deep link to an older round should still be visible behind the sheet.
  if (location.hash) { var li = document.querySelector('[data-slug="' + decodeURIComponent(location.hash.slice(1)).replace(/[^\w-]/g, '') + '"]'); if (li && +li.dataset.age > st.days) { st.days = 0; per.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x.dataset.days === '0' ? 'true' : 'false'); }); } }
  chipSync(); apply();
})();
</script>
<?php page_foot(['_extra' => $extra]); ?>
