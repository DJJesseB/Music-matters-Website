<?php
/**
 * DJ Live Request Desk & Event Manager
 * Transactional Email Service with Native Resend REST API Support
 * 
 * Works out-of-the-box on standard shared web hosting using PHP curl.
 * Supports Resend (https://resend.com) and fallback to PHP mail().
 */

declare(strict_types=1);

class DJ_Mailer {
    private static array $config = [];

    /**
     * Initialize mailer configuration
     */
    public static function init(array $config): void {
        self::$config = $config;
    }

    /**
     * Check if email delivery is configured and enabled
     */
    public static function isConfigured(): bool {
        if (empty(self::$config['enabled'])) {
            return false;
        }
        $provider = self::$config['provider'] ?? 'resend';
        if ($provider === 'resend') {
            return !empty(self::$config['api_key']);
        }
        return true;
    }

    /**
     * Get sender email address
     */
    public static function getFromEmail(): string {
        $from = self::$config['from_email'] ?? '';
        return !empty($from) ? trim($from) : 'onboarding@resend.dev';
    }

    /**
     * Get sender display name
     */
    public static function getFromName(): string {
        $name = self::$config['from_name'] ?? '';
        return !empty($name) ? trim($name) : 'DJ Jesse B';
    }

    /**
     * Get reply-to email address
     */
    public static function getReplyTo(): string {
        return self::$config['reply_to'] ?? '';
    }

    /**
     * Send an email
     *
     * @param string|array $to Recipient email or array of emails
     * @param string $subject Email subject line
     * @param string $html HTML email content
     * @param array $options Optional settings (reply_to, text, bcc, cc, tags)
     * @return array ['ok' => bool, 'id' => ?string, 'error' => ?string]
     */
    public static function send($to, string $subject, string $html, array $options = []): array {
        $toAddresses = is_array($to) ? array_values(array_filter(array_map('trim', $to))) : [trim((string)$to)];
        $toAddresses = array_filter($toAddresses, function($e) {
            return filter_var($e, FILTER_VALIDATE_EMAIL) !== false;
        });

        if (empty($toAddresses)) {
            return ['ok' => false, 'error' => 'No valid recipient email address provided.'];
        }

        $provider = self::$config['provider'] ?? 'resend';
        if (empty(self::$config['enabled']) && !($options['force'] ?? false)) {
            return ['ok' => false, 'error' => 'Email delivery is currently disabled in Desk Settings.'];
        }

        $plainText = $options['text'] ?? self::htmlToPlainText($html);
        $replyTo = !empty($options['reply_to']) ? trim($options['reply_to']) : self::getReplyTo();

        // Include admin copy if configured
        $bcc = [];
        if (!empty(self::$config['admin_copy']) && !empty(self::$config['admin_email'])) {
            $adminEmail = trim(self::$config['admin_email']);
            if (!in_array(strtolower($adminEmail), array_map('strtolower', $toAddresses), true)) {
                $bcc[] = $adminEmail;
            }
        }
        if (!empty($options['bcc'])) {
            $extraBcc = is_array($options['bcc']) ? $options['bcc'] : [$options['bcc']];
            $bcc = array_merge($bcc, $extraBcc);
        }

        if ($provider === 'resend') {
            return self::sendViaResend($toAddresses, $subject, $html, $plainText, $replyTo, $bcc);
        }

        return self::sendViaPhpMail($toAddresses, $subject, $html, $plainText, $replyTo);
    }

    /**
     * Deliver email using the Resend HTTPS REST API
     */
    private static function sendViaResend(array $to, string $subject, string $html, string $plainText, string $replyTo, array $bcc): array {
        $apiKey = trim(self::$config['api_key'] ?? '');
        if (empty($apiKey)) {
            return ['ok' => false, 'error' => 'Resend API key is missing. Enter your key (re_...) in Desk Settings.'];
        }

        if (!function_exists('curl_init')) {
            return ['ok' => false, 'error' => 'PHP cURL extension is not installed or enabled on this host.'];
        }

        $fromName = self::getFromName();
        $fromEmail = self::getFromEmail();
        $fromHeader = $fromName ? "{$fromName} <{$fromEmail}>" : $fromEmail;

        $payload = [
            'from'    => $fromHeader,
            'to'      => $to,
            'subject' => $subject,
            'html'    => $html,
            'text'    => $plainText,
        ];

        if (!empty($replyTo) && filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
            $payload['reply_to'] = $replyTo;
        }

        if (!empty($bcc)) {
            $payload['bcc'] = array_values(array_unique($bcc));
        }

        $ch = curl_init('https://api.resend.com/emails');
        $jsonPayload = json_encode($payload);

        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $jsonPayload,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 20,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bearer ' . $apiKey,
                'Content-Type: application/json',
                'User-Agent: DJ-Live-Request-Desk/2026',
            ],
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($curlError) {
            return ['ok' => false, 'error' => 'Network error connecting to Resend: ' . $curlError];
        }

        $data = json_decode((string)$response, true);

        if ($httpCode >= 200 && $httpCode < 300) {
            return [
                'ok'       => true,
                'id'       => $data['id'] ?? null,
                'provider' => 'resend',
                'message'  => 'Email accepted by Resend.'
            ];
        }

        // Format clean error message from Resend response
        $errMsg = 'Resend delivery failed';
        if (is_array($data)) {
            if (!empty($data['message'])) {
                $errMsg = $data['message'];
            } elseif (!empty($data['name'])) {
                $errMsg = $data['name'] . ': ' . json_encode($data);
            }
        } elseif ($response) {
            $errMsg = 'HTTP ' . $httpCode . ': ' . strip_tags($response);
        } else {
            $errMsg = 'HTTP ' . $httpCode . ' empty response from Resend';
        }

        return ['ok' => false, 'error' => $errMsg, 'httpCode' => $httpCode];
    }

    /**
     * Fallback to native PHP mail() if configured
     */
    private static function sendViaPhpMail(array $to, string $subject, string $html, string $plainText, string $replyTo): array {
        $fromEmail = self::getFromEmail();
        $fromName = self::getFromName();
        $boundary = '=_dj_' . md5((string)microtime());

        $headers = [];
        $headers[] = 'MIME-Version: 1.0';
        $headers[] = 'From: ' . ($fromName ? "{$fromName} <{$fromEmail}>" : $fromEmail);
        if ($replyTo) {
            $headers[] = 'Reply-To: ' . $replyTo;
        }
        $headers[] = 'Content-Type: multipart/alternative; boundary="' . $boundary . '"';

        $body = "--{$boundary}\r\n";
        $body .= "Content-Type: text/plain; charset=UTF-8\r\n";
        $body .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
        $body .= $plainText . "\r\n\r\n";
        $body .= "--{$boundary}\r\n";
        $body .= "Content-Type: text/html; charset=UTF-8\r\n";
        $body .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
        $body .= $html . "\r\n\r\n";
        $body .= "--{$boundary}--";

        $toStr = implode(', ', $to);
        $accepted = @mail($toStr, $subject, $body, implode("\r\n", $headers));

        if ($accepted) {
            return ['ok' => true, 'provider' => 'mail', 'message' => 'Sent via PHP mail()'];
        }
        $lastErr = error_get_last();
        return ['ok' => false, 'error' => 'PHP mail() error: ' . ($lastErr['message'] ?? 'rejected by server')];
    }

    /**
     * Test Resend connection by sending a verified diagnostic email
     */
    public static function testConnection(string $toEmail): array {
        $toEmail = trim($toEmail);
        if (!filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
            return ['ok' => false, 'error' => 'Please enter a valid email address to receive the test.'];
        }

        $brandName = self::getFromName();
        $fromEmail = self::getFromEmail();
        $timestamp = date('F j, Y, g:i a T');

        $body = "
            <h2 style=\"margin:0 0 16px;color:#ffffff;font-size:22px;\">Resend Connection Confirmed! 🚀</h2>
            <p style=\"font-size:15px;line-height:1.6;color:#cbd5e1;margin-bottom:20px;\">
                This diagnostic email confirms that your <strong>Resend</strong> transactional email integration is operational and ready to send booking invitations, signed contract notifications, and website inquiries.
            </p>
            <div style=\"background:#121812;border:1px solid #33422f;border-radius:8px;padding:16px 20px;margin-bottom:24px;\">
                <table style=\"width:100%;border-collapse:collapse;font-size:13px;color:#94a3b8;\">
                    <tr>
                        <td style=\"padding:6px 0;width:120px;\"><strong style=\"color:#b6ff35;\">Status:</strong></td>
                        <td style=\"padding:6px 0;color:#e2e8f0;\">Active & Connected</td>
                    </tr>
                    <tr>
                        <td style=\"padding:6px 0;\"><strong style=\"color:#b6ff35;\">Sender:</strong></td>
                        <td style=\"padding:6px 0;color:#e2e8f0;\">{$brandName} &lt;{$fromEmail}&gt;</td>
                    </tr>
                    <tr>
                        <td style=\"padding:6px 0;\"><strong style=\"color:#b6ff35;\">Sent At:</strong></td>
                        <td style=\"padding:6px 0;color:#e2e8f0;\">{$timestamp}</td>
                    </tr>
                </table>
            </div>
            <p style=\"font-size:13px;line-height:1.5;color:#94a3b8;margin:0;\">
                <strong>Next Step:</strong> When using <code>onboarding@resend.dev</code>, Resend only delivers to your registered Resend account address. To send to any client, verify your custom domain (e.g. <code>music-matters.me</code>) in your Resend Dashboard at <a href=\"https://resend.com/domains\" style=\"color:#b6ff35;text-decoration:none;\">resend.com/domains</a>.
            </p>
        ";

        $html = self::wrapBrandedTemplate(
            'Resend Connection Test',
            $body,
            'Open Desk Workspace',
            'https://music-matters.me/dj-desk/'
        );

        return self::send($toEmail, "Resend Delivery Test - {$brandName}", $html, ['force' => true]);
    }

    /**
     * Send client invitation link for planning & contract portal
     */
    public static function sendClientInvitation(string $toEmail, string $clientName, string $eventName, string $eventDate, string $token, string $scope = 'both', ?string $baseUrl = null): array {
        $brandName = self::getFromName();
        $portalUrl = ($baseUrl ?: 'https://music-matters.me/dj-desk/') . '?token=' . urlencode($token);

        $scopeDesc = ($scope === 'contract')
            ? 'review and sign your event agreement'
            : 'access your event planning timeline, music request list, and agreement';

        $body = "
            <h2 style=\"margin:0 0 16px;color:#ffffff;font-size:22px;\">Welcome, " . htmlspecialchars($clientName) . "! 🎧</h2>
            <p style=\"font-size:15px;line-height:1.6;color:#cbd5e1;margin-bottom:16px;\">
                Your client portal for <strong>" . htmlspecialchars($eventName) . "</strong> (" . htmlspecialchars($eventDate) . ") is ready. You can now " . $scopeDesc . ".
            </p>
            <div style=\"background:#121812;border:1px solid #33422f;border-radius:8px;padding:16px 20px;margin-bottom:24px;\">
                <table style=\"width:100%;border-collapse:collapse;font-size:14px;color:#cbd5e1;\">
                    <tr>
                        <td style=\"padding:6px 0;width:120px;\"><strong style=\"color:#b6ff35;\">Event:</strong></td>
                        <td style=\"padding:6px 0;color:#ffffff;\">" . htmlspecialchars($eventName) . "</td>
                    </tr>
                    <tr>
                        <td style=\"padding:6px 0;\"><strong style=\"color:#b6ff35;\">Date:</strong></td>
                        <td style=\"padding:6px 0;color:#ffffff;\">" . htmlspecialchars($eventDate) . "</td>
                    </tr>
                    <tr>
                        <td style=\"padding:6px 0;\"><strong style=\"color:#b6ff35;\">Access Link:</strong></td>
                        <td style=\"padding:6px 0;color:#94a3b8;\">One-click secure link (valid for 24 hours)</td>
                    </tr>
                </table>
            </div>
            <p style=\"font-size:14px;line-height:1.5;color:#cbd5e1;margin-bottom:24px;\">
                Click the button below to enter your private event planner:
            </p>
        ";

        $html = self::wrapBrandedTemplate(
            "Event Portal Access: {$eventName}",
            $body,
            'Open Your Client Portal →',
            $portalUrl
        );

        return self::send($toEmail, "Your Event Portal Access - {$eventName} ({$brandName})", $html);
    }

    /**
     * Send admin password reset notification
     */
    public static function sendAdminPasswordReset(string $toEmail, string $temporaryPassword, ?string $loginUrl = null): array {
        $brandName = self::getFromName();
        $url = $loginUrl ?: 'https://music-matters.me/dj-desk/';

        $body = "
            <h2 style=\"margin:0 0 16px;color:#ffffff;font-size:22px;\">Administrator Password Reset 🔑</h2>
            <p style=\"font-size:15px;line-height:1.6;color:#cbd5e1;margin-bottom:16px;\">
                An administrator has reset the password for your <strong>{$brandName}</strong> Desk account (<code>" . htmlspecialchars($toEmail) . "</code>).
            </p>
            <div style=\"background:#121812;border:1px solid #33422f;border-radius:8px;padding:18px 20px;margin-bottom:24px;\">
                <span style=\"display:block;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#b6ff35;margin-bottom:8px;\">Your Temporary Password</span>
                <code style=\"font-family:monospace;font-size:18px;font-weight:bold;color:#b6ff35;background:rgba(182,255,53,0.1);padding:6px 12px;border-radius:6px;display:inline-block;\">" . htmlspecialchars($temporaryPassword) . "</code>
            </div>
            <p style=\"font-size:14px;line-height:1.5;color:#cbd5e1;margin-bottom:24px;\">
                Please log in and update your password immediately under <strong>Desk Settings → Admin Accounts</strong>.
            </p>
        ";

        $html = self::wrapBrandedTemplate(
            'Admin Password Reset',
            $body,
            'Sign In to Desk →',
            $url
        );

        return self::send($toEmail, "Admin Password Reset - {$brandName}", $html);
    }

    /**
     * Send public website FAQ / inquiry notification to the DJ
     */
    public static function sendFaqInquiry(string $visitorName, string $visitorEmail, string $question): array {
        $brandName = self::getFromName();
        $toEmail = !empty(self::$config['reply_to']) ? self::$config['reply_to'] : (self::$config['admin_email'] ?? 'djgourmet@me.com');

        $body = "
            <h2 style=\"margin:0 0 16px;color:#ffffff;font-size:22px;\">New Website Inquiry 💬</h2>
            <p style=\"font-size:15px;line-height:1.6;color:#cbd5e1;margin-bottom:20px;\">
                A visitor submitted a new question from the FAQ section of <strong>music-matters.me</strong>:
            </p>
            <div style=\"background:#121812;border:1px solid #33422f;border-radius:8px;padding:16px 20px;margin-bottom:24px;\">
                <table style=\"width:100%;border-collapse:collapse;font-size:14px;\">
                    <tr>
                        <td style=\"padding:6px 0;width:90px;\"><strong style=\"color:#b6ff35;\">From:</strong></td>
                        <td style=\"padding:6px 0;color:#ffffff;\">" . htmlspecialchars($visitorName) . "</td>
                    </tr>
                    <tr>
                        <td style=\"padding:6px 0;\"><strong style=\"color:#b6ff35;\">Email:</strong></td>
                        <td style=\"padding:6px 0;color:#b6ff35;\"><a href=\"mailto:" . htmlspecialchars($visitorEmail) . "\" style=\"color:#b6ff35;text-decoration:none;\">" . htmlspecialchars($visitorEmail) . "</a></td>
                    </tr>
                </table>
            </div>
            <div style=\"background:#182017;border-left:3px solid #b6ff35;padding:16px 20px;border-radius:0 8px 8px 0;margin-bottom:24px;\">
                <strong style=\"color:#ffffff;font-size:14px;display:block;margin-bottom:8px;\">Question:</strong>
                <p style=\"color:#e2e8f0;font-size:14px;line-height:1.6;margin:0;white-space:pre-wrap;\">" . htmlspecialchars($question) . "</p>
            </div>
            <p style=\"font-size:13px;line-height:1.5;color:#94a3b8;margin:0;\">
                💡 <em>You can reply directly to this email to answer " . htmlspecialchars($visitorName) . ".</em>
            </p>
        ";

        $html = self::wrapBrandedTemplate(
            "Website Inquiry from {$visitorName}",
            $body,
            'Open Desk Workspace',
            'https://music-matters.me/dj-desk/'
        );

        return self::send($toEmail, "Website Question from {$visitorName}", $html, [
            'reply_to' => $visitorEmail,
            'force'    => true
        ]);
    }

    /**
     * Wrap content inside DJ Jesse B branded responsive HTML template
     */
    public static function wrapBrandedTemplate(string $title, string $bodyContent, ?string $ctaText = null, ?string $ctaUrl = null): string {
        $brandName = self::getFromName();
        $buttonHtml = '';
        if ($ctaText && $ctaUrl) {
            $buttonHtml = "
                <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin: 28px 0 20px;\">
                    <tr>
                        <td align=\"center\" bgcolor=\"#b6ff35\" style=\"border-radius: 8px;\">
                            <a href=\"{$ctaUrl}\" target=\"_blank\" style=\"font-size: 15px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-weight: 700; color: #0d120c; text-decoration: none; padding: 14px 28px; border-radius: 8px; display: inline-block; letter-spacing: 0.02em;\">
                                {$ctaText}
                            </a>
                        </td>
                    </tr>
                </table>
            ";
        }

        return "<!DOCTYPE html>
<html lang=\"en\">
<head>
    <meta charset=\"UTF-8\">
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">
    <title>" . htmlspecialchars($title) . "</title>
    <style>
        body { margin: 0; padding: 0; background-color: #0d120c; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0; -webkit-font-smoothing: antialiased; }
        a { color: #b6ff35; }
        @media only screen and (max-width: 600px) {
            .container { width: 100% !important; padding: 16px !important; }
            .card { padding: 24px 20px !important; }
        }
    </style>
</head>
<body style=\"margin:0;padding:0;background-color:#0d120c;\">
    <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" style=\"background-color:#0d120c;padding:32px 16px;\">
        <tr>
            <td align=\"center\">
                <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" class=\"container\" style=\"max-width:580px;\">
                    <!-- Brand Header -->
                    <tr>
                        <td align=\"center\" style=\"padding-bottom:24px;\">
                            <div style=\"display:inline-block;\">
                                <span style=\"font-size:20px;font-weight:900;letter-spacing:0.08em;color:#ffffff;text-transform:uppercase;\">
                                    " . htmlspecialchars($brandName) . "
                                </span>
                                <span style=\"display:inline-block;width:8px;height:8px;background-color:#b6ff35;border-radius:50%;margin-left:4px;vertical-align:middle;\"></span>
                            </div>
                            <div style=\"font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#7a8a72;margin-top:4px;\">
                                Live Request Desk & Event Portal
                            </div>
                        </td>
                    </tr>
                    <!-- Main Card -->
                    <tr>
                        <td class=\"card\" style=\"background-color:#182017;border:1px solid #3a4433;border-radius:14px;padding:36px 32px;box-shadow:0 12px 36px rgba(0,0,0,0.4);\">
                            {$bodyContent}
                            {$buttonHtml}
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td align=\"center\" style=\"padding-top:24px;\">
                            <p style=\"font-size:12px;line-height:1.5;color:#64734e;margin:0 0 6px;\">
                                Sent securely by " . htmlspecialchars($brandName) . " Desk • <a href=\"https://music-matters.me\" style=\"color:#7a8a72;text-decoration:none;\">music-matters.me</a>
                            </p>
                            <p style=\"font-size:11px;color:#4c5844;margin:0;\">
                                If you did not request this email, you can safely disregard it.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>";
    }

    /**
     * Convert HTML to clean plain text fallback
     */
    private static function htmlToPlainText(string $html): string {
        $text = preg_replace('/<style\b[^>]*>(.*?)<\/style>/is', '', $html);
        $text = preg_replace('/<script\b[^>]*>(.*?)<\/script>/is', '', $text);
        $text = preg_replace('/<br\s*\/?>/i', "\n", $text);
        $text = preg_replace('/<\/p>/i', "\n\n", $text);
        $text = preg_replace('/<\/tr>/i', "\n", $text);
        $text = preg_replace('/<\/h[1-6]>/i', "\n\n", $text);
        $text = strip_tags($text);
        $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        return trim(preg_replace("/\n{3,}/", "\n\n", $text));
    }
}
