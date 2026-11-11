<?php
declare(strict_types=1);
require __DIR__ . '/inc/bootstrap.php';
require_login();
require __DIR__ . '/inc/data.php';
require __DIR__ . '/inc/layout.php';

$d = load_or_fail();
$ideas = $d['ideas'] ?? [];
$startups = $d['startups'] ?? [];
$log = $d['log'] ?? [];
$n = count($ideas);
$ns = count($startups);
$scores = array_map(fn($i) => (int)$i['score'], $ideas);
$avg = $n ? array_sum($scores) / $n : 0;
$topIdea = $ideas[0] ?? null;
$names = [];
foreach ($ideas as $i) { $names[$i['slug']] = $i['name']; }

$rc = region_cfg();
$isUs = $rc['code'] === 'us';
$factors = ['critical' => 'Critical', 'demand' => 'Demand', 'ease' => 'Ease to build', 'india_edge' => $rc['edge']];
$fav = [];
foreach ($factors as $k => $label) {
    $v = array_map(fn($i) => (int)$i[$k], $ideas);
    $fav[$k] = $n ? array_sum($v) / $n : 0;
}
$buckets = ['Under 50' => 0, '50s' => 0, '60s' => 0, '70s' => 0, '80+' => 0];
foreach ($scores as $s) {
    $buckets[$s < 50 ? 'Under 50' : ($s < 60 ? '50s' : ($s < 70 ? '60s' : ($s < 80 ? '70s' : '80+')))]++;
}
$bmax = max(1, max($buckets));

$sec = [];
$filled = ['Valuation' => 0, 'Traction number' => 0, 'Named clients' => 0, 'India-gap note' => 0];
$ideasVisible = $ideas;
foreach ($startups as $s) {
    if ($s['last_round_amount_usd_m'] !== null) {
        $k = $s['sector'] ?: 'Other';
        $r = ($isUs || ($s['region'] ?? '') === 'India') ? 'in' : 'gl';
        $sec[$k][$r] = ($sec[$k][$r] ?? 0) + (float)$s['last_round_amount_usd_m'];
    }
    if ($s['valuation_usd_m'] !== null) $filled['Valuation']++;
    if ($s['traction_value'] !== null) $filled['Traction number']++;
    if (!empty($s['named_clients'])) $filled['Named clients']++;
    if (!empty($s['india_gap'])) $filled['India-gap note']++;
}
uasort($sec, fn($a, $b) => array_sum($b) <=> array_sum($a));
$sec = array_slice($sec, 0, 8, true);
$smax = 1.0;
foreach ($sec as $v) { $smax = max($smax, array_sum($v)); }
$coverage = $ns ? round(100 * array_sum($filled) / (4 * $ns)) : 0;

$nodes = array_map(fn($i) => ['n' => $i['name'], 's' => (int)$i['score'], 'k' => $i['slug']], $ideas);

page_head('Overview', 'index.php', $d);
stale_notice($d);
?>
<section class="hero" id="hero">
  <div id="constellation" aria-hidden="true"></div>
  <div class="tip" id="tip" hidden></div>
  <div class="hero-copy">
    <?php if ($topIdea): ?>
      <p class="hero-note"><?= $n ?> ideas ranked today</p>
      <h1><?= h($topIdea['name']) ?> leads at <?= (int)$topIdea['score'] ?>.</h1>
      <p class="hero-sub"><?= h($topIdea['india_angle']) ?></p>
      <div class="hero-actions">
        <a class="btn" href="ideas.php#<?= h($topIdea['slug']) ?>">Open idea</a>
        <a class="btn quiet" href="ideas.php">See all ideas</a>
      </div>
    <?php else: ?>
      <h1>No ideas yet.</h1>
      <p class="hero-sub">New ideas will appear here soon.</p>
    <?php endif; ?>
  </div>
  <p class="hero-hint">Each point is an idea. Larger means a higher score.</p>
</section>

<section class="stats" aria-label="Summary">
  <div><span class="num" data-count="<?= $n ?>">0</span><span class="lbl">Ideas</span></div>
  <div><span class="num" data-count="<?= number_format($avg, 1, '.', '') ?>" data-dec="1">0</span><span class="lbl">Average score</span></div>
  <div><span class="num" data-count="<?= $ns ?>">0</span><span class="lbl">Startups</span></div>
</section>

<div class="split">
  <section class="panel">
    <div class="panel-head"><h2>Top ideas</h2><a href="ideas.php">All <?= $n ?></a></div>
    <ol class="rank">
      <?php foreach (array_slice($ideas, 0, 10) as $i): ?>
        <li><a href="ideas.php#<?= h($i['slug']) ?>">
          <span class="rk"><?= (int)$i['rank_no'] ?></span>
          <span class="rn"><?= h($i['name']) ?></span>
          <span class="rbar"><i style="--w:<?= (int)$i['score'] ?>%"></i></span>
          <span class="rs"><?= (int)$i['score'] ?></span>
        </a></li>
      <?php endforeach; ?>
    </ol>
  </section>

  <section class="panel">
    <div class="panel-head"><h2>What drives the scores</h2></div>
    <div class="meters">
      <?php foreach ($factors as $k => $label): ?>
        <div class="meter"><div class="mh"><span><?= h($label) ?></span><b><?= number_format($fav[$k], 1) ?> of 5</b></div>
        <div class="track"><i style="--w:<?= round($fav[$k] * 20) ?>%"></i></div></div>
      <?php endforeach; ?>
    </div>
    <div class="panel-head sub"><h2>Score spread</h2></div>
    <div class="hist" role="img" aria-label="Number of ideas in each score band">
      <?php foreach ($buckets as $label => $c): ?>
        <div><i style="--h:<?= round(100 * $c / $bmax) ?>%"></i><b><?= $c ?></b><span><?= h($label) ?></span></div>
      <?php endforeach; ?>
    </div>
  </section>
</div>

<div class="split">
  <section class="panel">
    <div class="panel-head"><h2>Funding by sector</h2><span class="legend"><?php if ($isUs): ?><i class="k-in"></i>United States<?php else: ?><i class="k-in"></i>India <i class="k-gl"></i>Global<?php endif; ?></span></div>
    <?php if (!$sec): ?><p class="muted">No funding rounds yet.</p><?php endif; ?>
    <ul class="sectors">
      <?php foreach ($sec as $name => $v): $in = $v['in'] ?? 0; $gl = $v['gl'] ?? 0; ?>
        <li><span class="sn"><?= h($name) ?></span>
          <span class="sbar" title="<?= $isUs ? 'United States ' . h(money($in)) : 'India ' . h(money($in)) . ', Global ' . h(money($gl)) ?>"><i class="k-in" style="--w:<?= round(100 * $in / $smax, 1) ?>%"></i><i class="k-gl" style="--w:<?= round(100 * $gl / $smax, 1) ?>%"></i></span>
          <span class="sv"><?= money($in + $gl) ?></span></li>
      <?php endforeach; ?>
    </ul>
    <p class="muted small">Based on each company's latest disclosed round.</p>
  </section>

</div>

<section class="panel">
  <div class="panel-head"><h2>Recent updates</h2></div>
  <?php if (!$log): ?><p class="muted">No updates yet.</p><?php else: ?>
  <ul class="feed">
    <?php foreach (array_slice($log, 0, 10) as $l):
        $nm = $names[$l['idea_slug']] ?? $l['idea_slug'];
        $what = match ($l['change']) {
            'added' => 'Added',
            'rescored' => 'Re-scored ' . ($l['old_score'] !== null ? (int)$l['old_score'] . ' to ' : '') . (int)$l['new_score'],
            'retired' => 'Retired',
            default => 'Edited',
        }; ?>
      <li><time datetime="<?= h($l['logged_on']) ?>"><?= h(date('j M', strtotime((string)$l['logged_on']))) ?></time>
        <div><b><?= h($nm) ?></b><span><?= h($what) ?><?= !empty($l['note']) ? ' · ' . h($l['note']) : '' ?></span></div></li>
    <?php endforeach; ?>
  </ul>
  <?php endif; ?>
</section>

<script id="constellation-data" type="application/json"><?= json_encode($nodes, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE) ?></script>
<?php page_foot($d, ['assets/vendor/three.min.js', 'assets/scene.js']); ?>
