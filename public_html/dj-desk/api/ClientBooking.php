<?php

final class DJ_ClientBooking {
    public static function access(array $user, array $event): ?string {
        $email = (string)($user['email'] ?? '');
        if (($user['role'] ?? '') === 'admin'
            || ($email !== '' && strcasecmp($email, (string)($event['client']['email'] ?? '')) === 0)) {
            return 'planner';
        }

        $memberships = DJ_Database::get_table_name('memberships');
        $contractMemberships = DJ_Database::get_table_name('contract_memberships');
        $key = [$event['id'], $user['id']];
        if (DJ_Database::get_var("SELECT 1 FROM $memberships WHERE event_id = ? AND user_id = ?", $key)) {
            return 'planner';
        }
        if (DJ_Database::get_var("SELECT 1 FROM $contractMemberships WHERE event_id = ? AND user_id = ?", $key)) {
            return 'contract';
        }
        return null;
    }

    public static function step(array $event, ?string $access): array {
        $contracts = DJ_Database::get_table_name('contracts');
        $status = DJ_Database::get_var(
            "SELECT status FROM $contracts WHERE event_id = ? ORDER BY revision DESC LIMIT 1",
            [$event['id']]
        );
        $managed = (bool)$status;
        $signed = $status === 'Signed';
        $dueCents = max(0, (int)round((float)($event['depositRequired'] ?? 250) * 100));
        $receivedCents = max(0, (int)round((float)($event['depositReceived'] ?? 0) * 100));
        $acceptedCents = $managed && $signed && $access === 'planner' && $dueCents > $receivedCents
            ? self::acceptedRetainerCents($event, $receivedCents)
            : $receivedCents;
        $remainingCents = max(0, $dueCents - $acceptedCents);
        $stage = 'planning';
        if ($access !== 'planner' || ($managed && !$signed)) {
            $stage = 'contract';
        } elseif ($managed && $remainingCents > 0) {
            $stage = 'retainer';
        }

        return [
            'stage' => $stage,
            'managed' => $managed,
            'signed' => $signed,
            'retainerRemaining' => $remainingCents / 100,
        ];
    }

    private static function acceptedRetainerCents(array $event, int $receivedCents): int {
        $school = ($event['type'] ?? '') === 'School dance';
        $table = DJ_Database::get_table_name($school ? 'school_invoice_checks' : 'event_payments');
        // Payment tables are created on first use by their admin workflows.
        if (!DJ_Database::get_var(
            'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
            [$table]
        )) {
            return $receivedCents;
        }
        if ($school) {
            // School invoice checks apply to the event balance. Credit them toward
            // the planner gate without counting already credited checks twice.
            $totals = DJ_Database::get_row(
                "SELECT COALESCE(SUM(CASE WHEN status = 'Received' THEN amount ELSE 0 END), 0) AS received,
                        COALESCE(SUM(CASE WHEN status = 'Cleared' THEN amount ELSE 0 END), 0) AS cleared
                 FROM $table WHERE event_id = ?",
                [$event['id']]
            );
            return max($receivedCents, (int)round((float)$totals['cleared'] * 100))
                + (int)round((float)$totals['received'] * 100);
        }

        $uncleared = DJ_Database::get_var(
            "SELECT COALESCE(SUM(amount), 0) FROM $table WHERE event_id = ?
             AND method = 'Check' AND status = 'Received' AND applies_to = 'retainer'",
            [$event['id']]
        );
        return $receivedCents + (int)round((float)$uncleared * 100);
    }

    public static function canSign(array $user, ?array $contract): bool {
        $signer = (string)($contract['snapshot']['signerEmail'] ?? '');
        return ($user['role'] ?? '') === 'client'
            && ($contract['status'] ?? '') === 'Issued'
            && ($contract['snapshot']['deliveryMethod'] ?? 'electronic') === 'electronic'
            && $signer !== ''
            && strcasecmp($signer, (string)($user['email'] ?? '')) === 0;
    }
}
