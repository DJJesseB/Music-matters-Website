<?php
/**
 * DJ Live Request Desk & Event Manager
 * REST API Front Controller & Router (Standalone PHP)
 */

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
// Never reuse an authenticated JSON response after a session changes.
header('Cache-Control: no-store, no-cache, must-revalidate, private');
header('Pragma: no-cache');

// Global exception handler ensuring all errors produce valid JSON
set_exception_handler(function (\Throwable $e) {
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode(['error' => $e->getMessage()]);
    exit;
});

// Fatal error handler
register_shutdown_function(function () {
    $err = error_get_last();
    if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode(['error' => 'Fatal Error: ' . $err['message'] . ' in ' . basename($err['file']) . ':' . $err['line']]);
    }
});

// Load configurations and classes
$configFile = dirname(__DIR__) . '/config.php';
clearstatcache(true, $configFile);
if (function_exists('opcache_invalidate') && file_exists($configFile)) {
    @opcache_invalidate($configFile, true);
}
$config = file_exists($configFile) ? require $configFile : [];

require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/Auth.php';
require_once __DIR__ . '/QRCode.php';
require_once __DIR__ . '/Mailer.php';

// Initialize transactional email service
$mailConfig = $config['email'] ?? [];
$mailConfig['admin_email'] = $config['admin']['email'] ?? 'djgourmet@me.com';
$mailConfig['from_name'] = $mailConfig['from_name'] ?? ($config['brand']['name'] ?? 'DJ Jesse B');
DJ_Mailer::init($mailConfig);

// Check for explicit reset flag (e.g. 'reset' => true or 'configured' => false)
$isResetRequested = !empty($config['reset']) || !empty($config['reset_desk']) || (isset($config['configured']) && $config['configured'] === false);

// Try initializing DB if configured and reset not requested
$dbConnected = false;
$dbError = '';
if (!$isResetRequested && !empty($config['configured'])) {
    try {
        DJ_Database::init($config);
        $dbConnected = true;
    } catch (\Throwable $e) {
        $dbError = $e->getMessage();
    }
}


function save_config_file(array $cfg): array {
    $configFile = dirname(__DIR__) . '/config.php';
    $dir = dirname($configFile);
    if (file_exists($configFile) && !is_writable($configFile)) {
        @chmod($configFile, 0666);
    }
    if (!is_writable($dir) && !is_writable($configFile)) {
        return ['ok' => false, 'error' => "Cannot write to config.php. Please check write permissions on folder: $dir"];
    }
    $export = "<?php\n/**\n * DJ Live Request Desk & Event Manager - Active Configuration\n */\n\nreturn " . var_export($cfg, true) . ";\n";
    $bytes = @file_put_contents($configFile, $export, LOCK_EX);
    if ($bytes === false) {
        $lastErr = error_get_last();
        return ['ok' => false, 'error' => "Failed to write config.php: " . ($lastErr['message'] ?? 'Permission denied')];
    }
    @chmod($configFile, 0666);
    if (function_exists('opcache_invalidate')) {
        @opcache_invalidate($configFile, true);
    }
    clearstatcache(true, $configFile);
    return ['ok' => true];
}

function json_response($data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function json_error(string $msg, int $code = 400, ?string $field = null): void {
    http_response_code($code);
    $res = ['error' => $msg];
    if ($field !== null) {
        $res['field'] = $field;
    }
    echo json_encode($res);
    exit;
}

// Check database connection before executing database routes
function require_db(): void {
    global $dbConnected, $dbError;
    if (!$dbConnected) {
        json_error("Database connection failed. Please check config.php: $dbError", 503);
    }
}

// Auth helpers
function current_session(): ?array {
    return DJ_Auth::get_current_session();
}

function require_auth(): array {
    $session = current_session();
    if (!$session) {
        json_error('Authentication required', 401);
    }
    return $session;
}

function require_admin(): array {
    $session = require_auth();
    if (($session['user']['role'] ?? '') !== 'admin') {
        json_error('Admin permission required', 403);
    }
    return $session;
}

// Method & Route parsing
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Support rewrite, PATH_INFO, and ?route=
$path = '';
if (!empty($_GET['route'])) {
    $path = trim($_GET['route'], '/');
} elseif (!empty($_SERVER['PATH_INFO'])) {
    $path = trim($_SERVER['PATH_INFO'], '/');
} else {
    $scriptDir = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\');
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
    if ($scriptDir !== '' && strpos($uri, $scriptDir) === 0) {
        $path = substr($uri, strlen($scriptDir));
    } else {
        $path = $uri;
    }
    $path = preg_replace('#^/index\.php#', '', $path);
    $path = trim($path, '/');
}

$input = json_decode(file_get_contents('php://input'), true) ?: [];

// Global host & protocol helper for URLs
$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' || (($_SERVER['SERVER_PORT'] ?? '') == 443)) ? 'https://' : 'http://';
$host = $_SERVER['HTTP_HOST'] ?? 'localhost';
$appRoot = rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/\\');
$baseUrl = $protocol . $host . ($appRoot ? $appRoot : '');

// Private business ledger; created lazily so existing installations migrate safely.
if (strpos($path, 'admin/finance') === 0) {
    require_db();
    require_admin();
    $ledger = DJ_Database::get_table_name('finance_items');
    DJ_Database::pdo()->exec("CREATE TABLE IF NOT EXISTS $ledger (
        id varchar(64) NOT NULL PRIMARY KEY,
        kind varchar(16) NOT NULL,
        title varchar(255) NOT NULL,
        amount decimal(12,2) NOT NULL DEFAULT 0,
        category varchar(100) NOT NULL DEFAULT '',
        item_date date NOT NULL,
        frequency varchar(16) NOT NULL DEFAULT 'once',
        end_date date NULL,
        status varchar(32) NOT NULL DEFAULT '',
        notes text NULL,
        created_at datetime NOT NULL
    )");
    if ($path === 'admin/finance' && $method === 'GET') {
        json_response(DJ_Database::get_results("SELECT * FROM $ledger ORDER BY item_date DESC, created_at DESC"));
    }
    $editingFinance = preg_match('#^admin/finance/([a-f0-9-]+)$#', $path, $financeMatch) && $method === 'PUT';
    if (($path === 'admin/finance' && $method === 'POST') || $editingFinance) {
        if ($editingFinance && !DJ_Database::get_row("SELECT id FROM $ledger WHERE id = ?", [$financeMatch[1]])) json_error('Entry not found', 404);
        $kind = (string)($input['kind'] ?? '');
        $frequency = (string)($input['frequency'] ?? 'once');
        $title = trim((string)($input['title'] ?? ''));
        $amount = $input['amount'] ?? null;
        $dateValue = (string)($input['item_date'] ?? '');
        $endDate = (string)($input['end_date'] ?? '');
        if (!in_array($kind, ['income','expense','wish'], true) || !in_array($frequency, ['once','monthly','yearly'], true)) json_error('Invalid entry type or frequency');
        if ($kind !== 'expense') $frequency = 'once';
        if ($title === '' || mb_strlen($title) > 255) json_error('Enter a description (255 characters maximum)', 400, 'title');
        if (!is_numeric($amount) || !is_finite((float)$amount) || (float)$amount < 0 || (float)$amount > 99999999) json_error('Enter a valid positive amount', 400, 'amount');
        $validDate = static function($value) { $d = DateTimeImmutable::createFromFormat('!Y-m-d', $value); return $d && $d->format('Y-m-d') === $value; };
        if (!$validDate($dateValue) || ($endDate !== '' && (!$validDate($endDate) || $endDate < $dateValue))) json_error('Enter a valid date range', 400, 'item_date');
        $status = (string)($input['status'] ?? '');
        if ($kind === 'wish' && !in_array($status, ['Considering','Saving','Ready to buy','Purchased'], true)) json_error('Invalid wish-list status');
        $data = ['kind'=>$kind,'title'=>$title,'amount'=>round((float)$amount,2),'category'=>substr(trim((string)($input['category'] ?? '')),0,100),'item_date'=>$dateValue,'frequency'=>$frequency,'end_date'=>$endDate ?: null,'status'=>$kind === 'wish' ? $status : '', 'notes'=>substr(trim((string)($input['notes'] ?? '')),0,2000)];
        if ($editingFinance) {
            DJ_Database::update($ledger, $data, ['id'=>$financeMatch[1]]);
            json_response(['id'=>$financeMatch[1], 'ok'=>true]);
        }
        $id = DJ_Database::uuid();
        DJ_Database::insert($ledger, ['id'=>$id] + $data + ['created_at'=>DJ_Database::now()]);
        json_response(['id'=>$id], 201);
    }
    if (preg_match('#^admin/finance/([a-f0-9-]+)$#', $path, $financeMatch) && $method === 'DELETE') {
        DJ_Database::delete($ledger, ['id'=>$financeMatch[1]]);
        json_response(['ok'=>true]);
    }
    json_error('Unsupported finance request', 405);
}

// -------------------------------------------------------------
// 1. SETUP & CONFIGURATION ROUTES
// -------------------------------------------------------------

if ($path === 'setup/status' && $method === 'GET') {
    $availableDrivers = PDO::getAvailableDrivers();
    
    $hasAdminUser = false;
    if ($dbConnected) {
        try {
            $users_table = DJ_Database::get_table_name('users');
            $hasAdminUser = ((int)DJ_Database::get_var("SELECT COUNT(*) FROM $users_table WHERE role = 'admin'") > 0);
        } catch (\Throwable $e) {
            $hasAdminUser = false;
        }
    }

    $configured = !$isResetRequested && !empty($config['configured']) && $dbConnected && $hasAdminUser;
    $configFile = dirname(__DIR__) . '/config.php';
    $writable = is_writable($configFile) || (!file_exists($configFile) && is_writable(dirname($configFile)));
    $db = $config['db'] ?? [
        'driver'  => in_array('mysql', $availableDrivers) ? 'mysql' : 'sqlite',
        'host'    => 'localhost',
        'port'    => 3306,
        'name'    => '',
        'user'    => '',
        'pass'    => '',
        'prefix'  => 'dj_'
    ];
    $safeDb = $db;
    unset($safeDb['pass']);
    $safeDb['hasPassword'] = !empty($db['pass']);

    json_response([
        'configured'       => $configured,
        'dbConnected'      => $dbConnected,
        'dbError'          => $dbError,
        'availableDrivers' => $availableDrivers,
        'db'               => $safeDb,
        'brand'            => $config['brand'] ?? [
            'name'             => 'DJ Jesse B',
            'tip_link'         => '',
            'standard_deposit' => 250,
            'deposit_percent'  => 20,
            'deposit_mode'     => 'higher',
            'deposit_policy'   => 'A non-refundable retainer reserves your event date once the agreement is signed and payment is verified. It is non-refundable, used for date reservation and administrative purposes, and credited toward your event total.'
        ],
        'admin'            => [
            'email' => $config['admin']['email'] ?? 'admin@example.com'
        ],
        'writable'         => $writable
    ]);
}

if ($path === 'setup/test-db' && $method === 'POST') {
    $dbData = $input['db'] ?? [];
    if (empty($dbData['pass']) && !empty($config['db']['pass']) && ($dbData['user'] ?? '') === ($config['db']['user'] ?? '')) {
        $dbData['pass'] = $config['db']['pass'];
    }
    $res = DJ_Database::test_connection($dbData);
    json_response($res);
}

if ($path === 'setup/save' && $method === 'POST') {
    try {
        $hasAdminUser = false;
        if ($dbConnected) {
            try {
                $users_table = DJ_Database::get_table_name('users');
                $hasAdminUser = ((int)DJ_Database::get_var("SELECT COUNT(*) FROM $users_table WHERE role = 'admin'") > 0);
            } catch (\Throwable $e) {
                $hasAdminUser = false;
            }
        }
        $isConfigured = !$isResetRequested && !empty($config['configured']) && $dbConnected && $hasAdminUser;
        if ($isConfigured) {
            require_admin();
        }

        $db = $input['db'] ?? [];
        if (empty($db['driver'])) {
            $db['driver'] = 'mysql';
        }
        if (empty($db['pass']) && !empty($config['db']['pass'])) {
            $db['pass'] = $config['db']['pass'];
        }
        $test = DJ_Database::test_connection($db);
        if (!$test['ok']) {
            json_error($test['error'] ?? 'Database connection test failed');
        }

        $workingHost = $test['workingHost'] ?? ($db['host'] ?? 'localhost');

        $adminEmail = strtolower(trim($input['admin']['email'] ?? ($config['admin']['email'] ?? 'admin@example.com')));
        $adminPassword = trim($input['admin']['password'] ?? '');
        if (!$isConfigured && empty($adminPassword)) {
            json_error('Admin password is required during initial setup');
        }

        $brand = [
            'name'             => trim($input['brand']['name'] ?? ($config['brand']['name'] ?? 'DJ Jesse B')),
            'tip_link'         => trim($input['brand']['tip_link'] ?? ($config['brand']['tip_link'] ?? '')),
            'standard_deposit' => (float)($input['brand']['standard_deposit'] ?? ($config['brand']['standard_deposit'] ?? 250)),
            'deposit_percent'  => (float)($input['brand']['deposit_percent'] ?? ($config['brand']['deposit_percent'] ?? 20)),
            'deposit_mode'     => $input['brand']['deposit_mode'] ?? ($config['brand']['deposit_mode'] ?? 'higher'),
            'deposit_policy'   => $input['brand']['deposit_policy'] ?? ($config['brand']['deposit_policy'] ?? 'A non-refundable retainer reserves your event date once the agreement is signed and payment is verified. It is non-refundable, used for date reservation and administrative purposes, and credited toward your event total.')
        ];

        $security = $config['security'] ?? [
            'rate_limit_seconds' => 15,
            'max_requests_hour'  => 30,
            'session_lifetime'   => 604800
        ];

        $stripe = $input['stripe'] ?? ($config['stripe'] ?? [
            'enabled'         => false,
            'mode'            => 'test',
            'publishable_key' => '',
            'secret_key'      => '',
            'webhook_secret'  => ''
        ]);

        $newConfig = [
            'configured' => true,
            'db' => [
                'driver'   => $db['driver'],
                'host'     => $workingHost,
                'port'     => (int)($db['port'] ?? 3306),
                'name'     => $db['name'] ?? '',
                'user'     => $db['user'] ?? '',
                'pass'     => $db['pass'] ?? '',
                'charset'  => $db['charset'] ?? 'utf8mb4',
                'prefix'   => $db['prefix'] ?? 'dj_'
            ],
            'admin' => [
                'email' => $adminEmail
            ],
            'brand' => $brand,
            'security' => $security,
            'stripe' => $stripe
        ];

        $saveRes = save_config_file($newConfig);
        if (!$saveRes['ok']) {
            json_error($saveRes['error'], 500);
        }

        // Initialize database with new configuration
        DJ_Database::reset();
        DJ_Database::init($newConfig);
        DJ_Database::create_tables();

        // Create or update admin user
        $users_table = DJ_Database::get_table_name('users');
        $existingAdmin = DJ_Database::get_row("SELECT * FROM $users_table WHERE email = ? OR role = 'admin' LIMIT 1", [$adminEmail]);
        if (!empty($adminPassword)) {
            $hashedPassword = DJ_Auth::hash_password($adminPassword);
            if ($existingAdmin) {
                DJ_Database::update($users_table, [
                    'email'    => $adminEmail,
                    'password' => $hashedPassword,
                    'role'     => 'admin'
                ], ['id' => $existingAdmin['id']]);
            } else {
                DJ_Database::insert($users_table, [
                    'id'       => DJ_Database::uuid(),
                    'email'    => $adminEmail,
                    'password' => $hashedPassword,
                    'role'     => 'admin'
                ]);
            }
        } elseif ($existingAdmin && $adminEmail !== $existingAdmin['email']) {
            DJ_Database::update($users_table, ['email' => $adminEmail], ['id' => $existingAdmin['id']]);
        }

        // Seed demo data only if requested and initial installation (never wipe an already configured desk)
        if (!empty($input['seed_demo']) && !$isConfigured) {
            DJ_Database::seed_initial_data(false);
        }

        // Auto-login
        $session = null;
        if (!empty($adminPassword)) {
            try {
                $session = DJ_Auth::login($adminEmail, $adminPassword);
            } catch (\Throwable $e) {}
        }
        if (!$session) {
            $session = DJ_Auth::get_current_session();
        }

        json_response([
            'ok'      => true,
            'message' => 'Configuration saved successfully.',
            'session' => $session
        ]);
    } catch (\Throwable $e) {
        json_error('Setup failed: ' . $e->getMessage(), 500);
    }
}

if ($path === 'admin/settings' && $method === 'GET') {
    require_db();
    $session = require_admin();
    $safeDb = $config['db'] ?? [];
    unset($safeDb['pass']);
    $safeDb['hasPassword'] = !empty($config['db']['pass']);

    $users_table = DJ_Database::get_table_name('users');
    $adminUsers = DJ_Database::get_results("SELECT id, email, role FROM $users_table WHERE role = 'admin' ORDER BY email ASC");

    json_response([
        'db'               => $safeDb,
        'availableDrivers' => PDO::getAvailableDrivers(),
        'admin'            => ['email' => $session['user']['email'] ?? ($config['admin']['email'] ?? 'admin@example.com')],
        'adminUsers'       => $adminUsers,
        'currentAdminId'   => $session['user']['id'] ?? '',
        'brand'            => $config['brand'] ?? [],
        'security'         => $config['security'] ?? [],
        'stripe'           => [
            'enabled'            => !empty($config['stripe']['enabled']),
            'mode'               => $config['stripe']['mode'] ?? 'test',
            'publishable_key'    => $config['stripe']['publishable_key'] ?? '',
            'has_secret_key'     => !empty($config['stripe']['secret_key']),
            'has_webhook_secret' => !empty($config['stripe']['webhook_secret'])
        ],
        'email'            => [
            'enabled'            => !empty($config['email']['enabled']),
            'provider'           => $config['email']['provider'] ?? 'resend',
            'has_api_key'        => !empty($config['email']['api_key']),
            'api_key'            => !empty($config['email']['api_key']) ? (substr($config['email']['api_key'], 0, min(7, strlen($config['email']['api_key']))) . '••••••••') : '',
            'from_name'          => $config['email']['from_name'] ?? ($config['brand']['name'] ?? 'DJ Jesse B'),
            'from_email'         => $config['email']['from_email'] ?? 'onboarding@resend.dev',
            'reply_to'           => $config['email']['reply_to'] ?? ($config['admin']['email'] ?? 'djgourmet@me.com'),
            'admin_copy'         => !empty($config['email']['admin_copy'])
        ]
    ]);
}

if ($path === 'admin/settings' && $method === 'PUT') {
    require_db();
    $session = require_admin();

    $newConfig = $config;
    if (isset($input['brand'])) {
        $newConfig['brand'] = array_merge($newConfig['brand'] ?? [], [
            'name'             => trim($input['brand']['name'] ?? ''),
            'tip_link'         => trim($input['brand']['tip_link'] ?? ''),
            'standard_deposit' => (float)($input['brand']['standard_deposit'] ?? 250),
            'deposit_percent'  => (float)($input['brand']['deposit_percent'] ?? 20),
            'deposit_mode'     => $input['brand']['deposit_mode'] ?? 'higher',
            'deposit_policy'   => $input['brand']['deposit_policy'] ?? ''
        ]);
    }
    if (isset($input['security'])) {
        $newConfig['security'] = array_merge($newConfig['security'] ?? [], [
            'rate_limit_seconds' => (int)($input['security']['rate_limit_seconds'] ?? 15),
            'max_requests_hour'  => (int)($input['security']['max_requests_hour'] ?? 30),
            'session_lifetime'   => (int)($input['security']['session_lifetime'] ?? 604800)
        ]);
    }
    if (isset($input['stripe'])) {
        $existingStripe = $newConfig['stripe'] ?? [];
        $newStripe = [
            'enabled'         => !empty($input['stripe']['enabled']),
            'mode'            => ($input['stripe']['mode'] ?? '') === 'live' ? 'live' : 'test',
            'publishable_key' => trim($input['stripe']['publishable_key'] ?? ''),
            'secret_key'      => !empty($input['stripe']['secret_key']) ? trim($input['stripe']['secret_key']) : ($existingStripe['secret_key'] ?? ''),
            'webhook_secret'  => !empty($input['stripe']['webhook_secret']) ? trim($input['stripe']['webhook_secret']) : ($existingStripe['webhook_secret'] ?? '')
        ];
        $newConfig['stripe'] = $newStripe;
    }
    if (isset($input['email'])) {
        $existingEmail = $newConfig['email'] ?? [];
        $rawKey = trim((string)($input['email']['api_key'] ?? ''));
        $apiKey = ($rawKey === '' || strpos($rawKey, '••••') !== false)
            ? ($existingEmail['api_key'] ?? '')
            : $rawKey;

        $newConfig['email'] = [
            'enabled'    => !empty($input['email']['enabled']),
            'provider'   => 'resend',
            'api_key'    => $apiKey,
            'from_name'  => trim((string)($input['email']['from_name'] ?? ($newConfig['brand']['name'] ?? 'DJ Jesse B'))),
            'from_email' => trim((string)($input['email']['from_email'] ?? 'onboarding@resend.dev')),
            'reply_to'   => trim((string)($input['email']['reply_to'] ?? ($newConfig['admin']['email'] ?? 'djgourmet@me.com'))),
            'admin_copy' => !empty($input['email']['admin_copy'])
        ];

        // Re-initialize mailer in active request
        $activeMailCfg = $newConfig['email'];
        $activeMailCfg['admin_email'] = $newConfig['admin']['email'] ?? 'djgourmet@me.com';
        DJ_Mailer::init($activeMailCfg);
    }
    if (!empty($input['admin']['email'])) {
        $newEmail = strtolower(trim($input['admin']['email']));
        $users_table = DJ_Database::get_table_name('users');
        $adminId = $session['user']['id'];
        $existing = DJ_Database::get_row("SELECT id FROM $users_table WHERE email = ? AND id != ?", [$newEmail, $adminId]);
        if ($existing) {
            json_error('Another user already exists with that email address.', 409, 'admin_email');
        }
        DJ_Database::update($users_table, ['email' => $newEmail], ['id' => $adminId]);
        if (($config['admin']['email'] ?? '') === $session['user']['email']) {
            $newConfig['admin']['email'] = $newEmail;
        }
    }
    if (!empty($input['admin']['password'])) {
        $users_table = DJ_Database::get_table_name('users');
        $adminId = $session['user']['id'];
        $hashed = DJ_Auth::hash_password($input['admin']['password']);
        DJ_Database::update($users_table, ['password' => $hashed], ['id' => $adminId]);
    }

    $saveRes = save_config_file($newConfig);
    if (!$saveRes['ok']) {
        json_error($saveRes['error'] ?? 'Unable to save settings to config.php', 500);
    }

    json_response(['ok' => true, 'message' => 'Settings saved successfully.']);
}

if ($path === 'admin/email/test' && $method === 'POST') {
    require_db();
    $session = require_admin();

    $targetEmail = trim((string)($input['email'] ?? ($session['user']['email'] ?? '')));
    if (empty($targetEmail) || !filter_var($targetEmail, FILTER_VALIDATE_EMAIL)) {
        json_error('Please specify a valid destination email address for the test.', 400);
    }

    // Support testing unsaved API key directly from form
    $rawKey = trim((string)($input['api_key'] ?? ''));
    if (!empty($rawKey) && strpos($rawKey, '••••') === false) {
        $tempEmailCfg = $config['email'] ?? [];
        $tempEmailCfg['api_key'] = $rawKey;
        if (!empty($input['from_name'])) $tempEmailCfg['from_name'] = trim((string)$input['from_name']);
        if (!empty($input['from_email'])) $tempEmailCfg['from_email'] = trim((string)$input['from_email']);
        if (!empty($input['reply_to'])) $tempEmailCfg['reply_to'] = trim((string)$input['reply_to']);
        $tempEmailCfg['enabled'] = true;
        DJ_Mailer::init(array_merge($tempEmailCfg, ['admin_email' => $session['user']['email'] ?? '']));
    }

    $res = DJ_Mailer::testConnection($targetEmail);
    if (!$res['ok']) {
        json_error($res['error'] ?? 'Email delivery test failed.', 400);
    }

    json_response([
        'ok'      => true,
        'message' => "Test email successfully sent to {$targetEmail} via Resend!",
        'id'      => $res['id'] ?? null
    ]);
}


if ($path === 'admin/users' && $method === 'GET') {
    require_db();
    $session = require_admin();
    $users_table = DJ_Database::get_table_name('users');
    $adminUsers = DJ_Database::get_results("SELECT id, email, role FROM $users_table WHERE role = 'admin' ORDER BY email ASC");
    json_response([
        'users'         => $adminUsers,
        'currentUserId' => $session['user']['id'] ?? ''
    ]);
}

if ($path === 'admin/users' && $method === 'POST') {
    require_db();
    require_admin();
    $users_table = DJ_Database::get_table_name('users');
    $email = strtolower(trim($input['email'] ?? ''));
    $password = trim($input['password'] ?? '');

    if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_error('A valid email address is required.', 400, 'email');
    }
    if (strlen($password) < 8) {
        json_error('Password must be at least 8 characters long.', 400, 'password');
    }

    $existing = DJ_Database::get_row("SELECT id FROM $users_table WHERE email = ?", [$email]);
    if ($existing) {
        json_error('A user with this email address already exists.', 409, 'email');
    }

    $id = DJ_Database::uuid();
    $hashed = DJ_Auth::hash_password($password);
    DJ_Database::insert($users_table, [
        'id'       => $id,
        'email'    => $email,
        'password' => $hashed,
        'role'     => 'admin'
    ]);

    json_response([
        'ok'      => true,
        'message' => "Administrator account for $email created successfully.",
        'user'    => [
            'id'    => $id,
            'email' => $email,
            'role'  => 'admin'
        ]
    ]);
}

if (preg_match('#^admin/users/([a-f0-9-]+)/reset-password$#', $path, $m) && $method === 'POST') {
    require_db();
    $session = require_admin();
    $targetId = $m[1];

    // Must only be triggered by ANOTHER admin
    if ($targetId === $session['user']['id']) {
        json_error('Password reset for this account must be triggered by another administrator. To change your own password, use the Change Your Password form.', 403);
    }

    $users_table = DJ_Database::get_table_name('users');
    $target = DJ_Database::get_row("SELECT * FROM $users_table WHERE id = ? AND role = 'admin'", [$targetId]);
    if (!$target) {
        json_error('Administrator user not found.', 404);
    }

    $newPassword = trim($input['password'] ?? '');
    if (empty($newPassword)) {
        // Automatically generate a secure 12-character temporary password
        $chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
        $newPassword = '';
        $max = strlen($chars) - 1;
        for ($i = 0; $i < 12; $i++) {
            $newPassword .= $chars[random_int(0, $max)];
        }
    } elseif (strlen($newPassword) < 8) {
        json_error('Temporary password must be at least 8 characters long.', 400, 'password');
    }

    $hashed = DJ_Auth::hash_password($newPassword);
    DJ_Database::update($users_table, ['password' => $hashed], ['id' => $targetId]);

    // Sign the target user out of all active sessions
    $sessions_table = DJ_Database::get_table_name('sessions');
    DJ_Database::delete($sessions_table, ['user_id' => $targetId]);

    // Dispatch email notification to the administrator if mailer is active
    $emailSent = false;
    if (DJ_Mailer::isConfigured()) {
        $mailRes = DJ_Mailer::sendAdminPasswordReset($target['email'], $newPassword);
        $emailSent = !empty($mailRes['ok']);
    }

    json_response([
        'ok'                => true,
        'message'           => "Password successfully reset for {$target['email']}." . ($emailSent ? " Notification emailed to {$target['email']}." : ""),
        'email'             => $target['email'],
        'temporaryPassword' => $newPassword,
        'emailSent'         => $emailSent
    ]);
}


if (preg_match('#^admin/users/([a-f0-9-]+)$#', $path, $m)) {
    require_db();
    $session = require_admin();
    $targetId = $m[1];
    $users_table = DJ_Database::get_table_name('users');
    $target = DJ_Database::get_row("SELECT * FROM $users_table WHERE id = ? AND role = 'admin'", [$targetId]);
    if (!$target) {
        json_error('Administrator user not found.', 404);
    }

    if ($method === 'PUT') {
        $updates = [];
        $email = isset($input['email']) ? strtolower(trim($input['email'])) : null;
        $password = isset($input['password']) ? trim($input['password']) : null;

        if ($email !== null && $email !== $target['email']) {
            if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                json_error('A valid email address is required.', 400, 'email');
            }
            $existing = DJ_Database::get_row("SELECT id FROM $users_table WHERE email = ? AND id != ?", [$email, $targetId]);
            if ($existing) {
                json_error('Another user with this email address already exists.', 409, 'email');
            }
            $updates['email'] = $email;
        }

        if ($password !== null && $password !== '') {
            if (strlen($password) < 8) {
                json_error('Password must be at least 8 characters long.', 400, 'password');
            }
            $updates['password'] = DJ_Auth::hash_password($password);
        }

        if (!empty($updates)) {
            DJ_Database::update($users_table, $updates, ['id' => $targetId]);
            if (isset($updates['email']) && ($config['admin']['email'] ?? '') === $target['email']) {
                $config['admin']['email'] = $updates['email'];
                save_config_file($config);
            }
        }

        json_response([
            'ok'      => true,
            'message' => 'Administrator account updated successfully.',
            'user'    => [
                'id'    => $targetId,
                'email' => $updates['email'] ?? $target['email'],
                'role'  => 'admin'
            ]
        ]);
    }

    if ($method === 'DELETE') {
        if ($targetId === $session['user']['id']) {
            json_error('You cannot delete your own administrator account while logged in.', 400);
        }

        $totalAdmins = (int)DJ_Database::get_var("SELECT COUNT(*) FROM $users_table WHERE role = 'admin'");
        if ($totalAdmins <= 1) {
            json_error('Cannot delete the only remaining administrator account.', 400);
        }

        // Delete user sessions
        $sessions_table = DJ_Database::get_table_name('sessions');
        DJ_Database::delete($sessions_table, ['user_id' => $targetId]);

        // Delete user
        DJ_Database::delete($users_table, ['id' => $targetId]);

        // Update default email in config if needed
        if (($config['admin']['email'] ?? '') === $target['email']) {
            $anotherAdmin = DJ_Database::get_row("SELECT email FROM $users_table WHERE role = 'admin' LIMIT 1");
            if ($anotherAdmin) {
                $config['admin']['email'] = $anotherAdmin['email'];
                save_config_file($config);
            }
        }

        json_response([
            'ok'      => true,
            'message' => 'Administrator account removed successfully.'
        ]);
    }
}

// -------------------------------------------------------------
// 2. PUBLIC & AUTH ROUTES
// -------------------------------------------------------------

if ($path === 'options' && $method === 'GET') {
    $brand = $config['brand'] ?? [];
    json_response([
        'status' => ['Inquiry', 'Tentative', 'Confirmed', 'Completed', 'Canceled', 'Archived'],
        'type' => ['Wedding', 'School dance', 'Private party', 'Corporate', 'Other'],
        'plannerStatus' => ['Not started', 'In progress', 'Submitted for review', 'Ready'],
        'musicStatus' => ['Not started', 'In progress', 'Ready'],
        'contractStatus' => ['Not sent', 'Sent', 'Signed'],
        'standardDeposit' => (float)($brand['standard_deposit'] ?? 250),
        'depositPercent' => (float)($brand['deposit_percent'] ?? 20),
        'depositMode' => $brand['deposit_mode'] ?? 'higher',
        'depositPolicy' => $brand['deposit_policy'] ?? 'A non-refundable retainer reserves your event date once the agreement is signed and payment is verified. It is non-refundable, used for date reservation and administrative purposes, and credited toward your event total.'
    ]);
}

if ($path === 'auth/me' && $method === 'GET') {
    if (!$dbConnected) {
        json_response([
            'user' => null,
            'configured' => !empty($config['configured']),
            'dbConnected' => false,
            'dbError' => $dbError
        ]);
    }
    $session = current_session();
    json_response($session ? [
        'user' => ['email' => $session['user']['email'], 'role' => $session['user']['role']],
        'csrf' => $session['csrf'],
        'configured' => true,
        'dbConnected' => true
    ] : [
        'user' => null,
        'configured' => true,
        'dbConnected' => true
    ]);
}

if ($path === 'auth/login' && $method === 'POST') {
    require_db();
    $email = $input['email'] ?? '';
    $password = $input['password'] ?? '';
    try {
        $res = DJ_Auth::login($email, $password);
        json_response($res);
    } catch (\Throwable $e) {
        json_error($e->getMessage(), 401);
    }
}

if ($path === 'auth/logout' && $method === 'POST') {
    require_db();
    DJ_Auth::logout();
    json_response(['ok' => true]);
}

if ($path === 'auth/accept' && $method === 'POST') {
    require_db();
    $token = $input['token'] ?? '';
    $password = $input['password'] ?? '';
    $name = $input['name'] ?? '';
    try {
        $res = DJ_Auth::accept_invitation($token, $password, $name);
        json_response($res);
    } catch (\Throwable $e) {
        json_error($e->getMessage(), 400);
    }
}

// -------------------------------------------------------------
// 2. EVENTS CRUD
// -------------------------------------------------------------

if ($path === 'events' && $method === 'GET') {
    require_db();
    require_auth();
    json_response(DJ_Database::get_all_events());
}

if ($path === 'events' && $method === 'POST') {
    require_db();
    require_admin();
    $saved = DJ_Database::save_event($input);
    if (isset($saved['error'])) {
        json_error($saved['error'], $saved['code'] ?? 400);
    }
    json_response($saved, 201);
}

if (preg_match('#^events/([a-f0-9-]+)$#', $path, $m)) {
    require_db();
    $id = $m[1];
    if ($method === 'GET') {
        require_auth();
        $event = DJ_Database::get_event($id);
        if (!$event) json_error('Event not found', 404);
        json_response($event);
    } elseif ($method === 'PUT') {
        require_admin();
        $saved = DJ_Database::save_event($input, $id);
        if (isset($saved['error'])) {
            json_error($saved['error'], $saved['code'] ?? 400);
        }
        json_response($saved);
    }
}

if ($path === 'portal/events' && $method === 'GET') {
    require_db();
    $session = require_auth();
    $userId = $session['user']['id'];
    $role = $session['user']['role'];
    if ($role === 'admin') {
        json_response(DJ_Database::get_all_events());
    } else {
        $memberships = DJ_Database::get_table_name('memberships');
        $contract_memberships = DJ_Database::get_table_name('contract_memberships');
        $events = DJ_Database::get_table_name('events');
        $clients = DJ_Database::get_table_name('clients');
        $email = $session['user']['email'];

        $eIds = DJ_Database::get_col(
            "SELECT event_id FROM $memberships WHERE user_id = ?
             UNION
             SELECT event_id FROM $contract_memberships WHERE user_id = ?
             UNION
             SELECT e.id FROM $events e JOIN $clients c ON c.id = e.client_id WHERE c.email = ?",
            [$userId, $userId, $email]
        );
        $results = [];
        foreach ($eIds as $eid) {
            $ev = DJ_Database::get_event($eid);
            if ($ev) $results[] = $ev;
        }
        usort($results, fn($a, $b) => strcmp($a['date'] ?? '', $b['date'] ?? ''));
        json_response($results);
    }
}

// -------------------------------------------------------------
// 3. EVENT PLANNING & ACCESS
// -------------------------------------------------------------

if (preg_match('#^(admin|portal)/events/([a-f0-9-]+)/plan$#', $path, $m)) {
    require_db();
    require_auth();
    $id = $m[2];
    $event = DJ_Database::get_event($id);
    if (!$event) json_error('Event not found', 404);

    $plans_table = DJ_Database::get_table_name('portal_plans');

    if ($method === 'GET') {
        $row = DJ_Database::get_row("SELECT * FROM $plans_table WHERE event_id = ?", [$id]);
        $plan = $row ? json_decode($row['body'], true) : [
            'answers' => (object)[],
            'mustPlay' => '',
            'doNotPlay' => '',
            'playlist' => '',
            'timeline' => [],
            'submitted' => false,
            'version' => 0
        ];
        $plan['version'] = $row ? (int)$row['version'] : 0;

        // Fetch music requests for event
        $reqs_table = DJ_Database::get_table_name('music_requests');
        $blocks_table = DJ_Database::get_table_name('music_request_blocks');
        $reqRows = DJ_Database::get_results(
            "SELECT r.*, 
                    EXISTS(SELECT 1 FROM $blocks_table b WHERE b.event_id = r.event_id AND b.device_hash = r.device_hash AND b.blocked = 1) as requesterBlocked
             FROM $reqs_table r 
             WHERE r.event_id = ? 
             ORDER BY 
                CASE r.status WHEN 'Approved' THEN 0 WHEN 'Pending' THEN 1 WHEN 'Played' THEN 2 ELSE 3 END,
                r.created_at ASC",
            [$id]
        );
        $musicRequests = [];
        foreach ($reqRows as $r) {
            $musicRequests[] = [
                'id' => $r['id'],
                'eventId' => $r['event_id'],
                'title' => $r['title'],
                'artist' => $r['artist'],
                'status' => $r['status'],
                'version' => (int)$r['version'],
                'createdAt' => $r['created_at'],
                'updatedAt' => $r['updated_at'],
                'requesterBlocked' => !empty($r['requesterBlocked'])
            ];
        }

        json_response([
            'event' => $event,
            'fields' => [
                'contacts' => 'Day-of contacts',
                'announcements' => 'Announcements',
                'logistics' => 'Venue logistics'
            ],
            'plan' => $plan,
            'musicRequests' => $musicRequests
        ]);
    } elseif ($method === 'PUT') {
        $row = DJ_Database::get_row("SELECT * FROM $plans_table WHERE event_id = ?", [$id]);
        $oldVersion = $row ? (int)$row['version'] : 0;
        if (isset($input['version']) && (int)$input['version'] !== $oldVersion) {
            json_error('This planner changed. Reload before saving.', 409);
        }

        $input['savedAt'] = DJ_Database::now();
        $newVersion = $oldVersion + 1;

        if ($row) {
            DJ_Database::update($plans_table, [
                'body' => json_encode($input),
                'version' => $newVersion
            ], ['event_id' => $id]);
        } else {
            DJ_Database::insert($plans_table, [
                'event_id' => $id,
                'body' => json_encode($input),
                'version' => $newVersion
            ]);
        }

        json_response([
            'event' => DJ_Database::get_event($id),
            'plan' => array_merge($input, ['version' => $newVersion])
        ]);
    }
}

if (preg_match('#^admin/events/([a-f0-9-]+)/access$#', $path, $m)) {
    require_db();
    require_admin();
    $id = $m[1];
    if ($method === 'GET') {
        json_response(['members' => DJ_Auth::get_event_members($id)]);
    } elseif ($method === 'POST') {
        $email = strtolower(trim((string)($input['email'] ?? '')));
        if (!$email) json_error('Valid email required', 400);
        $scope = ($input['scope'] ?? '') === 'contract' ? 'contract' : 'planner';
        $name = trim((string)($input['name'] ?? ''));
        $token = DJ_Auth::create_invitation($id, $email, $scope, $name);

        $emailSent = false;
        if (DJ_Mailer::isConfigured()) {
            $event = DJ_Database::get_event($id);
            $evName = $event['name'] ?? 'Your Upcoming Event';
            $evDate = !empty($event['date']) ? date('F j, Y', strtotime($event['date'])) : 'TBD';
            $clientDisplayName = $name ?: ($event['client']['name'] ?? 'Valued Client');
            $mailRes = DJ_Mailer::sendClientInvitation($email, $clientDisplayName, $evName, $evDate, $token, $scope);
            $emailSent = !empty($mailRes['ok']);
        }

        json_response([
            'token'     => $token,
            'message'   => $emailSent ? 'Invitation created and emailed to client via Resend!' : 'Invitation valid for 24 hours.',
            'emailSent' => $emailSent
        ]);
    } elseif ($method === 'DELETE') {
        $email = strtolower(trim((string)($input['email'] ?? '')));
        DJ_Auth::revoke_access($id, $email);
        json_response(['ok' => true]);
    }
}

// Paper contract evidence is admin-only and stored in the database.
require_once __DIR__ . '/PaperContracts.php';
dj_paper_contract_route($path, $method, $input);

// School business-office invoices and check payment lifecycle.
require_once __DIR__ . '/SchoolInvoices.php';
dj_school_invoice_route($path,$method,$input);

// -------------------------------------------------------------
// 4. CONTRACTS & SIGNATURES
// -------------------------------------------------------------

if (preg_match('#^(admin|portal)/events/([a-f0-9-]+)/contracts$#', $path, $m)) {
    require_db();
    $id = $m[2];
    $contracts_table = DJ_Database::get_table_name('contracts');
    $signatures_table = DJ_Database::get_table_name('signatures');

    $acceptance = 'I agree to the terms of this contract and intend to sign it electronically.';
    $disclosure = 'Electronic signing is provided for your convenience. You may download a copy before and after signing.';

    if ($method === 'GET') {
        require_auth();
        $rows = DJ_Database::get_results(
            "SELECT * FROM $contracts_table WHERE event_id = ? ORDER BY revision DESC",
            [$id]
        );
        $records = [];
        foreach ($rows as $c) {
            $sig = DJ_Database::get_row("SELECT body FROM $signatures_table WHERE contract_id = ?", [$c['id']]);
            $records[] = [
                'id' => $c['id'],
                'revision' => (int)$c['revision'],
                'status' => $c['status'],
                'createdAt' => $c['created_at'],
                'hash' => $c['hash'],
                'snapshot' => json_decode($c['snapshot'], true),
                'signature' => $sig ? json_decode($sig['body'], true) : null
            ];
        }

        // Include contacts list for admin issue selector
        $event = DJ_Database::get_event($id);
        $contacts = [];
        if ($event && !empty($event['client']['email'])) {
            $contacts[] = ['name' => $event['client']['name'], 'email' => $event['client']['email']];
        }
        foreach (DJ_Auth::get_event_members($id) as $mem) {
            if ($mem['email'] !== ($event['client']['email'] ?? '')) {
                $contacts[] = ['name' => $mem['name'] ?? $mem['email'], 'email' => $mem['email']];
            }
        }

        json_response([
            'contracts' => $records,
            'acceptance' => $acceptance,
            'disclosure' => $disclosure,
            'contacts' => $contacts,
            'primaryEmail' => $event['client']['email'] ?? ''
        ]);
    } elseif ($method === 'POST') {
        require_admin();
        $event = DJ_Database::get_event($id);
        if (!$event) json_error('Event not found', 404);

        $terms = trim((string)($input['terms'] ?? ''));
        $signerEmail = strtolower(trim((string)($input['email'] ?? ($event['client']['email'] ?? ''))));
        $signerName = trim((string)($input['signerName'] ?? ($event['client']['name'] ?? '')));
        $deliveryMethod = (string)($input['deliveryMethod'] ?? 'electronic');
        if (!in_array($deliveryMethod, ['electronic','paper'], true)) json_error('Choose an available signing method.', 422);

        $lastRev = DJ_Database::get_var("SELECT MAX(revision) FROM $contracts_table WHERE event_id = ?", [$id]);
        $newRev = (int)$lastRev + 1;

        $snapshot = [
            'signerName' => $signerName,
            'signerEmail' => $signerEmail,
            'deliveryMethod' => $deliveryMethod,
            'event' => [
                'name' => $event['name'],
                'type' => $event['type'],
                'date' => $event['date'],
                'venue' => $event['venue'],
                'package' => $event['package'] ?? '',
                'startTime' => $event['startTime'] ?? '',
                'endTime' => $event['endTime'] ?? ''
            ],
            'financials' => [
                'amount' => $event['amount'],
                'subtotal' => $event['subtotal'] ?? $event['amount'],
                'discount' => $event['discount'] ?? 0,
                'depositRequired' => $event['depositRequired'] ?? 250,
                'depositDue' => $event['depositDue'] ?? '',
                'balanceDue' => $event['balanceDue'] ?? '',
                'paymentTerm' => 'retainer',
                'depositPolicy' => $event['depositPolicy'] ?? ($config['brand']['deposit_policy'] ?? '')
            ],
            'weddingPackage' => $event['weddingPackage'] ?? null,
            'schoolPackage' => $event['schoolPackage'] ?? null,
            'privatePackage' => $event['privatePackage'] ?? null,
            'terms' => $terms,
            'acceptance' => $acceptance,
            'disclosure' => $disclosure
        ];

        $content = json_encode($snapshot);
        $contractId = DJ_Database::uuid();
        $contractHash = hash('sha256', $content);

        // Mark previous as Superseded
        DJ_Database::update($contracts_table, ['status' => 'Superseded'], ['event_id' => $id, 'status' => 'Issued']);

        DJ_Database::insert($contracts_table, [
            'id' => $contractId,
            'event_id' => $id,
            'revision' => $newRev,
            'snapshot' => $content,
            'hash' => $contractHash,
            'recipient_id' => $event['client']['id'],
            'status' => 'Issued',
            'created_at' => DJ_Database::now()
        ]);

        // Automatically prepare invitations for signer only when requested.
        $deliveries = [];
        $emailSent = false;
        if ($deliveryMethod === 'electronic') {
        $token = DJ_Auth::create_invitation($id, $signerEmail, 'contract', $signerName);
        $deliveries[] = [
            'email' => $signerEmail,
            'name' => $signerName,
            'token' => $token,
            'signer' => true,
            'scope' => ($signerEmail === strtolower($event['client']['email'])) ? 'both' : 'contract'
        ];

        // Automatically dispatch invitation email to signer if mailer is active
        $emailSent = false;
        if (DJ_Mailer::isConfigured()) {
            $evName = $event['name'] ?? 'Your Upcoming Event';
            $evDate = !empty($event['date']) ? date('F j, Y', strtotime($event['date'])) : 'TBD';
            $mailRes = DJ_Mailer::sendClientInvitation($signerEmail, $signerName ?: 'Valued Client', $evName, $evDate, $token, 'contract');
            $emailSent = !empty($mailRes['ok']);
        }

        } // Paper delivery creates no electronic invitation or email.

        json_response([
            'id'         => $contractId,
            'revision'   => $newRev,
            'status'     => 'Issued',
            'deliveries' => $deliveries,
            'emailSent'  => $emailSent
        ]);
    }
}

if (preg_match('#^portal/events/([a-f0-9-]+)/contracts/([a-f0-9-]+)/sign$#', $path, $m)) {
    require_db();
    $id = $m[1];
    $contractId = $m[2];
    $contracts_table = DJ_Database::get_table_name('contracts');
    $signatures_table = DJ_Database::get_table_name('signatures');

    $c = DJ_Database::get_row("SELECT * FROM $contracts_table WHERE id = ? AND event_id = ?", [$contractId, $id]);
    if (!$c || $c['status'] !== 'Issued') {
        json_error('Contract is no longer awaiting signature', 409);
    }

    $session = current_session();
    $signature = [
        'method' => 'electronic',
        'name' => trim((string)($input['name'] ?? '')),
        'email' => $session['user']['email'] ?? '',
        'signedAt' => DJ_Database::now(),
        'contractHash' => $c['hash']
    ];

    DJ_Database::insert($signatures_table, [
        'contract_id' => $contractId,
        'body' => json_encode($signature)
    ]);

    DJ_Database::update($contracts_table, ['status' => 'Signed'], ['id' => $contractId]);
    json_response(['ok' => true]);
}

if (preg_match('#^admin/events/([a-f0-9-]+)/contracts/([a-f0-9-]+)/void$#', $path, $m)) {
    require_db();
    require_admin();
    $id = $m[1];
    $contractId = $m[2];
    $contracts_table = DJ_Database::get_table_name('contracts');
    DJ_Database::update($contracts_table, ['status' => 'Voided'], ['id' => $contractId, 'event_id' => $id]);
    json_response(['ok' => true]);
}

if (preg_match('#^(admin|portal)/events/([a-f0-9-]+)/contracts/([a-f0-9-]+)/download$#', $path, $m)) {
    require_db();
    $id = $m[2];
    $contractId = $m[3];
    $contracts_table = DJ_Database::get_table_name('contracts');
    $signatures_table = DJ_Database::get_table_name('signatures');

    $c = DJ_Database::get_row("SELECT * FROM $contracts_table WHERE id = ? AND event_id = ?", [$contractId, $id]);
    if (!$c) json_error('Contract not found', 404);

    $sig = DJ_Database::get_row("SELECT body FROM $signatures_table WHERE contract_id = ?", [$c['id']]);
    $snap = json_decode($c['snapshot'], true) ?: [];

    $brandName = $config['brand']['name'] ?? 'DJ Jesse B';
    $html = "<!doctype html><html><head><meta charset='utf-8'><title>Contract v{$c['revision']}</title>"
          . "<style>body{font-family:sans-serif;max-width:800px;margin:40px auto;line-height:1.6;color:#1e293b;padding:0 20px;}h1,h2{color:#0f172a;}pre{background:#f1f5f9;padding:16px;border-radius:8px;white-space:pre-wrap;}</style></head><body>"
          . "<h1>" . htmlspecialchars($snap['event']['name'] ?? ($brandName . ' Entertainment Agreement')) . "</h1>"
          . "<p><b>Version {$c['revision']}</b> · Status: <b>{$c['status']}</b> · Issued: {$c['created_at']}</p>"
          . "<hr>"
          . "<h3>Event Details</h3>"
          . "<p>Client: " . htmlspecialchars($snap['signerName'] ?? '') . " (" . htmlspecialchars($snap['signerEmail'] ?? '') . ")<br>"
          . "Event Date: " . htmlspecialchars($snap['event']['date'] ?? '') . " · Venue: " . htmlspecialchars($snap['event']['venue'] ?? 'To be arranged') . "<br>"
          . "Contract Total: $" . number_format($snap['financials']['amount'] ?? 0, 2) . " · Required Retainer: $" . number_format($snap['financials']['depositRequired'] ?? 250, 2) . "</p>"
          . "<h3>Terms & Conditions:</h3><pre>" . htmlspecialchars($snap['terms'] ?? '') . "</pre>"
          . "<h3>Electronic Signature:</h3><pre>" . htmlspecialchars($sig ? $sig['body'] : 'Unsigned') . "</pre>"
          . "</body></html>";

    header('Content-Type: text/html; charset=utf-8');
    header('Content-Disposition: attachment; filename="contract-v' . $c['revision'] . '.html"');
    echo $html;
    exit;
}

// -------------------------------------------------------------
// 5. LIVE MUSIC / SONG REQUESTS (PUBLIC & BOOTH)
// -------------------------------------------------------------

if (preg_match('#^music/([a-f0-9]{64})$#', $path, $m)) {
    require_db();
    $token = $m[1];
    $settings_table = DJ_Database::get_table_name('music_request_settings');
    $requests_table = DJ_Database::get_table_name('music_requests');
    $blocks_table = DJ_Database::get_table_name('music_request_blocks');

    $s = DJ_Database::get_row("SELECT * FROM $settings_table WHERE token = ?", [$token]);
    if (!$s) json_error('Song request link not available or event not found', 404);

    $event = DJ_Database::get_event($s['event_id']);
    $isOpen = !empty($s['enabled']) && !in_array($event['status'] ?? '', ['Canceled', 'Archived', 'Completed']);

    if ($method === 'GET') {
        json_response([
            'event' => [
                'name' => $event['name'],
                'date' => $event['date'],
                'type' => $event['type']
            ],
            'open' => $isOpen,
            'tipLink' => $config['brand']['tip_link'] ?? '',
            'disclaimer' => 'Every request helps shape the night! Requests aren’t guaranteed. The DJ will choose songs that fit the event and vibe.'
        ]);
    } elseif ($method === 'POST') {
        if (!$isOpen) json_error('Song requests are paused for this event.', 423);

        $title = trim((string)($input['title'] ?? ''));
        $artist = trim((string)($input['artist'] ?? ''));
        $key = trim((string)($input['key'] ?? ''));
        $deviceId = trim((string)($input['deviceId'] ?? ''));

        if (!$title || !$artist) {
            json_error('Enter a song title and artist', 400);
        }

        $deviceHash = hash('sha256', $s['event_id'] . ':' . $deviceId);

        // Check if requester is blocked
        $isBlocked = DJ_Database::get_var(
            "SELECT 1 FROM $blocks_table WHERE event_id = ? AND device_hash = ? AND blocked = 1",
            [$s['event_id'], $deviceHash]
        );
        if ($isBlocked) {
            json_error('Requests from this browser have been disabled for this event.', 403);
        }

        // Submission cooldown
        $cooldown = (int)($config['security']['rate_limit_seconds'] ?? 15);
        if ($cooldown < 1) $cooldown = 15;
        $recent = DJ_Database::get_var(
            "SELECT created_at FROM $requests_table WHERE event_id = ? AND device_hash = ? ORDER BY created_at DESC LIMIT 1",
            [$s['event_id'], $deviceHash]
        );
        if ($recent && (time() - strtotime($recent)) < $cooldown) {
            $left = $cooldown - (time() - strtotime($recent));
            json_error(sprintf('Please wait %d seconds before sending another song.', max(1, $left)), 429);
        }

        // Hourly limit
        $hourlyMax = (int)($config['security']['max_requests_hour'] ?? 30);
        if ($hourlyMax > 0) {
            $hourAgo = gmdate('Y-m-d H:i:s', time() - 3600);
            $hourlyCount = DJ_Database::get_var(
                "SELECT COUNT(*) FROM $requests_table WHERE event_id = ? AND device_hash = ? AND created_at >= ?",
                [$s['event_id'], $deviceHash, $hourAgo]
            );
            if ((int)$hourlyCount >= $hourlyMax) {
                json_error('Hourly song request limit reached for this device. Enjoy the party!', 429);
            }
        }

        // Deduplication key
        $existing = DJ_Database::get_row(
            "SELECT id FROM $requests_table WHERE event_id = ? AND submission_key = ?",
            [$s['event_id'], $key]
        );
        if ($existing) {
            json_response(['ok' => true, 'reference' => $existing['id']]);
        }

        $reqId = DJ_Database::uuid();
        DJ_Database::insert($requests_table, [
            'id' => $reqId,
            'event_id' => $s['event_id'],
            'submission_key' => $key ?: DJ_Database::uuid(),
            'title' => $title,
            'artist' => $artist,
            'status' => 'Pending',
            'version' => 1,
            'created_at' => DJ_Database::now(),
            'updated_at' => DJ_Database::now(),
            'device_hash' => $deviceHash
        ]);

        json_response([
            'ok' => true,
            'reference' => $reqId,
            'disclaimer' => 'Your song request is with the DJ!'
        ]);
    }
}

if ($path === 'admin/music/events' && $method === 'GET') {
    require_db();
    require_admin();
    $events = DJ_Database::get_all_events();
    $settings_table = DJ_Database::get_table_name('music_request_settings');
    $requests_table = DJ_Database::get_table_name('music_requests');

    $out = [];
    foreach ($events as $e) {
        $s = DJ_Database::get_row("SELECT * FROM $settings_table WHERE event_id = ?", [$e['id']]);
        $counts = [
            'Pending' => (int)DJ_Database::get_var("SELECT COUNT(*) FROM $requests_table WHERE event_id = ? AND status = 'Pending'", [$e['id']]),
            'Approved' => (int)DJ_Database::get_var("SELECT COUNT(*) FROM $requests_table WHERE event_id = ? AND status = 'Approved'", [$e['id']]),
            'Played' => (int)DJ_Database::get_var("SELECT COUNT(*) FROM $requests_table WHERE event_id = ? AND status = 'Played'", [$e['id']]),
            'Denied' => (int)DJ_Database::get_var("SELECT COUNT(*) FROM $requests_table WHERE event_id = ? AND status = 'Denied'", [$e['id']])
        ];
        $out[] = [
            'id' => $e['id'],
            'name' => $e['name'],
            'date' => $e['date'],
            'type' => $e['type'],
            'counts' => $counts,
            'enabled' => !empty($s['enabled'])
        ];
    }
    json_response($out);
}

if (preg_match('#^admin/events/([a-f0-9-]+)/music$#', $path, $m)) {
    require_db();
    require_admin();
    $id = $m[1];
    $event = DJ_Database::get_event($id);
    if (!$event) json_error('Event not found', 404);

    $settings_table = DJ_Database::get_table_name('music_request_settings');
    $requests_table = DJ_Database::get_table_name('music_requests');
    $blocks_table = DJ_Database::get_table_name('music_request_blocks');

    $s = DJ_Database::get_row("SELECT * FROM $settings_table WHERE event_id = ?", [$id]);

    if ($method === 'POST') {
        $action = $input['action'] ?? '';
        $token = $s ? $s['token'] : bin2hex(random_bytes(32));
        if ($action === 'rotate') {
            $token = bin2hex(random_bytes(32));
        }
        $enabled = ($action === 'open') ? 1 : (($action === 'pause') ? 0 : ($s['enabled'] ?? 1));

        if ($s) {
            DJ_Database::update($settings_table, [
                'token' => $token,
                'enabled' => $enabled,
                'version' => (int)$s['version'] + 1
            ], ['event_id' => $id]);
        } else {
            DJ_Database::insert($settings_table, [
                'event_id' => $id,
                'token' => $token,
                'enabled' => 1,
                'version' => 1
            ]);
        }
        $s = DJ_Database::get_row("SELECT * FROM $settings_table WHERE event_id = ?", [$id]);
    }

    $guestUrl = $s ? "{$baseUrl}/#music/{$s['token']}" : null;

    $counts = [
        'Pending' => (int)DJ_Database::get_var("SELECT COUNT(*) FROM $requests_table WHERE event_id = ? AND status = 'Pending'", [$id]),
        'Approved' => (int)DJ_Database::get_var("SELECT COUNT(*) FROM $requests_table WHERE event_id = ? AND status = 'Approved'", [$id]),
        'Played' => (int)DJ_Database::get_var("SELECT COUNT(*) FROM $requests_table WHERE event_id = ? AND status = 'Played'", [$id]),
        'Denied' => (int)DJ_Database::get_var("SELECT COUNT(*) FROM $requests_table WHERE event_id = ? AND status = 'Denied'", [$id])
    ];

    // Get all requests
    $reqRows = DJ_Database::get_results(
        "SELECT r.*, 
                EXISTS(SELECT 1 FROM $blocks_table b WHERE b.event_id = r.event_id AND b.device_hash = r.device_hash AND b.blocked = 1) as requesterBlocked
         FROM $requests_table r 
         WHERE r.event_id = ? 
         ORDER BY 
            CASE r.status WHEN 'Approved' THEN 0 WHEN 'Pending' THEN 1 WHEN 'Played' THEN 2 ELSE 3 END,
            r.created_at ASC",
        [$id]
    );
    $requests = [];
    foreach ($reqRows as $r) {
        $requests[] = [
            'id' => $r['id'],
            'eventId' => $r['event_id'],
            'title' => $r['title'],
            'artist' => $r['artist'],
            'status' => $r['status'],
            'version' => (int)$r['version'],
            'createdAt' => $r['created_at'],
            'updatedAt' => $r['updated_at'],
            'requesterBlocked' => !empty($r['requesterBlocked'])
        ];
    }

    json_response([
        'event' => [
            'id' => $event['id'],
            'name' => $event['name'],
            'date' => $event['date'],
            'type' => $event['type']
        ],
        'config' => [
            'enabled' => !empty($s['enabled']),
            'url' => $guestUrl,
            'version' => (int)($s['version'] ?? 1)
        ],
        'requests' => $requests,
        'counts' => $counts
    ]);
}

if (preg_match('#^admin/events/([a-f0-9-]+)/music/requests/([a-f0-9-]+)$#', $path, $m)) {
    require_db();
    require_admin();
    $id = $m[1];
    $requestId = $m[2];
    $requests_table = DJ_Database::get_table_name('music_requests');
    $blocks_table = DJ_Database::get_table_name('music_request_blocks');
    $history_table = DJ_Database::get_table_name('music_request_history');

    $row = DJ_Database::get_row("SELECT * FROM $requests_table WHERE id = ? AND event_id = ?", [$requestId, $id]);
    if (!$row) json_error('Request not found', 404);

    $session = current_session();
    $actorId = $session['user']['email'] ?? 'admin';

    if (isset($input['action']) && in_array($input['action'], ['block', 'unblock'])) {
        $blocked = ($input['action'] === 'block') ? 1 : 0;
        DJ_Database::replace($blocks_table, [
            'event_id' => $id,
            'device_hash' => $row['device_hash'],
            'blocked' => $blocked,
            'updated_at' => DJ_Database::now(),
            'actor_id' => $actorId
        ]);
        DJ_Database::insert($history_table, [
            'request_id' => $row['id'],
            'status' => $blocked ? 'Requester blocked' : 'Requester unblocked',
            'actor_id' => $actorId,
            'changed_at' => DJ_Database::now()
        ]);
    } elseif (isset($input['status'])) {
        $status = trim((string)$input['status']);
        DJ_Database::update($requests_table, [
            'status' => $status,
            'version' => (int)$row['version'] + 1,
            'updated_at' => DJ_Database::now()
        ], ['id' => $requestId]);

        DJ_Database::insert($history_table, [
            'request_id' => $row['id'],
            'status' => $status,
            'actor_id' => $actorId,
            'changed_at' => DJ_Database::now()
        ]);
    }

    $counts = [
        'Pending' => (int)DJ_Database::get_var("SELECT COUNT(*) FROM $requests_table WHERE event_id = ? AND status = 'Pending'", [$id]),
        'Approved' => (int)DJ_Database::get_var("SELECT COUNT(*) FROM $requests_table WHERE event_id = ? AND status = 'Approved'", [$id]),
        'Played' => (int)DJ_Database::get_var("SELECT COUNT(*) FROM $requests_table WHERE event_id = ? AND status = 'Played'", [$id]),
        'Denied' => (int)DJ_Database::get_var("SELECT COUNT(*) FROM $requests_table WHERE event_id = ? AND status = 'Denied'", [$id])
    ];

    $reqRows = DJ_Database::get_results(
        "SELECT r.*, 
                EXISTS(SELECT 1 FROM $blocks_table b WHERE b.event_id = r.event_id AND b.device_hash = r.device_hash AND b.blocked = 1) as requesterBlocked
         FROM $requests_table r 
         WHERE r.event_id = ? 
         ORDER BY 
            CASE r.status WHEN 'Approved' THEN 0 WHEN 'Pending' THEN 1 WHEN 'Played' THEN 2 ELSE 3 END,
            r.created_at ASC",
        [$id]
    );
    $requests = [];
    foreach ($reqRows as $r) {
        $requests[] = [
            'id' => $r['id'],
            'eventId' => $r['event_id'],
            'title' => $r['title'],
            'artist' => $r['artist'],
            'status' => $r['status'],
            'version' => (int)$r['version'],
            'createdAt' => $r['created_at'],
            'updatedAt' => $r['updated_at'],
            'requesterBlocked' => !empty($r['requesterBlocked'])
        ];
    }

    json_response([
        'requests' => $requests,
        'counts' => $counts
    ]);
}

if (preg_match('#^admin/events/([a-f0-9-]+)/music/qr$#', $path, $m)) {
    require_db();
    $id = $m[1];
    $settings_table = DJ_Database::get_table_name('music_request_settings');
    $s = DJ_Database::get_row("SELECT * FROM $settings_table WHERE event_id = ?", [$id]);
    if (!$s || !$s['token']) {
        json_error('QR not available', 404);
    }

    $guestUrl = "{$baseUrl}/#music/{$s['token']}";
    $svg = DJ_QRCode::svg($guestUrl, 320, 3);

    header('Content-Type: image/svg+xml');
    header('Content-Disposition: inline; filename="event-music-qr.svg"');
    echo $svg;
    exit;
}

// -------------------------------------------------------------
// 6. INTAKE & DATE REQUESTS
// -------------------------------------------------------------

function synthesize_quote(array $body): array {
    $type = $body['type'] ?? 'Wedding';
    $guests = (int)($body['guests'] ?? 120);
    $total = (float)($body['quote']['total'] ?? ($body['amount'] ?? ($type === 'Corporate' ? 2200 : ($type === 'School dance' ? 1800 : 2500))));

    if ($type === 'Wedding') {
        return [
            'catalogVersion' => '2026-11-11',
            'selection' => [
                'id' => 'full',
                'guestCount' => $guests,
                'additionalSound' => false,
                'extraSubwoofers' => 0,
                'booth' => 'White',
                'extraHalfHours' => 0,
                'lighting' => 'none',
                'bubbles' => false,
                'haze' => false,
                'bubblesApproval' => 'Pending',
                'hazeApproval' => 'Pending',
                'additionalCharge' => 0,
                'chargeNote' => '',
                'extraTopPairs' => 0
            ],
            'package' => [
                'id' => 'full',
                'name' => 'The Full Wedding Experience',
                'price' => $total,
                'hours' => 5.5,
                'ceremony' => true,
                'cocktail' => true,
                'features' => [
                    'DJ Jesse B. as your reception DJ and MC',
                    'A dedicated assistant',
                    'Wedding Planning App',
                    'Your choice of white or black DJ booth',
                    'Ceremony sound with wireless microphones',
                    'Cocktail-hour sound with custom mix',
                    'Premium reception sound system with wireless microphones',
                    'Advanced dance-floor lighting',
                    'Up to 5.5 hours total wedding coverage'
                ]
            ],
            'items' => [
                ['name' => 'The Full Wedding Experience', 'quantity' => 1, 'unitPrice' => $total, 'total' => $total]
            ],
            'total' => $total,
            'coverageHours' => 5.5,
            'ceremonyCondition' => 'Included ceremony coverage requires the ceremony to be at the same location as the reception.',
            'cocktailIncluded' => true,
            'soundCapacityNotice' => '',
            'soundReviewRequired' => false
        ];
    } elseif ($type === 'School dance') {
        return [
            'catalogVersion' => '2026-11-14-school-2-3-4-hours',
            'selection' => [
                'id' => 'prom',
                'guestCount' => $guests,
                'additionalSound' => false,
                'extraSubwoofers' => 0,
                'booth' => 'Premium',
                'extraHalfHours' => 0,
                'lighting' => 'none',
                'bubbles' => false,
                'haze' => false,
                'bubblesApproval' => 'Pending',
                'hazeApproval' => 'Approved',
                'glow' => false,
                'additionalCharge' => 0,
                'chargeNote' => '',
                'extraTopPairs' => 0
            ],
            'package' => [
                'id' => 'prom',
                'name' => 'The Total Prom Experience',
                'price' => $total,
                'hours' => 4,
                'features' => [
                    'DJ Jesse B. as your prom DJ and MC',
                    'A dedicated assistant',
                    'Custom Song Request / Planning App',
                    'Premium DJ booth',
                    'Mocktail-hour sound with custom mix',
                    'Premium event sound system with subwoofer(s)',
                    'Advanced dance-floor lighting',
                    'Up to 4 hours total coverage'
                ]
            ],
            'items' => [
                ['name' => 'The Total Prom Experience', 'quantity' => 1, 'unitPrice' => $total, 'total' => $total]
            ],
            'total' => $total,
            'coverageHours' => 4
        ];
    } else {
        return [
            'catalogVersion' => '2026-11-private-v3',
            'selection' => [
                'id' => ($type === 'Corporate' ? 'corporate' : 'private'),
                'guestCount' => $guests,
                'djHours' => 4,
                'lighting' => 'none',
                'glow' => false,
                'bubbles' => false,
                'haze' => false,
                'additionalSound' => false,
                'extraSubwoofers' => 0
            ],
            'package' => [
                'id' => ($type === 'Corporate' ? 'corporate' : 'private'),
                'name' => ($type === 'Corporate' ? 'Corporate event à la carte services' : 'Private event à la carte services'),
                'price' => $total,
                'hours' => 4,
                'features' => [
                    'DJ Jesse B. as your DJ and MC',
                    'Premium sound system',
                    'Basic lighting',
                    'Custom DJ booth'
                ]
            ],
            'items' => [
                ['name' => 'DJ Jesse B. DJ and MC service', 'quantity' => 4, 'unitPrice' => round($total / 4, 2), 'total' => $total]
            ],
            'total' => $total,
            'coverageHours' => 4,
            'soundCapacityNotice' => ''
        ];
    }
}

if ($path === 'intake/requests' && $method === 'POST') {
    require_db();
    $reqs_table = DJ_Database::get_table_name('booking_requests');
    $key = trim((string)($input['key'] ?? DJ_Database::uuid()));

    $existing = DJ_Database::get_row("SELECT id FROM $reqs_table WHERE submission_key = ?", [$key]);
    if ($existing) {
        json_response(['reference' => $existing['id'], 'status' => 'Awaiting admin review']);
    }

    if (empty($input['quote'])) {
        $input['quote'] = synthesize_quote($input);
    }

    $id = DJ_Database::uuid();
    DJ_Database::insert($reqs_table, [
        'id' => $id,
        'submission_key' => $key,
        'body' => json_encode($input),
        'state' => 'Pending',
        'event_id' => null,
        'version' => 1,
        'created_at' => DJ_Database::now()
    ]);

    json_response(['reference' => $id, 'status' => 'Awaiting admin review']);
}

// Same-day commitments are treated conservatively: without reliable setup/travel
// times, a different event on the date is not proof that the slot is free.
function request_availability(array $request, string $requestId, array $events, array $pending): array {
    $date = $request['date'] ?? '';
    $conflicts = [];
    $otherRequests = [];
    if (!$date || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        return ['level' => 'review', 'events' => [], 'requests' => [], 'reasons' => ['A valid event date is required.']];
    }
    foreach ($events as $event) {
        if (($event['date'] ?? '') !== $date || in_array($event['status'] ?? '', ['Canceled', 'Archived'], true)) continue;
        $conflicts[] = [
            'name' => $event['name'] ?? 'Existing event',
            'status' => $event['status'] ?? 'Unknown',
            'startTime' => $event['startTime'] ?? '',
            'endTime' => $event['endTime'] ?? ''
        ];
    }
    foreach ($pending as $row) {
        if ($row['id'] === $requestId || $row['state'] !== 'Pending') continue;
        $body = json_decode($row['body'], true) ?: [];
        if (($body['date'] ?? '') === $date) $otherRequests[] = ['name' => $body['name'] ?? 'Other inquiry'];
    }
    $reasons = [];
    if ($conflicts) $reasons[] = 'Existing event on this date; verify commitments, setup and travel.';
    if ($otherRequests) $reasons[] = 'Another pending inquiry requests this date.';
    if (empty($request['venue'])) $reasons[] = 'Venue not yet provided.';
    if (empty($request['startTime']) || empty($request['endTime'])) $reasons[] = 'Event hours and travel/setup feasibility have not been verified.';
    return ['level' => $reasons ? 'review' : 'available', 'events' => $conflicts, 'requests' => $otherRequests, 'reasons' => $reasons];
}

if ($path === 'admin/requests' && $method === 'GET') {
    require_db();
    require_admin();
    $reqs_table = DJ_Database::get_table_name('booking_requests');
    $rows = DJ_Database::get_results("SELECT * FROM $reqs_table ORDER BY created_at DESC");
    $eventsForReview = DJ_Database::get_all_events();
    $results = [];
    foreach ($rows as $r) {
        $b = json_decode($r['body'], true) ?: [];
        if (empty($b['quote']) || empty($b['quote']['package'])) {
            $b['quote'] = synthesize_quote($b);
        }

        $workflow = null;
        if (!empty($r['event_id'])) {
            $ev = DJ_Database::get_event($r['event_id']);
            $workflow = [
                'stage' => ($ev && ($ev['status'] ?? '') === 'Confirmed') ? 'Confirmed booking' : 'Awaiting contract & retainer',
                'depositReceived' => (float)($ev['depositReceived'] ?? 0),
                'planningUnlocked' => ($ev && ($ev['contractStatus'] ?? '') === 'Signed')
            ];
        }

        $results[] = array_merge($b, [
            'id' => $r['id'],
            'name' => $b['name'] ?? ($b['clientName'] ?? 'Event Request'),
            'email' => $b['email'] ?? ($b['clientEmail'] ?? ''),
            'phone' => $b['phone'] ?? ($b['clientPhone'] ?? ''),
            'venue' => $b['venue'] ?? '',
            'notes' => $b['notes'] ?? ($b['message'] ?? ''),
            'state' => $r['state'],
            'eventId' => $r['event_id'],
            'version' => (int)$r['version'],
            'createdAt' => $r['created_at'],
            'workflow' => $workflow
            ,'availability' => request_availability($b, $r['id'], $eventsForReview, $rows)
        ]);
    }
    json_response($results);
}

if (preg_match('#^admin/requests/([a-f0-9-]+)/(approve|decline|response)$#', $path, $m)) {
    require_db();
    require_admin();
    $id = $m[1];
    $action = $m[2];
    $reqs_table = DJ_Database::get_table_name('booking_requests');

    $row = DJ_Database::get_row("SELECT * FROM $reqs_table WHERE id = ?", [$id]);
    if (!$row) json_error('Request not found', 404);

    $b = json_decode($row['body'], true) ?: [];

    if ($action === 'approve') {
        if ($row['state'] !== 'Pending') json_error('This request has already been reviewed. Refresh the list.', 409);
        $availability = request_availability($b, $id, DJ_Database::get_all_events(), DJ_Database::get_results("SELECT * FROM $reqs_table WHERE state = 'Pending'"));
        if ($availability['level'] !== 'available' && empty($input['acknowledgeReview'])) {
            json_error('Availability review is required before approving this date. Refresh and review the conflicts.', 409);
        }
        $eventInput = [
            'name' => ($b['name'] ?? 'Client') . ' • ' . ($b['type'] ?? 'Event'),
            'type' => $b['type'] ?? 'Wedding',
            'date' => $b['date'] ?? '',
            'status' => 'Tentative',
            'venue' => $b['venue'] ?? '',
            'client' => [
                'name' => $b['name'] ?? '',
                'email' => $b['email'] ?? '',
                'phone' => $b['phone'] ?? '',
                'organization' => $b['organization'] ?? ''
            ],
            'amount' => (float)($b['quote']['total'] ?? 1800),
            'subtotal' => (float)($b['quote']['total'] ?? 1800),
            'depositRequired' => (function () use ($b, $config) {
                $total = max(0, (float)($b['quote']['total'] ?? 1800));
                $brand = $config['brand'] ?? [];
                $flat = max(0, (float)($brand['standard_deposit'] ?? 250));
                $percent = round($total * max(0, (float)($brand['deposit_percent'] ?? 20)) / 100, 2);
                $mode = $brand['deposit_mode'] ?? 'higher';
                return $mode === 'percent' ? $percent : ($mode === 'flat' ? $flat : max($flat, $percent));
            })(),
            'notes' => 'Website intake booking: ' . ($b['notes'] ?? '')
        ];
        $saved = DJ_Database::save_event($eventInput);
        DJ_Database::update($reqs_table, [
            'state' => 'Approved',
            'event_id' => $saved['id']
        ], ['id' => $id]);

        $workflows_table = DJ_Database::get_table_name('booking_workflows');
        DJ_Database::replace($workflows_table, [
            'event_id' => $saved['id'],
            'request_id' => $id,
            'approved_at' => DJ_Database::now()
        ]);

        $token = DJ_Auth::create_invitation($saved['id'], $saved['client']['email'], 'planner', $saved['client']['name']);
        json_response([
            'eventId' => $saved['id'],
            'token' => $token,
            'message' => 'Date approved.'
        ]);
    } elseif ($action === 'decline') {
        DJ_Database::update($reqs_table, ['state' => 'Declined'], ['id' => $id]);
        json_response(['ok' => true, 'message' => 'Request declined.']);
    } elseif ($action === 'response') {
        json_response(['ok' => true]);
    }
}

// -------------------------------------------------------------
// 7. FOLLOW-UPS & CLOSE EVENT
// -------------------------------------------------------------

if ($path === 'admin/followups' && $method === 'GET') {
    require_db();
    require_admin();
    $drafts_table = DJ_Database::get_table_name('followup_drafts');
    $events_table = DJ_Database::get_table_name('events');
    $rows = DJ_Database::get_results(
        "SELECT d.*, e.body as event_body FROM $drafts_table d LEFT JOIN $events_table e ON e.id = d.event_id WHERE d.status = 'Needs review' ORDER BY d.created_at DESC"
    );
    $out = [];
    foreach ($rows as $r) {
        $draftBody = json_decode($r['body'], true) ?: [];
        $evBody = json_decode($r['event_body'] ?? '', true) ?: [];
        $out[] = [
            'id' => $r['id'],
            'eventId' => $r['event_id'],
            'eventName' => $evBody['name'] ?? ($draftBody['eventName'] ?? 'Event'),
            'kind' => $draftBody['kind'] ?? 'deposit',
            'status' => $r['status'],
            'subject' => $draftBody['subject'] ?? '',
            'message' => $draftBody['body'] ?? ($draftBody['message'] ?? ''),
            'body' => $draftBody['body'] ?? '',
            'createdAt' => $r['created_at'],
            'to' => $draftBody['to'] ?? '',
            'from' => $draftBody['from'] ?? 'admin@example.com'
        ];
    }
    json_response($out);
}

if (preg_match('#^admin/events/([a-f0-9-]+)/followups$#', $path, $m)) {
    require_db();
    require_admin();
    $id = $m[1];
    $drafts_table = DJ_Database::get_table_name('followup_drafts');
    $settings_table = DJ_Database::get_table_name('followup_settings');

    $settingsRow = DJ_Database::get_row("SELECT body FROM $settings_table WHERE event_id = ?", [$id]);
    $settings = $settingsRow ? json_decode($settingsRow['body'], true) : [
        'enabled' => false,
        'kind' => 'auto',
        'afterDays' => 3,
        'repeatDays' => 5,
        'maxReminders' => 3,
        'details' => ''
    ];

    if ($method === 'PUT') {
        $settings = array_merge($settings, $input);
        DJ_Database::replace($settings_table, [
            'event_id' => $id,
            'body' => json_encode($settings)
        ]);
    }

    $draftRows = DJ_Database::get_results("SELECT * FROM $drafts_table WHERE event_id = ? ORDER BY created_at DESC", [$id]);
    $drafts = [];
    foreach ($draftRows as $dr) {
        $b = json_decode($dr['body'], true) ?: [];
        $drafts[] = array_merge($b, [
            'id' => $dr['id'],
            'status' => $dr['status'],
            'createdAt' => $dr['created_at']
        ]);
    }

    json_response([
        'settings' => $settings,
        'drafts' => $drafts,
        'closeouts' => []
    ]);
}

if (preg_match('#^admin/events/([a-f0-9-]+)/followups/([a-f0-9-]+)$#', $path, $m)) {
    require_db();
    require_admin();
    $id = $m[1];
    $draftId = $m[2];
    $drafts_table = DJ_Database::get_table_name('followup_drafts');

    $draft = DJ_Database::get_row("SELECT * FROM $drafts_table WHERE id = ? AND event_id = ?", [$draftId, $id]);
    if (!$draft) json_error('Draft not found', 404);

    $body = json_decode($draft['body'], true) ?: [];
    if (isset($input['subject'])) $body['subject'] = $input['subject'];
    if (isset($input['body'])) $body['body'] = $input['body'];
    $newStatus = $input['status'] ?? $draft['status'];

    DJ_Database::update($drafts_table, [
        'status' => $newStatus,
        'body' => json_encode($body),
        'handled_at' => DJ_Database::now()
    ], ['id' => $draftId]);

    json_response(['ok' => true]);
}

if (preg_match('#^admin/events/([a-f0-9-]+)/close$#', $path, $m)) {
    require_db();
    require_admin();
    $id = $m[1];
    $event = DJ_Database::get_event($id);
    if (!$event) json_error('Event not found', 404);

    $event['status'] = $input['status'] ?? 'Completed';
    $saved = DJ_Database::save_event($event, $id);
    json_response($saved);
}

// -------------------------------------------------------------
// 8. STRIPE PAYMENTS
// -------------------------------------------------------------

function get_stripe_data(string $eventId): array {
    global $config;
    $stripeCfg = $config['stripe'] ?? [];
    $enabled = !empty($stripeCfg['enabled']);
    $secKey = trim((string)($stripeCfg['secret_key'] ?? ''));

    $invoices_table = DJ_Database::get_table_name('stripe_invoices');
    $receipts_table = DJ_Database::get_table_name('stripe_receipts');

    $invoices = [];
    $rows = DJ_Database::get_results("SELECT * FROM $invoices_table WHERE event_id = ? ORDER BY created_at DESC", [$eventId]);
    foreach ($rows as $r) {
        $invoices[] = [
            'id' => $r['id'],
            'kind' => $r['kind'],
            'payer' => $r['payer'],
            'amount' => (int)$r['amount'],
            'status' => $r['status'],
            'url' => $r['url'],
            'number' => $r['number'],
            'error' => null,
            'reviewRequired' => false
        ];
    }

    $receipts = [];
    $rRows = DJ_Database::get_results(
        "SELECT r.* FROM $receipts_table r JOIN $invoices_table i ON i.id = r.invoice_id WHERE i.event_id = ?",
        [$eventId]
    );
    foreach ($rRows as $r) {
        $receipts[] = [
            'id' => $r['payment_id'],
            'invoiceId' => $r['invoice_id'],
            'amount' => (int)$r['amount'],
            'refunded' => (int)$r['refunded'],
            'disputed' => !empty($r['disputed']),
            'createdAt' => $r['created_at']
        ];
    }

    return [
        'configured' => $enabled && !empty($secKey),
        'publishableKey' => $stripeCfg['publishable_key'] ?? '',
        'invoices' => $invoices,
        'receipts' => $receipts
    ];
}

if (preg_match('#^(admin|portal)/events/([a-f0-9-]+)/stripe$#', $path, $m)) {
    require_db();
    require_auth();
    $id = $m[2];
    $event = DJ_Database::get_event($id);
    if (!$event) json_error('Event not found', 404);

    if ($method === 'GET') {
        json_response(get_stripe_data($id));
    } elseif ($method === 'POST') {
        require_admin();
        $kind = $input['kind'] ?? 'retainer';
        $depositDue = (float)($event['depositRequired'] ?? 250);
        $amountDue = ($kind === 'retainer') ? max(0, $depositDue - ($event['depositReceived'] ?? 0)) : max(0, $event['amount'] - ($event['paid'] ?? 0));
        $amountCents = (int)round($amountDue * 100);

        $invId = DJ_Database::uuid();
        $invoices_table = DJ_Database::get_table_name('stripe_invoices');
        DJ_Database::insert($invoices_table, [
            'id' => $invId,
            'event_id' => $id,
            'kind' => $kind,
            'payer' => $event['client']['email'] ?? '',
            'amount' => $amountCents,
            'status' => 'open',
            'url' => '',
            'number' => 'inv_' . substr($invId, 0, 8),
            'body' => json_encode(['amount' => $amountCents, 'kind' => $kind]),
            'created_at' => DJ_Database::now()
        ]);

        json_response(get_stripe_data($id));
    }
}

if (preg_match('#^admin/events/([a-f0-9-]+)/stripe/([^/]+)/([^/]+)$#', $path, $m)) {
    require_db();
    require_admin();
    $id = $m[1];
    $invoiceId = $m[2];
    $action = $m[3];

    $invoices_table = DJ_Database::get_table_name('stripe_invoices');
    if ($action === 'void') {
        DJ_Database::update($invoices_table, ['status' => 'void'], ['id' => $invoiceId]);
        json_response(['ok' => true]);
    }
    json_response(['ok' => true]);
}

// -------------------------------------------------------------
// 9. DEMO DATA RESET & SEED CONTROLS
// -------------------------------------------------------------

if ($path === 'admin/clear-demo' && $method === 'POST') {
    require_db();
    require_admin();
    DJ_Database::clear_sample_data();
    json_response(['ok' => true, 'message' => 'Sample data cleared cleanly.']);
}

if ($path === 'admin/seed-demo' && $method === 'POST') {
    require_db();
    require_admin();
    DJ_Database::seed_initial_data(true);
    json_response(['ok' => true, 'message' => 'Demo events and requests restored successfully.']);
}

if ($path === 'admin/reset-desk' && $method === 'POST') {
    require_db();
    require_admin();

    $wipeTables = !empty($input['wipe_data']);
    if ($wipeTables) {
        DJ_Database::clear_sample_data();
        try {
            $users_table = DJ_Database::get_table_name('users');
            $sessions_table = DJ_Database::get_table_name('sessions');
            DJ_Database::pdo()->exec("DELETE FROM $sessions_table");
            DJ_Database::pdo()->exec("DELETE FROM $users_table");
        } catch (\Throwable $e) {}
    }

    $resetConfig = $config;
    $resetConfig['configured'] = false;
    $resetConfig['db']['name'] = '';
    $resetConfig['db']['user'] = '';
    $resetConfig['db']['pass'] = '';
    $saveRes = save_config_file($resetConfig);

    if (!$saveRes['ok']) {
        json_error($saveRes['error'] ?? 'Failed to reset config.php', 500);
    }

    setcookie('dj_desk_session', '', [
        'expires'  => time() - 3600,
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Lax'
    ]);

    json_response([
        'ok'      => true,
        'message' => 'DJ-Desk configuration reset. Redirecting to Setup Wizard...'
    ]);
}

// 404 Route Not Found

json_error("Route not found: $path", 404);
