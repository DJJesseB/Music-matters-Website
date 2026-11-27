<?php
// Exercise the same storage methods used by the authenticated settings route.
$root = $argv[1];
$webRoot = $root . '/public_html/staging/public_html';
$desk = $webRoot . '/dj-desk';
mkdir($desk . '/api', 0700, true);
copy(__DIR__ . '/../public_html/dj-desk/api/GoogleCalendar.php', $desk . '/api/GoogleCalendar.php');
require $desk . '/api/GoogleCalendar.php';

function check(bool $passed, string $message): void {
    if (!$passed) throw new RuntimeException($message);
}

$calendar = new ReflectionClass(DJ_GoogleCalendar::class);
$read = $calendar->getMethod('config');
$write = $calendar->getMethod('configWrite');
$read->setAccessible(true);
$write->setAccessible(true);
$_SERVER['HTTP_HOST'] = 'staging.music-matters.me';
$_SERVER['DOCUMENT_ROOT'] = $webRoot;
$dir = $root . '/.dj-desk-staging';
$path = $dir . '/google-calendar-secrets.json';
$legacyPath = $desk . '/data/google-calendar-secrets.php';
check($read->invoke(null) === [], 'Fresh install should report no credentials.');
$write->invoke(null, ['clientId' => 'fixture-id', 'clientSecret' => 'fixture-secret']);
$initial = $read->invoke(null);
check($initial['client_secret'] === 'fixture-secret', 'Fresh save should work without a data directory.');
check(!is_dir(dirname($legacyPath)), 'Save should not create public storage.');
check((fileperms($dir) & 0777) === 0700, 'Private directory must have mode 0700.');
check((fileperms($path) & 0777) === 0600, 'Private file must have mode 0600.');
$write->invoke(null, ['clientId' => 'updated-id']);
$updated = $read->invoke(null);
check($updated['client_id'] === 'updated-id', 'Credential updates should persist.');
check($updated['client_secret'] === $initial['client_secret'], 'Omitted secret must be preserved.');
check($updated['encryption_key'] === $initial['encryption_key'], 'Updates must preserve the token key.');

rename($dir, $dir . '-fixture');
mkdir(dirname($legacyPath), 0500);
chmod(dirname($legacyPath), 0700);
$legacy = ['client_id' => 'legacy-id', 'client_secret' => 'legacy-secret', 'encryption_key' => base64_encode(random_bytes(32))];
$legacyBody = '<?php return ' . var_export($legacy, true) . ';';
file_put_contents($legacyPath, $legacyBody);
chmod(dirname($legacyPath), 0500);
check($read->invoke(null) === $legacy, 'Existing credentials must remain readable before migration.');
$write->invoke(null, []);
check($read->invoke(null) === $legacy, 'Migration must preserve the existing token key and credentials.');
check(file_get_contents($legacyPath) === $legacyBody, 'Migration must leave the legacy file intact.');
chmod(dirname($legacyPath), 0700);

$_SERVER['HTTP_HOST'] = 'music-matters.me';
check($read->invoke(null) === $legacy, 'Production must still read its existing file.');
$_SERVER['HTTP_HOST'] = 'staging.music-matters.me';
$_SERVER['DOCUMENT_ROOT'] = $root;
try {
    $read->invoke(null);
    throw new LogicException('A public storage path was accepted.');
} catch (RuntimeException $error) {
    check(strpos($error->getMessage(), $root) === false, 'Storage errors must not expose filesystem paths.');
}
echo "Staging Calendar storage checks passed.\n";
