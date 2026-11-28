<?php
declare(strict_types=1);

final class DJ_Database {
    public static ?array $session = null;
    public static array $event = ['id' => 'event', 'status' => 'Confirmed'];
    public static function get_table_name(string $table): string { return $table; }
    public static function get_event(string $id): array { return self::$event; }
    public static function get_row(string $sql, array $params): ?array {
        if (str_contains($sql, 'FROM music_kiosks')) return self::$session;
        if (str_contains($sql, 'FROM music_request_settings')) return ['enabled' => 1];
        if (str_contains($sql, 'FROM music_request_lifecycle')) return [];
        throw new RuntimeException('Unexpected query');
    }
}
require __DIR__ . '/../public_html/dj-desk/api/RequestKiosk.php';
$_COOKIE[DJ_RequestKiosk::COOKIE] = str_repeat('a', 64);
function expect_guard(bool $expected, string $label): void {
    if (DJ_RequestKiosk::blocksSignIn() !== $expected) throw new RuntimeException($label);
}
expect_guard(false, 'Missing session should allow sign-in');
DJ_Database::$session = ['state' => 'active', 'expires_at' => time() + 3600, 'event_id' => 'event'];
expect_guard(true, 'Standby kiosk should block sign-in');
DJ_Database::$session['state'] = 'paused';
expect_guard(true, 'Paused kiosk should block sign-in');
DJ_Database::$session['state'] = 'revoked';
expect_guard(false, 'Revoked kiosk should allow sign-in');
DJ_Database::$session['state'] = 'active';
DJ_Database::$session['expires_at'] = time() - 1;
expect_guard(false, 'Expired kiosk should allow sign-in');
DJ_Database::$session['expires_at'] = time() + 3600;
DJ_Database::$event['status'] = 'Completed';
expect_guard(false, 'Closed kiosk should allow sign-in');
echo "Kiosk sign-in checks passed\n";
