<?php
/**
 * Admin-only paper contract evidence. Stored inside the database, never in a publicly
 * accessible uploads directory. Existing issued contract snapshots are immutable.
 */
declare(strict_types=1);

function dj_paper_contract_route(string $path, string $method, array $input): void {
    if (!preg_match('#^admin/events/([a-f0-9-]+)/contracts/([a-f0-9-]+)/paper(?:/([a-f0-9-]+)/download|/verify)?$#', $path, $m)) return;
    require_db();
    $session = require_admin();
    $eventId = $m[1];
    $contractId = $m[2];
    $actorId = (string)($session['user']['id'] ?? '');
    if ($method !== 'GET') {
        $expected = (string)($session['csrf'] ?? '');
        $provided = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
        if ($expected === '' || $provided === '' || !hash_equals($expected, $provided)) json_error('Session verification failed. Refresh and try again.', 403);
    }

    $contracts = DJ_Database::get_table_name('contracts');
    $signatures = DJ_Database::get_table_name('signatures');
    $paper = DJ_Database::get_table_name('paper_contracts');
    $audit = DJ_Database::get_table_name('paper_contract_audit');
    $contract = DJ_Database::get_row("SELECT id, event_id, revision, hash, status FROM $contracts WHERE id = ? AND event_id = ?", [$contractId, $eventId]);
    if (!$contract) json_error('Contract not found', 404);

    DJ_Database::pdo()->exec("CREATE TABLE IF NOT EXISTS $paper (
        id varchar(64) NOT NULL PRIMARY KEY,
        contract_id varchar(64) NOT NULL,
        event_id varchar(64) NOT NULL,
        file_name varchar(255) NOT NULL,
        mime varchar(64) NOT NULL,
        byte_size int NOT NULL,
        sha256 varchar(64) NOT NULL,
        data_base64 longtext NOT NULL,
        uploaded_by varchar(64) NOT NULL,
        uploaded_at datetime NOT NULL,
        signer_name varchar(255) NOT NULL DEFAULT '',
        signed_on date NULL,
        verified_by varchar(64) NOT NULL DEFAULT '',
        verified_at datetime NULL
    )");
    DJ_Database::pdo()->exec("CREATE TABLE IF NOT EXISTS $audit (
        id varchar(64) NOT NULL PRIMARY KEY,
        contract_id varchar(64) NOT NULL,
        event_id varchar(64) NOT NULL,
        evidence_id varchar(64) NOT NULL,
        action varchar(32) NOT NULL,
        actor_id varchar(64) NOT NULL,
        details varchar(255) NOT NULL DEFAULT '',
        created_at datetime NOT NULL
    )");
    $log = static function(string $action, string $evidenceId, string $details = '') use ($audit, $contractId, $eventId, $actorId) {
        DJ_Database::insert($audit, [
            'id' => DJ_Database::uuid(), 'contract_id' => $contractId, 'event_id' => $eventId,
            'evidence_id' => $evidenceId, 'action' => $action, 'actor_id' => $actorId,
            'details' => $details, 'created_at' => DJ_Database::now()
        ]);
    };

    if ($method === 'GET' && isset($m[3]) && $m[3] !== '') {
        $file = DJ_Database::get_row("SELECT * FROM $paper WHERE id = ? AND contract_id = ? AND event_id = ?", [$m[3], $contractId, $eventId]);
        if (!$file) json_error('Signed document not found', 404);
        $bytes = base64_decode($file['data_base64'], true);
        if ($bytes === false || !hash_equals($file['sha256'], hash('sha256', $bytes))) json_error('File integrity verification failed', 500);
        header('Content-Type: ' . $file['mime']);
        header('Content-Length: ' . strlen($bytes));
        header('Content-Disposition: attachment; filename="signed-contract-v' . (int)$contract['revision'] . '-' . $file['id'] . ($file['mime'] === 'application/pdf' ? '.pdf' : ($file['mime'] === 'image/png' ? '.png' : '.jpg')) . '"');
        header('Content-Security-Policy: sandbox');
        echo $bytes;
        exit;
    }

    if ($method === 'GET' && !isset($m[3])) {
        $records = DJ_Database::get_results("SELECT id, file_name, mime, byte_size, sha256, uploaded_by, uploaded_at, signer_name, signed_on, verified_by, verified_at FROM $paper WHERE contract_id = ? AND event_id = ? ORDER BY uploaded_at DESC, id DESC", [$contractId, $eventId]);
        $history = DJ_Database::get_results("SELECT action, actor_id, details, created_at FROM $audit WHERE contract_id = ? AND event_id = ? ORDER BY created_at DESC", [$contractId, $eventId]);
        json_response(['documents' => $records, 'history' => $history, 'contractStatus' => $contract['status']]);
    }

    if ($method === 'POST' && $path === "admin/events/$eventId/contracts/$contractId/paper") {
        if ($contract['status'] !== 'Issued') json_error('Only an issued, unsigned contract can accept paper signatures.', 409);
        $name = trim((string)($input['fileName'] ?? 'signed-contract'));
        $encoded = (string)($input['fileData'] ?? '');
        if ($encoded === '' || strlen($encoded) > 4000000) json_error('Choose a PDF, JPG, or PNG smaller than 2 MB.', 413);
        $bytes = base64_decode($encoded, true);
        if ($bytes === false || strlen($bytes) === 0 || strlen($bytes) > 2 * 1024 * 1024) json_error('Choose a PDF, JPG, or PNG smaller than 2 MB.', 413);
        $mime = (new finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
        if (!in_array($mime, ['application/pdf', 'image/jpeg', 'image/png'], true)) json_error('Only PDF, JPG, or PNG documents are accepted.', 415);
        $ext = $mime === 'application/pdf' ? 'pdf' : ($mime === 'image/png' ? 'png' : 'jpg');
        $base = preg_replace('/[^a-zA-Z0-9._-]/', '_', pathinfo($name, PATHINFO_FILENAME));
        $fileName = substr($base ?: 'signed-contract', 0, 140) . '.' . $ext;
        $id = DJ_Database::uuid();
        DJ_Database::insert($paper, [
            'id' => $id, 'contract_id' => $contractId, 'event_id' => $eventId,
            'file_name' => $fileName, 'mime' => $mime, 'byte_size' => strlen($bytes),
            'sha256' => hash('sha256', $bytes), 'data_base64' => base64_encode($bytes),
            'uploaded_by' => $actorId, 'uploaded_at' => DJ_Database::now(),
            'signer_name' => '', 'signed_on' => null, 'verified_by' => '', 'verified_at' => null
        ]);
        $log('uploaded', $id, $fileName);
        json_response(['id' => $id, 'uploaded' => true], 201);
    }

    if ($method === 'POST' && $path === "admin/events/$eventId/contracts/$contractId/paper/verify") {
        if ($contract['status'] !== 'Issued') json_error('This contract is not awaiting a signature.', 409);
        $evidenceId = (string)($input['evidenceId'] ?? '');
        $signedBy = trim((string)($input['signerName'] ?? ''));
        $signedOn = (string)($input['signedOn'] ?? '');
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $signedOn);
        if (!preg_match('/^[a-f0-9-]{36}$/', $evidenceId) || $signedBy === '' || strlen($signedBy) > 255 || !$date || $date->format('Y-m-d') !== $signedOn || $signedOn > gmdate('Y-m-d')) json_error('Choose the signed file, signer name, and valid signing date.', 422);
        $file = DJ_Database::get_row("SELECT id FROM $paper WHERE id = ? AND contract_id = ? AND event_id = ? AND verified_at IS NULL", [$evidenceId, $contractId, $eventId]);
        if (!$file) json_error('The signed document is missing or already verified.', 409);
        $pdo = DJ_Database::pdo();
        $pdo->beginTransaction();
        try {
            $changed = DJ_Database::update($contracts, ['status' => 'Signed'], ['id' => $contractId, 'event_id' => $eventId, 'status' => 'Issued']);
            if ($changed !== 1) throw new RuntimeException('The contract was already changed. Reload and try again.');
            DJ_Database::update($paper, ['signer_name' => $signedBy, 'signed_on' => $signedOn, 'verified_by' => $actorId, 'verified_at' => DJ_Database::now()], ['id' => $evidenceId]);
            DJ_Database::insert($signatures, ['contract_id' => $contractId, 'body' => json_encode([
                'method' => 'paper', 'name' => $signedBy, 'email' => '',
                'signedAt' => $signedOn, 'verifiedAt' => DJ_Database::now(),
                'verifiedBy' => $actorId, 'evidenceId' => $evidenceId, 'contractHash' => $contract['hash']
            ])]);
            $log('verified', $evidenceId, $signedBy . ' · ' . $signedOn);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            json_error('Could not verify paper contract: ' . $e->getMessage(), 409);
        }
        json_response(['ok' => true, 'status' => 'Signed', 'signatureMethod' => 'paper']);
    }
    json_error('Unsupported paper contract request', 405);
}
