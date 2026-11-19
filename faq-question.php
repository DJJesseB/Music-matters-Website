<?php
// New-host handler. Enable only after the host's PHP mail service is configured.
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
function reply(int $code, array $body): never { http_response_code($code); echo json_encode($body); exit; }
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') reply(405, ['error'=>'Method not allowed.']);
if (getenv('DJ_FAQ_MAIL_ENABLED') !== '1') reply(503, ['error'=>'Email delivery is not connected yet. Your question has not been sent. Please email djgourmet@me.com.']);
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) reply(415, ['error'=>'Please use the question form.']);
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin === '' || strtolower((string)parse_url($origin, PHP_URL_HOST)) !== strtolower(explode(':', $_SERVER['HTTP_HOST'] ?? '')[0])) reply(403, ['error'=>'Please use the question form on this website.']);
$input = file_get_contents('php://input', false, null, 0, 16001);
if ($input === false || strlen($input) > 16000) reply(413, ['error'=>'Your message is too long.']);
$data = json_decode($input, true);
if (!is_array($data)) reply(400, ['error'=>'Please check your question and try again.']);
foreach (['name','email','question','website'] as $field) if (isset($data[$field]) && !is_string($data[$field])) reply(400, ['error'=>'Invalid form fields.']);
if (trim($data['website'] ?? '') !== '') reply(400, ['error'=>'Your question could not be sent.']);
$name=trim($data['name'] ?? ''); $email=trim($data['email'] ?? ''); $question=trim($data['question'] ?? '');
if ($name === '' || strlen($name)>480 || preg_match('/[\r\n]/', $name) || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email)>254 || preg_match('/[\r\n]/', $email) || $question === '' || strlen($question)>20000) reply(422, ['error'=>'Please enter your name, a valid email address, and your question.']);
// Lightweight per-sender/IP rate limit. Keep this temporary state outside the web root.
$bucket = sys_get_temp_dir().'/dj-faq-'.hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '').'|'.$email).'.lock';
$lock = fopen($bucket, 'c+');
if (!$lock || !flock($lock, LOCK_EX)) reply(503, ['error'=>'Please try again later.']);
$last = (int)stream_get_contents($lock);
if ($last > time()-60) { flock($lock, LOCK_UN); fclose($lock); reply(429, ['error'=>'Please wait a minute before sending another question.']); }
$sender=getenv('DJ_FAQ_FROM_EMAIL') ?: 'website@music-matters.me';
if (!filter_var($sender, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $sender)) { flock($lock, LOCK_UN); fclose($lock); reply(503, ['error'=>'Email delivery needs configuration. Please email djgourmet@me.com.']); }
$body="New website FAQ question\n\nName: $name\nEmail: $email\n\nQuestion:\n$question\n\nReply directly to this message to answer the visitor. Do not publish their name or email in the FAQs.\n";
$headers=['From'=>'DJ Jesse B Website <'.$sender.'>', 'Reply-To'=>$email, 'Content-Type'=>'text/plain; charset=UTF-8'];
$accepted=mail('djgourmet@me.com', 'Website question for DJ Jesse B', $body, $headers);
if ($accepted) { ftruncate($lock, 0); rewind($lock); fwrite($lock, (string)time()); }
flock($lock, LOCK_UN); fclose($lock);
if (!$accepted) reply(502, ['error'=>'Your question could not be sent. Please email djgourmet@me.com or try again later.']);
reply(200, ['ok'=>true]);
