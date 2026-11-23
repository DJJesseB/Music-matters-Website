<?php
/** Admin school invoices, immutable invoice snapshots, and check-payment tracking. */
declare(strict_types=1);

function dj_school_invoice_route(string $path, string $method, array $input): void {
    if (!preg_match('#^admin/events/([a-f0-9-]+)/invoices(?:/([a-f0-9-]+)(?:/checks(?:/([a-f0-9-]+))?)?)?$#', $path, $m)) return;
    require_db();
    $session = require_admin();
    if ($method !== 'GET') {
        if (empty($session['csrf']) || !hash_equals((string)$session['csrf'], (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) json_error('Session validation failed. Refresh and try again.', 403);
    }
    $eventId = $m[1];$invoiceId = $m[2] ?? null;$checkId = $m[3] ?? null;
    $event = DJ_Database::get_event($eventId);
    if (!$event) json_error('Event not found', 404);
    if (($event['type'] ?? '') !== 'School dance') json_error('School invoicing is available for school dance bookings.', 422);
    $table = DJ_Database::get_table_name('school_invoices');
    $checks = DJ_Database::get_table_name('school_invoice_checks');
    $audit = DJ_Database::get_table_name('school_invoice_audit');
    $pdo = DJ_Database::pdo();
    $pdo->exec("CREATE TABLE IF NOT EXISTS $table (
      id varchar(64) NOT NULL PRIMARY KEY, event_id varchar(64) NOT NULL,
      number varchar(64) NOT NULL, revision int NOT NULL,
      snapshot longtext NOT NULL, status varchar(24) NOT NULL DEFAULT 'Issued',
      created_by varchar(64) NOT NULL, issued_at datetime NOT NULL,
      UNIQUE (event_id,revision), UNIQUE (number)
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS $checks (
      id varchar(64) NOT NULL PRIMARY KEY, invoice_id varchar(64) NOT NULL,
      event_id varchar(64) NOT NULL, check_number varchar(100) NOT NULL,
      amount decimal(12,2) NOT NULL, received_on date NOT NULL,
      status varchar(32) NOT NULL DEFAULT 'Received',
      cleared_on date NULL, recorded_by varchar(64) NOT NULL,
      recorded_at datetime NOT NULL
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS $audit (
      id varchar(64) NOT NULL PRIMARY KEY, invoice_id varchar(64) NOT NULL,
      event_id varchar(64) NOT NULL, action varchar(50) NOT NULL,
      actor_id varchar(64) NOT NULL, details varchar(255) NOT NULL DEFAULT '',
      created_at datetime NOT NULL
    )");
    $actor = (string)($session['user']['id'] ?? '');
    $log = static function($invoice,$action,$details='') use ($audit,$eventId,$actor){
        DJ_Database::insert($audit,['id'=>DJ_Database::uuid(),'invoice_id'=>$invoice,'event_id'=>$eventId,
          'action'=>$action,'actor_id'=>$actor,'details'=>substr((string)$details,0,255),'created_at'=>DJ_Database::now()]);
    };
    $invoice = $invoiceId ? DJ_Database::get_row("SELECT * FROM $table WHERE id = ? AND event_id = ?",[$invoiceId,$eventId]) : null;
    if ($invoiceId && !$invoice) json_error('Invoice not found',404);

    if ($method === 'GET') {
        $records = $invoice ? [$invoice] : DJ_Database::get_results("SELECT * FROM $table WHERE event_id = ? ORDER BY revision DESC",[$eventId]);
        foreach ($records as &$record){
            $record['snapshot']=json_decode($record['snapshot'],true)?:[];
            $record['checks']=DJ_Database::get_results("SELECT * FROM $checks WHERE invoice_id = ? ORDER BY recorded_at DESC",[$record['id']]);
            $record['history']=DJ_Database::get_results("SELECT * FROM $audit WHERE invoice_id = ? ORDER BY created_at DESC",[$record['id']]);
            $record['clearedTotal']=round(array_reduce($record['checks'],static fn($sum,$check)=>$sum+($check['status']==='Cleared'?(float)$check['amount']:0),0),2);
            $record['receivedTotal']=round(array_reduce($record['checks'],static fn($sum,$check)=>$sum+($check['status']==='Received'?(float)$check['amount']:0),0),2);
            $record['balance']=max(0,round((float)($record['snapshot']['amountDue']??0)-$record['clearedTotal'],2));
        }unset($record);
        json_response($invoice?($records[0]??[]):$records);
    }

    if ($path === "admin/events/$eventId/invoices" && $method === 'POST') {
        $school = trim((string)($input['school']??$event['client']['organization']??''));
        $billTo = trim((string)($input['billTo']??'Accounts Payable'));
        $address = trim((string)($input['billingAddress']??''));
        $po = trim((string)($input['poNumber']??''));
        $payee = trim((string)($input['payee']??''));
        $mailing = trim((string)($input['mailingAddress']??''));
        $terms = (string)($input['terms']??'due');
        $customDue = (string)($input['dueDate']??'');
        $notes = trim((string)($input['notes']??''));
        if ($school===''||mb_strlen($school)>255||mb_strlen($billTo)>255||mb_strlen($address)>1000||mb_strlen($po)>100||mb_strlen($notes)>2000) json_error('Enter valid school billing information.',422);
        if (!in_array($terms,['due','net15','net30','custom'],true)) json_error('Choose invoice payment terms.',422);
        $issuedOn = gmdate('Y-m-d');
        $validDate=static function($value){$d=DateTimeImmutable::createFromFormat('!Y-m-d',$value);return $d&&$d->format('Y-m-d')===$value;};
        if ($terms==='custom'&&(!$validDate($customDue)||$customDue<$issuedOn))json_error('Choose a valid custom due date.',422);
        if ($payee===''||$mailing===''||mb_strlen($payee)>255||mb_strlen($mailing)>1000)json_error('Enter the check payee name and mailing instructions.',422);
        $dueDate=$terms==='net15'?gmdate('Y-m-d',strtotime('+15 days')):($terms==='net30'?gmdate('Y-m-d',strtotime('+30 days')):($terms==='custom'?$customDue:$issuedOn));
        $amount=(float)($event['amount']??0);$paid=(float)($event['paid']??0);
        if (!is_finite($amount)||$amount<0||!is_finite($paid)||$paid<0)json_error('The booking has invalid financial amounts.',422);
        $existing=DJ_Database::get_results("SELECT snapshot FROM $table WHERE event_id = ?",[$eventId]);
        $cleared=DJ_Database::get_var("SELECT COALESCE(SUM(c.amount),0) FROM $checks c JOIN $table i ON i.id=c.invoice_id WHERE i.event_id = ? AND c.status='Cleared'",[$eventId]);
        // Only the current outstanding event balance can be newly invoiced; previously
        // cleared checks are already represented in the booking's paid amount.
        $outstanding=max(0,round($amount-$paid,2));
        if ($outstanding<=0)json_error('The booking has no remaining amount to invoice.',422);
        $items=$event['schoolPackage']['items']??[];
        if (!is_array($items)||!$items)$items=[['name'=>$event['package']??'School dance DJ & MC services','quantity'=>1,'total'=>(float)($event['subtotal']??$amount)]];
        $revision=(int)DJ_Database::get_var("SELECT COALESCE(MAX(revision),0) FROM $table WHERE event_id = ?",[$eventId])+1;
        $number='DJB-'.gmdate('Y').'-'.strtoupper(substr(str_replace('-','',$eventId),0,8)).'-'.str_pad((string)$revision,2,'0',STR_PAD_LEFT);
        $snapshot=['eventName'=>$event['name']??'', 'eventDate'=>$event['date']??'',
          'eventType'=>$event['type'],'eventVenue'=>$event['venue']??'','school'=>$school,
          'billTo'=>$billTo,'billingAddress'=>$address,'poNumber'=>$po,'payee'=>$payee,
          'mailingAddress'=>$mailing,'terms'=>$terms,'issuedOn'=>$issuedOn,'dueDate'=>$dueDate,
          'notes'=>$notes,'lineItems'=>$items,'subtotal'=>(float)($event['subtotal']??$amount),
          'discount'=>(float)($event['discount']??0),'contractTotal'=>$amount,
          'alreadyPaid'=>$paid,'amountDue'=>$outstanding,'email'=>$event['client']['email']??''];
        $id=DJ_Database::uuid();
        DJ_Database::insert($table,['id'=>$id,'event_id'=>$eventId,'number'=>$number,
          'revision'=>$revision,'snapshot'=>json_encode($snapshot,JSON_THROW_ON_ERROR),
          'status'=>'Issued','created_by'=>$actor,'issued_at'=>DJ_Database::now()]);
        $log($id,'issued','Invoice '.$number);
        json_response(['id'=>$id,'number'=>$number],201);
    }

    if ($invoice && $path === "admin/events/$eventId/invoices/$invoiceId/checks" && $method==='POST') {
        $number=trim((string)($input['checkNumber']??''));
        $amount=$input['amount']??null;
        $received=(string)($input['receivedOn']??'');
        $d=DateTimeImmutable::createFromFormat('!Y-m-d',$received);
        if ($number===''||strlen($number)>100||!is_numeric($amount)||(float)$amount<=0||(float)$amount>1000000||abs(round((float)$amount,2)-(float)$amount)>0.00001||!$d||$d->format('Y-m-d')!==$received||$received>gmdate('Y-m-d'))json_error('Enter a valid check number, amount and received date.',422);
        if ($invoice['status']!=='Issued')json_error('This invoice cannot accept new checks.',409);
        $id=DJ_Database::uuid();
        DJ_Database::insert($checks,['id'=>$id,'invoice_id'=>$invoiceId,'event_id'=>$eventId,
          'check_number'=>$number,'amount'=>round((float)$amount,2),'received_on'=>$received,
          'status'=>'Received','cleared_on'=>null,'recorded_by'=>$actor,'recorded_at'=>DJ_Database::now()]);
        $log($invoiceId,'check_received',$number.' $'.number_format((float)$amount,2));
        json_response(['id'=>$id,'status'=>'Received'],201);
    }

    if ($invoice && $checkId && $path === "admin/events/$eventId/invoices/$invoiceId/checks/$checkId" && $method==='PUT') {
        $status=(string)($input['status']??'');
        if (!in_array($status,['Cleared','Returned'],true))json_error('Choose Cleared or Returned.',422);
        $pdo->beginTransaction();
        try {
            $check=DJ_Database::get_row("SELECT * FROM $checks WHERE id = ? AND invoice_id = ? AND event_id = ?",[$checkId,$invoiceId,$eventId]);
            if (!$check||$check['status']!=='Received')throw new RuntimeException('Only received checks can be updated.');
            $amount=(float)$check['amount'];
            if ($status==='Cleared') {
                $fresh=DJ_Database::get_event($eventId);
                if (!$fresh)throw new RuntimeException('Booking not found');
                $currentPaid=(float)($fresh['paid']??0);
                if ($currentPaid+$amount>(float)($fresh['amount']??0)+0.009)throw new RuntimeException('Check exceeds the unpaid event balance. Reconcile payment totals before clearing.');
                // The check is recorded as a booking payment once, at clearance.
                $saved=DJ_Database::save_event(array_merge($fresh,['paid'=>round($currentPaid+$amount,2)]),$eventId);
                if (isset($saved['error']))throw new RuntimeException($saved['error']);
            }
            DJ_Database::update($checks,['status'=>$status,'cleared_on'=>$status==='Cleared'?gmdate('Y-m-d'):null],['id'=>$checkId,'status'=>'Received']);
            $log($invoiceId,$status==='Cleared'?'check_cleared':'check_returned',(string)$check['check_number']);
            $pdo->commit();
        }catch(Throwable $error){
            if($pdo->inTransaction())$pdo->rollBack();
            json_error('Unable to update check: '.$error->getMessage(),409);
        }
        json_response(['ok'=>true,'status'=>$status]);
    }
    json_error('Unsupported invoice request.',405);
}
