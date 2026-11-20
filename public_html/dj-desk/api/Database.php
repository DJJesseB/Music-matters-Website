<?php
/**
 * DJ Live Request Desk & Event Manager
 * Database Abstraction Layer (PDO MySQL / MariaDB & SQLite)
 */

class DJ_Database {
    private static ?PDO $pdo = null;
    private static array $config = [];
    private static string $prefix = 'dj_';

    public static function init(?array $config = null): ?PDO {
        if (self::$pdo !== null) {
            return self::$pdo;
        }

        if ($config === null) {
            $configFile = dirname(__DIR__) . '/config.php';
            if (file_exists($configFile)) {
                $config = require $configFile;
            } else {
                $config = [];
            }
        }

        self::$config = $config;
        $db = $config['db'] ?? [];
        self::$prefix = $db['prefix'] ?? 'dj_';

        $driver = strtolower($db['driver'] ?? 'mysql');
        try {
            if ($driver === 'sqlite') {
                $sqlitePath = $db['path'] ?? (dirname(__DIR__) . '/data/dj_desk.sqlite');
                $sqliteDir = dirname($sqlitePath);
                if (!is_dir($sqliteDir)) {
                    @mkdir($sqliteDir, 0755, true);
                }
                self::$pdo = new PDO("sqlite:$sqlitePath", null, null, [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
                ]);
                self::$pdo->exec('PRAGMA foreign_keys = ON;');
            } else {
                $host = $db['host'] ?? 'localhost';
                $port = (int)($db['port'] ?? 3306);
                $name = $db['name'] ?? 'dj_desk';
                $user = $db['user'] ?? 'root';
                $pass = $db['pass'] ?? '';
                $charset = $db['charset'] ?? 'utf8mb4';

                $dsn = "mysql:host=$host;port=$port;dbname=$name;charset=$charset";
                $options = [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false
                ];

                try {
                    self::$pdo = new PDO($dsn, $user, $pass, $options);
                } catch (PDOException $e) {
                    $is2002 = ($e->getCode() === 2002 || strpos($e->getMessage(), '2002') !== false || stripos($e->getMessage(), 'No such file or directory') !== false);
                    $connected = false;
                    if ($is2002 && ($host === 'localhost' || $host === '127.0.0.1')) {
                        $altHost = ($host === 'localhost') ? '127.0.0.1' : 'localhost';
                        try {
                            $altDsn = "mysql:host=$altHost;port=$port;dbname=$name;charset=$charset";
                            self::$pdo = new PDO($altDsn, $user, $pass, $options);
                            $connected = true;
                        } catch (\Throwable $e2) {
                            $knownSockets = ['/var/run/mysqld/mysqld.sock', '/tmp/mysql.sock', '/var/lib/mysql/mysql.sock', '/run/mysqld/mysqld.sock'];
                            foreach ($knownSockets as $sock) {
                                if (file_exists($sock)) {
                                    try {
                                        $sockDsn = "mysql:unix_socket=$sock;dbname=$name;charset=$charset";
                                        self::$pdo = new PDO($sockDsn, $user, $pass, $options);
                                        $connected = true;
                                        break;
                                    } catch (\Throwable $e3) {}
                                }
                            }
                        }
                    }
                    if (!$connected) {
                        self::$pdo = null;
                        throw $e;
                    }
                }
            }
        } catch (PDOException $e) {
            self::$pdo = null;
            throw $e;
        }

        self::ensure_installed();
        return self::$pdo;
    }

    public static function is_connected(): bool {
        return self::$pdo !== null;
    }

    public static function reset(): void {
        self::$pdo = null;
    }

    public static function test_connection(array $db): array {
        $driver = strtolower($db['driver'] ?? 'mysql');
        $available = PDO::getAvailableDrivers();
        try {
            if ($driver === 'sqlite') {
                if (!in_array('sqlite', $available)) {
                    return ['ok' => false, 'error' => 'SQLite (pdo_sqlite) is not installed on this PHP server. Please choose MySQL.'];
                }
                $path = $db['path'] ?? (dirname(__DIR__) . '/data/dj_desk.sqlite');
                $dir = dirname($path);
                if (!is_dir($dir) && !@mkdir($dir, 0755, true)) {
                    return ['ok' => false, 'error' => "Cannot create directory $dir. Check directory write permissions."];
                }
                $pdo = new PDO("sqlite:$path");
                return ['ok' => true, 'message' => 'SQLite connection verified! Database will be created inside the directory.'];
            } else {
                if (!in_array('mysql', $available)) {
                    return ['ok' => false, 'error' => 'MySQL (pdo_mysql) is not installed on this PHP server.'];
                }
                $host = $db['host'] ?? 'localhost';
                $port = (int)($db['port'] ?? 3306);
                $name = trim((string)($db['name'] ?? ''));
                $user = trim((string)($db['user'] ?? ''));
                $pass = (string)($db['pass'] ?? '');
                $charset = $db['charset'] ?? 'utf8mb4';

                if (empty($name) || empty($user)) {
                    return ['ok' => false, 'error' => 'Database name and database username are required.'];
                }

                $dsn = "mysql:host=$host;port=$port;dbname=$name;charset=$charset";
                $options = [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_TIMEOUT => 5
                ];

                try {
                    $pdo = new PDO($dsn, $user, $pass, $options);
                    return ['ok' => true, 'workingHost' => $host, 'message' => 'Successfully connected to MySQL database on ' . $host . '!'];
                } catch (\Throwable $e) {
                    $is2002 = ($e->getCode() === 2002 || strpos($e->getMessage(), '2002') !== false || stripos($e->getMessage(), 'No such file or directory') !== false);
                    if ($is2002 && ($host === 'localhost' || $host === '127.0.0.1')) {
                        $altHost = ($host === 'localhost') ? '127.0.0.1' : 'localhost';
                        try {
                            $altDsn = "mysql:host=$altHost;port=$port;dbname=$name;charset=$charset";
                            $pdo = new PDO($altDsn, $user, $pass, $options);
                            return ['ok' => true, 'workingHost' => $altHost, 'message' => "Successfully connected to MySQL database via $altHost!"];
                        } catch (\Throwable $e2) {
                            $knownSockets = ['/var/run/mysqld/mysqld.sock', '/tmp/mysql.sock', '/var/lib/mysql/mysql.sock', '/run/mysqld/mysqld.sock'];
                            foreach ($knownSockets as $sock) {
                                if (file_exists($sock)) {
                                    try {
                                        $sockDsn = "mysql:unix_socket=$sock;dbname=$name;charset=$charset";
                                        $pdo = new PDO($sockDsn, $user, $pass, $options);
                                        return ['ok' => true, 'workingHost' => $host, 'message' => "Successfully connected to MySQL database via $sock!"];
                                    } catch (\Throwable $e3) {}
                                }
                            }
                        }
                    }
                    return ['ok' => false, 'error' => $e->getMessage()];
                }
            }
        } catch (\Throwable $e) {
            return ['ok' => false, 'error' => $e->getMessage()];
        }
    }

    public static function pdo(): PDO {
        if (self::$pdo === null) {
            self::init();
        }
        return self::$pdo;
    }

    public static function get_table_name(string $name): string {
        return self::$prefix . $name;
    }

    public static function query(string $sql, array $params = []): PDOStatement {
        $stmt = self::pdo()->prepare($sql);
        $stmt->execute($params);
        return $stmt;
    }

    public static function get_row(string $sql, array $params = []): ?array {
        $stmt = self::query($sql, $params);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public static function get_results(string $sql, array $params = []): array {
        $stmt = self::query($sql, $params);
        return $stmt->fetchAll();
    }

    public static function get_var(string $sql, array $params = []) {
        $stmt = self::query($sql, $params);
        return $stmt->fetchColumn();
    }

    public static function get_col(string $sql, array $params = []): array {
        $stmt = self::query($sql, $params);
        return $stmt->fetchAll(PDO::FETCH_COLUMN, 0);
    }

    public static function insert(string $table, array $data): bool {
        $cols = array_keys($data);
        $placeholders = array_fill(0, count($cols), '?');
        $sql = "INSERT INTO $table (" . implode(', ', $cols) . ") VALUES (" . implode(', ', $placeholders) . ")";
        return self::query($sql, array_values($data))->rowCount() > 0;
    }

    public static function update(string $table, array $data, array $where): int {
        $set = [];
        $values = [];
        foreach ($data as $col => $val) {
            $set[] = "$col = ?";
            $values[] = $val;
        }
        $whereClause = [];
        foreach ($where as $col => $val) {
            $whereClause[] = "$col = ?";
            $values[] = $val;
        }
        $sql = "UPDATE $table SET " . implode(', ', $set) . " WHERE " . implode(' AND ', $whereClause);
        return self::query($sql, $values)->rowCount();
    }

    public static function replace(string $table, array $data): bool {
        $driver = strtolower(self::$config['db']['driver'] ?? 'mysql');
        $verb = ($driver === 'sqlite') ? 'INSERT OR REPLACE' : 'REPLACE';
        $cols = array_keys($data);
        $placeholders = array_fill(0, count($cols), '?');
        $sql = "$verb INTO $table (" . implode(', ', $cols) . ") VALUES (" . implode(', ', $placeholders) . ")";
        return self::query($sql, array_values($data))->rowCount() > 0;
    }

    public static function delete(string $table, array $where): int {
        $whereClause = [];
        $values = [];
        foreach ($where as $col => $val) {
            $whereClause[] = "$col = ?";
            $values[] = $val;
        }
        $sql = "DELETE FROM $table WHERE " . implode(' AND ', $whereClause);
        return self::query($sql, $values)->rowCount();
    }

    public static function get_meta(string $key, $default = null) {
        $table = self::get_table_name('metadata');
        $row = self::get_row("SELECT meta_value FROM $table WHERE meta_key = ?", [$key]);
        return $row ? $row['meta_value'] : $default;
    }

    public static function set_meta(string $key, $value): bool {
        $table = self::get_table_name('metadata');
        return self::replace($table, [
            'meta_key' => $key,
            'meta_value' => is_scalar($value) ? (string)$value : json_encode($value)
        ]);
    }

    public static function delete_meta(string $key): int {
        $table = self::get_table_name('metadata');
        return self::delete($table, ['meta_key' => $key]);
    }

    public static function uuid(): string {
        return sprintf(
            '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );
    }

    public static function now(): string {
        return gmdate('Y-m-d H:i:s');
    }

    public static function ensure_installed(): void {
        $events = self::get_table_name('events');
        $driver = strtolower(self::$config['db']['driver'] ?? 'mysql');

        // Check if already created
        try {
            if ($driver === 'sqlite') {
                $exists = self::get_var("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?", [$events]);
            } else {
                $exists = self::get_var("SHOW TABLES LIKE '$events'");
            }
            if ($exists) {
                return;
            }
        } catch (\Throwable $e) {
            // Not installed yet
        }

        try {
            self::create_tables();
        } catch (\Throwable $e) {
            error_log("DJ_Database ensure_installed non-fatal: " . $e->getMessage());
        }
    }

    public static function create_tables(): void {
        $driver = strtolower(self::$config['db']['driver'] ?? 'mysql');
        $isSqlite = ($driver === 'sqlite');

        $clients = self::get_table_name('clients');
        $events = self::get_table_name('events');
        $metadata = self::get_table_name('metadata');
        $users = self::get_table_name('users');
        $sessions = self::get_table_name('sessions');
        $memberships = self::get_table_name('memberships');
        $contract_memberships = self::get_table_name('contract_memberships');
        $invitations = self::get_table_name('invitations');
        $portal_plans = self::get_table_name('portal_plans');
        $music_settings = self::get_table_name('music_request_settings');
        $music_requests = self::get_table_name('music_requests');
        $music_blocks = self::get_table_name('music_request_blocks');
        $music_history = self::get_table_name('music_request_history');
        $contracts = self::get_table_name('contracts');
        $signatures = self::get_table_name('signatures');
        $booking_requests = self::get_table_name('booking_requests');
        $booking_workflows = self::get_table_name('booking_workflows');
        $followup_settings = self::get_table_name('followup_settings');
        $followup_drafts = self::get_table_name('followup_drafts');
        $stripe_invoices = self::get_table_name('stripe_invoices');
        $stripe_receipts = self::get_table_name('stripe_receipts');

        $options = $isSqlite ? '' : 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';

        $tables = [
            "CREATE TABLE IF NOT EXISTS $clients (
                id varchar(64) NOT NULL,
                name varchar(255) NOT NULL,
                email varchar(255) NOT NULL,
                phone varchar(64) NOT NULL DEFAULT '',
                organization varchar(255) NOT NULL DEFAULT '',
                PRIMARY KEY (id)
            ) $options;",

            "CREATE TABLE IF NOT EXISTS $events (
                id varchar(64) NOT NULL,
                client_id varchar(64) NOT NULL,
                body longtext NOT NULL,
                version int(11) NOT NULL DEFAULT 1,
                created_at datetime NOT NULL,
                PRIMARY KEY (id)
            ) $options;",

            "CREATE TABLE IF NOT EXISTS $metadata (
                meta_key varchar(64) NOT NULL,
                meta_value longtext NOT NULL,
                PRIMARY KEY (meta_key)
            ) $options;",

            "CREATE TABLE IF NOT EXISTS $users (
                id varchar(64) NOT NULL,
                email varchar(191) NOT NULL,
                password varchar(255) NOT NULL,
                role varchar(32) NOT NULL,
                PRIMARY KEY (id),
                UNIQUE (email)
            ) $options;",

            "CREATE TABLE IF NOT EXISTS $sessions (
                token varchar(64) NOT NULL,
                user_id varchar(64) NOT NULL,
                csrf varchar(64) NOT NULL,
                expires bigint(20) NOT NULL,
                PRIMARY KEY (token)
            ) $options;",

            "CREATE TABLE IF NOT EXISTS $memberships (
                user_id varchar(64) NOT NULL,
                event_id varchar(64) NOT NULL,
                PRIMARY KEY (user_id, event_id)
            ) $options;",

            "CREATE TABLE IF NOT EXISTS $contract_memberships (
                user_id varchar(64) NOT NULL,
                event_id varchar(64) NOT NULL,
                name varchar(255) NOT NULL DEFAULT '',
                PRIMARY KEY (user_id, event_id)
            ) $options;",

            "CREATE TABLE IF NOT EXISTS $invitations (
                token varchar(64) NOT NULL,
                event_id varchar(64) NOT NULL,
                email varchar(255) NOT NULL,
                expires bigint(20) NOT NULL,
                access_scope varchar(32) NOT NULL DEFAULT 'planner',
                contact_name varchar(255) NOT NULL DEFAULT '',
                PRIMARY KEY (token)
            ) $options;",

            "CREATE TABLE IF NOT EXISTS $portal_plans (
                event_id varchar(64) NOT NULL,
                body longtext NOT NULL,
                version int(11) NOT NULL DEFAULT 1,
                PRIMARY KEY (event_id)
            ) $options;",

            "CREATE TABLE IF NOT EXISTS $music_settings (
                event_id varchar(64) NOT NULL,
                token varchar(64) NOT NULL,
                enabled tinyint(1) NOT NULL DEFAULT 0,
                version int(11) NOT NULL DEFAULT 1,
                PRIMARY KEY (event_id),
                UNIQUE (token)
            ) $options;",

            "CREATE TABLE IF NOT EXISTS $music_requests (
                id varchar(64) NOT NULL,
                event_id varchar(64) NOT NULL,
                submission_key varchar(64) NOT NULL,
                title varchar(255) NOT NULL,
                artist varchar(255) NOT NULL,
                status varchar(32) NOT NULL DEFAULT 'Pending',
                version int(11) NOT NULL DEFAULT 1,
                created_at datetime NOT NULL,
                updated_at datetime NOT NULL,
                device_hash varchar(64) NOT NULL,
                PRIMARY KEY (id),
                UNIQUE (event_id, submission_key)
            ) $options;",

            "CREATE TABLE IF NOT EXISTS $music_blocks (
                event_id varchar(64) NOT NULL,
                device_hash varchar(64) NOT NULL,
                blocked tinyint(1) NOT NULL DEFAULT 1,
                updated_at datetime NOT NULL,
                actor_id varchar(64) NOT NULL,
                PRIMARY KEY (event_id, device_hash)
            ) $options;",

            "CREATE TABLE IF NOT EXISTS $music_history (
                " . ($isSqlite ? "id INTEGER PRIMARY KEY AUTOINCREMENT," : "id bigint(20) NOT NULL AUTO_INCREMENT,") . "
                request_id varchar(64) NOT NULL,
                status varchar(64) NOT NULL,
                actor_id varchar(64) NOT NULL,
                changed_at datetime NOT NULL" . ($isSqlite ? "" : ", PRIMARY KEY (id)") . "
            ) $options;",

            "CREATE TABLE IF NOT EXISTS $contracts (
                id varchar(64) NOT NULL,
                event_id varchar(64) NOT NULL,
                revision int(11) NOT NULL,
                snapshot longtext NOT NULL,
                hash varchar(64) NOT NULL,
                recipient_id varchar(64) NOT NULL,
                status varchar(32) NOT NULL,
                created_at datetime NOT NULL,
                PRIMARY KEY (id),
                UNIQUE (event_id, revision)
            ) $options;",

            "CREATE TABLE IF NOT EXISTS $signatures (
                contract_id varchar(64) NOT NULL,
                body longtext NOT NULL,
                PRIMARY KEY (contract_id)
            ) $options;",

            "CREATE TABLE IF NOT EXISTS $booking_requests (
                id varchar(64) NOT NULL,
                submission_key varchar(64) NOT NULL,
                body longtext NOT NULL,
                state varchar(32) NOT NULL DEFAULT 'Pending',
                event_id varchar(64) DEFAULT NULL,
                version int(11) NOT NULL DEFAULT 1,
                created_at datetime NOT NULL,
                PRIMARY KEY (id),
                UNIQUE (submission_key)
            ) $options;",

            "CREATE TABLE IF NOT EXISTS $booking_workflows (
                event_id varchar(64) NOT NULL,
                request_id varchar(64) NOT NULL,
                approved_at datetime NOT NULL,
                PRIMARY KEY (event_id),
                UNIQUE (request_id)
            ) $options;",

            "CREATE TABLE IF NOT EXISTS $followup_settings (
                event_id varchar(64) NOT NULL,
                body longtext NOT NULL,
                PRIMARY KEY (event_id)
            ) $options;",

            "CREATE TABLE IF NOT EXISTS $followup_drafts (
                id varchar(64) NOT NULL,
                event_id varchar(64) NOT NULL,
                body longtext NOT NULL,
                status varchar(32) NOT NULL,
                created_at datetime NOT NULL,
                handled_at datetime DEFAULT NULL,
                PRIMARY KEY (id)
            ) $options;",

            "CREATE TABLE IF NOT EXISTS $stripe_invoices (
                id varchar(64) NOT NULL,
                event_id varchar(64) NOT NULL,
                kind varchar(32) NOT NULL,
                payer varchar(255) NOT NULL,
                amount int(11) NOT NULL,
                status varchar(32) NOT NULL DEFAULT 'draft',
                url varchar(500) NOT NULL DEFAULT '',
                number varchar(64) NOT NULL DEFAULT '',
                body longtext NOT NULL,
                created_at datetime NOT NULL,
                PRIMARY KEY (id)
            ) $options;",

            "CREATE TABLE IF NOT EXISTS $stripe_receipts (
                payment_id varchar(128) NOT NULL,
                invoice_id varchar(64) NOT NULL,
                amount int(11) NOT NULL,
                refunded int(11) NOT NULL DEFAULT 0,
                disputed tinyint(1) NOT NULL DEFAULT 0,
                created_at datetime NOT NULL,
                PRIMARY KEY (payment_id)
            ) $options;"
        ];

        foreach ($tables as $sql) {
            self::pdo()->exec($sql);
        }
    }

    public static function clear_sample_data(): void {
        $tables = [
            'events', 'clients', 'booking_requests', 'booking_workflows',
            'music_request_settings', 'music_requests', 'music_request_blocks', 'music_request_history',
            'contracts', 'signatures', 'portal_plans', 'followup_settings', 'followup_drafts',
            'stripe_invoices', 'stripe_receipts', 'invitations', 'memberships', 'contract_memberships'
        ];
        foreach ($tables as $t) {
            try {
                $tableName = self::get_table_name($t);
                self::pdo()->exec("DELETE FROM $tableName");
            } catch (\Throwable $e) {
                // Table might not exist or already be empty
            }
        }
        self::delete_meta('seeded');
    }

    public static function seed_initial_data(bool $force = false): void {
        $events_table = self::get_table_name('events');
        $count = (int)self::get_var("SELECT COUNT(*) FROM $events_table");
        if (!$force && $count > 0) {
            return;
        }

        if ($force) {
            self::clear_sample_data();
        }

        // 0. Ensure Admin User
        $users_table = self::get_table_name('users');
        $adminEmail = strtolower(trim(self::$config['admin']['email'] ?? 'admin@example.com'));
        $adminPass = self::$config['admin']['password'] ?? 'DJDesk2026!';
        $adminExists = self::get_var("SELECT 1 FROM $users_table WHERE email = ?", [$adminEmail]);
        if (!$adminExists) {
            $salt = bin2hex(random_bytes(16));
            $hash = hash_pbkdf2('sha256', $adminPass, $salt, 10000, 64);
            self::insert($users_table, [
                'id' => self::uuid(),
                'email' => $adminEmail,
                'password' => $salt . ':' . $hash,
                'role' => 'admin'
            ]);
        }

        $clients_table = self::get_table_name('clients');
        $requests_table = self::get_table_name('booking_requests');
        $music_settings = self::get_table_name('music_request_settings');
        $music_requests = self::get_table_name('music_requests');
        $contracts_table = self::get_table_name('contracts');
        $signatures_table = self::get_table_name('signatures');
        $plans_table = self::get_table_name('portal_plans');
        $invoices_table = self::get_table_name('stripe_invoices');
        $receipts_table = self::get_table_name('stripe_receipts');
        $followup_drafts = self::get_table_name('followup_drafts');
        $followup_settings = self::get_table_name('followup_settings');

        $future1 = gmdate('Y-m-d', strtotime('+35 days'));
        $future2 = gmdate('Y-m-d', strtotime('+65 days'));
        $future3 = gmdate('Y-m-d', strtotime('+95 days'));

        // 1. Avery & Jordan Wedding
        $client1Id = self::uuid();
        $event1Id = self::uuid();
        $contract1Id = self::uuid();
        $invoice1Id = self::uuid();
        $contractHash1 = hash('sha256', $event1Id . ':contract-v1');

        self::insert($clients_table, [
            'id' => $client1Id,
            'name' => 'Avery Example',
            'email' => 'client@example.com',
            'phone' => '555-0101',
            'organization' => ''
        ]);

        $weddingBody = [
            'name' => 'Avery & Jordan • Wedding',
            'type' => 'Wedding',
            'date' => $future1,
            'status' => 'Confirmed',
            'venue' => 'Willow House',
            'address' => '100 Main Street',
            'startTime' => '17:00',
            'endTime' => '23:00',
            'setupTime' => '15:30',
            'loadOutTime' => '23:45',
            'amount' => 2750,
            'subtotal' => 2750,
            'discount' => 0,
            'depositRequired' => 550,
            'depositReceived' => 550,
            'paid' => 550,
            'package' => 'The Full Wedding Experience',
            'plannerStatus' => 'Submitted for review',
            'musicStatus' => 'In progress',
            'contractStatus' => 'Signed',
            'guests' => 140,
            'notes' => 'Full wedding experience package with ceremony, cocktail hour, and wireless uplighting.',
            'weddingPackage' => [
                'catalogVersion' => '2026-11-11',
                'selection' => [
                    'id' => 'full',
                    'guestCount' => 140,
                    'additionalSound' => false,
                    'extraSubwoofers' => 0,
                    'booth' => 'White',
                    'extraHalfHours' => 0,
                    'lighting' => 'uplighting',
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
                    'price' => 2500,
                    'hours' => 5.5,
                    'ceremony' => true,
                    'cocktail' => true,
                    'features' => [
                        'DJ Jesse B. as your reception DJ and MC',
                        'A dedicated assistant',
                        'Wedding Planning App',
                        'Your choice of white or black DJ booth',
                        'Ceremony sound with wireless microphones — portable and battery-operated',
                        'Cocktail-hour sound with custom mix — separate dedicated sound system',
                        'Premium reception sound system with wireless microphones',
                        'Advanced dance-floor lighting',
                        'Up to 5.5 hours total wedding coverage'
                    ]
                ],
                'items' => [
                    ['name' => 'The Full Wedding Experience', 'quantity' => 1, 'unitPrice' => 2500, 'total' => 2500],
                    ['name' => 'Wireless uplighting', 'quantity' => 1, 'unitPrice' => 250, 'total' => 250, 'description' => '8 wireless uplights']
                ],
                'total' => 2750,
                'coverageHours' => 5.5,
                'ceremonyCondition' => 'Included ceremony coverage requires the ceremony to be at the same location as the reception.',
                'cocktailIncluded' => true,
                'soundCapacityNotice' => '',
                'soundReviewRequired' => false
            ]
        ];

        self::insert($events_table, [
            'id' => $event1Id,
            'client_id' => $client1Id,
            'body' => json_encode($weddingBody),
            'version' => 1,
            'created_at' => gmdate('Y-m-d H:i:s', strtotime('-10 days'))
        ]);

        $contractSnapshot1 = [
            'signerName' => 'Avery Example',
            'signerEmail' => 'client@example.com',
            'acceptance' => 'I agree to the terms of this contract and intend to sign it electronically.',
            'disclosure' => 'Electronic signing is provided for your convenience. You may download a copy before and after signing.',
            'event' => [
                'name' => 'Avery & Jordan • Wedding',
                'type' => 'Wedding',
                'date' => $future1,
                'venue' => 'Willow House',
                'package' => 'The Full Wedding Experience'
            ],
            'financials' => [
                'amount' => 2750,
                'depositRequired' => 550,
                'balanceDue' => 2200
            ],
            'terms' => "EVENT ENTERTAINMENT SERVICES AGREEMENT\nThis agreement is made between DJ Jesse B and Avery Example for the event details and fee specified above.\n1. RETAINER & PAYMENT: A standard upfront non-refundable retainer of $550.00 reserves the event date. The remaining balance of $2,200.00 is due 14 days prior to the event date.\n2. PERFORMANCE & TIMING: DJ Jesse B and assistant will arrive at Willow House 90 minutes prior to scheduled start time for sound check and setup.\n3. CANCELLATION: Written notice is required for rescheduling or cancellations.\n4. VENUE & SOUND: Client ensures adequate power and safe operating space for all sound reinforcement and lighting equipment."
        ];

        self::insert($contracts_table, [
            'id' => $contract1Id,
            'event_id' => $event1Id,
            'revision' => 1,
            'snapshot' => json_encode($contractSnapshot1),
            'hash' => $contractHash1,
            'recipient_id' => $client1Id,
            'status' => 'Signed',
            'created_at' => gmdate('Y-m-d H:i:s', strtotime('-7 days'))
        ]);

        self::insert($signatures_table, [
            'contract_id' => $contract1Id,
            'body' => json_encode([
                'signatureText' => 'Avery Example',
                'signerRole' => 'Client / Couple',
                'accepted' => true,
                'email' => 'client@example.com',
                'signedAt' => gmdate('Y-m-d H:i:s', strtotime('-5 days')),
                'contractHash' => $contractHash1
            ])
        ]);

        self::insert($invoices_table, [
            'id' => $invoice1Id,
            'event_id' => $event1Id,
            'kind' => 'retainer',
            'payer' => 'client@example.com',
            'amount' => 55000,
            'status' => 'paid',
            'url' => 'https://checkout.stripe.com/pay/cs_test_demo_retainer_avery',
            'number' => 'cs_test_demo_retainer_avery',
            'body' => json_encode([
                'id' => 'cs_test_demo_retainer_avery',
                'payment_status' => 'paid',
                'amount_total' => 55000,
                'currency' => 'usd'
            ]),
            'created_at' => gmdate('Y-m-d H:i:s', strtotime('-5 days'))
        ]);

        self::insert($receipts_table, [
            'payment_id' => 'pi_test_demo_payment_avery_550',
            'invoice_id' => $invoice1Id,
            'amount' => 55000,
            'refunded' => 0,
            'disputed' => 0,
            'created_at' => gmdate('Y-m-d H:i:s', strtotime('-5 days'))
        ]);

        $portalPlan1 = [
            'answers' => [
                'couple' => 'Avery & Jordan',
                'contacts' => 'Jane Smith - Wedding Coordinator (555-0192)',
                'announcements' => 'Grand entrance at 19:00, Champagne toast at 19:15, Cake cutting at 21:00',
                'logistics' => 'Load-in at loading ramp adjacent to garden courtyard. Power drop available at DJ booth location.'
            ],
            'wedding' => [
                'values' => [
                    'couple' => 'Avery & Jordan',
                    'date' => $future1,
                    'guest_count' => 140,
                    'venue' => 'Willow House',
                    'address' => '100 Main Street'
                ],
                'moments' => [
                    'ceremony' => [
                        'enabled' => true,
                        'time' => '17:00',
                        'timeTbd' => false,
                        'music' => 'Instrumental indie & acoustic covers',
                        'notes' => 'Microphone for officiant and reader',
                        'details' => [
                            'processional' => "Canon in D - Acoustic Guitar (Bridal Party)\nCan't Help Falling in Love - Kina Grannis (Bride)",
                            'recessional' => 'Signed, Sealed, Delivered - Stevie Wonder',
                            'cue_contact' => 'Jane Smith (Coordinator) 555-0192'
                        ]
                    ],
                    'cocktail' => [
                        'enabled' => true,
                        'time' => '18:00',
                        'timeTbd' => false,
                        'music' => 'Upbeat soul, classic Motown, and warm acoustic indie',
                        'notes' => 'Courtyard patio sound setup',
                        'details' => ['style' => 'Warm, soulful & upbeat']
                    ]
                ]
            ],
            'mustPlay' => "Earth, Wind & Fire - September\nStevie Wonder - Signed, Sealed, Delivered\nABBA - Dancing Queen\nWhitney Houston - I Wanna Dance with Somebody\nBruno Mars - 24K Magic",
            'doNotPlay' => "Chicken Dance\nMacarena\nCha Cha Slide\nCotton Eye Joe",
            'playlist' => 'https://open.spotify.com/playlist/sample-wedding-favorites',
            'timeline' => [
                ['time' => '17:00', 'activity' => 'Guest Arrival & Prelude', 'notes' => 'Acoustic / instrumental playlist'],
                ['time' => '17:30', 'activity' => 'Ceremony Processional & Exchange', 'notes' => 'Handheld wireless mic for vows'],
                ['time' => '18:00', 'activity' => 'Cocktail Hour in Courtyard', 'notes' => 'Soul and Motown groove'],
                ['time' => '19:00', 'activity' => 'Grand Entrance & Welcome Toast', 'notes' => 'Couple entrance song: 24K Magic'],
                ['time' => '19:30', 'activity' => 'Dinner Service', 'notes' => 'Acoustic & jazz background music'],
                ['time' => '20:30', 'activity' => 'First Dance & Special Dances', 'notes' => 'First dance: You Are The Best Thing - Ray LaMontagne'],
                ['time' => '21:00', 'activity' => 'Open Dance Floor Party', 'notes' => 'High energy party classics, funk, and 2000s throwbacks'],
                ['time' => '22:45', 'activity' => 'Last Dance & Sparkler Send-off', 'notes' => 'Last dance: Don\'t Stop Believin\' - Journey']
            ],
            'submitted' => true,
            'savedAt' => gmdate('Y-m-d H:i:s', strtotime('-2 days')),
            'version' => 1
        ];

        self::insert($plans_table, [
            'event_id' => $event1Id,
            'body' => json_encode($portalPlan1),
            'version' => 1
        ]);

        $qrToken1 = hash('sha256', $event1Id . ':music-token');
        self::insert($music_settings, [
            'event_id' => $event1Id,
            'token' => $qrToken1,
            'enabled' => 1,
            'version' => 1
        ]);

        $sampleSongs = [
            ['title' => 'September', 'artist' => 'Earth, Wind & Fire', 'status' => 'Approved'],
            ['title' => 'Levitating', 'artist' => 'Dua Lipa', 'status' => 'Pending'],
            ['title' => 'Mr. Brightside', 'artist' => 'The Killers', 'status' => 'Pending'],
            ['title' => 'I Wanna Dance with Somebody', 'artist' => 'Whitney Houston', 'status' => 'Played'],
            ['title' => 'Sir Duke', 'artist' => 'Stevie Wonder', 'status' => 'Approved'],
            ['title' => 'Shut Up and Dance', 'artist' => 'WALK THE MOON', 'status' => 'Pending']
        ];

        foreach ($sampleSongs as $i => $s) {
            self::insert($music_requests, [
                'id' => self::uuid(),
                'event_id' => $event1Id,
                'submission_key' => 'seed_key_' . $i,
                'title' => $s['title'],
                'artist' => $s['artist'],
                'status' => $s['status'],
                'version' => 1,
                'created_at' => gmdate('Y-m-d H:i:s', time() - (60 * (15 - $i))),
                'updated_at' => self::now(),
                'device_hash' => hash('sha256', 'guest_device_' . $i)
            ]);
        }

        // 2. Northstar Academy • Spring Formal
        $client2Id = self::uuid();
        $event2Id = self::uuid();
        $contract2Id = self::uuid();

        self::insert($clients_table, [
            'id' => $client2Id,
            'name' => 'Taylor Example',
            'email' => 'demo1@example.com',
            'phone' => '555-0102',
            'organization' => 'Northstar Academy'
        ]);

        $schoolBody = [
            'name' => 'Northstar Academy • Spring Formal',
            'type' => 'School dance',
            'date' => $future2,
            'status' => 'Tentative',
            'venue' => 'Northstar Fieldhouse',
            'address' => '450 Academy Way',
            'startTime' => '19:00',
            'endTime' => '23:00',
            'setupTime' => '17:30',
            'loadOutTime' => '23:45',
            'amount' => 1850,
            'subtotal' => 1850,
            'discount' => 0,
            'depositRequired' => 370,
            'depositReceived' => 0,
            'paid' => 0,
            'package' => 'The Total Prom Experience',
            'plannerStatus' => 'In progress',
            'musicStatus' => 'Not started',
            'contractStatus' => 'Sent',
            'guests' => 350,
            'notes' => 'Total Prom Experience package with UV Glow Party and atmospheric haze effect.',
            'schoolPackage' => [
                'catalogVersion' => '2026-11-14-school-2-3-4-hours',
                'selection' => [
                    'id' => 'prom',
                    'guestCount' => 350,
                    'additionalSound' => false,
                    'extraSubwoofers' => 0,
                    'booth' => 'Premium',
                    'extraHalfHours' => 0,
                    'lighting' => 'none',
                    'bubbles' => false,
                    'haze' => true,
                    'bubblesApproval' => 'Pending',
                    'hazeApproval' => 'Approved',
                    'glow' => true,
                    'additionalCharge' => 0,
                    'chargeNote' => '',
                    'extraTopPairs' => 0
                ],
                'package' => [
                    'id' => 'prom',
                    'name' => 'The Total Prom Experience',
                    'price' => 1500,
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
                    ['name' => 'The Total Prom Experience', 'quantity' => 1, 'unitPrice' => 1500, 'total' => 1500],
                    ['name' => 'Ultra-Violet Glow Party', 'quantity' => 1, 'unitPrice' => 250, 'total' => 250],
                    ['name' => 'Haze atmospheric effect', 'quantity' => 1, 'unitPrice' => 100, 'total' => 100, 'venueApproval' => 'Approved']
                ],
                'total' => 1850,
                'coverageHours' => 4
            ]
        ];

        self::insert($events_table, [
            'id' => $event2Id,
            'client_id' => $client2Id,
            'body' => json_encode($schoolBody),
            'version' => 1,
            'created_at' => gmdate('Y-m-d H:i:s', strtotime('-4 days'))
        ]);

        $contractSnapshot2 = [
            'signerName' => 'Taylor Example',
            'signerEmail' => 'demo1@example.com',
            'acceptance' => 'I agree to the terms of this contract and intend to sign it electronically on behalf of Northstar Academy.',
            'disclosure' => 'Electronic signing is provided for your convenience. You may download a copy before and after signing.',
            'event' => [
                'name' => 'Northstar Academy • Spring Formal',
                'type' => 'School dance',
                'date' => $future2,
                'venue' => 'Northstar Fieldhouse',
                'package' => 'The Total Prom Experience'
            ],
            'financials' => [
                'amount' => 1850,
                'depositRequired' => 370,
                'balanceDue' => 1850
            ],
            'terms' => "SCHOOL DANCE ENTERTAINMENT AGREEMENT\nThis agreement is made between DJ Jesse B and Northstar Academy for the Spring Formal.\n1. RETAINER & PAYMENT: A standard retainer of $370.00 reserves the event date on the DJ calendar. Remaining balance is due prior to the start of the event.\n2. CONTENT STANDARDS: All songs played will be clean radio edits appropriate for school functions.\n3. LOAD-IN & VENUE: School staff will ensure gymnasium/fieldhouse access 2 hours prior to scheduled start time."
        ];

        self::insert($contracts_table, [
            'id' => $contract2Id,
            'event_id' => $event2Id,
            'revision' => 1,
            'snapshot' => json_encode($contractSnapshot2),
            'hash' => hash('sha256', $event2Id . ':contract-v1'),
            'recipient_id' => $client2Id,
            'status' => 'Issued',
            'created_at' => gmdate('Y-m-d H:i:s', strtotime('-2 days'))
        ]);

        self::insert($followup_settings, [
            'event_id' => $event2Id,
            'body' => json_encode([
                'enabled' => true,
                'kind' => 'auto',
                'afterDays' => 3,
                'repeatDays' => 5,
                'maxReminders' => 3,
                'details' => 'Spring Formal retainer deposit and signed agreement'
            ])
        ]);

        self::insert($followup_drafts, [
            'id' => self::uuid(),
            'event_id' => $event2Id,
            'status' => 'Needs review',
            'body' => json_encode([
                'kind' => 'deposit',
                'eventName' => 'Northstar Academy • Spring Formal',
                'from' => 'djgourmet@me.com',
                'to' => 'demo1@example.com',
                'subject' => 'Northstar Academy Spring Formal — Contract & Retainer Reminder',
                'body' => "Hi Taylor,\n\nI hope your week is going well! I wanted to follow up on the entertainment agreement for the Northstar Academy Spring Formal.\n\nYour date is currently on soft hold. To reserve the date on our master calendar, please review and electronically sign the contract and submit the retainer deposit when ready.\n\nLet me know if you or the committee have any questions about the sound layout or glow package!\n\nBest,\nDJ Jesse B"
            ]),
            'created_at' => gmdate('Y-m-d H:i:s', strtotime('-1 day'))
        ]);

        // 3. Morgan • 30th Birthday Celebration
        $client3Id = self::uuid();
        $event3Id = self::uuid();

        self::insert($clients_table, [
            'id' => $client3Id,
            'name' => 'Morgan Demo',
            'email' => 'demo2@example.com',
            'phone' => '555-0103',
            'organization' => ''
        ]);

        $privateBody = [
            'name' => 'Morgan • 30th Birthday Celebration',
            'type' => 'Private party',
            'date' => $future3,
            'status' => 'Inquiry',
            'venue' => 'The Loft Downtown',
            'address' => '720 4th Ave, Suite 300',
            'startTime' => '20:00',
            'endTime' => '00:00',
            'setupTime' => '18:45',
            'loadOutTime' => '00:45',
            'amount' => 1200,
            'subtotal' => 1200,
            'discount' => 0,
            'depositRequired' => 250,
            'depositReceived' => 0,
            'paid' => 0,
            'package' => 'Private event à la carte services',
            'plannerStatus' => 'Not started',
            'musicStatus' => 'Not started',
            'contractStatus' => 'Not sent',
            'guests' => 60,
            'notes' => '4 hours DJ & MC service with 8 wireless uplights.',
            'privatePackage' => [
                'catalogVersion' => '2026-11-private-v3',
                'selection' => [
                    'id' => 'private',
                    'djHours' => 4,
                    'guestCount' => 60,
                    'lighting' => 'uplighting',
                    'glow' => false,
                    'bubbles' => false,
                    'haze' => false,
                    'additionalSound' => false,
                    'extraSubwoofers' => 0
                ],
                'package' => [
                    'id' => 'private',
                    'name' => 'Private event à la carte services',
                    'price' => 1200,
                    'hours' => 4,
                    'features' => [
                        'DJ Jesse B. as your DJ and MC',
                        'Premium sound system',
                        'Basic lighting',
                        'Custom DJ booth'
                    ]
                ],
                'items' => [
                    ['name' => 'DJ Jesse B. DJ and MC service', 'quantity' => 4, 'unitPrice' => 250, 'total' => 1000, 'description' => 'First four hours: 250 per hour.'],
                    ['name' => 'Wireless uplighting', 'quantity' => 1, 'unitPrice' => 200, 'total' => 200]
                ],
                'total' => 1200,
                'coverageHours' => 4
            ]
        ];

        self::insert($events_table, [
            'id' => $event3Id,
            'client_id' => $client3Id,
            'body' => json_encode($privateBody),
            'version' => 1,
            'created_at' => gmdate('Y-m-d H:i:s', strtotime('-1 day'))
        ]);

        // 4. Sample Booking Requests
        self::insert($requests_table, [
            'id' => self::uuid(),
            'submission_key' => 'sub_key_' . self::uuid(),
            'event_id' => null,
            'state' => 'Pending',
            'version' => 1,
            'body' => json_encode([
                'name' => 'Sarah & Liam Wedding',
                'clientName' => 'Sarah Jenkins',
                'type' => 'Wedding',
                'date' => gmdate('Y-m-d', strtotime('+70 days')),
                'venue' => 'Lakeside Pavilion',
                'email' => 'sarah.jenkins@example.com',
                'phone' => '555-0144',
                'guests' => 150,
                'ceremony' => true,
                'cocktail' => true,
                'notes' => 'Looking for ceremony and reception DJ coverage with uplighting.',
                'quote' => [
                    'catalogVersion' => '2026-11-11',
                    'selection' => [
                        'id' => 'full',
                        'guestCount' => 150,
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
                        'price' => 2500,
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
                        ['name' => 'The Full Wedding Experience', 'quantity' => 1, 'unitPrice' => 2500, 'total' => 2500]
                    ],
                    'total' => 2500,
                    'coverageHours' => 5.5,
                    'ceremonyCondition' => 'Included ceremony coverage requires the ceremony to be at the same location as the reception.',
                    'cocktailIncluded' => true,
                    'soundCapacityNotice' => '',
                    'soundReviewRequired' => false
                ]
            ]),
            'created_at' => gmdate('Y-m-d H:i:s', strtotime('-2 days'))
        ]);

        self::insert($requests_table, [
            'id' => self::uuid(),
            'submission_key' => 'sub_key_' . self::uuid(),
            'event_id' => null,
            'state' => 'Pending',
            'version' => 1,
            'body' => json_encode([
                'name' => 'Apex Annual Awards Gala',
                'clientName' => 'David Miller',
                'type' => 'Corporate',
                'date' => gmdate('Y-m-d', strtotime('+110 days')),
                'venue' => 'Grand Ballroom',
                'email' => 'dmiller@apextech.example.com',
                'phone' => '555-0199',
                'guests' => 200,
                'ceremony' => false,
                'cocktail' => false,
                'notes' => 'Corporate gala with dinner background music followed by full dance floor.',
                'quote' => [
                    'catalogVersion' => '2026-11-private-v3',
                    'selection' => [
                        'id' => 'corporate',
                        'guestCount' => 200,
                        'djHours' => 5,
                        'lighting' => 'none',
                        'glow' => false,
                        'bubbles' => false,
                        'haze' => false,
                        'additionalSound' => false,
                        'extraSubwoofers' => 0,
                        'technician' => 0,
                        'microphones' => 0,
                        'pa' => 0,
                        'projector' => 0
                    ],
                    'package' => [
                        'id' => 'corporate',
                        'name' => 'Corporate event à la carte services',
                        'price' => 2200,
                        'hours' => 5,
                        'features' => [
                            'DJ Jesse B. as your DJ and MC',
                            'Dedicated assistant',
                            'Premium sound system',
                            'Basic lighting',
                            'Custom DJ booth'
                        ]
                    ],
                    'items' => [
                        ['name' => 'DJ Jesse B. DJ and MC service', 'quantity' => 4, 'unitPrice' => 300, 'total' => 1200, 'description' => 'First four hours: 300 per hour.'],
                        ['name' => 'DJ coverage beyond four hours', 'quantity' => 2, 'unitPrice' => 175, 'total' => 350, 'description' => '$175 per additional half-hour'],
                        ['name' => 'Wireless uplighting', 'quantity' => 1, 'unitPrice' => 250, 'total' => 250]
                    ],
                    'total' => 2200,
                    'coverageHours' => 5,
                    'soundCapacityNotice' => ''
                ]
            ]),
            'created_at' => gmdate('Y-m-d H:i:s', strtotime('-1 day'))
        ]);

        self::set_meta('seeded', '1');
    }

    public static function get_event(string $id): ?array {
        $events = self::get_table_name('events');
        $clients = self::get_table_name('clients');
        $contracts = self::get_table_name('contracts');
        $plans = self::get_table_name('portal_plans');

        $row = self::get_row(
            "SELECT e.*, c.name as client_name, c.email as client_email, c.phone as client_phone, c.organization as client_org 
             FROM $events e 
             JOIN $clients c ON c.id = e.client_id 
             WHERE e.id = ?",
            [$id]
        );

        if (!$row) return null;

        $body = json_decode($row['body'], true) ?: [];

        // Check contracts table for live status
        $contract = self::get_row(
            "SELECT status FROM $contracts WHERE event_id = ? ORDER BY revision DESC LIMIT 1",
            [$id]
        );
        if ($contract) {
            $body['contractStatus'] = ($contract['status'] === 'Signed') ? 'Signed' : (($contract['status'] === 'Issued') ? 'Sent' : 'Not sent');
        }

        // Check portal plans
        $savedPlan = self::get_row(
            "SELECT body FROM $plans WHERE event_id = ?",
            [$id]
        );
        if ($savedPlan) {
            $planBody = json_decode($savedPlan['body'], true) ?: [];
            if (($body['plannerStatus'] ?? '') !== 'Ready') {
                $body['plannerStatus'] = !empty($planBody['submitted']) ? 'Submitted for review' : 'In progress';
            }
            $body['plannerLastSavedAt'] = $planBody['savedAt'] ?? null;
        }

        return array_merge($body, [
            'id' => $row['id'],
            'version' => (int)$row['version'],
            'createdAt' => $row['created_at'],
            'client' => [
                'id' => $row['client_id'],
                'name' => $row['client_name'],
                'email' => $row['client_email'],
                'phone' => $row['client_phone'],
                'organization' => $row['client_org']
            ]
        ]);
    }

    public static function get_all_events(): array {
        self::ensure_installed();
        $events = self::get_table_name('events');
        $rows = self::get_col("SELECT id FROM $events");
        $results = [];
        if (!empty($rows)) {
            foreach ($rows as $id) {
                $e = self::get_event($id);
                if ($e) $results[] = $e;
            }
            usort($results, function($a, $b) {
                return strcmp($a['date'] ?? '', $b['date'] ?? '');
            });
        }
        return $results;
    }

    public static function save_event(array $input, ?string $id = null): array {
        $events_table = self::get_table_name('events');
        $clients_table = self::get_table_name('clients');

        $old = $id ? self::get_event($id) : null;
        if ($id && !$old) {
            return ['error' => 'Event not found', 'code' => 404];
        }
        if ($old && isset($input['version']) && (int)$input['version'] !== (int)$old['version']) {
            return ['error' => 'This event changed. Reload before saving.', 'code' => 409];
        }

        $clientId = $old ? $old['client']['id'] : self::uuid();
        $eventId = $id ?: self::uuid();

        $clientInput = $input['client'] ?? [];
        $clientData = [
            'id' => $clientId,
            'name' => trim((string)($clientInput['name'] ?? ($input['clientName'] ?? ''))),
            'email' => trim(strtolower((string)($clientInput['email'] ?? ($input['email'] ?? '')))),
            'phone' => trim((string)($clientInput['phone'] ?? ($input['phone'] ?? ''))),
            'organization' => trim((string)($clientInput['organization'] ?? ($input['organization'] ?? '')))
        ];

        self::replace($clients_table, $clientData);

        $body = $input;
        unset($body['id'], $body['client'], $body['version'], $body['createdAt']);

        $subtotal = (float)($body['weddingPackage']['total'] ?? ($body['schoolPackage']['total'] ?? ($body['privatePackage']['total'] ?? ($body['subtotal'] ?? ($body['amount'] ?? 0)))));
        $discount = (float)($body['discount'] ?? 0);
        $body['subtotal'] = $subtotal;
        $body['discount'] = $discount;
        $body['amount'] = max(0, $subtotal - $discount);
        
        $brandConfig = self::$config['brand'] ?? [];
        $stdDeposit = (float)($brandConfig['standard_deposit'] ?? 250);
        $pctDeposit = (float)($brandConfig['deposit_percent'] ?? 20);
        $mode = $brandConfig['deposit_mode'] ?? 'higher';
        $pctAmount = round(($body['amount'] * $pctDeposit) / 100, 2);
        if ($mode === 'flat') {
            $depositRequired = $stdDeposit;
        } elseif ($mode === 'percent') {
            $depositRequired = $pctAmount;
        } else {
            $depositRequired = max($stdDeposit, $pctAmount);
        }
        $body['depositRequired'] = $depositRequired;
        $body['depositReceived'] = (float)($body['depositReceived'] ?? 0);
        $body['paid'] = (float)($body['paid'] ?? 0);

        if ($old) {
            $newVersion = (int)$old['version'] + 1;
            self::update($events_table, [
                'body' => json_encode($body),
                'version' => $newVersion
            ], ['id' => $id]);
        } else {
            self::insert($events_table, [
                'id' => $eventId,
                'client_id' => $clientId,
                'body' => json_encode($body),
                'version' => 1,
                'created_at' => self::now()
            ]);
        }

        return self::get_event($eventId) ?: [];
    }
}
