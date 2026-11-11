<?php
declare(strict_types=1);

function icon(string $name): string {
    $p = [
        'overview' => '<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 8h6V4h-6z"/>',
        'ideas'    => '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
        'startups' => '<path d="M5 19V9l7-5 7 5v10M9 19v-6h6v6"/>',
        'search'   => '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
        'refresh'  => '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
        'out'      => '<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>',
        'close'    => '<path d="M6 6l12 12M18 6 6 18"/>',
        'download' => '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    ];
    return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' . ($p[$name] ?? '') . '</svg>';
}

function ring(int|float $score, string $cls = ''): string {
    $s = max(0, min(100, (int)$score));
    return '<span class="ring ' . h($cls) . '" role="img" aria-label="Score ' . $s . ' out of 100">'
         . '<svg viewBox="0 0 36 36" aria-hidden="true"><circle class="rb" cx="18" cy="18" r="15.5" pathLength="100"/>'
         . '<circle class="rf" cx="18" cy="18" r="15.5" pathLength="100" stroke-dasharray="' . $s . ' 100"/></svg>'
         . '<b>' . $s . '</b></span>';
}

function glyph(array $i): string {
    $out = '<span class="glyph" role="img" aria-label="Critical ' . (int)$i['critical'] . ', demand ' . (int)$i['demand'] . ', ease ' . (int)$i['ease'] . ', India edge ' . (int)$i['india_edge'] . ' out of 5">';
    foreach (['critical', 'demand', 'ease', 'india_edge'] as $k) {
        $out .= '<i style="--h:' . ((int)$i[$k] * 20) . '%"></i>';
    }
    return $out . '</span>';
}

function palette_json(array $d): string {
    $items = [
        ['k' => 'Pages', 't' => 'Overview', 'h' => 'index.php'],
        ['k' => 'Pages', 't' => 'Ideas', 'h' => 'ideas.php'],
        ['k' => 'Pages', 't' => 'Startups', 'h' => 'startups.php'],
    ];
    foreach ($d['ideas'] ?? [] as $i) {
        $items[] = ['k' => 'Ideas', 't' => (string)$i['name'], 's' => 'Score ' . (int)$i['score'], 'h' => 'ideas.php#' . $i['slug']];
    }
    foreach ($d['startups'] ?? [] as $s) {
        $items[] = ['k' => 'Startups', 't' => (string)$s['name'], 's' => (string)($s['sector'] ?? ''), 'h' => 'startups.php#' . $s['slug']];
    }
    return json_encode($items, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE);
}

function page_head(string $title, string $active, array $d = []): void {
    global $CONFIG;
    $nav = ['index.php' => ['Overview', 'overview'], 'ideas.php' => ['Ideas', 'ideas'], 'startups.php' => ['Startups', 'startups']];
    $brand = 'BusinessOS';
    $last = $d['log'][0]['logged_on'] ?? null;
    ?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="color-scheme" content="light dark">
<title><?= h($title) ?> · <?= h('BusinessOS') ?></title>
<link rel="stylesheet" href="assets/style.css?v=3">
<link rel="stylesheet" href="assets/glass.css?v=1">
<noscript><style>.rbar i,.track i,.sbar i{width:var(--w)}.hist i{height:var(--h)}</style></noscript>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><linearGradient id="ringgrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0a84ff"/><stop offset=".55" stop-color="#bf5af2"/><stop offset="1" stop-color="#ff375f"/></linearGradient></defs></svg>
<div class="shell">
  <aside class="side">
    <a class="brand" href="index.php"><span class="mark" aria-hidden="true"></span><span><?= h($brand) ?></span></a>
    <nav class="nav" aria-label="Main">
      <?php foreach ($nav as $href => [$label, $ic]): ?>
        <a href="<?= h($href) ?>"<?= $active === $href ? ' aria-current="page"' : '' ?>><?= icon($ic) ?><span><?= h($label) ?></span></a>
      <?php endforeach; ?>
    </nav>
    <form method="post" action="logout.php" class="signout">
      <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
      <button type="submit"><?= icon('out') ?><span>Sign out</span></button>
    </form>
  </aside>
  <div class="main">
    <header class="bar">
      <h2 class="crumb"><?= h($title) ?></h2>
      <div class="bar-actions">
        <button type="button" class="cmd" data-palette aria-label="Search or jump to"><?= icon('search') ?><span>Search or jump to</span><kbd>⌘K</kbd></button>
        <?php if ($active === 'index.php'): ?><a class="iconbtn" href="index.php?refresh=1" title="Refresh data" aria-label="Refresh data"><?= icon('refresh') ?></a><?php endif; ?>
      </div>
    </header>
    <main id="content">
<?php
}

function page_foot(array $d = [], array $scripts = []): void { ?>
    </main>
  </div>
</div>

<dialog id="sheet" aria-labelledby="sheet-title">
  <div class="sheet-card">
    <header><h2 id="sheet-title"></h2><button type="button" class="iconbtn" data-close aria-label="Close"><?= icon('close') ?></button></header>
    <div class="sheet-body" id="sheet-body"></div>
  </div>
</dialog>

<dialog id="palette" aria-label="Search or jump to">
  <div class="pal-card">
    <div class="pal-input"><?= icon('search') ?><input id="pal-q" type="text" placeholder="Search ideas, startups, pages" autocomplete="off" spellcheck="false" aria-label="Search"></div>
    <ul id="pal-list" role="listbox"></ul>
    <div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div>
  </div>
</dialog>

<script id="palette-data" type="application/json"><?= palette_json($d) ?></script>
<?php foreach ($scripts as $s): ?><script src="<?= h($s) ?>"></script>
<?php endforeach; ?>
<script src="assets/app.js?v=2"></script>
</body>
</html>
<?php
}

function stale_notice(array $d): void {
    if (!empty($d['_stale'])) {
        echo '<p class="notice">Live data could not be reached. Showing the last saved copy.</p>';
    }
}

function load_or_fail(): array {
    try {
        return load_data(isset($_GET['refresh']));
    } catch (Throwable $e) {
        http_response_code(502);
        page_head('Data unavailable', '');
        echo '<section class="empty"><h1>Data unavailable</h1><p>The data source could not be reached and there is no saved copy yet. Check <code>inc/config.php</code> and that PHP cURL is enabled, then reload.</p></section>';
        page_foot();
        exit;
    }
}
