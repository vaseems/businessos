<?php
declare(strict_types=1);

/**
 * Region handling: the dashboard has an India edition and a US edition.
 * Order of precedence: the visitor's own choice (cookie bos_region), then the country Cloudflare
 * reports for the request (CF-IPCountry), then India.
 */
function current_region(): string {
    static $r = null;
    if ($r !== null) { return $r; }
    $c = (string)($_COOKIE['bos_region'] ?? '');
    if ($c === 'in' || $c === 'us') { return $r = $c; }
    $geo = strtoupper((string)($_SERVER['HTTP_CF_IPCOUNTRY'] ?? ''));
    return $r = ($geo === 'US' ? 'us' : 'in');
}

/** True when neither a saved choice nor a country header is available, so the browser may guess once. */
function region_unknown(): bool {
    $c = (string)($_COOKIE['bos_region'] ?? '');
    return $c !== 'in' && $c !== 'us' && trim((string)($_SERVER['HTTP_CF_IPCOUNTRY'] ?? '')) === '';
}

/** Words and labels that differ between the editions. */
function region_cfg(): array {
    static $cfg = null;
    if ($cfg !== null) { return $cfg; }
    if (current_region() === 'us') {
        return $cfg = [
            'code' => 'us', 'country' => 'US', 'name' => 'United States', 'short' => 'US', 'adj' => 'US',
            'all' => 'All United States', 'pick' => 'Your state',
            'central' => 'Federal', 'centralLow' => 'federal', 'dept' => 'Agency', 'stateUnit' => 'states and territories', 'unitShort' => 'States and territories', 'everywhere' => 'across the United States', 'portalSrc' => 'official agency pages and policy documents',
            'noun' => 'programs', 'Noun' => 'Programs', 'bizWord' => 'small businesses', 'edge' => 'US edge', 'angle' => 'US angle', 'palette' => 'Search ideas, startups, funding, VCs, programs, jobs, grants, laws',
        ];
    }
    return $cfg = [
        'code' => 'in', 'country' => 'IN', 'name' => 'India', 'short' => 'India', 'adj' => 'Indian',
        'all' => 'All India', 'pick' => 'Your state',
        'central' => 'Central', 'centralLow' => 'central', 'dept' => 'Ministry', 'stateUnit' => 'states and union territories', 'unitShort' => 'States and UTs', 'everywhere' => 'across India', 'portalSrc' => 'official portals and policy documents',
        'noun' => 'schemes', 'Noun' => 'Schemes', 'bizWord' => 'MSMEs', 'edge' => 'India edge', 'angle' => 'India angle', 'palette' => 'Search ideas, startups, funding, VCs, programs, jobs, schemes, laws',
    ];
}

function india_regions(): array {
    return [
        'States' => ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
                     'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
                     'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'],
        'Union territories' => ['Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
                                'Ladakh', 'Lakshadweep', 'Puducherry'],
    ];
}

function us_regions(): array {
    return [
        'States' => ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia',
                     'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland',
                     'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey',
                     'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina',
                     'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'],
        'District and territories' => ['District of Columbia', 'Puerto Rico', 'Guam', 'U.S. Virgin Islands', 'American Samoa', 'Northern Mariana Islands'],
    ];
}

/** Groups of states for the picker in the active edition. */
function region_groups(): array { return current_region() === 'us' ? us_regions() : india_regions(); }

function state_slug(string $name): string {
    return trim((string)preg_replace('/[^a-z0-9]+/', '-', strtolower($name)), '-');
}

/** Slug => name for the active edition's states. */
function state_map(): array {
    $m = [];
    foreach (region_groups() as $names) { foreach ($names as $n) { $m[state_slug($n)] = $n; } }
    return $m;
}

/** The state chosen in the header, or '' for the whole country. Validated against the active edition's list. */
function current_state(): string {
    $c = (string)($_COOKIE['bos_state'] ?? '');
    return isset(state_map()[$c]) ? $c : '';
}

/** Keep only rows for the active edition. $key is the column holding IN / US (and optionally GLOBAL). */
function region_rows(array $rows, string $key = 'country', bool $withGlobal = false): array {
    $want = region_cfg()['country'];
    return array_values(array_filter($rows, function ($r) use ($key, $want, $withGlobal) {
        $v = strtoupper((string)($r[$key] ?? 'IN'));
        return $v === $want || ($withGlobal && $v === 'GLOBAL');
    }));
}
