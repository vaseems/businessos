<?php
declare(strict_types=1);

function fetch_remote(array $cfg, string $fn = 'app_get_data', string $must = 'ideas'): ?array {
    if (!function_exists('curl_init')) { return null; }
    $ch = curl_init(rtrim($cfg['supabase_url'], '/') . '/rest/v1/rpc/' . $fn);
    $headers = ['Content-Type: application/json', 'Accept: application/json', 'apikey: ' . $cfg['supabase_key']];
    if (str_starts_with($cfg['supabase_key'], 'eyJ')) { $headers[] = 'Authorization: Bearer ' . $cfg['supabase_key']; }
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode(['p_key' => $cfg['app_key']]),
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 15,
    ]);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($body === false || $code !== 200) { return null; }
    $d = json_decode($body, true);
    return (is_array($d) && isset($d[$must])) ? $d : null;
}

function load_data_raw(bool $force = false): array {
    global $CONFIG;
    $file = $CONFIG['cache_file'];
    $ttl = (int)$CONFIG['cache_ttl'];
    if (!$force && is_file($file) && (time() - filemtime($file)) < $ttl) {
        $d = json_decode((string)file_get_contents($file), true);
        if (is_array($d)) { return $d; }
    }
    $d = fetch_remote($CONFIG);
    if ($d !== null) {
        @file_put_contents($file, json_encode($d), LOCK_EX);
        return $d;
    }
    if (is_file($file)) {
        $d = json_decode((string)file_get_contents($file), true);
        if (is_array($d)) { $d['_stale'] = true; return $d; }
    }
    throw new RuntimeException('Could not load data from Supabase.');
}

function load_cached(string $fn, string $must, string $name, bool $force = false): array {
    global $CONFIG;
    $file = dirname($CONFIG['cache_file']) . '/' . $name . '.json';
    $ttl = (int)$CONFIG['cache_ttl'];
    if (!$force && is_file($file) && (time() - filemtime($file)) < $ttl) {
        $d = json_decode((string)file_get_contents($file), true);
        if (is_array($d)) { return $d; }
    }
    $d = fetch_remote($CONFIG, $fn, $must);
    if ($d !== null) {
        @file_put_contents($file, json_encode($d), LOCK_EX);
        return $d;
    }
    if (is_file($file)) {
        $d = json_decode((string)file_get_contents($file), true);
        if (is_array($d)) { $d['_stale'] = true; return $d; }
    }
    throw new RuntimeException('Could not load ' . $name . ' data from Supabase.');
}

/** Ideas, startups and the update log for the active edition. */
function load_data(bool $force = false): array {
    $d = load_data_raw($force);
    $us = current_region() === 'us';
    $want = $us ? 'US' : 'IN';
    $d['ideas'] = array_values(array_filter($d['ideas'] ?? [], fn($i) => strtoupper((string)($i['region'] ?? 'IN')) === $want));
    $keep = [];
    foreach ($d['ideas'] as $i) { $keep[$i['slug']] = true; }
    $d['log'] = array_values(array_filter($d['log'] ?? [], fn($l) => isset($keep[$l['idea_slug'] ?? ''])));
    if ($us) {
        $d['startups'] = array_values(array_filter($d['startups'] ?? [], fn($s) => in_array(strtoupper((string)($s['hq_country'] ?? '')), ['US', 'USA', 'UNITED STATES'], true)));
    }
    return $d;
}

/** Jobs data: rows tagged with a region are kept when they fit the active edition. */
function load_jobs(bool $force = false): array {
    $d = load_cached('app_get_jobs', 'future', 'jobs', $force);
    $us = current_region() === 'us';
    $usOnly = ['United States', 'Europe and United States'];
    $fit = function ($r) use ($us, $usOnly) {
        $reg = (string)($r['region'] ?? 'Global');
        $isUs = in_array($reg, $usOnly, true);
        return $us ? ($isUs || $reg === 'Global') : !$isUs;
    };
    foreach (['future', 'hot', 'skills', 'stats'] as $k) { $d[$k] = array_values(array_filter($d[$k] ?? [], $fit)); }
    return $d;
}

/** Schemes, regulations and milestones for the active edition. */
function load_policy(bool $force = false): array {
    $d = load_cached('app_get_policy', 'schemes', 'policy', $force);
    $d['schemes'] = region_rows($d['schemes'] ?? []);
    $d['regulations'] = region_rows($d['regulations'] ?? []);
    $slugs = [];
    foreach ($d['regulations'] as $r) { $slugs[$r['slug']] = true; }
    $d['milestones'] = array_values(array_filter($d['milestones'] ?? [], fn($m) => isset($slugs[$m['reg_slug'] ?? ''])));
    return $d;
}

function load_funding(bool $force = false): array {
    $d = load_cached('app_get_funding', 'deals', 'funding', $force);
    $d['deals'] = region_rows($d['deals'] ?? []);
    return $d;
}

/** Programs for the active edition, plus the ones open to startups anywhere. */
function load_opportunities(bool $force = false): array {
    $d = load_cached('app_get_funding_sources', 'sources', 'opportunities', $force);
    $d['sources'] = region_rows($d['sources'] ?? [], 'country', true);
    return $d;
}
