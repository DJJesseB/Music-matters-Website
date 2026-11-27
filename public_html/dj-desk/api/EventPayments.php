<?php
/** Admin manual event payments for cash, checks, and money orders. */
declare(strict_types=1);

function dj_event_payment_route(string $path, string $method, array $input): void {
    if (!preg_match('#^admin/events/([a-f0-9-]+)/payments(?:/([a-f0-9-]+))?$#', $path, $m)) return;
    require_db();
    $session = require_admin();
    if ($method !== 'GET') {
        if (empty($session['csrf']) || !hash_equals((string)$session['csrf'], (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) {
            json_error('Session validation failed. Refresh and try again.', 403);
        }
    }
    $eventId = $m[1];
    $paymentId = $m[2] ?? null;
    $event = DJ_Database::get_event($eventId);
    if (!$event) json_error('Event not found', 404);
    if (($event['type'] ?? '') === 'School dance') {
        json_error('Use School invoices & check payments for school dance checks.', 409);
    }
    $table = DJ_Database::get_table_name('event_payments');
    DJ_Database::pdo()->exec("CREATE TABLE IF NOT EXISTS $table (
        id varchar(64) NOT NULL PRIMARY KEY,
        event_id varchar(64) NOT NULL,
        method varchar(24) NOT NULL,
        amount decimal(12,2) NOT NULL,
        received_on date NOT NULL,
        applies_to varchar(24) NOT NULL DEFAULT 'balance',
        reference varchar(100) NOT NULL DEFAULT '',
        status varchar(24) NOT NULL DEFAULT 'Cleared',
        cleared_on date NULL,
        recorded_by varchar(64) NOT NULL,
        recorded_at datetime NOT NULL,
        KEY event_payment_lookup (event_id, recorded_at)
    )");
    $actor = (string)($session['user']['id'] ?? '');
    $validDate = static function(string $value): bool {
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        return $date && $date->format('Y-m-d') === $value;
    };
    $lockEvent = static function() use ($eventId): ?array {
        $events = DJ_Database::get_table_name('events');
        DJ_Database::query("UPDATE $events SET version = version WHERE id = ?", [$eventId]);
        return DJ_Database::get_event($eventId);
    };
    $applyPayment = static function(array $fresh, float $amount, string $appliesTo): array {
        $paid = round((float)($fresh['paid'] ?? 0), 2);
        $total = round((float)($fresh['amount'] ?? 0), 2);
        if ($amount <= 0 || $amount > $total - $paid + 0.009) throw new RuntimeException('Payment exceeds the remaining event balance.');
        $changes = ['paid' => round($paid + $amount, 2)];
        if ($appliesTo === 'retainer') {
            $deposit = round((float)($fresh['depositReceived'] ?? 0), 2);
            $depositDue = round((float)($fresh['depositRequired'] ?? 0), 2);
            if ($amount > $depositDue - $deposit + 0.009) throw new RuntimeException('Payment exceeds the unpaid retainer amount.');
            $changes['depositReceived'] = round($deposit + $amount, 2);
        }
        $saved = DJ_Database::save_event(array_merge($fresh, $changes), $fresh['id']);
        if (isset($saved['error'])) throw new RuntimeException($saved['error']);
        return $saved;
    };

    if ($method === 'GET' && !$paymentId) {
        json_response(DJ_Database::get_results("SELECT id, method, amount, received_on, applies_to, reference, status, cleared_on, recorded_at FROM $table WHERE event_id = ? ORDER BY recorded_at DESC", [$eventId]));
    }

    if ($method === 'POST' && !$paymentId) {
        $paymentMethod = (string)($input['method'] ?? '');
        $appliesTo = (string)($input['appliesTo'] ?? 'balance');
        $amountValue = $input['amount'] ?? null;
        $received = (string)($input['receivedOn'] ?? '');
        $reference = trim((string)($input['reference'] ?? ''));
        if (!in_array($paymentMethod, ['Check', 'Cash', 'Money order'], true)
            || !in_array($appliesTo, ['retainer', 'balance'], true)
            || !is_numeric($amountValue) || !is_finite((float)$amountValue) || (float)$amountValue <= 0
            || (float)$amountValue > 1000000 || abs(round((float)$amountValue, 2) - (float)$amountValue) > 0.00001
            || !$validDate($received) || $received > gmdate('Y-m-d')
            || mb_strlen($reference) > 100
            || ($paymentMethod === 'Check' && $reference === '')) {
            json_error('Enter a valid payment method, amount, date, and check number when applicable.', 422);
        }
        $pdo = DJ_Database::pdo();
        $pdo->beginTransaction();
        try {
            $fresh = $lockEvent();
            if (!$fresh) throw new RuntimeException('Event not found.');
            $amount = round((float)$amountValue, 2);
            $pending = (float)DJ_Database::get_var("SELECT COALESCE(SUM(amount),0) FROM $table WHERE event_id = ? AND method = 'Check' AND status = 'Received'", [$eventId]);
            if ($amount > (float)($fresh['amount'] ?? 0) - (float)($fresh['paid'] ?? 0) - $pending + 0.009) {
                throw new RuntimeException('Payment exceeds the remaining balance after pending checks.');
            }
            if ($appliesTo === 'retainer' && $amount > (float)($fresh['depositRequired'] ?? 0) - (float)($fresh['depositReceived'] ?? 0) + 0.009) {
                throw new RuntimeException('Payment exceeds the unpaid retainer amount.');
            }
            $status = $paymentMethod === 'Check' ? 'Received' : 'Cleared';
            if ($status === 'Cleared') $applyPayment($fresh, $amount, $appliesTo);
            $id = DJ_Database::uuid();
            DJ_Database::insert($table, [
                'id'=>$id, 'event_id'=>$eventId, 'method'=>$paymentMethod, 'amount'=>$amount,
                'received_on'=>$received, 'applies_to'=>$appliesTo, 'reference'=>$reference,
                'status'=>$status, 'cleared_on'=>$status === 'Cleared' ? gmdate('Y-m-d') : null,
                'recorded_by'=>$actor, 'recorded_at'=>DJ_Database::now()
            ]);
            $pdo->commit();
            json_response(['id'=>$id, 'status'=>$status], 201);
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            json_error('Unable to record payment: '.$error->getMessage(), 409);
        }
    }

    if ($method === 'PUT' && $paymentId) {
        $status = (string)($input['status'] ?? '');
        if (!in_array($status, ['Cleared', 'Returned'], true)) json_error('Choose Cleared or Returned.', 422);
        $pdo = DJ_Database::pdo();
        $pdo->beginTransaction();
        try {
            $fresh = $lockEvent();
            if (!$fresh) throw new RuntimeException('Event not found.');
            $payment = DJ_Database::get_row("SELECT * FROM $table WHERE id = ? AND event_id = ?", [$paymentId, $eventId]);
            if (!$payment || $payment['status'] !== 'Received' || $payment['method'] !== 'Check') {
                throw new RuntimeException('Only a received check can be cleared or returned.');
            }
            if ($status === 'Cleared') $applyPayment($fresh, (float)$payment['amount'], (string)$payment['applies_to']);
            DJ_Database::update($table, [
                'status'=>$status, 'cleared_on'=>$status === 'Cleared' ? gmdate('Y-m-d') : null
            ], ['id'=>$paymentId, 'event_id'=>$eventId, 'status'=>'Received']);
            $pdo->commit();
            json_response(['ok'=>true, 'status'=>$status]);
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            json_error('Unable to update check: '.$error->getMessage(), 409);
        }
    }
    json_error('Unsupported payment request.', 405);
}
