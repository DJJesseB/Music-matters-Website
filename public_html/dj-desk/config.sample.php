<?php
/**
 * DJ Live Request Desk & Event Manager - Configuration Template
 * 
 * Instructions for Standard Shared Web Hosting:
 * 1. Log into your hosting control panel (cPanel / DirectAdmin / Plesk).
 * 2. Go to MySQL Databases and create a database and a database user with ALL PRIVILEGES.
 * 3. Copy this file to `config.php` and enter your database credentials below.
 * 4. Place this entire folder in your website document root or any subfolder
 *    (for example: public_html/dj-requests/ or public_html/booth/).
 */

return [
    // Database Configuration (MySQL / MariaDB on shared hosts)
    'db' => [
        'driver'   => 'mysql',          // 'mysql' for shared hosts; 'sqlite' for zero-config testing
        'host'     => 'localhost',      // Usually 'localhost' or '127.0.0.1' on cPanel
        'port'     => 3306,
        'name'     => 'dj_desk',        // Your MySQL database name
        'user'     => 'dj_user',        // Your MySQL username
        'pass'     => 'your_password',  // Your MySQL password
        'charset'  => 'utf8mb4',
        'prefix'   => 'dj_'             // Table prefix
    ],

    // Administrator Account (auto-created on first database initialization)
    'admin' => [
        'email'    => 'admin@example.com',
        'password' => 'DJDesk2026!'
    ],

    // Business Brand & Retainer Settings
    'brand' => [
        'name'             => 'DJ Jesse B',
        'tip_link'         => '',
        'standard_deposit' => 250,
        'deposit_percent'  => 20,
        'deposit_mode'     => 'higher', // 'higher' ($250 or 20%, whichever is greater), 'flat', or 'percent'
        'deposit_policy'   => 'A non-refundable retainer reserves your event date once the agreement is signed and payment is verified. It is non-refundable, used for date reservation and administrative purposes, and credited toward your event total.'
    ],

    // Security & Guest Song Request Anti-Spam Controls
    'security' => [
        'rate_limit_seconds' => 15,     // Cooldown between mobile song requests from the same device
        'max_requests_hour'  => 30,     // Hourly cap per guest device
        'session_lifetime'   => 604800  // 7 days in seconds
    ],

    // Stripe Online Payments (Optional)
    'stripe' => [
        'enabled'         => false,
        'mode'            => 'test',    // 'test' or 'live'
        'publishable_key' => '',
        'secret_key'      => '',
        'webhook_secret'  => ''
    ]
];
