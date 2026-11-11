<?php
declare(strict_types=1);
require __DIR__ . '/inc/bootstrap.php';
require_login();
require __DIR__ . '/inc/data.php';

$what = $_GET['what'] ?? '';
if (!in_array($what, ['ideas', 'startups'], true)) { http_response_code(400); exit('Bad request'); }
try { $d = load_data(); } catch (Throwable $e) { http_response_code(502); exit('Data unavailable'); }
$rows = $d[$what] ?? [];

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $what . '-' . date('Y-m-d') . '.csv"');
echo "\xEF\xBB\xBF";
$out = fopen('php://output', 'w');
if ($rows) {
    $cols = array_keys($rows[0]);
    fputcsv($out, $cols);
    foreach ($rows as $r) {
        $line = [];
        foreach ($cols as $c) {
            $v = $r[$c] ?? '';
            if (is_bool($v)) { $v = $v ? 'true' : 'false'; }
            $v = (string)$v;
            if ($v !== '' && strpbrk($v[0], "=+-@\t\r") !== false) { $v = "'" . $v; } // block spreadsheet formula injection
            $line[] = $v;
        }
        fputcsv($out, $line);
    }
}
fclose($out);
