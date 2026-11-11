# Startup Opportunity Dashboard (PHP)

Shows the ranked ideas, startup dataset and charts from the `india-startup-ideas` Supabase project.

Requirements: PHP 8.0+ with cURL (standard on Hostinger). No database or Composer needed.

Deploy: upload everything in this folder to the site's `public_html` (or a subdomain's root), keep `.htaccess` files, make sure `inc/cache/` is writable.

Files: `index.php` dashboard, `ideas.php`, `startups.php`, `export.php` (CSV), `login.php`/`logout.php`.
Secrets live only in `inc/config.php` (blocked from the web by `inc/.htaccess`). Do not share this folder or zip publicly: it contains the access key.

Change the password: `php -r "echo password_hash('NEW-PASSWORD', PASSWORD_DEFAULT);"` and paste into `password_hash`.
Rotate the data key: insert a new SHA-256 hash into `public.app_access`, update `app_key`, delete the old row.

Design: Apple-style app shell with a Three.js idea constellation on the Overview page and tsParticles on the sign-in screen.
Both libraries are bundled in `assets/vendor/` (no CDN). Press Cmd/Ctrl+K anywhere to search ideas, startups and pages.
