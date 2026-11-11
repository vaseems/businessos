<?php
declare(strict_types=1);
require __DIR__ . '/inc/bootstrap.php';
require_login();
require __DIR__ . '/inc/data.php';
require __DIR__ . '/inc/layout.php';

$d = load_or_fail();
$ideas = $d['ideas'] ?? [];
page_head('Ideas', 'ideas.php', $d);
stale_notice($d);
?>
<div class="toolbar">
  <label class="field search"><?= icon('search') ?><input id="q" type="search" placeholder="Filter ideas" aria-label="Filter ideas"></label>
  <div class="seg" role="group" aria-label="Sort" id="sort">
    <button type="button" data-sort="rank" aria-pressed="true">Rank</button>
    <button type="button" data-sort="added" aria-pressed="false">Newest</button>
    <button type="button" data-sort="name" aria-pressed="false">Name</button>
  </div>
  <div class="seg" role="group" aria-label="Minimum score" id="minseg">
    <button type="button" data-min="0" aria-pressed="true">All</button>
    <button type="button" data-min="60" aria-pressed="false">60+</button>
    <button type="button" data-min="70" aria-pressed="false">70+</button>
    <button type="button" data-min="80" aria-pressed="false">80+</button>
  </div>
  <a class="btn quiet sm" href="export.php?what=ideas"><?= icon('download') ?>CSV</a>
</div>
<p class="count"><span id="count"><?= count($ideas) ?></span> ideas</p>

<ul class="rows" id="list">
<?php foreach ($ideas as $i):
    $search = strtolower(implode(' ', [$i['name'], $i['problem'], $i['solution'], $i['first_customers'], $i['india_angle']])); ?>
  <li class="row" data-slug="<?= h($i['slug']) ?>" data-search="<?= h($search) ?>" data-rank="<?= (int)$i['rank_no'] ?>" data-score="<?= (int)$i['score'] ?>" data-added="<?= h($i['date_added']) ?>" data-name="<?= h(strtolower($i['name'])) ?>">
    <button type="button" class="row-btn" data-open>
      <?= ring($i['score']) ?>
      <span class="row-main"><b class="row-title"><?= h($i['name']) ?></b><span class="row-sub"><?= h($i['india_angle']) ?></span></span>
      <?= glyph($i) ?>
      <time class="row-date" datetime="<?= h($i['date_added']) ?>"><?= h(date('j M', strtotime((string)$i['date_added']))) ?></time>
    </button>
    <template>
      <div class="sheet-meta"><?= ring($i['score'], 'lg') ?><div class="facts-inline">
        <span>Critical <b><?= (int)$i['critical'] ?></b></span><span>Demand <b><?= (int)$i['demand'] ?></b></span>
        <span>Ease to build <b><?= (int)$i['ease'] ?></b></span><span>India edge <b><?= (int)$i['india_edge'] ?></b></span></div></div>
      <dl class="facts">
        <div><dt>India angle</dt><dd><?= h($i['india_angle']) ?></dd></div>
        <div><dt>Problem</dt><dd><?= h($i['problem']) ?></dd></div>
        <div><dt>Solution</dt><dd><?= h($i['solution']) ?></dd></div>
        <div><dt>First customers</dt><dd><?= h($i['first_customers']) ?></dd></div>
        <div><dt>Rough MVP</dt><dd><?= h($i['rough_mvp']) ?></dd></div>
        <div><dt>Main risk</dt><dd><?= h($i['main_risk']) ?></dd></div>
      </dl>
      <p class="muted small">Added <?= h($i['date_added']) ?>. Scores are analyst judgment on a 1 to 5 scale per factor.</p>
    </template>
  </li>
<?php endforeach; ?>
</ul>
<?php if (!$ideas): ?><section class="empty"><h1>No ideas yet</h1><p>New ideas will appear here soon.</p></section><?php endif; ?>
<section class="empty" id="none" hidden><h1>No matches</h1><p>Try a different search or lower the minimum score.</p></section>
<?php page_foot($d); ?>
