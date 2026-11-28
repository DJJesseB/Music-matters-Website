<?php
/**
 * DJ Live Request Desk & Event Manager
 * Authentication, Sessions, and Permissions
 */

require_once __DIR__ . '/Database.php';

class DJ_Auth {

    public static function hash_password(string $password): string {
        $salt = bin2hex(random_bytes(16));
        $hash = hash_pbkdf2('sha256', $password, $salt, 10000, 64);
        return $salt . ':' . $hash;
    }

    public static function verify_password(string $password, string $stored): bool {
        if (strpos($stored, ':') !== false) {
            list($salt, $hash) = explode(':', $stored, 2);
            $computed = hash_pbkdf2('sha256', $password, $salt, 10000, 64);
            return hash_equals($hash, $computed);
        }
        return password_verify($password, $stored);
    }

    public static function get_current_session(): ?array {
        $cookieToken = $_COOKIE['dj_desk_session'] ?? '';
        if (!$cookieToken) {
            $cookieToken = $_SERVER['HTTP_X_DJ_SESSION'] ?? '';
        }
        if (!$cookieToken) {
            return null;
        }

        $sessions_table = DJ_Database::get_table_name('sessions');
        $users_table = DJ_Database::get_table_name('users');
        $tokenHash = hash('sha256', $cookieToken);

        $row = DJ_Database::get_row(
            "SELECT s.*, u.id as user_id, u.email, u.role 
             FROM $sessions_table s 
             JOIN $users_table u ON u.id = s.user_id 
             WHERE s.token = ? AND s.expires > ?",
            [$tokenHash, time() * 1000]
        );

        if (!$row) {
            return null;
        }

        return [
            'user' => [
                'id' => $row['user_id'],
                'email' => $row['email'],
                'role' => $row['role']
            ],
            'csrf' => $row['csrf']
        ];
    }

    public static function login(string $email, string $password): array {
        $users_table = DJ_Database::get_table_name('users');
        $sessions_table = DJ_Database::get_table_name('sessions');

        $email = strtolower(trim($email));
        $user = DJ_Database::get_row("SELECT * FROM $users_table WHERE email = ?", [$email]);

        // Emergency Single-Admin Reset: Check config.php for emergency override credentials
        $configFile = dirname(__DIR__) . '/config.php';
        clearstatcache(true, $configFile);
        $config = file_exists($configFile) ? require $configFile : [];
        $adminEmail = strtolower(trim($config['admin']['email'] ?? 'admin@example.com'));
        $emergencyPass = $config['admin']['emergency_password'] ?? ($config['admin']['password'] ?? null);

        if (!empty($emergencyPass) && $email === $adminEmail && $password === $emergencyPass) {
            $hashed = self::hash_password($emergencyPass);
            if ($user) {
                DJ_Database::update($users_table, ['password' => $hashed], ['id' => $user['id']]);
                $user['password'] = $hashed;
            } else {
                $user = [
                    'id'       => DJ_Database::uuid(),
                    'email'    => $adminEmail,
                    'password' => $hashed,
                    'role'     => 'admin'
                ];
                DJ_Database::insert($users_table, $user);
            }
        } elseif (!$user || !self::verify_password($password, $user['password'])) {
            throw new Exception('Invalid email or password', 401);
        }

        $rawToken = bin2hex(random_bytes(32));
        $csrf = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $rawToken);
        $expires = (time() + 604800) * 1000; // 7 days

        DJ_Database::insert($sessions_table, [
            'token' => $tokenHash,
            'user_id' => $user['id'],
            'csrf' => $csrf,
            'expires' => $expires
        ]);

        $cookiePath = rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/\\') ?: '/';
        $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['SERVER_PORT'] ?? '') == 443);
        setcookie('dj_desk_session', $rawToken, [
            'expires' => time() + 604800,
            'path' => $cookiePath,
            'secure' => $secure,
            'httponly' => true,
            'samesite' => 'Lax'
        ]);

        return [
            'user' => [
                'id' => $user['id'],
                'email' => $user['email'],
                'role' => $user['role']
            ],
            'csrf' => $csrf
        ];
    }

    public static function logout(): void {
        $cookieToken = $_COOKIE['dj_desk_session'] ?? ($_SERVER['HTTP_X_DJ_SESSION'] ?? '');
        if ($cookieToken) {
            $sessions_table = DJ_Database::get_table_name('sessions');
            DJ_Database::delete($sessions_table, ['token' => hash('sha256', $cookieToken)]);
        }
        $cookiePath = rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/\\') ?: '/';
        setcookie('dj_desk_session', '', [
            'expires' => time() - 3600,
            'path' => $cookiePath,
            'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['SERVER_PORT'] ?? '') == 443),
            'httponly' => true,
            'samesite' => 'Lax'
        ]);
        unset($_COOKIE['dj_desk_session']);
    }

    public static function create_invitation(string $eventId, string $email, string $scope = 'planner', string $name = ''): string {
        $inv_table = DJ_Database::get_table_name('invitations');
        $token = bin2hex(random_bytes(32));
        $expires = (time() + 86400) * 1000; // 24 hours

        DJ_Database::insert($inv_table, [
            'token' => $token,
            'event_id' => $eventId,
            'email' => strtolower(trim($email)),
            'expires' => $expires,
            'access_scope' => $scope,
            'contact_name' => $name
        ]);

        return $token;
    }

    public static function accept_invitation(string $token, string $password, string $name = ''): array {
        $inv_table = DJ_Database::get_table_name('invitations');
        $users_table = DJ_Database::get_table_name('users');
        $memberships = DJ_Database::get_table_name('memberships');
        $contract_memberships = DJ_Database::get_table_name('contract_memberships');

        $inv = DJ_Database::get_row(
            "SELECT * FROM $inv_table WHERE token = ? AND expires > ?",
            [$token, time() * 1000]
        );

        if (!$inv) {
            throw new Exception('Invalid or expired invitation token', 400);
        }

        $email = $inv['email'];
        $user = DJ_Database::get_row("SELECT * FROM $users_table WHERE email = ?", [$email]);
        $hashed = self::hash_password($password);

        if (!$user) {
            $userId = DJ_Database::uuid();
            DJ_Database::insert($users_table, [
                'id' => $userId,
                'email' => $email,
                'password' => $hashed,
                'role' => 'client'
            ]);
        } else {
            $userId = $user['id'];
            DJ_Database::update($users_table, ['password' => $hashed], ['id' => $userId]);
        }

        if ($inv['access_scope'] === 'contract') {
            DJ_Database::replace($contract_memberships, [
                'user_id' => $userId,
                'event_id' => $inv['event_id'],
                'name' => $name ?: $inv['contact_name']
            ]);
        } else {
            DJ_Database::replace($memberships, [
                'user_id' => $userId,
                'event_id' => $inv['event_id']
            ]);
        }

        // Delete invitation
        DJ_Database::delete($inv_table, ['token' => $token]);

        $session = self::login($email, $password);
        $session['eventId'] = $inv['event_id'];
        return $session;
    }

    public static function get_event_members(string $eventId): array {
        $memberships = DJ_Database::get_table_name('memberships');
        $contract_memberships = DJ_Database::get_table_name('contract_memberships');
        $users = DJ_Database::get_table_name('users');

        $members = [];
        $rows = DJ_Database::get_results(
            "SELECT u.email, 'planner' as accessMode FROM $memberships m JOIN $users u ON u.id = m.user_id WHERE m.event_id = ?",
            [$eventId]
        );
        foreach ($rows as $r) {
            $members[] = $r;
        }

        $cRows = DJ_Database::get_results(
            "SELECT u.email, 'contract' as accessMode, cm.name FROM $contract_memberships cm JOIN $users u ON u.id = cm.user_id WHERE cm.event_id = ?",
            [$eventId]
        );
        foreach ($cRows as $r) {
            $members[] = $r;
        }

        return $members;
    }

    public static function revoke_access(string $eventId, string $email): void {
        $users = DJ_Database::get_table_name('users');
        $memberships = DJ_Database::get_table_name('memberships');
        $contract_memberships = DJ_Database::get_table_name('contract_memberships');

        $user = DJ_Database::get_row("SELECT id FROM $users WHERE email = ?", [strtolower(trim($email))]);
        if ($user) {
            DJ_Database::delete($memberships, ['event_id' => $eventId, 'user_id' => $user['id']]);
            DJ_Database::delete($contract_memberships, ['event_id' => $eventId, 'user_id' => $user['id']]);
        }
    }
}
