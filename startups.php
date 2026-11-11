<?php
declare(strict_types=1);
require __DIR__ . '/inc/bootstrap.php';
require_login();
require __DIR__ . '/inc/data.php';
require __DIR__ . '/inc/layout.php';

$d = load_or_fail();
$startups = $d['startups'] ?? [];
$sectors = array_values(array_unique(array_filter(array_map(fn($s) => $s['sector'] ?? '', $startups))));
sort($sectors);
page_head('Startups', 'startups.php', $d);
stale_notice($d);
?>
<div class="toolbar">
  <label class="field search"><?= icon('search') ?><input id="q" type="search" placeholder="Filter startups" aria-label="Filter startups"></label>
  <div class="seg" role="group" aria-label="Region" id="regseg">
    <button type="button" data-region="" aria-pressed="true">All</button>
    <button type="button" data-region="India" aria-pressed="false">India</button>
    <button type="button" data-region="Global" aria-pressed="false">Global</button>
  </div>
  <label class="field select"><select id="sector" aria-label="Sector"><option value="">All sectors</option>
    <?php foreach ($sectors as $s): ?><option><?= h($s) ?></option><?php endforeach; ?></select></label>
  <label class="field select"><select id="sortsel" aria-label="Sort by">
    <option value="funding">Largest round</option><option value="valuation">Valuation</option><option value="name">Name</option></select></label>
  <a class="btn quiet sm" href="export.php?what=startups"><?= icon('download') ?>CSV</a>
</div>
<p class="count"><span id="count"><?= count($startups) ?></span> startups</p>

<ul class="tiles" id="list">
<?php foreach ($startups as $s):
    $search = strtolower(implode(' ', [$s['name'], $s['sector'], $s['sub_sector'], $s['last_round_investors'], $s['named_clients'], $s['one_liner']]));
    $links = [];
    foreach (preg_split('/\s+/', str_replace(';', ' ', (string)($s['source_urls'] ?? ''))) as $u) {
        if ($u !== '' && ($su = safe_url($u))) { $links[] = $su; }
    } ?>
  <li class="tile" data-slug="<?= h($s['slug']) ?>" data-search="<?= h($search) ?>" data-region="<?= h($s['region']) ?>" data-sector="<?= h($s['sector']) ?>" data-funding="<?= h($s['last_round_amount_usd_m'] ?? '') ?>" data-valuation="<?= h($s['valuation_usd_m'] ?? '') ?>" data-name="<?= h(strtolower($s['name'])) ?>">
    <button type="button" class="tile-btn" data-open>
      <span class="tile-top"><b><?= h($s['name']) ?></b><span class="tag"><?= h($s['region']) ?></span></span>
      <span class="tile-sub"><?= h($s['one_liner'] ?: $s['sector']) ?></span>
      <span class="tile-fig"><?= money($s['last_round_amount_usd_m']) ?><small><?= h($s['last_round'] ?: 'No round disclosed') ?></small></span>
      <span class="tile-foot"><span><?= $s['valuation_usd_m'] !== null ? h(money($s['valuation_usd_m'])) . ' valuation' : 'Valuation not disclosed' ?></span><span class="conf c-<?= h($s['confidence']) ?>"><i></i><?= h($s['confidence']) ?></span></span>
    </button>
    <template>
      <dl class="facts">
        <?php if (!empty($s['one_liner'])): ?><div><dt>What it does</dt><dd><?= h($s['one_liner']) ?></dd></div><?php endif; ?>
        <?php if (!empty($s['problem_solved'])): ?><div><dt>Problem</dt><dd><?= h($s['problem_solved']) ?></dd></div><?php endif; ?>
        <div><dt>Sector</dt><dd><?= h($s['sector']) ?><?= !empty($s['sub_sector']) ? ' · ' . h($s['sub_sector']) : '' ?><?= !empty($s['customer_type']) ? ' · ' . h($s['customer_type']) : '' ?></dd></div>
        <div><dt>HQ and founded</dt><dd><?= h(trim(($s['hq_city'] ? $s['hq_city'] . ', ' : '') . $s['hq_country'], ', ')) ?><?= $s['founded_year'] ? ' · ' . (int)$s['founded_year'] : '' ?></dd></div>
        <?php if (!empty($s['founders'])): ?><div><dt>Founders</dt><dd><?= h($s['founders']) ?></dd></div><?php endif; ?>
        <div><dt>Last round</dt><dd><?= h(money($s['last_round_amount_usd_m'])) ?> <?= h($s['last_round']) ?><?= $s['last_round_date'] ? ' · ' . h($s['last_round_date']) : '' ?><?= !empty($s['last_round_investors']) ? '<br>' . h($s['last_round_investors']) : '' ?></dd></div>
        <?php if ($s['total_funding_usd_m'] !== null): ?><div><dt>Total funding</dt><dd><?= h(money($s['total_funding_usd_m'])) ?></dd></div><?php endif; ?>
        <?php if ($s['valuation_usd_m'] !== null): ?><div><dt>Valuation</dt><dd><?= h(money($s['valuation_usd_m'])) ?> (<?= h($s['valuation_basis']) ?>)</dd></div><?php endif; ?>
        <?php if (!empty($s['traction_metric'])): ?><div><dt>Traction</dt><dd><?= h(num($s['traction_value'])) ?> · <?= h($s['traction_metric']) ?><br><span class="muted"><?= h($s['traction_metric_type']) ?>, as of <?= h($s['traction_as_of']) ?></span></dd></div><?php endif; ?>
        <?php if (!empty($s['named_clients'])): ?><div><dt>Named clients</dt><dd><?= h($s['named_clients']) ?></dd></div><?php endif; ?>
        <?php if (!empty($s['india_gap'])): ?><div><dt>India gap</dt><dd><?= h($s['india_gap']) ?></dd></div><?php endif; ?>
        <?php if ($s['copyability'] !== null): ?><div><dt>Copyability</dt><dd><?= (int)$s['copyability'] ?> of 5 <span class="muted">(analyst judgment)</span></dd></div><?php endif; ?>
        <?php if (!empty($s['regulatory_dependency'])): ?><div><dt>Regulation</dt><dd><?= h($s['regulatory_dependency']) ?></dd></div><?php endif; ?>
        <?php if (!empty($s['key_risks'])): ?><div><dt>Risks</dt><dd><?= h($s['key_risks']) ?></dd></div><?php endif; ?>
        <?php if (!empty($s['notes'])): ?><div><dt>Notes</dt><dd><?= h($s['notes']) ?></dd></div><?php endif; ?>
        <div><dt>Sources</dt><dd><?php foreach ($links as $k => $u): ?><a href="<?= h($u) ?>" target="_blank" rel="noopener noreferrer">Source <?= $k + 1 ?></a> <?php endforeach; ?><span class="muted">Checked <?= h($s['data_as_of']) ?>. Confidence: <?= h($s['confidence']) ?>.</span></dd></div>
      </dl>
    </template>
  </li>
<?php endforeach; ?>
</ul>
<section class="empty" id="none" hidden><h1>No matches</h1><p>Try a different search or clear the filters.</p></section>
<?php page_foot($d); ?>
