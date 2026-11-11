<?php
declare(strict_types=1);
require __DIR__ . '/inc/bootstrap.php';
require_login();
require __DIR__ . '/inc/data.php';
require __DIR__ . '/inc/layout.php';

try {
    $J = load_jobs(isset($_GET['refresh']));
} catch (Throwable $e) {
    http_response_code(503);
    page_head('Jobs', 'jobs.php', []);
    echo '<section class="empty"><h1>Jobs data is unavailable</h1><p>Please try again in a moment.</p></section>';
    page_foot([]);
    exit;
}

function jslug(string $s): string {
    return trim((string)preg_replace('/[^a-z0-9]+/', '-', strtolower($s)), '-');
}

$src = [];
foreach ($J['sources'] ?? [] as $s) { $src[$s['slug']] = $s; }
$skillsByRole = [];
foreach ($J['role_skills'] ?? [] as $r) { $skillsByRole[$r['role']][(int)$r['rank_no']] = $r['skill']; }
foreach ($skillsByRole as &$sk) { ksort($sk); } unset($sk);

$stat = [];
foreach ($J['stats'] ?? [] as $t) { $stat[$t['source_slug'] . '/' . $t['stat_key']] = $t; }
$sv = fn(string $k) => isset($stat[$k]) ? $stat[$k]['value'] : null;

function fmt_pct($v): string { return ($v >= 0 ? '+' : '') . rtrim(rtrim(number_format((float)$v, 1), '0'), '.') . '%'; }
function fmt_abs($v, ?string $unit): string {
    $v = (float)$v; $u = (string)$unit;
    if (str_contains($u, 'million')) { return rtrim(rtrim(number_format($v, 1), '0'), '.') . 'M'; }
    return $v >= 1000 ? rtrim(rtrim(number_format($v / 1000, 1), '0'), '.') . 'K' : (string)(int)$v;
}

$outlookTitle = [
    'growing' => 'Fastest-growing roles',
    'largest_net_growth' => 'Largest net job gains',
    'declining' => 'Fastest-declining roles',
    'largest_net_decline' => 'Largest net job losses',
];
$tabs = [
    'growing'   => ['Growing', ['growing', 'largest_net_growth']],
    'declining' => ['Declining', ['declining', 'largest_net_decline']],
];

// Build sections: [tab][source|outlook] => rows
$sections = ['growing' => [], 'declining' => []];
$roles = [];
foreach ($J['future'] ?? [] as $f) {
    foreach ($tabs as $tk => [$lbl, $outs]) {
        if (in_array($f['outlook'], $outs, true)) {
            $sections[$tk][$f['source_slug'] . '|' . $f['outlook'] . '|' . $f['horizon'] . '|' . $f['region']][] = $f;
        }
    }
    $roles[$f['role']] = ($roles[$f['role']] ?? []) + ['t' => $f['role'], 's' => $f['outlook'] === 'declining' || $f['outlook'] === 'largest_net_decline' ? 'Declining role' : 'Growing role', 'slug' => jslug($f['role'])];
}
$hot = $J['hot'] ?? [];
$hotRoles = array_filter($hot, fn($h) => isset($skillsByRole[$h['role']]));
foreach ($hot as $h) {
    if (isset($skillsByRole[$h['role']])) {
        $roles[$h['role']] = ($roles[$h['role']] ?? []) + ['t' => $h['role'], 's' => 'In demand now', 'slug' => jslug($h['role'])];
    }
}
$J2 = ['_jobs_roles' => array_values($roles)];

$cats = [
    'rising' => 'Fastest-rising skills',
    'shortage' => 'Hardest skills to find',
    'most_sought' => 'Most sought-after',
    'premium' => 'Skills that earn a premium',
    'role_skill' => 'Skills named for hot roles',
    'declining' => 'Declining skills',
];
$skillsBy = [];
foreach ($J['skills'] ?? [] as $k) { $skillsBy[$k['category']][] = $k; }

$conf = ['high' => 'Verified', 'medium' => 'Partly verified', 'low' => 'Unverified'];

function src_link(array $src, string $slug): string {
    $s = $src[$slug] ?? null;
    if (!$s) { return h($slug); }
    $u = safe_url((string)$s['url']);
    $t = h($s['publisher']) . ': ' . h($s['title']);
    return $u ? '<a href="' . h($u) . '" target="_blank" rel="noopener noreferrer">' . $t . '</a>' : $t;
}

function role_sheet(array $row, array $skills, array $src, array $conf, string $detailRows): string {
    ob_start(); ?>
      <h3 class="sheet-h">Top 5 skills required</h3>
      <?php if ($skills): ?>
      <ol class="skills5">
        <?php foreach ($skills as $i => $sk): ?><li><span class="n"><?= (int)$i ?></span><span><?= h($sk) ?></span></li><?php endforeach; ?>
      </ol>
      <?php else: ?><p class="muted">No skill list yet for this role.</p><?php endif; ?>
      <dl class="facts" style="margin-top:22px"><?= $detailRows ?></dl>
    <?php return (string)ob_get_clean();
}

$d = $J2;
page_head('Jobs and skills', 'jobs.php', $d);
stale_notice($J);
?>
<section class="stats jobs-stats" aria-label="Headline numbers">
  <div><span class="num" data-count="<?= (float)($sv('wef-foj-2025/net_growth') ?? 0) ?>">0</span><span class="lbl">Net new jobs by 2030 (millions)</span></div>
  <div><span class="num" data-count="<?= (float)($sv('wef-foj-2025/skills_change') ?? 0) ?>" data-suffix="%">0</span><span class="lbl">Core skills changing by 2030</span></div>
  <div><span class="num" data-count="<?= (float)($sv('pwc-aijb-2026/ai_wage_premium') ?? 0) ?>" data-suffix="%">0</span><span class="lbl">Pay premium for AI skills</span></div>
</section>

<div class="toolbar">
  <label class="field search"><?= icon('search') ?><input id="jq" type="search" placeholder="Search roles and skills" aria-label="Search roles and skills"></label>
  <div class="seg" role="tablist" aria-label="View" id="jtabs">
    <button type="button" role="tab" data-tab="growing" aria-pressed="true">Growing</button>
    <button type="button" role="tab" data-tab="declining" aria-pressed="false">Declining</button>
    <button type="button" role="tab" data-tab="hot" aria-pressed="false">In demand now</button>
    <button type="button" role="tab" data-tab="skills" aria-pressed="false">Skills</button>
  </div>
</div>

<div id="jobs">
<?php foreach ($sections as $tk => $groups): ?>
<div class="jtab" data-tab="<?= h($tk) ?>"<?= $tk === 'growing' ? '' : ' hidden' ?>>
  <?php foreach ($groups as $key => $rows):
      [$slug, $outlook, $horizon, $region] = explode('|', $key); ?>
  <section class="jgroup">
    <div class="panel-head sub"><h2><?= h($outlookTitle[$outlook] ?? $outlook) ?></h2><span class="muted small"><?= h($region) ?> · <?= h($horizon) ?> · <?= h($src[$slug]['publisher'] ?? $slug) ?></span></div>
    <ul class="rows">
    <?php foreach ($rows as $r):
        $skills = $skillsByRole[$r['role']] ?? [];
        $rslug = jslug($r['role']);
        $metric = $r['growth_pct'] !== null ? fmt_pct($r['growth_pct']) : ($r['change_abs'] !== null ? fmt_abs($r['change_abs'], $r['change_unit']) : '');
        $search = strtolower($r['role'] . ' ' . implode(' ', $skills) . ' ' . ($r['note'] ?? ''));
        $dr = '<div><dt>Outlook</dt><dd>' . h($outlookTitle[$outlook] ?? $outlook) . ', ' . h($r['region']) . ', ' . h($r['horizon']) . '</dd></div>';
        if ($r['growth_pct'] !== null) { $dr .= '<div><dt>Projected growth</dt><dd>' . h(fmt_pct($r['growth_pct'])) . ($r['change_abs'] !== null ? ' (' . h(fmt_abs($r['change_abs'], $r['change_unit'])) . ' ' . h(preg_replace('/^million /', '', (string)$r['change_unit'])) . ')' : '') . '</dd></div>'; }
        elseif ($r['change_abs'] !== null) { $dr .= '<div><dt>Change</dt><dd>' . h(fmt_abs($r['change_abs'], $r['change_unit'])) . ' ' . h((string)$r['change_unit']) . '</dd></div>'; }
        if (!empty($r['note'])) { $dr .= '<div><dt>Note</dt><dd>' . h($r['note']) . '</dd></div>'; }
        $dr .= '<div><dt>Source</dt><dd>' . src_link($src, $r['source_slug']) . '</dd></div>';
        $dr .= '<div><dt>Confidence</dt><dd>' . h($conf[$r['confidence']] ?? $r['confidence']) . '</dd></div>';
    ?>
      <li class="row jrow" data-slug="<?= h($rslug) ?>" data-search="<?= h($search) ?>">
        <button type="button" class="row-btn" data-open>
          <span class="rkb<?= $r['rank_no'] === null ? ' none' : '' ?>"><?= $r['rank_no'] !== null ? (int)$r['rank_no'] : '·' ?></span>
          <span class="row-main"><b class="row-title"><?= h($r['role']) ?></b><span class="row-sub"><?= h($skills ? implode(' · ', array_slice($skills, 0, 3)) : (string)($r['note'] ?? '')) ?></span></span>
          <span class="jmetric <?= $tk === 'declining' ? 'neg' : 'pos' ?>"><?= h($metric) ?></span>
          <span class="glyph"><span class="tag"><?= h($conf[$r['confidence']] ?? '') ?></span></span>
        </button>
        <template><?= role_sheet($r, $skills, $src, $conf, $dr) ?></template>
      </li>
    <?php endforeach; ?>
    </ul>
  </section>
  <?php endforeach; ?>
</div>
<?php endforeach; ?>

<div class="jtab" data-tab="hot" hidden>
  <?php
  $byRegion = [];
  foreach ($hot as $h) { $byRegion[$h['region']][] = $h; }
  foreach ($byRegion as $region => $rows): ?>
  <section class="jgroup">
    <div class="panel-head sub"><h2><?= h($region) ?></h2><span class="muted small">Current hiring demand</span></div>
    <ul class="rows">
    <?php foreach ($rows as $h):
        $skills = $skillsByRole[$h['role']] ?? [];
        $rslug = jslug($h['role'] . '-' . $region);
        $metric = $h['metric_value'] !== null ? rtrim(rtrim(number_format((float)$h['metric_value'], 1), '0'), '.') . ' ' . (string)$h['metric_unit'] : '';
        $search = strtolower($h['role'] . ' ' . implode(' ', $skills) . ' ' . ($h['signal'] ?? '') . ' ' . ($h['note'] ?? ''));
        $dr = '<div><dt>Signal</dt><dd>' . h((string)$h['signal']) . '</dd></div>';
        if ($metric !== '') { $dr .= '<div><dt>Figure</dt><dd>' . h($metric) . '</dd></div>'; }
        if (!empty($h['note'])) { $dr .= '<div><dt>Note</dt><dd>' . h($h['note']) . '</dd></div>'; }
        $dr .= '<div><dt>Region</dt><dd>' . h($h['region']) . '</dd></div>';
        $dr .= '<div><dt>Source</dt><dd>' . src_link($src, $h['source_slug']) . '</dd></div>';
        $dr .= '<div><dt>Confidence</dt><dd>' . h($conf[$h['confidence']] ?? $h['confidence']) . '</dd></div>';
    ?>
      <li class="row jrow" data-slug="<?= h($rslug) ?>" data-search="<?= h($search) ?>">
        <button type="button" class="row-btn" data-open>
          <span class="rkb<?= $h['rank_no'] === null ? ' none' : '' ?>"><?= $h['rank_no'] !== null ? (int)$h['rank_no'] : '·' ?></span>
          <span class="row-main"><b class="row-title"><?= h($h['role']) ?></b><span class="row-sub"><?= h((string)$h['signal']) ?></span></span>
          <span class="jmetric pos"><?= h($metric) ?></span>
          <span class="glyph"><span class="tag"><?= h($conf[$h['confidence']] ?? '') ?></span></span>
        </button>
        <template><?= role_sheet($h, $skills, $src, $conf, $dr) ?></template>
      </li>
    <?php endforeach; ?>
    </ul>
  </section>
  <?php endforeach; ?>
</div>

<div class="jtab" data-tab="skills" hidden>
  <div class="skillgrid">
  <?php foreach ($cats as $ck => $title): if (empty($skillsBy[$ck])) continue; ?>
    <section class="panel jgroup">
      <div class="panel-head"><h2><?= h($title) ?></h2></div>
      <ul class="skilllist">
        <?php foreach ($skillsBy[$ck] as $k):
            $m = $k['metric_value'] !== null ? rtrim(rtrim(number_format((float)$k['metric_value'], 1), '0'), '.') . ' ' . (string)$k['metric_unit'] : ''; ?>
        <li class="skillrow" data-search="<?= h(strtolower($k['skill'] . ' ' . ($k['note'] ?? '') . ' ' . $k['region'])) ?>">
          <span class="rkb sm<?= $k['rank_no'] === null ? ' none' : '' ?>"><?= $k['rank_no'] !== null ? (int)$k['rank_no'] : '·' ?></span>
          <span class="sk-main"><b><?= h($k['skill']) ?></b>
            <span class="muted small"><?= h($k['region']) ?> · <?= h($src[$k['source_slug']]['publisher'] ?? $k['source_slug']) ?><?= $m !== '' ? ' · ' . h($m) : '' ?></span></span>
        </li>
        <?php endforeach; ?>
      </ul>
    </section>
  <?php endforeach; ?>
  </div>
</div>

<section class="empty" id="jnone" hidden><h1>No matches</h1><p>Try a different role or skill.</p></section>
</div>

<p class="muted small jnote">Sources: <?php
    $names = [];
    foreach ($src as $s) { if ($s['slug'] === 'compiled-role-skills') continue; $names[] = h($s['publisher']); }
    echo implode(', ', $names);
?>. The top 5 skills for each role are an indicative list, not a published ranking. Data refreshed <?= h(date('j M Y', strtotime((string)($J['refreshed_at'] ?? 'now')))) ?>.</p>

<script>
(function () {
  var tabs = document.getElementById('jtabs'), q = document.getElementById('jq'), none = document.getElementById('jnone');
  var cur = 'growing';
  function apply() {
    var term = (q.value || '').trim().toLowerCase(), shown = 0;
    document.querySelectorAll('.jtab').forEach(function (t) {
      var on = t.dataset.tab === cur; t.hidden = !on;
      if (!on) return;
      t.querySelectorAll('.jrow, .skillrow').forEach(function (r) {
        var ok = !term || (r.dataset.search || '').indexOf(term) > -1;
        r.hidden = !ok; if (ok) shown++;
      });
      t.querySelectorAll('.jgroup').forEach(function (g) {
        var any = g.querySelector('.jrow:not([hidden]), .skillrow:not([hidden])');
        g.hidden = !any;
      });
    });
    none.hidden = shown > 0;
  }
  tabs.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tab]'); if (!b) return;
    cur = b.dataset.tab;
    tabs.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
    apply();
  });
  q.addEventListener('input', apply);
  // Deep link: open the tab that holds the role
  var h = decodeURIComponent(location.hash.slice(1)).replace(/[^\w-]/g, '');
  if (h) {
    var el = document.querySelector('[data-slug="' + h + '"]');
    var t = el && el.closest('.jtab');
    if (t && t.dataset.tab !== 'growing') { var b = tabs.querySelector('[data-tab="' + t.dataset.tab + '"]'); if (b) b.click(); }
  }
})();
</script>
<?php page_foot($J2); ?>
