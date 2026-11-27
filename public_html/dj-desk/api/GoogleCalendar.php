<?php
/** Google Calendar sync for DJ Desk. OAuth credentials are kept outside Git. */
final class DJ_GoogleCalendar {
    private static function env(): string {
        $host = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
        if (preg_match('/^staging\./', $host)) return 'staging';
        if (preg_match('/^(www\.)?music-matters\.me$/', $host)) return 'production';
        return 'unknown';
    }
    private static function table(string $name): string { return DJ_Database::get_table_name('google_calendar_' . $name); }
    private static function schema(): void {
        $options = DJ_Database::pdo()->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite' ? '' : 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';
        DJ_Database::pdo()->exec('CREATE TABLE IF NOT EXISTS ' . self::table('settings') . " (environment varchar(16) NOT NULL PRIMARY KEY, calendar_id varchar(512) NOT NULL DEFAULT '', calendar_name varchar(255) NOT NULL DEFAULT '', setup_buffer int NOT NULL DEFAULT 60, breakdown_buffer int NOT NULL DEFAULT 30, timezone varchar(64) NOT NULL DEFAULT 'America/New_York', enabled int NOT NULL DEFAULT 1, last_synced_at varchar(32) NOT NULL DEFAULT '', last_error text NOT NULL) $options");
        DJ_Database::pdo()->exec('CREATE TABLE IF NOT EXISTS ' . self::table('tokens') . " (environment varchar(16) NOT NULL PRIMARY KEY, access_token longtext NOT NULL, refresh_token longtext NOT NULL, expires_at bigint NOT NULL DEFAULT 0, connected_email varchar(255) NOT NULL DEFAULT '') $options");
        DJ_Database::pdo()->exec('CREATE TABLE IF NOT EXISTS ' . self::table('events') . " (environment varchar(16) NOT NULL, event_id varchar(64) NOT NULL, google_event_id varchar(128) NOT NULL, updated_at varchar(32) NOT NULL, PRIMARY KEY (environment, event_id), UNIQUE (environment, google_event_id)) $options");
        DJ_Database::pdo()->exec('CREATE TABLE IF NOT EXISTS ' . self::table('states') . " (state varchar(64) NOT NULL PRIMARY KEY, environment varchar(16) NOT NULL, admin_id varchar(64) NOT NULL, expires_at bigint NOT NULL) $options");
        $env = self::env();
        if ($env !== 'unknown' && !DJ_Database::get_row('SELECT environment FROM ' . self::table('settings') . ' WHERE environment = ?', [$env])) {
            DJ_Database::insert(self::table('settings'), ['environment'=>$env,'calendar_id'=>'','calendar_name'=>'','setup_buffer'=>60,'breakdown_buffer'=>30,'timezone'=>'America/New_York','enabled'=>1,'last_synced_at'=>'','last_error'=>'']);
        }
    }
    private const STAGING_STORAGE_ERROR = 'Cannot save calendar credentials. Ask the hosting administrator to check DJ Desk’s private Staging storage.';

    private static function legacyConfigPath(): string {
        return dirname(__DIR__) . '/data/google-calendar-secrets.php';
    }

    private static function stagingStorageDir(): string {
        // SiteGround uses public_html for both sites and subdomains. Walk past
        // the outermost public_html in case the Staging root is nested.
        $webRoot = null;
        for ($dir = dirname(__DIR__, 2); $dir !== dirname($dir); $dir = dirname($dir)) {
            if (basename($dir) === 'public_html') {
                $webRoot = $dir;
            }
        }
        if ($webRoot === null) {
            throw new RuntimeException(self::STAGING_STORAGE_ERROR);
        }
        $storage = dirname($webRoot) . '/.dj-desk-staging';
        $documentRoot = empty($_SERVER['DOCUMENT_ROOT']) ? false : realpath($_SERVER['DOCUMENT_ROOT']);
        if ($documentRoot !== false && strpos($storage . '/', rtrim($documentRoot, '/') . '/') === 0) {
            throw new RuntimeException(self::STAGING_STORAGE_ERROR);
        }
        return $storage;
    }

    private static function stagingConfig(string $dir): ?array {
        if (@is_link($dir)) {
            throw new RuntimeException(self::STAGING_STORAGE_ERROR);
        }
        if (!@is_dir($dir)) {
            return null;
        }
        $mode = @fileperms($dir);
        if ($mode === false || ($mode & 0777) !== 0700 || !@is_readable($dir) || !@is_executable($dir)) {
            throw new RuntimeException(self::STAGING_STORAGE_ERROR);
        }
        $path = $dir . '/google-calendar-secrets.json';
        if (@is_link($path)) {
            throw new RuntimeException(self::STAGING_STORAGE_ERROR);
        }
        if (!@file_exists($path)) {
            return null;
        }
        $mode = @fileperms($path);
        if (!@is_file($path) || $mode === false || ($mode & 0777) !== 0600) {
            throw new RuntimeException(self::STAGING_STORAGE_ERROR);
        }
        $body = @file_get_contents($path);
        $config = $body === false ? null : json_decode($body, true);
        if (!is_array($config) || empty($config['client_id']) || empty($config['client_secret']) || empty($config['encryption_key'])) {
            throw new RuntimeException(self::STAGING_STORAGE_ERROR);
        }
        return $config;
    }

    private static function config(): array {
        if (self::env() === 'staging') {
            $config = self::stagingConfig(self::stagingStorageDir());
            if ($config !== null) return $config;
        }
        return self::legacyConfig();
    }

    private static function legacyConfig(): array {
        $path=self::legacyConfigPath();
        if (!is_file($path)) return [];
        $cfg=require $path;
        return is_array($cfg)?$cfg:[];
    }
    private static function currentSettings(): array {
        self::schema(); $env=self::env();
        if ($env==='unknown') return [];
        return DJ_Database::get_row('SELECT * FROM '.self::table('settings').' WHERE environment = ?',[$env]) ?: [];
    }
    private static function currentToken(): array {
        self::schema(); $env=self::env();
        return $env==='unknown' ? [] : (DJ_Database::get_row('SELECT * FROM '.self::table('tokens').' WHERE environment = ?',[$env]) ?: []);
    }
    private static function assertEnvironment(): string {
        $env=self::env(); if ($env==='unknown') throw new RuntimeException('Google Calendar sync is available only on the Staging or Production site.'); return $env;
    }
    private static function cleanError(string $message): string { return substr(preg_replace('/(?:access_token|refresh_token|client_secret|code)=?[^\s&]*/i','[redacted]',$message),0,600); }
    private static function saveError(string $error): void {
        $s=self::currentSettings(); if (!$s) return;
        DJ_Database::update(self::table('settings'),['last_error'=>self::cleanError($error)],['environment'=>self::env()]);
    }
    private static function updatedConfig(array $incoming, array $current): array {
        $id=trim((string)($incoming['clientId']??''));
        $secret=trim((string)($incoming['clientSecret']??''));
        $clientId=$id!==''?$id:(string)($current['client_id']??'');
        $clientSecret=$secret!==''?$secret:(string)($current['client_secret']??'');
        if ($clientId==='' || $clientSecret==='') throw new RuntimeException('Enter the Google OAuth Client ID and Client Secret first.');
        $key=(string)($current['encryption_key']??'');
        if ($key==='') $key=base64_encode(random_bytes(32));
        return ['client_id'=>$clientId,'client_secret'=>$clientSecret,'encryption_key'=>$key];
    }

    private static function configWrite(array $incoming): void {
        if (self::env() === 'staging') {
            self::writeStagingConfig($incoming);
            return;
        }

        $config = self::updatedConfig($incoming, self::config());
        $path=self::legacyConfigPath(); $body="<?php\n// Private DJ Desk Google Calendar credentials. Never commit this file.\nreturn ".var_export($config,true).";\n";
        if (file_put_contents($path,$body,LOCK_EX)===false) throw new RuntimeException('Cannot write calendar credentials. Check DJ Desk folder permissions.');
        @chmod($path,0600); if (function_exists('opcache_invalidate')) @opcache_invalidate($path,true);
    }

    private static function writeStagingConfig(array $incoming): void {
        $dir = self::stagingStorageDir();
        if (@is_link($dir) || (!@is_dir($dir) && !@mkdir($dir, 0700) && !@is_dir($dir))) {
            throw new RuntimeException(self::STAGING_STORAGE_ERROR);
        }
        // Check the directory before opening a lock or creating a temporary file.
        $mode = @fileperms($dir);
        if ($mode === false || ($mode & 0777) !== 0700 || !@is_executable($dir) || !@is_writable($dir)) {
            throw new RuntimeException(self::STAGING_STORAGE_ERROR);
        }
        $lockPath = $dir . '/.lock';
        $lock = @is_link($lockPath) ? false : @fopen($lockPath, 'c');
        if ($lock === false) {
            throw new RuntimeException(self::STAGING_STORAGE_ERROR);
        }
        $temp = false;
        try {
            if (!@chmod($lockPath, 0600) || !@flock($lock, LOCK_EX)) {
                throw new RuntimeException(self::STAGING_STORAGE_ERROR);
            }
            clearstatcache(true);
            $current = self::stagingConfig($dir) ?? self::legacyConfig();
            $config = self::updatedConfig($incoming, $current);
            $body = json_encode($config, JSON_THROW_ON_ERROR);
            $temp = @tempnam($dir, '.calendar-');
            if ($temp === false || dirname($temp) !== $dir || !@chmod($temp, 0600)
                || @file_put_contents($temp, $body) !== strlen($body)
                || !@rename($temp, $dir . '/google-calendar-secrets.json')) {
                throw new RuntimeException(self::STAGING_STORAGE_ERROR);
            }
            $temp = false;
        } finally {
            if ($temp !== false) @unlink($temp);
            fclose($lock);
        }
    }
    private static function key(): string {
        $raw=base64_decode((string)(self::config()['encryption_key']??''),true);
        if ($raw===false || strlen($raw)<32) throw new RuntimeException('Calendar encryption key is missing. Save the Google credentials again in Calendar Integration Center.');
        return hash('sha256',$raw,true);
    }
    private static function seal(string $value): string {
        $iv=random_bytes(12); $tag=''; $cipher=openssl_encrypt($value,'aes-256-gcm',self::key(),OPENSSL_RAW_DATA,$iv,$tag);
        if ($cipher===false) throw new RuntimeException('Unable to encrypt Google authorization data.');
        return base64_encode($iv.$tag.$cipher);
    }
    private static function unseal(string $value): string {
        $raw=base64_decode($value,true); if ($raw===false || strlen($raw)<29) throw new RuntimeException('Stored Google authorization data is invalid.');
        $plain=openssl_decrypt(substr($raw,28),'aes-256-gcm',self::key(),OPENSSL_RAW_DATA,substr($raw,0,12),substr($raw,12,16));
        if ($plain===false) throw new RuntimeException('Unable to decrypt Google authorization data. Check the private calendar credentials file.');
        return $plain;
    }
    private static function redirectUri(): string {
        $https=(!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS']!=='off') || (($_SERVER['SERVER_PORT']??'')==='443');
        $scheme=$https?'https':'http'; $host=(string)($_SERVER['HTTP_HOST']??'');
        $apiDir=rtrim(dirname($_SERVER['SCRIPT_NAME']??'/'),'/\\');
        return $scheme.'://'.$host.$apiDir.'/google-calendar/callback';
    }
    private static function tokenRequest(array $params): array {
        $cfg=self::config(); if (empty($cfg['client_id'])||empty($cfg['client_secret'])) throw new RuntimeException('Save Google OAuth credentials before connecting.');
        $ch=curl_init('https://oauth2.googleapis.com/token');
        curl_setopt_array($ch,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>http_build_query($params),CURLOPT_RETURNTRANSFER=>true,CURLOPT_HTTPHEADER=>['Content-Type: application/x-www-form-urlencoded'],CURLOPT_TIMEOUT=>25]);
        $raw=curl_exec($ch); $code=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE); $err=curl_error($ch); curl_close($ch);
        if ($raw===false) throw new RuntimeException('Google authorization request failed: '.$err);
        $json=json_decode($raw,true)?:[]; if ($code<200||$code>=300||empty($json['access_token'])) throw new RuntimeException('Google token exchange failed (HTTP '.$code.'): '.($json['error_description']??$json['error']??'Unknown response'));
        return $json;
    }
    private static function request(string $method,string $url,?string $accessToken=null,?array $body=null): array {
        if (!function_exists('curl_init')) throw new RuntimeException('PHP cURL is required for Google Calendar integration.');
        $headers=['Accept: application/json']; if($accessToken)$headers[]='Authorization: Bearer '.$accessToken;
        if($body!==null)$headers[]='Content-Type: application/json';
        $ch=curl_init($url); curl_setopt_array($ch,[CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_RETURNTRANSFER=>true,CURLOPT_HTTPHEADER=>$headers,CURLOPT_TIMEOUT=>25]);
        if($body!==null)curl_setopt($ch,CURLOPT_POSTFIELDS,json_encode($body));
        $raw=curl_exec($ch);$code=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);$err=curl_error($ch);curl_close($ch);
        if($raw===false)throw new RuntimeException('Google Calendar request failed: '.$err);
        $json=$raw!==''?(json_decode($raw,true)?:[]):[];
        if($code<200||$code>=300){$msg=$json['error']['message']??$json['error_description']??('HTTP '.$code);throw new RuntimeException('Google Calendar API: '.$msg.' (HTTP '.$code.')');}
        return ['code'=>$code,'body'=>$json];
    }
    private static function accessToken(): string {
        $env=self::assertEnvironment();$row=self::currentToken(); if(!$row)throw new RuntimeException('Connect a Google account in Calendar Integration Center.');
        if((int)$row['expires_at']>time()+90)return self::unseal($row['access_token']);
        $cfg=self::config();$refresh=self::unseal((string)$row['refresh_token']);
        $token=self::tokenRequest(['client_id'=>$cfg['client_id'],'client_secret'=>$cfg['client_secret'],'refresh_token'=>$refresh,'grant_type'=>'refresh_token']);
        DJ_Database::update(self::table('tokens'),['access_token'=>self::seal($token['access_token']),'expires_at'=>time()+(int)($token['expires_in']??3600),'connected_email'=>$row['connected_email']??''],['environment'=>$env]);
        return $token['access_token'];
    }
    private static function api(string $method,string $path,?array $body=null): array {
        return self::request($method,'https://www.googleapis.com/calendar/v3/'.$path,self::accessToken(),$body);
    }
    private static function settingsView(): array {
        $env=self::env();$s=self::currentSettings();$token=self::currentToken();$cfg=self::config();
        return ['environment'=>$env,'configured'=>!empty($cfg['client_id'])&&!empty($cfg['client_secret']),'hasClientId'=>!empty($cfg['client_id']),'callbackUrl'=>self::redirectUri(),'connected'=>!empty($token),'connectedEmail'=>$token['connected_email']??'','calendarId'=>$s['calendar_id']??'','calendarName'=>$s['calendar_name']??'','setupBuffer'=>(int)($s['setup_buffer']??60),'breakdownBuffer'=>(int)($s['breakdown_buffer']??30),'timezone'=>$s['timezone']??'America/New_York','enabled'=>!empty($s['enabled']),'lastSyncedAt'=>$s['last_synced_at']??'','lastError'=>$s['last_error']??''];
    }
    private static function calendarList(): array {
        $all=[];$token=null;do{$path='users/me/calendarList?maxResults=250'.($token?'&pageToken='.rawurlencode($token):'');$res=self::api('GET',$path)['body'];foreach(($res['items']??[]) as $item)$all[]=['id'=>$item['id']??'','name'=>$item['summary']??'Calendar','primary'=>!empty($item['primary']),'accessRole'=>$item['accessRole']??''];$token=$res['nextPageToken']??null;}while($token);return $all;
    }
    private static function startOAuth(array $session): void {
        $env=self::assertEnvironment();$cfg=self::config();if(empty($cfg['client_id'])||empty($cfg['client_secret']))throw new RuntimeException('Enter and save your Google OAuth Client ID and Client Secret first.');
        $state=bin2hex(random_bytes(32));
        DJ_Database::insert(self::table('states'),['state'=>$state,'environment'=>$env,'admin_id'=>$session['user']['id'],'expires_at'=>time()+600]);
        $params=['client_id'=>$cfg['client_id'],'redirect_uri'=>self::redirectUri(),'response_type'=>'code','scope'=>'openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly','access_type'=>'offline','prompt'=>'consent','state'=>$state];
        header('Location: https://accounts.google.com/o/oauth2/v2/auth?'.http_build_query($params));exit;
    }
    private static function callback(): void {
        $state=(string)($_GET['state']??'');$row=$state!==''?DJ_Database::get_row('SELECT * FROM '.self::table('states').' WHERE state = ?',[$state]):null;
        if(!$row || (int)$row['expires_at']<time() || $row['environment']!==self::env()) self::callbackPage(false,'This Google authorization link expired or belongs to a different DJ Desk environment.');
        DJ_Database::delete(self::table('states'),['state'=>$state]);
        if(!empty($_GET['error']))self::callbackPage(false,'Google authorization was not completed. You can return to Settings and try again.');
        $code=(string)($_GET['code']??'');if($code==='')self::callbackPage(false,'Google did not return an authorization code.');
        try{$cfg=self::config();$t=self::tokenRequest(['code'=>$code,'client_id'=>$cfg['client_id'],'client_secret'=>$cfg['client_secret'],'redirect_uri'=>self::redirectUri(),'grant_type'=>'authorization_code']);
            $refresh=$t['refresh_token']??'';if($refresh===''){ $old=self::currentToken();$refresh=$old?self::unseal($old['refresh_token']):''; }
            if($refresh==='')throw new RuntimeException('Google did not provide offline access. Disconnect and reconnect, approving the requested access.');
            $profile=self::request('GET','https://www.googleapis.com/oauth2/v2/userinfo',$t['access_token'])['body'];$email=(string)($profile['email']??'');$env=self::env();
            DJ_Database::replace(self::table('tokens'),['environment'=>$env,'access_token'=>self::seal($t['access_token']),'refresh_token'=>self::seal($refresh),'expires_at'=>time()+(int)($t['expires_in']??3600),'connected_email'=>$email]);
            DJ_Database::update(self::table('settings'),['last_error'=>''],['environment'=>$env]);self::callbackPage(true,'Google Calendar connected'.($email?' for '.$email:'').'. Return to Calendar Integration Center to choose this environment’s calendar.');
        }catch(Throwable $e){self::saveError(self::cleanError($e->getMessage()));self::callbackPage(false,$e->getMessage());}
    }
    private static function callbackPage(bool $ok,string $message): void {
        header('Content-Type: text/html; charset=utf-8');$safe=htmlspecialchars($message,ENT_QUOTES,'UTF-8');$url=htmlspecialchars(dirname(self::redirectUri(),3).'/index.php#settings',ENT_QUOTES,'UTF-8');
        echo '<!doctype html><meta charset="utf-8"><title>DJ Desk Calendar</title><main style="font:16px system-ui;max-width:560px;margin:12vh auto;padding:24px;background:#111;color:#eee;border:1px solid #46513a;border-radius:12px"><h1 style="color:'.($ok?'#b6ff35':'#ff8a96').'">'.($ok?'Connected':'Connection issue').'</h1><p>'.$safe.'</p><a style="color:#b6ff35" href="'.$url.'">Return to DJ Desk Settings</a></main>';exit;
    }
    private static function dateRange(array $event,array $s): array {
        $tz=new DateTimeZone($s['timezone']?:'America/New_York');$date=(string)($event['date']??'');if(!$date)throw new RuntimeException('Booking has no event date.');
        $start=(string)($event['startTime']??'');$end=(string)($event['endTime']??'');
        if(!preg_match('/^\d{2}:\d{2}$/',$start)||!preg_match('/^\d{2}:\d{2}$/',$end))throw new RuntimeException('Add event start and end times before syncing this confirmed booking.');
        $a=new DateTimeImmutable($date.' '.$start,$tz);$b=new DateTimeImmutable($date.' '.$end,$tz);if($b<=$a)$b=$b->modify('+1 day');
        $begin=$a->modify('-'.(int)$s['setup_buffer'].' minutes');$finish=$b->modify('+'.(int)$s['breakdown_buffer'].' minutes');
        return [$begin,$finish,$a,$b];
    }
    private static function overlap(DateTimeImmutable $a,DateTimeImmutable $b,DateTimeImmutable $c,DateTimeImmutable $d): bool {return $a<$d&&$c<$b;}
    private static function conflicts(array $event): array {
        $s=self::currentSettings();$conflicts=[];try{[$start,$end]=self::dateRange($event,$s);}catch(Throwable $e){return [];}
        foreach(DJ_Database::get_all_events() as $other){if(($other['id']??'')===($event['id']??'')||($other['status']??'')!=='Confirmed')continue;try{[$a,$b]=self::dateRange($other,$s);if(self::overlap($start,$end,$a,$b))$conflicts[]=['source'=>'DJ Desk','event'=>$other['name']??'Another confirmed booking'];}catch(Throwable $e){}}
        $token=self::currentToken();if(!$token||empty($s['calendar_id']))return $conflicts;
        $tz=new DateTimeZone($s['timezone']?:'America/New_York');$min=$start->modify('-1 second')->format(DateTimeInterface::RFC3339);$max=$end->modify('+1 second')->format(DateTimeInterface::RFC3339);
        $path='calendars/'.rawurlencode($s['calendar_id']).'/events?'.http_build_query(['timeMin'=>$min,'timeMax'=>$max,'singleEvents'=>'true','orderBy'=>'startTime','maxResults'=>250]);
        $current=DJ_Database::get_row('SELECT google_event_id FROM '.self::table('events').' WHERE environment = ? AND event_id = ?',[self::env(),$event['id']??'']);$own=$current['google_event_id']??self::googleId((string)($event['id']??''));
        foreach(self::api('GET',$path)['body']['items']??[] as $item){if(($item['id']??'')===$own||($item['status']??'')==='cancelled')continue;$x=$item['start']['dateTime']??($item['start']['date']??'');$y=$item['end']['dateTime']??($item['end']['date']??'');if(!$x||!$y)continue;try{$c=new DateTimeImmutable($x,$tz);$d=new DateTimeImmutable($y,$tz);if(self::overlap($start,$end,$c,$d))$conflicts[]=['source'=>'Google Calendar','event'=>$item['summary']??'Busy'];}catch(Throwable $e){}}
        return $conflicts;
    }
    private static function googleId(string $eventId): string {return substr(hash('sha256',self::env().':'.$eventId),0,40);}
    private static function deleteCalendarEvent(string $eventId): array {
        $env=self::env();$map=DJ_Database::get_row('SELECT google_event_id FROM '.self::table('events').' WHERE environment = ? AND event_id = ?',[$env,$eventId]);if(!$map)return ['status'=>'not-mapped'];
        try{$id=rawurlencode($map['google_event_id']);self::api('DELETE','calendars/'.rawurlencode(self::currentSettings()['calendar_id']).'/events/'.$id);}catch(Throwable $e){if(strpos($e->getMessage(),'HTTP 404')===false)throw $e;}
        DJ_Database::delete(self::table('events'),['environment'=>$env,'event_id'=>$eventId]);return ['status'=>'deleted'];
    }
    private static function syncOne(array $event): array {
        $s=self::currentSettings();if(empty($s['enabled']))return ['status'=>'disabled','conflicts'=>[]];
        if(($event['status']??'')!=='Confirmed'){
            if(($event['status']??'')==='Canceled'||(($event['status']??'')!=='Completed'&&($event['status']??'')!=='Archived'))return ['status'=>self::deleteCalendarEvent((string)$event['id'])['status'],'conflicts'=>[]];
            return ['status'=>'ignored','conflicts'=>[]];
        }
        if(empty($s['calendar_id']))throw new RuntimeException('Choose a dedicated calendar for this environment before syncing.');
        [$start,$end,$eventStart,$eventEnd]=self::dateRange($event,$s);$conflicts=self::conflicts($event);
        $id=self::googleId((string)$event['id']);$summary=(string)($event['name']??'DJ event');$client=(string)($event['client']['name']??'');$venue=(string)($event['venue']??'');
        $description="DJ Desk booking\nClient: $client\nEvent time: ".$eventStart->format('g:i A').'–'.$eventEnd->format('g:i A')."\nSetup and breakdown buffers are included in the calendar block.";
        if($venue!=='')$description.="\nVenue: $venue";if(!empty($event['address']))$description.="\nAddress: ".$event['address'];if(!empty($event['type']))$description.="\nType: ".$event['type'];if(!empty($event['client']['email']))$description.="\nClient email: ".$event['client']['email'];
        $body=['id'=>$id,'summary'=>$summary,'description'=>$description,'location'=>$venue,'start'=>['dateTime'=>$start->format(DateTimeInterface::RFC3339),'timeZone'=>$s['timezone']],'end'=>['dateTime'=>$end->format(DateTimeInterface::RFC3339),'timeZone'=>$s['timezone']],'extendedProperties'=>['private'=>['djDeskEnvironment'=>self::env(),'djDeskEventId'=>(string)$event['id']]]];
        $path='calendars/'.rawurlencode($s['calendar_id']).'/events/'.$id;$http=409;
        try{self::api('PUT',$path,$body);$http=200;}catch(Throwable $e){if(strpos($e->getMessage(),'HTTP 404')===false && strpos($e->getMessage(),'HTTP 405')===false) {if(strpos($e->getMessage(),'HTTP 409')===false)throw $e;}}
        if($http===409){try{self::api('POST','calendars/'.rawurlencode($s['calendar_id']).'/events',$body);}catch(Throwable $e){if(strpos($e->getMessage(),'HTTP 409')===false)throw $e;self::api('PUT',$path,$body);}}
        DJ_Database::replace(self::table('events'),['environment'=>self::env(),'event_id'=>(string)$event['id'],'google_event_id'=>$id,'updated_at'=>gmdate('Y-m-d H:i:s')]);
        return ['status'=>'synced','conflicts'=>$conflicts];
    }
    private static function manualSync(): array {
        $s=self::currentSettings();if(!$s||empty($s['calendar_id']))throw new RuntimeException('Choose a dedicated calendar for this environment before synchronizing.');self::accessToken();
        $result=['synced'=>0,'removed'=>0,'conflicts'=>[],'errors'=>[]];
        foreach(DJ_Database::get_all_events() as $event){try{$r=self::syncOne($event);if($r['status']==='synced')$result['synced']++;if($r['status']==='deleted')$result['removed']++;foreach($r['conflicts'] as $c)$result['conflicts'][]=['booking'=>$event['name']??'Booking']+$c;}catch(Throwable $e){$result['errors'][]=['booking'=>$event['name']??'Booking','message'=>self::cleanError($e->getMessage())];}}
        $err=count($result['errors'])?json_encode($result['errors']):'';DJ_Database::update(self::table('settings'),['last_synced_at'=>gmdate('Y-m-d H:i:s'),'last_error'=>$err],['environment'=>self::env()]);return $result;
    }
    public static function onEventSaved(array $event): array {
        try{
            if(self::env()==='unknown'||!self::config()||!self::currentToken())return ['status'=>'not-connected','conflicts'=>[]];
            $result=self::syncOne($event);DJ_Database::update(self::table('settings'),['last_synced_at'=>gmdate('Y-m-d H:i:s'),'last_error'=>''],['environment'=>self::env()]);return $result;
        }
        catch(Throwable $e){$message=self::cleanError($e->getMessage());self::saveError($message);return ['status'=>'error','error'=>$message,'conflicts'=>[]];}
    }
    public static function route(string $path,string $method,array $input): bool {
        // Older copies of the Calendar settings module still use this URL.
        if ($path === 'google-calendar/connect' && $method === 'GET') $path = 'admin/google-calendar/connect';
        if(strpos($path,'admin/google-calendar/')!==0 && $path!=='google-calendar/callback')return false;
        if($path==='google-calendar/callback'&&$method==='GET'){self::schema();self::callback();}
        require_db();$session=require_admin();self::assertEnvironment();self::schema();
        if($path==='admin/google-calendar/connect'&&$method==='GET')self::startOAuth($session);
        if($path==='admin/google-calendar/status'&&$method==='GET')json_response(self::settingsView());
        if($path==='admin/google-calendar/calendars'&&$method==='GET')json_response(self::calendarList());
        if($path==='admin/google-calendar/settings'&&$method==='POST'){
            self::configWrite($input);$calId=trim((string)($input['calendarId']??''));$name='';
            if($calId!==''){$calendars=self::calendarList();foreach($calendars as $calendar)if(hash_equals($calendar['id'],$calId)){$name=$calendar['name'];if($calendar['primary'])json_error('Select the dedicated calendar named for this DJ Desk environment, not your primary calendar.',422);break;}if($name==='')json_error('Select a calendar returned by Google for this account.',422);$expected=self::env();if(stripos($name,$expected)===false)json_error('Calendar name must include “'.ucfirst($expected).'” to keep Staging and Production separate.',422);}
            $setup=(int)($input['setupBuffer']??60);$break=(int)($input['breakdownBuffer']??30);if($setup<0||$setup>720||$break<0||$break>720)json_error('Buffers must be between 0 and 720 minutes.',422);
            $tz=(string)($input['timezone']??'America/New_York');try{new DateTimeZone($tz);}catch(Throwable $e){json_error('Choose a valid timezone.',422);}
            DJ_Database::update(self::table('settings'),['calendar_id'=>$calId,'calendar_name'=>$name,'setup_buffer'=>$setup,'breakdown_buffer'=>$break,'timezone'=>$tz,'enabled'=>!empty($input['enabled'])?1:0],['environment'=>self::env()]);json_response(self::settingsView());
        }
        if($path==='admin/google-calendar/sync'&&$method==='POST'){try{json_response(self::manualSync());}catch(Throwable $e){self::saveError(self::cleanError($e->getMessage()));json_error(self::cleanError($e->getMessage()),502);}}
        if($path==='admin/google-calendar/disconnect'&&$method==='POST'){DJ_Database::delete(self::table('tokens'),['environment'=>self::env()]);json_response(['ok'=>true,'message'=>'Google Calendar disconnected. Existing calendar entries were left in place.']);}
        json_error('Unsupported Google Calendar request.',405);
    }
}
