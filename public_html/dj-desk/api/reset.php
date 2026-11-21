<?php
/**
 * DJ Live Request Desk & Event Manager
 * Standalone Production Configuration & Database Reset Tool
 * 
 * Usage options:
 *   1. Command Line / SSH:
 *      php reset.php
 *      php reset.php --wipe-data
 * 
 *   2. Web Browser:
 *      Visit https://yourdomain.com/dj-desk/api/reset.php
 */

declare(strict_types=1);

$isCli = (php_sapi_name() === 'cli');

$configFile = dirname(__DIR__) . '/config.php';
clearstatcache(true, $configFile);
if (function_exists('opcache_invalidate') && file_exists($configFile)) {
    @opcache_invalidate($configFile, true);
}
if (function_exists('opcache_reset')) {
    @opcache_reset();
}

$config = file_exists($configFile) ? require $configFile : [];
require_once __DIR__ . '/Database.php';

$wipeRequested = false;
if ($isCli) {
    $args = $argv ?? [];
    $wipeRequested = in_array('--wipe-data', $args, true) || in_array('--wipe', $args, true);
} else {
    $wipeRequested = !empty($_GET['wipe']);
}

// Interactive confirmation page for browser access
if (!$isCli) {
    $confirm = $_GET['confirm'] ?? '';
    if ($confirm !== 'yes' && $confirm !== '1') {
        header('Content-Type: text/html; charset=utf-8');
        echo '<!doctype html><html lang="en"><head><meta charset="utf-8">';
        echo '<meta name="viewport" content="width=device-width, initial-scale=1">';
        echo '<title>Reset DJ-Desk for Production</title>';
        echo '<style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0d120c; color: #e2e8f0; margin: 0; padding: 40px 16px; display: flex; justify-content: center; }
            .card { max-width: 580px; width: 100%; background: #182017; border: 1px solid #3a4433; border-radius: 14px; padding: 32px; box-shadow: 0 16px 40px rgba(0,0,0,0.5); }
            h2 { color: #b6ff35; margin-top: 0; font-size: 22px; }
            p { font-size: 14px; line-height: 1.6; color: #cbd5e1; }
            .btn-group { display: flex; flex-direction: column; gap: 12px; margin-top: 24px; }
            .btn { display: block; text-align: center; padding: 14px 20px; border-radius: 8px; font-weight: 700; font-size: 14px; text-decoration: none; cursor: pointer; border: 1px solid transparent; }
            .btn-primary { background: #b6ff35; color: #0d120c; }
            .btn-danger { background: rgba(255, 77, 77, 0.15); border-color: #ff6b6b; color: #ff8585; }
            .btn-secondary { color: #94a3b8; border-color: #3a4433; }
        </style></head><body><div class="card">';
        echo '<h2>⚠️ Reset DJ-Desk for Production</h2>';
        echo '<p>This emergency utility completely clears OPcache and resets DJ-Desk back to initial setup mode so the <strong>Setup Wizard</strong> can be completed with fresh production database credentials and your primary administrator account.</p>';
        echo '<div class="btn-group">';
        echo '<a class="btn btn-primary" href="reset.php?confirm=yes">Reset Configuration Only (Keep Database Tables)</a>';
        echo '<a class="btn btn-danger" href="reset.php?confirm=yes&wipe=1" onclick="return confirm(\'Are you sure you want to completely erase all events, song requests, and test data in the database?\');">Factory Reset: Reset Config & Wipe All Database Tables</a>';
        echo '<a class="btn btn-secondary" href="../">← Cancel and Return to Desk</a>';
        echo '</div></div></body></html>';
        exit;
    }
}

// Wipe database tables if requested
$wiped = false;
if ($wipeRequested && !empty($config['db']['name'])) {
    try {
        DJ_Database::init($config);
        DJ_Database::clear_sample_data();
        $users_table = DJ_Database::get_table_name('users');
        $sessions_table = DJ_Database::get_table_name('sessions');
        DJ_Database::pdo()->exec("DELETE FROM $sessions_table");
        DJ_Database::pdo()->exec("DELETE FROM $users_table");
        $wiped = true;
    } catch (\Throwable $e) {
        // Table might not exist yet or connection failed
    }
}

// Reset config.php
$resetConfig = [
    'configured' => false,
    'db' => [
        'driver'   => 'mysql',
        'host'     => 'localhost',
        'port'     => 3306,
        'name'     => '',
        'user'     => '',
        'pass'     => '',
        'charset'  => 'utf8mb4',
        'prefix'   => 'dj_'
    ],
    'admin' => [
        'email' => $config['admin']['email'] ?? 'admin@example.com'
    ],
    'brand' => $config['brand'] ?? [
        'name'             => 'DJ Jesse B',
        'tip_link'         => '',
        'standard_deposit' => 250,
        'deposit_percent'  => 20,
        'deposit_mode'     => 'higher',
        'deposit_policy'   => 'A non-refundable retainer reserves your event date once the agreement is signed and payment is verified. It is non-refundable, used for date reservation and administrative purposes, and credited toward your event total.'
    ],
    'security' => $config['security'] ?? [
        'rate_limit_seconds' => 15,
        'max_requests_hour'  => 30,
        'session_lifetime'   => 604800
    ],
    'stripe' => $config['stripe'] ?? [
        'enabled'         => false,
        'mode'            => 'test',
        'publishable_key' => '',
        'secret_key'      => '',
        'webhook_secret'  => ''
    ],
    'email' => $config['email'] ?? [
        'enabled'    => false,
        'provider'   => 'resend',
        'api_key'    => '',
        'from_name'  => 'DJ Jesse B',
        'from_email' => 'onboarding@resend.dev',
        'reply_to'   => 'djgourmet@me.com',
        'admin_copy' => false
    ]
];

$export = "<?php\n/**\n * DJ Live Request Desk & Event Manager - Active Configuration\n */\n\nreturn " . var_export($resetConfig, true) . ";\n";
file_put_contents($configFile, $export, LOCK_EX);
@chmod($configFile, 0666);

if (function_exists('opcache_invalidate')) {
    @opcache_invalidate($configFile, true);
}
if (function_exists('opcache_reset')) {
    @opcache_reset();
}
clearstatcache(true, $configFile);

// Expire cookies
if (!$isCli && !headers_sent()) {
    setcookie('dj_desk_session', '', ['expires' => time() - 3600, 'path' => '/']);
}

if ($isCli) {
    echo "✓ DJ-Desk configuration successfully reset to unconfigured state.\n";
    if ($wiped) {
        echo "✓ Database tables and demo data were wiped.\n";
    }
    echo "✓ OPcache and file stat cache were cleared.\n";
    echo "→ Open DJ-Desk in your browser to complete the Setup Wizard.\n";
    exit(0);
}

header('Location: ../#dashboard');
exit;
