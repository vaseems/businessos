<?php
declare(strict_types=1);

if (PHP_VERSION_ID < 80000) { http_response_code(500); exit('PHP 8.0 or newer is required.'); }
$cfgFile = __DIR__ . '/config.php';
if (!is_file($cfgFile)) { http_response_code(500); exit('Missing inc/config.php. Copy inc/config.sample.php and fill it in.'); }
$CONFIG = require $cfgFile;

$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
      || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
session_name('sdash');
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax']);
session_start();

function h(mixed $v): string { return htmlspecialchars((string)($v ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }

function csrf_token(): string {
    if (empty($_SESSION['csrf'])) { $_SESSION['csrf'] = bin2hex(random_bytes(16)); }
    return $_SESSION['csrf'];
}
function csrf_ok(): bool {
    return isset($_POST['csrf'], $_SESSION['csrf']) && hash_equals($_SESSION['csrf'], (string)$_POST['csrf']);
}
function require_login(): void {
    if (empty($_SESSION['ok'])) { header('Location: login.php'); exit; }
}
function safe_url(string $u): ?string {
    $u = trim($u);
    return preg_match('#^https?://[^\s<>"\']+$#i', $u) ? $u : null;
}
function money(mixed $m): string {
    if ($m === null || $m === '') return '—';
    $m = (float)$m;
    if ($m >= 1000) return '$' . rtrim(rtrim(number_format($m / 1000, 1), '0'), '.') . 'B';
    return '$' . rtrim(rtrim(number_format($m, 1), '0'), '.') . 'M';
}
function num(mixed $n): string {
    if ($n === null || $n === '') return '—';
    return number_format((float)$n);
}
