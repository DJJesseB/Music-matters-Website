<?php
/**
 * DJ Live Request Desk & Event Manager
 * Standalone Dark-Mode Live Canvas & Command Center
 */

$configFile = __DIR__ . '/config.php';
clearstatcache(true, $configFile);
if (function_exists('opcache_invalidate') && file_exists($configFile)) {
    @opcache_invalidate($configFile, true);
}
$config = file_exists($configFile) ? require $configFile : [];

$brandName = $config['brand']['name'] ?? 'DJ Jesse B';
$standardDeposit = (float)($config['brand']['standard_deposit'] ?? 250);
$depositPercent = (float)($config['brand']['deposit_percent'] ?? 20);
$depositMode = $config['brand']['deposit_mode'] ?? 'higher';
$depositPolicy = $config['brand']['deposit_policy'] ?? 'A non-refundable retainer reserves your event date once the agreement is signed and payment is verified. It is non-refundable, used for date reservation and administrative purposes, and credited toward your event total.';
$tipLink = $config['brand']['tip_link'] ?? '';

// Dynamically calculate the relative API URL for any folder or subfolder
$baseDir = rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? '/'), '/\\');
$apiBase = ($baseDir === '' ? '' : $baseDir) . '/api/';

// Test if database is configured & connected
$isResetRequested = !empty($config['reset']) || !empty($config['reset_desk']) || (isset($config['configured']) && $config['configured'] === false);
$dbConfigured = false;
$dbMessage = '';
if (!$isResetRequested && !empty($config['configured'])) {
    try {
        require_once __DIR__ . '/api/Database.php';
        DJ_Database::init($config);
        $users_table = DJ_Database::get_table_name('users');
        $hasAdmin = ((int)DJ_Database::get_var("SELECT COUNT(*) FROM $users_table WHERE role = 'admin'") > 0);
        $dbConfigured = $hasAdmin;
        if (!$hasAdmin) {
            $dbMessage = 'Database connected, but no administrator account exists. Setup wizard required.';
        }
    } catch (\Throwable $e) {
        $dbMessage = $e->getMessage();
    }
}
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title><?php echo htmlspecialchars($brandName); ?> · Live Event Desk</title>
    <link rel="stylesheet" href="./style.css?v=216">
    <script>
        window.djDeskConfig = {
            apiBase: '<?php echo addslashes($apiBase); ?>',
            brandName: '<?php echo addslashes($brandName); ?>',
            standardDeposit: <?php echo json_encode($standardDeposit); ?>,
            depositPercent: <?php echo json_encode($depositPercent); ?>,
            depositMode: <?php echo json_encode($depositMode); ?>,
            depositPolicy: <?php echo json_encode($depositPolicy); ?>,
            tipLink: <?php echo json_encode($tipLink); ?>
        };
    </script>
    <script type="module" src="./app.js?v=216"></script>
<link rel="stylesheet" href="/back-to-top.css?v=2"></head>
<body>
    <aside>
        <a class="brand" href="#dashboard"><?php echo htmlspecialchars(strtoupper($brandName)); ?><span>EVENT MANAGER</span></a>
        <div class="desk-home-banner" style="margin: 16px 0 0;">
            <a href="../" class="button secondary" style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:10px 14px;font-size:12px;font-weight:700;text-decoration:none;background:#242c22;border:1px solid #64734e;color:#b6ff35;border-radius:8px;">← Return to Main Website</a>
        </div>
        <div class="nav-label">YOUR WORKSPACE</div>
        <nav>
            <a href="#dashboard">◈ &nbsp; Dashboard</a>
            <a href="#events">▦ &nbsp; Events</a>
            <a href="#new">＋ &nbsp; New booking</a>
            <a href="#requests">◇ &nbsp; Date requests</a>
            <a href="#music-admin">♫ &nbsp; Song requests</a>
            <a href="#social-media">▤ &nbsp; Social Media</a>
        </nav>
        <div class="local">
            <i></i> DJ BOOTH &amp; CLIENT HUB
            <small><?php echo $dbConfigured ? 'Connected &amp; Synced' : 'Database Setup Needed'; ?></small>
            <div class="desk-byline" style="font-size: 11px; color: #94a3b8; margin-top: 6px; letter-spacing: 0.02em;">DJ Jesse B - Standalone Web Edition</div>
        </div>
    </aside>
    <main>
        <header>
            <span>BUSINESS COMMAND CENTER</span>
            <div style="display:flex;align-items:center;gap:12px;">
                <a class="header-song-requests" href="#music-admin">♫ Song Requests</a>
                <span class="pill">Live Desk</span>
            </div>
        </header>
        <div id="notice" role="status">
            <?php if (!$dbConfigured): ?>
                <div class="card" style="margin-bottom: 20px; border-left: 4px solid #f59e0b; background: rgba(245, 158, 11, 0.08); padding: 16px;">
                    <h3 style="color: #f59e0b; margin-top: 0;">MySQL Database Configuration Required</h3>
                    <p style="margin-bottom: 8px;">Welcome to DJ Live Request Desk! To complete setup on your webhost:</p>
                    <ol style="margin-left: 20px; margin-bottom: 8px; line-height: 1.6;">
                        <li>In your hosting control panel (cPanel, etc.), create a MySQL database and user.</li>
                        <li>Open <code>config.php</code> in this folder and update <code>name</code>, <code>user</code>, and <code>pass</code> under the <code>db</code> section.</li>
                        <li>Refresh this page. All database tables and demo events will automatically initialize!</li>
                    </ol>
                    <small style="color: #94a3b8;">Database status: <?php echo htmlspecialchars($dbMessage); ?></small>
                </div>
            <?php endif; ?>
        </div>
        <div id="app"></div>
    </main>
<script src="/back-to-top.js?v=2" defer></script></body>
</html>
