<?php
/**
 * DJ Live Request Desk & Event Manager
 * Emergency Administrator Password Reset (CLI Tool)
 * 
 * Usage from terminal / SSH:
 *   php emergency-reset.php [admin_email] [new_password]
 * 
 * Example:
 *   php emergency-reset.php admin@example.com NewSecurePassword123!
 */

if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    echo "This emergency tool can only be executed from the server command line (CLI) for security.\n";
    echo "To reset via web/FTP without terminal access, specify 'emergency_password' in config.php.\n";
    exit(1);
}

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    echo "Error: config.php not found at $configFile\n";
    exit(1);
}

$config = require $configFile;
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/Auth.php';

try {
    DJ_Database::init($config);
} catch (\Throwable $e) {
    echo "Database connection failed: " . $e->getMessage() . "\n";
    exit(1);
}

$email = $argv[1] ?? '';
$password = $argv[2] ?? '';

if (empty($email) || empty($password)) {
    echo "DJ-Desk Emergency Admin Reset Tool\n";
    echo "-----------------------------------\n";
    echo "Usage: php emergency-reset.php <email> <new_password>\n\n";
    $users_table = DJ_Database::get_table_name('users');
    $admins = DJ_Database::get_results("SELECT email FROM $users_table WHERE role = 'admin'");
    if ($admins) {
        echo "Current administrator accounts found:\n";
        foreach ($admins as $a) {
            echo " - " . $a['email'] . "\n";
        }
    }
    exit(1);
}

$email = strtolower(trim($email));
if (strlen($password) < 8) {
    echo "Error: Password must be at least 8 characters long.\n";
    exit(1);
}

$users_table = DJ_Database::get_table_name('users');
$sessions_table = DJ_Database::get_table_name('sessions');
$user = DJ_Database::get_row("SELECT * FROM $users_table WHERE email = ?", [$email]);
$hashed = DJ_Auth::hash_password($password);

if ($user) {
    DJ_Database::update($users_table, [
        'password' => $hashed,
        'role'     => 'admin'
    ], ['id' => $user['id']]);
    DJ_Database::delete($sessions_table, ['user_id' => $user['id']]);
    echo "✓ Success: Password has been reset for administrator: $email\n";
    echo "  All active sessions for this administrator have been logged out.\n";
} else {
    $id = DJ_Database::uuid();
    DJ_Database::insert($users_table, [
        'id'       => $id,
        'email'    => $email,
        'password' => $hashed,
        'role'     => 'admin'
    ]);
    echo "✓ Success: Administrator account created with email: $email\n";
}
