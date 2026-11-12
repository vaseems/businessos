<?php
// Copy to config.php and fill in. Never commit or expose config.php.
return [
    'supabase_url' => 'https://YOUR-PROJECT.supabase.co',
    'supabase_key' => 'YOUR_PUBLISHABLE_OR_ANON_KEY',      // public-type key; data is protected by app_key below
    'app_key'      => 'LONG_RANDOM_SECRET_CHECKED_BY_app_get_data', // plain secret; only its SHA-256 is stored in Supabase
    // Generate: php -r "echo password_hash('your-password', PASSWORD_DEFAULT), PHP_EOL;"
    'password_hash' => '',
    'cache_ttl'    => 300,
    'cache_file'   => __DIR__ . '/cache/data.json',
    'site_name'    => 'Groundwork',
];
