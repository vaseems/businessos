<?php
declare(strict_types=1);
require __DIR__ . '/inc/bootstrap.php';

$error = '';
if (!empty($_SESSION['ok'])) { header('Location: index.php'); exit; }
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $_SESSION['tries'] = ($_SESSION['tries'] ?? 0) + 1;
    if ($_SESSION['tries'] > 8) {
        $error = 'Too many attempts. Close the browser and try again later.';
    } elseif (!csrf_ok()) {
        $error = 'Session expired. Reload the page and try again.';
    } elseif ($CONFIG['password_hash'] !== '' && password_verify((string)($_POST['password'] ?? ''), $CONFIG['password_hash'])) {
        session_regenerate_id(true);
        $_SESSION['ok'] = true;
        $_SESSION['tries'] = 0;
        header('Location: index.php');
        exit;
    } else {
        usleep(700000);
        $error = 'That password is incorrect.';
    }
}
$brand = 'BusinessOS';
?><!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="light dark">
<title>Sign in · <?= h('BusinessOS') ?></title>
<link rel="stylesheet" href="assets/style.css?v=3">
<link rel="stylesheet" href="assets/glass.css?v=2">
</head><body class="login">
<div id="particles" data-count="55" aria-hidden="true"></div>
<form method="post" class="login-card">
  <span class="mark big" aria-hidden="true"></span>
  <h1><?= h($brand) ?></h1>
  <p class="muted">Sign in to see today's ranked ideas.</p>
  <?php if ($error): ?><p class="notice" role="alert"><?= h($error) ?></p><?php endif; ?>
  <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
  <label class="field"><input id="password" name="password" type="password" autocomplete="current-password" placeholder="Password" aria-label="Password" autofocus required></label>
  <button type="submit" class="btn full">Sign in</button>
</form>
<footer class="foot login-foot">&copy; 2026 Gradient Technology Labs LLP. All rights reserved.</footer>
<script src="assets/vendor/tsparticles.slim.bundle.min.js"></script>
<script src="assets/particles.js?v=2"></script>
</body></html>
