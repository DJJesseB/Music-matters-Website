<?php
declare(strict_types=1);

final class DJ_Database {
    public static ?string $contract = null;
    public static bool $hasPayments = false;
    public static float $pendingRetainer = 0;
    public static array $schoolChecks = ['received' => 0, 'cleared' => 0];

    public static function get_table_name(string $name): string { return $name; }

    public static function get_var(string $sql, array $args) {
        if (str_contains($sql, 'FROM contracts')) return self::$contract;
        if (str_contains($sql, 'FROM information_schema.TABLES')) return self::$hasPayments;
        if (str_contains($sql, "applies_to = 'retainer'")) return self::$pendingRetainer;
        if (str_contains($sql, 'FROM memberships')) return $args[1] === 'planner-member';
        if (str_contains($sql, 'FROM contract_memberships')) return $args[1] === 'signer';
        throw new RuntimeException('Unexpected query');
    }

    public static function get_row(string $sql, array $args): array {
        if (str_contains($sql, 'FROM school_invoice_checks')) return self::$schoolChecks;
        throw new RuntimeException('Unexpected query');
    }
}

require __DIR__ . '/../public_html/dj-desk/api/ClientBooking.php';

function expect_same($expected, $actual, string $label): void {
    if ($expected !== $actual) {
        throw new RuntimeException($label . ' expected ' . json_encode($expected) . ', got ' . json_encode($actual));
    }
}

$event = ['id' => 'event', 'type' => 'Birthday', 'client' => ['email' => 'client@example.com'],
          'depositRequired' => 250, 'depositReceived' => 100, 'paid' => 900];
$client = ['id' => 'client', 'role' => 'client', 'email' => 'Client@example.com'];
$signer = ['id' => 'signer', 'role' => 'client', 'email' => 'signer@example.com'];
$contract = ['status' => 'Issued', 'snapshot' => ['signerEmail' => $signer['email']]];
expect_same('planner', DJ_ClientBooking::access($client, $event), 'primary access');
expect_same('contract', DJ_ClientBooking::access($signer, $event), 'signer access');
expect_same(null, DJ_ClientBooking::access(['id' => 'other'], $event), 'unrelated access');
expect_same(true, DJ_ClientBooking::canSign($signer, $contract), 'designated electronic signer');
expect_same(false, DJ_ClientBooking::canSign($client, $contract), 'primary is not always signer');
$contract['snapshot']['deliveryMethod'] = 'paper';
expect_same(false, DJ_ClientBooking::canSign($signer, $contract), 'paper contract');
expect_same('planning', DJ_ClientBooking::step($event, 'planner')['stage'], 'legacy event without an issued contract');
DJ_Database::$contract = 'Issued';
expect_same('contract', DJ_ClientBooking::step($event, 'planner')['stage'], 'unsigned contract');
DJ_Database::$contract = 'Signed';
expect_same('contract', DJ_ClientBooking::step($event, 'contract')['stage'], 'signer cannot open planner');
expect_same('retainer', DJ_ClientBooking::step($event, 'planner')['stage'], 'balance payments alone do not satisfy retainer');
expect_same(150, DJ_ClientBooking::step($event, 'planner')['retainerRemaining'], 'remaining amount');
DJ_Database::$hasPayments = true;
DJ_Database::$pendingRetainer = 149.99;
expect_same('retainer', DJ_ClientBooking::step($event, 'planner')['stage'], 'partial offline receipt');
DJ_Database::$pendingRetainer = 150;
expect_same('planning', DJ_ClientBooking::step($event, 'planner')['stage'], 'offline receipt unlocks before clearing');
DJ_Database::$pendingRetainer = 0;
expect_same('retainer', DJ_ClientBooking::step($event, 'planner')['stage'], 'returned check no longer counts');
expect_same('planning', DJ_ClientBooking::step(array_replace($event, ['depositReceived' => 250]), 'planner')['stage'], 'credited payment');
expect_same('planning', DJ_ClientBooking::step(array_replace($event, ['depositReceived' => 0, 'depositRequired' => 0]), 'planner')['stage'], 'waived retainer');
$school = array_replace($event, ['type' => 'School dance', 'depositReceived' => 0]);
DJ_Database::$schoolChecks = ['received' => 250, 'cleared' => 0];
expect_same('planning', DJ_ClientBooking::step($school, 'planner')['stage'], 'school check at receipt');
DJ_Database::$schoolChecks = ['received' => 0, 'cleared' => 250];
expect_same('planning', DJ_ClientBooking::step($school, 'planner')['stage'], 'school check after clearing');
echo "Client booking flow checks passed\n";
