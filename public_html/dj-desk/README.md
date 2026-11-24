# 🎧 DJ Live Request Desk & Event Manager (Standalone Web Edition)

> **DJ Jesse B - Standalone Web Edition**

A professional, high-performance web application for DJs and live entertainment companies designed to be deployed directly onto standard shared web hosting (cPanel, Apache, LiteSpeed, etc.) in its own directory as part of a larger site.

Zero WordPress dependency. Built with clean, standalone PHP and MySQL.

---

## ✨ Features

- **Live Song Request Desk & Digital Booth Queue:** Real-time request queue with Approved, Played, and Denied status filters, refreshing automatically every 4 seconds.
- **Mobile Guest Hub & Dynamic SVG QR Codes:** Guests scan an SVG QR code at their table to submit song requests from their phones.
- **Anti-Spam & Booth Protection:** Configurable cooldowns (default: 15-second pause), 30 requests/hour cap per device, device fingerprinting, and one-click guest blocking directly from the booth.
- **Client Booking & Event Pipeline:** Manage inquiries, tentative dates, confirmed events, and package/add-on calculators (weddings, proms, school dances, corporate & private events).
- **Client Planning Worksheet:** Run-of-show timeline, ceremony/cocktail moment details, must-play / do-not-play lists.
- **Digital Agreements & Electronic Signatures:** Built-in contract generation, revision tracking, cryptographic SHA-256 fingerprinting, and downloadable HTML contract backups.
- **Subfolder Agnostic:** Operates out of the box in any website subfolder (e.g., `yourdomain.com/requests/`, `yourdomain.com/dj-desk/`, or at the domain root).

---

## 🚀 Quick Setup on Shared Web Hosting

### 1. Upload Files
Upload the entire contents of this repository to your web hosting account (via cPanel File Manager, FTP, or Git):
- **As a subfolder (recommended):** Upload to `/public_html/requests/` or `/public_html/dj-desk/`.
- **At domain root:** Upload directly to `/public_html/`.

### 2. Create a MySQL Database
In your hosting control panel (cPanel, Plesk, DirectAdmin):
1. Navigate to **MySQL Databases**.
2. Create a new database (e.g. `youruser_djdesk`).
3. Create a database user and assign a strong password.
4. Add the user to the database with **ALL PRIVILEGES**.

### 3. Configure `config.php`
Open `config.php` (copied from `config.sample.php` if needed) and enter your database credentials:

```php
return [
    'db' => [
        'driver'   => 'mysql',
        'host'     => 'localhost',
        'port'     => 3306,
        'name'     => 'youruser_djdesk',
        'user'     => 'youruser_djuser',
        'pass'     => 'your_strong_password',
        'charset'  => 'utf8mb4',
        'prefix'   => 'dj_'
    ],

    // Default Administrator Credentials
    'admin' => [
        'email'    => 'admin@example.com',
        'password' => 'DJDesk2026!'
    ],

    // Branding & Retainer Settings
    'brand' => [
        'name'             => 'DJ Jesse B',
        'tip_link'         => '',
        'standard_deposit' => 250,
        'deposit_percent'  => 20,
        'deposit_mode'     => 'higher', // 'higher', 'flat', or 'percent'
        'deposit_policy'   => 'A non-refundable retainer reserves your event date once the agreement is signed and payment is verified.'
    ],

    // Anti-Spam Controls for Live Guest Song Requests
    'security' => [
        'rate_limit_seconds' => 15, // Cooldown between requests from the same phone
        'max_requests_hour'  => 30, // Max requests per device per hour
        'session_lifetime'   => 604800 // 7 days
    ]
];
```

### 4. Launch the App
Visit your folder in a browser:
```
https://yourdomain.com/requests/
```
On initial launch, the app automatically creates all 20 indexed database tables and seeds demo events (Avery & Jordan Wedding, Northstar Academy Spring Formal, Morgan Birthday Celebration) so you can immediately explore the workspace.

Log in using the administrator credentials configured in `config.php`:
- **Email:** `admin@example.com`
- **Password:** `DJDesk2026!`

*(You can change your password anytime or update `config.php`).*

---

## 📱 Mobile Guest Experience & QR Codes

1. Navigate to **♫ Song requests** or open an event in **Event HQ**.
2. Click **Open song requests & create QR**.
3. The booth automatically generates an SVG QR code pointing to:
   ```
   https://yourdomain.com/requests/#music/<event_token>
   ```
4. Print the QR code or display it on a tablet/table card.
5. Guests scan the QR code with their mobile phone cameras to land directly on the mobile request portal.
6. Song requests pop up on the DJ's iPad/laptop booth queue within 4 seconds.

---

## 📂 Project Structure

```
├── index.php                      # Dark-mode Live Canvas & Shell (auto-detects subfolder)
├── index.html                     # Static HTML fallback entry point
├── config.php                     # Active database and business configuration
├── config.sample.php              # Configuration template with setup instructions
├── .htaccess                      # Apache security & MIME configurations
├── app.js                         # Core single-page application router & controller
├── style.css                      # Unified dark-mode command center styles
├── music-ui.js                    # Live request desk & guest mobile view
├── contracts-ui.js                # Digital agreements & e-signature interface
├── portal-ui.js                   # Client portal & run-of-show planner
├── intake-ui.js                   # Public booking requests & date review pipeline
├── pricing.js                     # Package pricing & retainer calculations
├── api/
│   ├── index.php                  # REST API front controller & route dispatcher
│   ├── Database.php               # PDO MySQL abstraction layer & schema installer
│   ├── Auth.php                   # Session security & authentication manager
│   ├── QRCode.php                 # Pure PHP SVG QR code generator (zero external dependencies)
│   └── .htaccess                  # API routing rewrite rules for subfolder support
└── *.png                          # Package preview assets (booth, lighting, uplighting)
```

---

## 🔒 Security & Shared Host Hardening

- **Direct File Protection:** `.htaccess` blocks public web access to `config.php` and sensitive configuration files.
- **Session Security:** Uses HTTP-only, SameSite cookies with SHA-256 session token hashing.
- **Prepared Statements:** All database queries utilize parameterized PDO prepared statements to prevent SQL injection.
- **Client Separation:** Client portal tokens isolate each client to their assigned event and planner.

## Request Kiosk on iPad

1. On a staff device, open the event’s **Live Request Desk**, open requests, and choose **Launch Request Kiosk**. Set a 6–12 digit exit PIN and keep it with staff. The six-digit pairing code is single-use and lasts five minutes.
2. On the iPad, open the kiosk page shown in the launch panel in Safari. Tap **Share**, **Add to Home Screen**, and enable **Open as Web App** if shown. Open the new Home Screen icon and paste the pairing code there. Pair from inside the Home Screen web app so it can keep its own session. [Apple’s Home Screen instructions](https://support.apple.com/en-ca/guide/ipad/ipad8f1f7a29/ipados)
3. In **Settings → Accessibility → Guided Access**, enable Guided Access and set a separate device passcode. With the kiosk open, triple-click the top or Home button, select **Guided Access** if prompted, and tap **Start**. Leave touch and the software keyboard enabled. The web app handles its own PIN exit. Guided Access is what locks iPadOS to the app. [Apple’s Guided Access instructions](https://support.apple.com/en-us/111795)
4. Keep DJ Desk open on the staff device. Under **Request kiosks**, you can see whether the iPad has checked in recently and pause, resume, or revoke it. Use **Pause requests** to close requests for the whole event and end all its kiosk sessions. A completed, canceled, or archived event also ends its kiosk sessions. Opening requests again requires a fresh kiosk pairing.
5. To finish on the iPad, tap **Admin exit** and enter the kiosk PIN. To leave the web app, end Guided Access using the iPad’s controls. Signing back into DJ Desk requires your normal admin credentials.

A paired kiosk can refresh without re-pairing and expires after 12 hours. Its requests enter the usual approval queue. The queue shows how many submissions came from the kiosk and how many came from personal devices. If the kiosk loses its connection, submissions are disabled until it reconnects.

Eight incorrect PIN attempts lock the kiosk PIN. To recover, revoke it from the staff device, launch a new pairing code, and choose **Admin exit → Pair again** on the iPad.
