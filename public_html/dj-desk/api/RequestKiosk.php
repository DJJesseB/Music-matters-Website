<?php

final class DJ_RequestKiosk {
    const COOKIE = 'dj_desk_kiosk';

    public static function table(): string {
        return DJ_Database::get_table_name('music_kiosks');
    }

    public static function sources(): string {
        return DJ_Database::get_table_name('music_kiosk_submissions');
    }

    public static function install(): void {
        $table = self::table();
        $sources = self::sources();
        $pdo = DJ_Database::pdo();
        $options = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : '';
        $pdo->exec("CREATE TABLE IF NOT EXISTS $table (
            id varchar(64) NOT NULL PRIMARY KEY,
            event_id varchar(64) NOT NULL,
            pair_hash varchar(64) NOT NULL UNIQUE,
            token_hash varchar(64) NULL UNIQUE,
            pin_hash varchar(255) NOT NULL,
            pin_failures integer NOT NULL DEFAULT 0,
            state varchar(16) NOT NULL,
            pair_until bigint NOT NULL,
            expires_at bigint NOT NULL,
            last_seen bigint NULL,
            created_at bigint NOT NULL
        )$options");
        $pdo->exec("CREATE TABLE IF NOT EXISTS $sources (
            request_id varchar(64) NOT NULL,
            submission_key varchar(64) NOT NULL,
            PRIMARY KEY (request_id, submission_key)
        )$options");
    }

    public static function open(?array $event, ?array $settings): bool {
        return $event && !empty($settings['enabled'])
            && !in_array($event['status'] ?? '', ['Canceled', 'Archived', 'Completed'], true);
    }

    public static function lockEvent(string $id): ?array {
        $table = DJ_Database::get_table_name('music_request_settings');
        DJ_Database::query("UPDATE $table SET version = version WHERE event_id = ?", [$id]);
        return DJ_Database::get_row("SELECT * FROM $table WHERE event_id = ?", [$id]);
    }

    public static function revokeEvent(string $id): void {
        $table = self::table();
        DJ_Database::query("UPDATE $table SET state = 'revoked' WHERE event_id = ? AND state <> 'revoked'", [$id]);
    }

    public static function credential($value): bool {
        return is_string($value) && preg_match('/^[a-f0-9]{64}$/D', $value);
    }

    public static function session(bool $lock = false): ?array {
        $token = $_COOKIE[self::COOKIE] ?? '';
        if (!self::credential($token)) return null;
        $table = self::table();
        $hash = hash('sha256', $token);
        if ($lock) DJ_Database::query("UPDATE $table SET last_seen = last_seen WHERE token_hash = ?", [$hash]);
        return DJ_Database::get_row("SELECT * FROM $table WHERE token_hash = ?", [$hash]);
    }

    public static function usable(?array $session): bool {
        return $session && (int)$session['expires_at'] > time() && $session['state'] === 'active';
    }

    private static function cookie(string $token, int $expires): void {
        global $appRoot;
        setcookie(self::COOKIE, $token, [
            'expires' => $expires, 'path' => $appRoot ?: '/',
            'secure' => true, 'httponly' => true, 'samesite' => 'Strict'
        ]);
    }

    public static function summaries(string $eventId): array {
        $table = self::table();
        $now = time();
        return array_map(static function (array $row) use ($now): array {
            $status = $row['state'];
            return [
                'id' => $row['id'], 'state' => $status,
                'connected' => in_array($status, ['active', 'paused'], true) && (int)$row['last_seen'] >= $now - 25,
                'lastSeen' => $row['last_seen'] === null ? null : (int)$row['last_seen']
            ];
        }, DJ_Database::get_results(
            "SELECT id, state, last_seen FROM $table
             WHERE event_id = ? AND state <> 'revoked' AND expires_at > ?
               AND (state <> 'pairing' OR pair_until > ?)
             ORDER BY created_at DESC",
            [$eventId, $now, $now]
        ));
    }

    public static function admin(string $id, array $input, array $auth): void {
        $csrf = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if ($csrf === '' || !hash_equals($auth['csrf'], $csrf)) json_error('Reload the request desk and try again.', 403);
        $action = $input['action'] ?? '';
        if (!in_array($action, ['launch', 'pause', 'resume', 'revoke'], true)) json_error('Invalid kiosk action.');
        $pin = $input['pin'] ?? '';
        if ($action === 'launch' && (!is_string($pin) || !preg_match('/^[0-9]{6,12}$/D', $pin))) {
            json_error('Choose a kiosk exit PIN with 6 to 12 digits.');
        }
        $pinHash = $action === 'launch' ? password_hash($pin, PASSWORD_DEFAULT) : null;
        $table = self::table();
        $pdo = DJ_Database::pdo();
        $pdo->beginTransaction();
        try {
            $settings = self::lockEvent($id);
            if (in_array($action, ['launch', 'resume'], true) && !self::open(DJ_Database::get_event($id), $settings)) {
                $pdo->rollBack();
                json_error('Open event requests first.', 409);
            }
            if ($action === 'launch') {
                $pair = self::createPairingCode($id, $pinHash);
                $pdo->commit();
                json_response(['code' => $pair], 201);
            }
            $kioskId = is_string($input['id'] ?? null) ? $input['id'] : '';
            $target = DJ_Database::get_row("SELECT * FROM $table WHERE id = ? AND event_id = ?", [$kioskId, $id]);
            $from = ['pause' => ['active'], 'resume' => ['paused'], 'revoke' => ['pairing', 'active', 'paused']];
            if (!$target || (int)$target['expires_at'] <= time() || !in_array($target['state'], $from[$action], true)) {
                $pdo->rollBack();
                json_error('This kiosk has changed. Refresh and try again.', 409);
            }
            $state = ['pause' => 'paused', 'resume' => 'active', 'revoke' => 'revoked'][$action];
            $updated = DJ_Database::update($table, ['state' => $state], ['id' => $kioskId, 'state' => $target['state']]);
            $pdo->commit();
            if (!$updated) json_error('This kiosk has changed. Refresh and try again.', 409);
            json_response(['ok' => true]);
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
    }

    private static function createPairingCode(string $eventId, string $pinHash): string {
        $table = self::table();
        $now = time();
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $code = sprintf('%06d', random_int(0, 999999));
            $hash = hash('sha256', $code);
            // Keep used codes reserved through their original pairing window.
            DJ_Database::query("UPDATE $table SET pair_hash = ? WHERE pair_hash = ? AND pair_until <= ?",
                [bin2hex(random_bytes(32)), $hash, $now]);
            try {
                DJ_Database::insert($table, [
                    'id' => DJ_Database::uuid(), 'event_id' => $eventId, 'pair_hash' => $hash,
                    'pin_hash' => $pinHash, 'state' => 'pairing', 'pair_until' => $now + 300,
                    'expires_at' => $now + 43200, 'created_at' => $now
                ]);
                return $code;
            } catch (PDOException $error) {
                if ((string)$error->getCode() !== '23000') throw $error;
            }
        }
        throw new RuntimeException('Could not reserve a pairing code. Try again.');
    }

    private static function limitPairingAttempts(): void {
        $table = DJ_Database::get_table_name('music_kiosk_pair_rate');
        $pdo = DJ_Database::pdo();
        $mysql = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
        $options = $mysql ? ' ENGINE=InnoDB' : '';
        $pdo->exec("CREATE TABLE IF NOT EXISTS $table (
            id integer NOT NULL PRIMARY KEY,
            window_minute bigint NOT NULL,
            attempts integer NOT NULL
        )$options");
        $insert = $mysql ? 'INSERT IGNORE' : 'INSERT OR IGNORE';
        $pdo->exec("$insert INTO $table (id, window_minute, attempts) VALUES (1, 0, 0)");
        $minute = intdiv(time(), 60);
        $allowed = DJ_Database::query(
            "UPDATE $table SET attempts = CASE WHEN window_minute = ? THEN attempts + 1 ELSE 1 END,
                window_minute = ? WHERE id = 1 AND (window_minute < ? OR (window_minute = ? AND attempts < 20))",
            [$minute, $minute, $minute, $minute]
        )->rowCount();
        if (!$allowed) {
            header('Retry-After: ' . (60 - time() % 60));
            json_error('Too many pairing attempts. Wait a minute and try again.', 429);
        }
    }

    public static function pair(array $input): void {
        $code = $input['code'] ?? '';
        if (!is_string($code) || !preg_match('/^[0-9]{6}$/D', $code)) json_error('Enter the six-digit pairing code from the request desk.');
        self::limitPairingAttempts();
        $existing = self::session();
        if ($existing && (int)$existing['expires_at'] > time() && $existing['state'] !== 'revoked') {
            json_error('Exit or revoke the existing kiosk before pairing another event.', 409);
        }
        $table = self::table();
        $hash = hash('sha256', $code);
        $target = DJ_Database::get_row("SELECT id, event_id FROM $table WHERE pair_hash = ? AND state = 'pairing' AND pair_until > ?", [$hash, time()]);
        if (!$target) json_error('This pairing code is invalid or expired.', 410);
        $pdo = DJ_Database::pdo();
        $pdo->beginTransaction();
        try {
            $id = $target['event_id'];
            $settings = self::lockEvent($id);
            if (!self::open(DJ_Database::get_event($id), $settings)) {
                $pdo->rollBack();
                json_error('This event is no longer accepting requests.', 423);
            }
            $token = bin2hex(random_bytes(32));
            $changed = DJ_Database::query(
                "UPDATE $table SET token_hash = ?, state = 'active', last_seen = ?
                 WHERE id = ? AND pair_hash = ? AND state = 'pairing' AND pair_until > ? AND expires_at > ?",
                [hash('sha256', $token), time(), $target['id'], $hash, time(), time()]
            )->rowCount();
            if (!$changed) {
                $pdo->rollBack();
                json_error('This pairing code is invalid or expired.', 410);
            }
            DJ_Auth::logout();
            $pdo->commit();
            self::cookie($token, time() + 86400);
            json_response(['ok' => true]);
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
    }

    public static function status(): void {
        $session = self::session();
        if (!$session) json_response(['state' => 'unpaired']);
        $event = DJ_Database::get_event($session['event_id']);
        $settings = DJ_Database::get_table_name('music_request_settings');
        $config = DJ_Database::get_row("SELECT enabled FROM $settings WHERE event_id = ?", [$session['event_id']]);
        $state = (int)$session['expires_at'] > time() && self::open($event, $config) ? $session['state'] : 'closed';
        if (in_array($state, ['active', 'paused'], true) && (int)$session['last_seen'] <= time() - 5) {
            DJ_Database::update(self::table(), ['last_seen' => time()], ['id' => $session['id'], 'state' => $state]);
        }
        json_response(['state' => $state, 'school' => $event ? music_school_event($event) : false]);
    }

    public static function exit(array $input): void {
        $pin = $input['pin'] ?? '';
        if (!is_string($pin) || !preg_match('/^[0-9]{6,12}$/D', $pin)) json_error('Enter the kiosk exit PIN.');
        $pdo = DJ_Database::pdo();
        $pdo->beginTransaction();
        try {
            $session = self::session(true);
            if (!$session || (int)$session['pin_failures'] >= 8) {
                $pdo->rollBack();
                json_error('PIN exit is locked. Use your device’s Guided Access controls.', 403);
            }
            $table = self::table();
            if (!password_verify($pin, $session['pin_hash'])) {
                DJ_Database::query("UPDATE $table SET pin_failures = pin_failures + 1 WHERE id = ?", [$session['id']]);
                $pdo->commit();
                json_error('Incorrect kiosk PIN.', 403);
            }
            DJ_Database::update($table, ['state' => 'revoked', 'token_hash' => null], ['id' => $session['id']]);
            $pdo->commit();
            self::cookie('', time() - 3600);
            json_response(['ok' => true]);
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
    }
}
