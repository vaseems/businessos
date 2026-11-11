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

function load_data(bool $force = false): array {
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

function load_jobs(bool $force = false): array { return load_cached('app_get_jobs', 'future', 'jobs', $force); }
function load_policy(bool $force = false): array { return load_cached('app_get_policy', 'schemes', 'policy', $force); }
