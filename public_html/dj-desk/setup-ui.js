import {mountCalendarSettings} from './calendar-ui.js?v=1';

/**
 * DJ Live Request Desk & Event Manager
 * Setup Wizard & Admin Desk Settings UI
 */

export function setupUI({ api, app, head, esc, message, onComplete }) {

  function wizard(initialStatus = {}) {
    const hasSqlite = (initialStatus.availableDrivers || []).includes('sqlite');
    const defaultDriver = initialStatus.db?.driver || 'mysql';
    const brand = initialStatus.brand || {};
    const admin = initialStatus.admin || {};
    const db = initialStatus.db || {};

    app.innerHTML = head(
      'QUICK INSTALLATION & SETUP',
      'Welcome to DJ Live Request Desk',
      'Configure your database and administrator account. These settings can also be updated anytime from the Admin Settings workspace.',
      '<a class="button secondary" href="../" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none;font-weight:700;color:#b6ff35;padding:10px 16px;border:1px solid #64734e;border-radius:8px;">← Return to Main Website</a>'
    ) + `
    <form id="setupWizard" class="setup-wizard-card">
      <fieldset>
        <legend>1. Database Connection</legend>
        <p>Choose your database backend. Standard shared hosting (cPanel, Plesk, etc.) uses true MySQL. If SQLite is installed, you can use local directory storage.</p>
        
        <div class="driver-selector" role="radiogroup" aria-label="Database driver">
          <label class="driver-option ${defaultDriver === 'mysql' ? 'selected' : ''}">
            <input type="radio" name="driver" value="mysql" ${defaultDriver === 'mysql' ? 'checked' : ''}>
            <div>
              <strong>MySQL / MariaDB</strong>
              <small>Standard for shared web hosts (cPanel / Plesk). Connects to your hosting database.</small>
            </div>
          </label>
          <label class="driver-option ${!hasSqlite ? 'disabled' : ''} ${defaultDriver === 'sqlite' ? 'selected' : ''}">
            <input type="radio" name="driver" value="sqlite" ${defaultDriver === 'sqlite' ? 'checked' : ''} ${!hasSqlite ? 'disabled' : ''}>
            <div>
              <strong>Local SQLite File</strong>
              <small>${hasSqlite ? 'Stores data in ./data/dj_desk.sqlite inside this folder.' : 'Not enabled in host PHP (pdo_sqlite missing). Choose MySQL.'}</small>
            </div>
          </label>
        </div>

        <div id="mysqlFields" class="grid" ${defaultDriver === 'sqlite' ? 'hidden' : ''}>
          <label>Database Host *
            <input type="text" name="db_host" value="${esc(db.host || 'localhost')}" required>
          </label>
          <label>Port
            <input type="number" name="db_port" value="${esc(db.port || 3306)}" required>
          </label>
          <label>Database Name *
            <input type="text" name="db_name" value="${esc(db.name || '')}" placeholder="e.g. cpaneluser_djdesk" required>
          </label>
          <label>Database User *
            <input type="text" name="db_user" value="${esc(db.user || '')}" placeholder="e.g. cpaneluser_djuser" required>
          </label>
          <label>Database Password
            <input type="password" name="db_pass" placeholder="Database password">
          </label>
          <label>Table Prefix
            <input type="text" name="db_prefix" value="${esc(db.prefix || 'dj_')}">
          </label>
        </div>

        <div id="sqliteFields" class="grid" ${defaultDriver !== 'sqlite' ? 'hidden' : ''}>
          <label class="wide">SQLite Database Path
            <input type="text" name="db_path" value="data/dj_desk.sqlite" readonly>
            <small class="input-guidance">Protected by data/.htaccess against public browser access.</small>
          </label>
        </div>

        <div style="margin-top: 18px;">
          <button type="button" id="btnTestDb" class="button secondary">Test Database Connection</button>
          <div id="testResult" class="test-result" hidden></div>
        </div>
      </fieldset>

      <fieldset style="margin-top: 34px;">
        <legend>2. Administrator Account</legend>
        <p>Create your primary DJ administrator account to manage bookings, clients, music requests, and invoices.</p>
        <div class="grid">
          <label>Admin Email *
            <input type="email" name="admin_email" value="${esc(admin.email || '')}" placeholder="dj@yourdomain.com" required>
          </label>
          <div></div>
          <label>Admin Password *
            <input type="password" name="admin_pass" minlength="8" placeholder="At least 8 characters" required>
          </label>
          <label>Confirm Password *
            <input type="password" name="admin_pass_confirm" minlength="8" placeholder="Re-enter password" required>
          </label>
        </div>
      </fieldset>

      <fieldset style="margin-top: 34px;">
        <legend>3. Business Brand & Retainer Defaults</legend>
        <div class="grid">
          <label>Brand / DJ Name *
            <input type="text" name="brand_name" value="${esc(brand.name || 'DJ Jesse B')}" required>
          </label>
          <label>Guest Tip / CashApp Link
            <input type="url" name="brand_tip_link" value="${esc(brand.tip_link || '')}" placeholder="https://cash.app/$yourname">
          </label>
          <label>Standard Retainer ($)
            <input type="number" name="brand_deposit" value="${esc(brand.standard_deposit || 250)}" min="0" step="1">
          </label>
          <label>Retainer Percentage (%)
            <input type="number" name="brand_percent" value="${esc(brand.deposit_percent || 20)}" min="0" max="100" step="1">
          </label>
          <label class="wide">Retainer Calculation Mode
            <select name="brand_mode">
              <option value="higher" ${brand.deposit_mode === 'higher' ? 'selected' : ''}>Higher of Standard or Percentage (Recommended)</option>
              <option value="standard" ${brand.deposit_mode === 'standard' ? 'selected' : ''}>Standard Fixed Amount Only</option>
              <option value="percent" ${brand.deposit_mode === 'percent' ? 'selected' : ''}>Percentage Only</option>
            </select>
          </label>
          <label class="wide">Retainer Agreement Statement
            <textarea name="brand_policy" rows="3">${esc(brand.deposit_policy || 'A non-refundable retainer reserves your event date once the agreement is signed and payment is verified. It is non-refundable, used for date reservation and administrative purposes, and credited toward your event total.')}</textarea>
          </label>
        </div>
      </fieldset>

      <fieldset style="margin-top: 34px;">
        <legend>4. Starter Data</legend>
        <label class="check-row" style="display:flex;align-items:center;gap:12px;font-size:14px;cursor:pointer;">
          <input type="checkbox" name="seed_demo" value="1" checked style="width:20px;height:20px;accent-color:var(--lime);">
          <span>Seed sample demo events, contracts, and song requests (can be cleared anytime with 1 click).</span>
        </label>
      </fieldset>

      <div style="margin-top: 34px; padding-top: 24px; border-top: 1px solid #48513f; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
        <button type="submit" id="btnSaveSetup" style="font-size: 16px; padding: 15px 28px;">Save Configuration & Launch Desk →</button>
        <small id="setupNotice" style="color:var(--muted);"></small>
      </div>
    </form>`;

    const form = document.querySelector('#setupWizard');
    const mysqlFields = document.querySelector('#mysqlFields');
    const sqliteFields = document.querySelector('#sqliteFields');
    const testBtn = document.querySelector('#btnTestDb');
    const testResult = document.querySelector('#testResult');

    // Driver toggle
    form.querySelectorAll('input[name="driver"]').forEach(radio => {
      radio.onchange = () => {
        const isSqlite = form.elements.driver.value === 'sqlite';
        mysqlFields.hidden = isSqlite;
        sqliteFields.hidden = !isSqlite;
        form.querySelectorAll('.driver-option').forEach(el => {
          el.classList.toggle('selected', el.querySelector('input').checked);
        });
        form.querySelectorAll('#mysqlFields input').forEach(inp => {
          if (inp.name !== 'db_pass') inp.required = !isSqlite;
        });
      };
    });

    // Test connection
    testBtn.onclick = async () => {
      const driver = form.elements.driver.value;
      const dbPayload = {
        driver,
        host: form.elements.db_host?.value || 'localhost',
        port: Number(form.elements.db_port?.value || 3306),
        name: form.elements.db_name?.value || '',
        user: form.elements.db_user?.value || '',
        pass: form.elements.db_pass?.value || '',
        prefix: form.elements.db_prefix?.value || 'dj_'
      };

      testResult.hidden = false;
      testResult.className = 'test-result testing';
      testResult.textContent = 'Testing connection...';
      testBtn.disabled = true;

      try {
        const res = await api('setup/test-db', 'POST', { db: dbPayload });
        if (res.ok) {
          testResult.className = 'test-result success';
          testResult.textContent = '✓ ' + (res.message || 'Connection verified successfully!');
        } else {
          testResult.className = 'test-result error';
          testResult.textContent = '✕ ' + (res.error || 'Connection failed.');
        }
      } catch (err) {
        testResult.className = 'test-result error';
        testResult.textContent = '✕ ' + (err.message || 'Connection failed.');
      } finally {
        testBtn.disabled = false;
      }
    };

    // Submit wizard
    form.onsubmit = async (e) => {
      e.preventDefault();
      const p1 = form.elements.admin_pass.value;
      const p2 = form.elements.admin_pass_confirm.value;

      if (p1 !== p2) {
        message('Admin passwords do not match. Please re-enter.', true);
        form.elements.admin_pass_confirm.focus();
        return;
      }

      const driver = form.elements.driver.value;
      const payload = {
        db: {
          driver,
          host: form.elements.db_host?.value || 'localhost',
          port: Number(form.elements.db_port?.value || 3306),
          name: form.elements.db_name?.value || '',
          user: form.elements.db_user?.value || '',
          pass: form.elements.db_pass?.value || '',
          prefix: form.elements.db_prefix?.value || 'dj_'
        },
        admin: {
          email: form.elements.admin_email.value,
          password: p1
        },
        brand: {
          name: form.elements.brand_name.value,
          tip_link: form.elements.brand_tip_link.value,
          standard_deposit: Number(form.elements.brand_deposit.value || 250),
          deposit_percent: Number(form.elements.brand_percent.value || 20),
          deposit_mode: form.elements.brand_mode.value,
          deposit_policy: form.elements.brand_policy.value
        },
        seed_demo: form.elements.seed_demo.checked
      };

      const saveBtn = document.querySelector('#btnSaveSetup');
      const notice = document.querySelector('#setupNotice');
      saveBtn.disabled = true;
      notice.textContent = 'Saving configuration and setting up tables...';

      try {
        const res = await api('setup/save', 'POST', payload);
        notice.textContent = 'Configuration saved! Launching desk...';
        message('Desk configured and ready! Welcome.');
        if (onComplete && res.session) {
          onComplete(res.session);
        } else {
          location.hash = '#dashboard';
          location.reload();
        }
      } catch (err) {
        message(err.message, true);
        notice.textContent = '';
        saveBtn.disabled = false;
      }
    };
  }

  async function settings() {
    let cfg = {};
    try {
      cfg = await api('admin/settings');
    } catch (err) {
      message(err.message, true);
      return;
    }

    const brand = cfg.brand || {};
    const admin = cfg.admin || {};
    const db = cfg.db || {};
    const stripe = cfg.stripe || {};
    const security = cfg.security || {};
    const email = cfg.email || {};

    app.innerHTML = head(
      'SYSTEM ADMINISTRATION',
      'Desk Settings & Configuration',
      'Manage branding, database connection, payment gateways, anti-spam rate limits, and demo data.',
      '<button type="button" id="btnSaveSettingsTop" class="button">Save Settings</button>'
    ) + `
    <form id="settingsForm">
      <div class="tabs" role="group" aria-label="Settings categories">
        <button type="button" class="active" data-set-tab="brand">Brand & Retainer</button>
        <button type="button" data-set-tab="admin">Admin Accounts</button>
        <button type="button" data-set-tab="email">Email (Resend)</button>
        <button type="button" data-set-tab="database">Database</button>
        <button type="button" data-set-tab="stripe">Stripe Payments</button>
        <button type="button" data-set-tab="security">Anti-Spam & Security</button>
        <button type="button" data-set-tab="calendar">Google Calendar</button>
        <button type="button" data-set-tab="demo">Sample Data</button>
      </div>

      <!-- Tab: Brand -->
      <section class="card" data-settings-panel="brand">
        <fieldset>
          <legend>Business Brand & Retainer Rules</legend>
          <div class="grid">
            <label>Brand / DJ Name *
              <input type="text" name="brand_name" value="${esc(brand.name || '')}" required>
            </label>
            <label>Song Request Tip Link (CashApp, Venmo, PayPal)
              <input type="url" name="brand_tip_link" value="${esc(brand.tip_link || '')}" placeholder="https://cash.app/$yourname">
            </label>
            <label>Standard Retainer Amount ($)
              <input type="number" name="brand_deposit" value="${esc(brand.standard_deposit || 250)}" min="0" step="1">
            </label>
            <label>Retainer Percentage (%)
              <input type="number" name="brand_percent" value="${esc(brand.deposit_percent || 20)}" min="0" max="100" step="1">
            </label>
            <label class="wide">Retainer Calculation Mode
              <select name="brand_mode">
                <option value="higher" ${brand.deposit_mode === 'higher' ? 'selected' : ''}>Higher of Standard or Percentage (Recommended)</option>
                <option value="standard" ${brand.deposit_mode === 'standard' ? 'selected' : ''}>Standard Fixed Amount Only</option>
                <option value="percent" ${brand.deposit_mode === 'percent' ? 'selected' : ''}>Percentage Only</option>
              </select>
            </label>
            <label class="wide">Retainer Policy Statement
              <textarea name="brand_policy" rows="3">${esc(brand.deposit_policy || '')}</textarea>
            </label>
          </div>
        </fieldset>
      </section>

      <!-- Tab: Admin Accounts -->
      <section class="card" data-settings-panel="admin" hidden>
        <fieldset>
          <legend>Administrator Team & Access</legend>
          <p>Configure multiple administrator accounts. Any administrator can log in with their email and password to manage bookings, clients, music requests, invoices, and settings.</p>
          
          <div style="margin-top: 14px;">
            <strong style="display:block; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--lime); margin-bottom: 10px;">Active Administrators</strong>
            <div id="adminResetResult" hidden></div>
            <div id="adminUsersList" style="margin-bottom: 24px;"></div>
          </div>

          <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #3a4433;">
            <strong style="display:block; font-size: 14px; margin-bottom: 12px; color: #fff;">＋ Add Another Administrator</strong>
            <div class="grid" style="align-items: flex-end;">
              <label>Admin Email Address *
                <input type="email" id="newAdminEmail" placeholder="colleague@example.com" autocomplete="off">
              </label>
              <label>Password * (min 8 chars)
                <input type="password" id="newAdminPassword" placeholder="Minimum 8 characters" minlength="8" autocomplete="new-password">
              </label>
              <label>Confirm Password *
                <input type="password" id="newAdminPasswordConfirm" placeholder="Confirm password" minlength="8" autocomplete="new-password">
              </label>
              <div style="padding-bottom: 2px;">
                <button type="button" id="btnAddAdminUser" class="button" style="width: 100%;">Create Admin</button>
              </div>
            </div>
            <div id="newAdminNotice" class="test-result" hidden style="margin-top: 12px;"></div>
          </div>

          <div style="margin-top: 20px; padding: 14px 16px; background: rgba(255,255,255,0.02); border: 1px dashed #48513f; border-radius: 8px;">
            <strong style="color: var(--lime); font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; display:block; margin-bottom: 4px;">Single-Admin Emergency Recovery</strong>
            <small style="color: #cbd5e1; line-height: 1.5; display:block;">
              If you only have 1 administrator account and are locked out, emergency recovery is built in: open <code>config.php</code> on your host (via cPanel File Manager or FTP) and set <code>'emergency_password' => 'YourNewPass123!'</code> under <code>'admin'</code>, or run <code>php api/emergency-reset.php email new_password</code> via SSH.
            </small>
          </div>
        </fieldset>

        <fieldset style="margin-top: 28px;">
          <legend>Your Own Login Credentials (${esc(admin.email || '')})</legend>
          <div class="grid">
            <label>Your Email *
              <input type="email" name="admin_email" value="${esc(admin.email || '')}" required>
            </label>
            <div></div>
            <label>Change Your Password (Optional)
              <input type="password" name="admin_password" placeholder="Leave blank to keep current password" minlength="8">
              <small class="input-guidance">Only enter if you wish to change your own login password.</small>
            </label>
            <label>Confirm New Password
              <input type="password" name="admin_password_confirm" placeholder="Confirm new password" minlength="8">
            </label>
          </div>
        </fieldset>
      </section>

      <!-- Tab: Email (Resend) -->
      <section class="card" data-settings-panel="email" hidden>
        <fieldset>
          <legend>Transactional Email Delivery (Resend)</legend>
          <p>
            Connect your <a href="https://resend.com" target="_blank" rel="noopener" style="color:var(--lime);text-decoration:underline;">Resend</a> account to automatically dispatch client portal invitations, signed agreement notices, and website inquiries with maximum inbox delivery.
          </p>

          <label class="check-row" style="display:flex;align-items:center;gap:12px;margin:20px 0;cursor:pointer;">
            <input type="checkbox" name="email_enabled" value="1" ${email.enabled ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--lime);">
            <strong style="font-size:15px;color:#fff;">Enable Resend Email Service</strong>
          </label>

          <div class="grid">
            <label class="wide">Resend API Key *
              <input type="password" name="email_api_key" placeholder="${email.has_api_key ? '•••••••• (leave blank to keep existing key)' : 're_123456789...'}" value="${esc(email.api_key || '')}">
              <small class="input-guidance">Obtain from your dashboard at <a href="https://resend.com/api-keys" target="_blank" rel="noopener" style="color:var(--lime);">resend.com/api-keys</a> (starts with <code>re_</code>).</small>
            </label>

            <label>Sender Display Name *
              <input type="text" name="email_from_name" value="${esc(email.from_name || brand.name || 'DJ Jesse B')}" placeholder="DJ Jesse B" required>
            </label>

            <label>Sender "From" Email *
              <input type="email" name="email_from_email" value="${esc(email.from_email || 'onboarding@resend.dev')}" placeholder="onboarding@resend.dev" required>
              <small class="input-guidance">Use <code>onboarding@resend.dev</code> for instant testing (delivers to your Resend account email), or your verified domain.</small>
            </label>

            <label class="wide">Reply-To Email Address
              <input type="email" name="email_reply_to" value="${esc(email.reply_to || admin.email || 'djgourmet@me.com')}" placeholder="djgourmet@me.com">
              <small class="input-guidance">Replies from clients or FAQ inquiries will route straight to this inbox.</small>
            </label>

            <label class="check-row wide" style="display:flex;align-items:center;gap:12px;margin-top:8px;cursor:pointer;">
              <input type="checkbox" name="email_admin_copy" value="1" ${email.admin_copy ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--lime);">
              <span style="font-size:14px;color:#cbd5e1;">Send a BCC copy of client invitations to the administrator email address.</span>
            </label>
          </div>

          <div style="margin-top: 24px; padding: 20px; background: rgba(182, 255, 53, 0.03); border: 1px solid #3a4433; border-radius: 10px;">
            <strong style="color:var(--lime); font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; display:block; margin-bottom: 6px;">Test Email Delivery</strong>
            <p style="font-size: 13px; color: #cbd5e1; margin: 0 0 14px; line-height: 1.5;">
              Send an instant diagnostic test to verify your API key and connection before or after saving.
            </p>
            <div style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
              <label style="flex:1; min-width:240px; margin:0;">Destination Email
                <input type="email" id="testEmailTarget" value="${esc(admin.email || 'djgourmet@me.com')}" placeholder="you@example.com">
              </label>
              <button type="button" id="btnTestEmail" class="button secondary" style="padding:11px 20px;">Send Test Email</button>
            </div>
            <div id="testEmailResult" class="test-result" hidden style="margin-top: 14px;"></div>
          </div>
        </fieldset>
      </section>

      <!-- Tab: Database -->
      <section class="card" data-settings-panel="database" hidden>
        <fieldset>
          <legend>Database Connection Settings</legend>
          <p>Configured database credentials in config.php.</p>
          <div class="grid">
            <label>Database Engine
              <input type="text" name="db_driver" value="${esc(db.driver || 'mysql')}" readonly>
            </label>
            <label>Host
              <input type="text" name="db_host" value="${esc(db.host || 'localhost')}">
            </label>
            <label>Port
              <input type="number" name="db_port" value="${esc(db.port || 3306)}">
            </label>
            <label>Database Name
              <input type="text" name="db_name" value="${esc(db.name || '')}">
            </label>
            <label>Database User
              <input type="text" name="db_user" value="${esc(db.user || '')}">
            </label>
            <label>Database Password
              <input type="password" name="db_pass" placeholder="${db.hasPassword ? '•••••••• (leave blank to keep current)' : 'Enter password'}">
            </label>
            <label>Table Prefix
              <input type="text" name="db_prefix" value="${esc(db.prefix || 'dj_')}">
            </label>
          </div>
          <div style="margin-top: 18px;">
            <button type="button" id="btnTestDbSettings" class="button secondary">Test Connection</button>
            <div id="testResultSettings" class="test-result" hidden></div>
          </div>
        </fieldset>
      </section>

      <!-- Tab: Stripe -->
      <section class="card" data-settings-panel="stripe" hidden>
        <fieldset>
          <legend>Stripe Payments Integration</legend>
          <label class="check-row" style="display:flex;align-items:center;gap:12px;margin-bottom:20px;cursor:pointer;">
            <input type="checkbox" name="stripe_enabled" value="1" ${stripe.enabled ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--lime);">
            <strong style="font-size:15px;">Enable Stripe Online Card Payments</strong>
          </label>
          <div class="grid">
            <label>Processing Mode
              <select name="stripe_mode">
                <option value="test" ${stripe.mode !== 'live' ? 'selected' : ''}>Test Mode (Stripe sandbox)</option>
                <option value="live" ${stripe.mode === 'live' ? 'selected' : ''}>Live Mode (Real card charges)</option>
              </select>
            </label>
            <div></div>
            <label class="wide">Stripe Publishable Key
              <input type="text" name="stripe_publishable_key" value="${esc(stripe.publishable_key || '')}" placeholder="pk_test_... or pk_live_...">
            </label>
            <label class="wide">Stripe Secret Key
              <input type="password" name="stripe_secret_key" placeholder="${stripe.has_secret_key ? '•••••••• (leave blank to keep existing key)' : 'sk_test_... or sk_live_...'}">
            </label>
            <label class="wide">Stripe Webhook Secret
              <input type="password" name="stripe_webhook_secret" placeholder="${stripe.has_webhook_secret ? '•••••••• (leave blank to keep existing secret)' : 'whsec_...'}">
            </label>
          </div>
        </fieldset>
      </section>

      <!-- Tab: Security -->
      <section class="card" data-settings-panel="security" hidden>
        <fieldset>
          <legend>Guest Song Request Anti-Spam Controls</legend>
          <div class="grid">
            <label>Cooldown Between Requests (Seconds)
              <input type="number" name="rate_limit_seconds" value="${esc(security.rate_limit_seconds || 15)}" min="1" max="300">
              <small class="input-guidance">Minimum wait time before a single device can submit another request.</small>
            </label>
            <label>Maximum Requests Per Hour Per Device
              <input type="number" name="max_requests_hour" value="${esc(security.max_requests_hour || 30)}" min="1" max="500">
              <small class="input-guidance">Limits excessive requests from any single mobile phone at an event.</small>
            </label>
            <label>Session Lifetime (Days)
              <input type="number" name="session_days" value="${Math.round((security.session_lifetime || 604800) / 86400)}" min="1" max="90">
              <small class="input-guidance">How long an admin or client stays signed in.</small>
            </label>
          </div>
        </fieldset>
      </section>

      <!-- Tab: Google Calendar -->
      <section class="card" data-settings-panel="calendar" hidden><div id="calendarIntegrationCenter"></div></section>

      <!-- Tab: Demo Data -->
      <section class="card" data-settings-panel="demo" hidden>
        <fieldset>
          <legend>Demo Data & Sample Events Management</legend>
          <p>Easily restore sample bookings, song requests, and client accounts for evaluation, or wipe all sample data cleanly for production.</p>
          <div class="demo-management">
            <button type="button" id="btnRestoreDemo" class="button secondary">Restore Sample Events & Requests</button>
            <button type="button" id="btnClearDemo" class="button secondary" style="border-color:#ff7d8a;color:#ffb6bd;">Clear All Sample Data</button>
          </div>
          <div id="demoNotice" class="test-result" hidden></div>

          <div style="margin-top: 28px; padding-top: 24px; border-top: 1px solid #48513f;">
            <strong style="color:var(--lime); font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; display:block; margin-bottom: 8px;">Production Reset & Rerun Setup Wizard</strong>
            <p style="font-size: 13px; color: #cbd5e1; line-height: 1.5; margin-bottom: 16px;">
              Ready to launch in production or re-configure credentials? You can reset DJ-Desk back to initial setup mode to enter fresh production database credentials, brand settings, and your primary administrator account.
            </p>
            <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
              <button type="button" id="btnResetDesk" class="button secondary" style="border-color:#ff7d8a; color:#ffb6bd;">Reset Configuration (Keep Tables)</button>
              <button type="button" id="btnResetDeskWipe" class="button secondary" style="border-color:#ff4d4d; background:rgba(255,77,77,0.1); color:#ff6b6b;">⚠️ Factory Reset & Wipe Test Data</button>
            </div>
            <div id="resetDeskNotice" class="test-result" hidden style="margin-top: 14px;"></div>
          </div>
        </fieldset>
      </section>

      <div class="actions">
        <button type="submit" id="btnSaveSettingsBottom">Save Settings</button>
        <small id="settingsSaveStatus">All changes write to config.php directly.</small>
      </div>
    </form>`;

    const form = document.querySelector('#settingsForm');
    mountCalendarSettings({api,esc,message});

    // Tab switcher
    document.querySelectorAll('[data-set-tab]').forEach(btn => {
      btn.onclick = () => {
        const target = btn.dataset.setTab;
        document.querySelectorAll('[data-set-tab]').forEach(b => b.classList.toggle('active', b === btn));
        document.querySelectorAll('[data-settings-panel]').forEach(panel => {
          panel.hidden = panel.dataset.settingsPanel !== target;
        });
      };
    });

    // Admin user management
    function renderAdminList(users = [], currentUserId = '') {
      const listEl = document.querySelector('#adminUsersList');
      if (!listEl) return;
      if (!users.length) {
        listEl.innerHTML = '<p style="color:var(--muted);">No administrator accounts found.</p>';
        return;
      }
      listEl.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${users.map(u => {
            const isMe = u.id === currentUserId;
            return `
              <div class="event" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:rgba(255,255,255,0.03);border:1px solid #3a4433;border-radius:8px;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <span style="font-size:16px;">👤</span>
                  <div>
                    <strong style="color:#fff;">${esc(u.email)}</strong>
                    ${isMe ? '<span class="badge purple" style="margin-left:8px;font-size:11px;">You</span>' : ''}
                  </div>
                </div>
                <div style="display:flex;gap:8px;">
                  ${isMe ? '' : `<button type="button" class="button secondary btn-reset-admin-pass" data-user-id="${esc(u.id)}" data-user-email="${esc(u.email)}" style="padding:6px 12px;font-size:12px;">🔑 Reset Password</button>`}
                  ${isMe || users.length <= 1 ? '' : `<button type="button" class="button secondary btn-delete-admin" data-user-id="${esc(u.id)}" data-user-email="${esc(u.email)}" style="padding:6px 12px;font-size:12px;color:#ff6b6b;border-color:#ff6b6b;">Delete</button>`}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;

      listEl.querySelectorAll('.btn-reset-admin-pass').forEach(btn => {
        btn.onclick = async () => {
          const email = btn.dataset.userEmail;
          const uid = btn.dataset.userId;
          const choice = confirm(`Reset password for administrator "${email}"?\n\n• Click OK to automatically generate a secure temporary password.\n• Click Cancel to enter a custom password.`);
          let payload = {};
          if (!choice) {
            const custom = prompt(`Enter custom temporary password for ${email} (minimum 8 characters):`);
            if (!custom) return;
            if (custom.length < 8) {
              alert('Password must be at least 8 characters long.');
              return;
            }
            payload.password = custom;
          }

          try {
            const res = await api(`admin/users/${uid}/reset-password`, 'POST', payload);
            message(res.message || 'Password reset successfully.');
            const resetBox = document.querySelector('#adminResetResult');
            if (resetBox) {
              resetBox.hidden = false;
              resetBox.innerHTML = `
                <div style="background:rgba(182,255,53,0.08);border:1px solid #64734e;border-radius:8px;padding:16px;margin-bottom:18px;">
                  <strong style="color:var(--lime);display:block;margin-bottom:6px;">✓ Password Reset for ${esc(res.email)}</strong>
                  <p style="margin:0 0 10px;font-size:13px;color:#e2e8f0;">Temporary password assigned. All existing sessions for this administrator have been logged out:</p>
                  <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                    <input type="text" id="tempPassField" value="${esc(res.temporaryPassword)}" readonly style="font-family:monospace;font-size:15px;font-weight:700;padding:8px 12px;background:#182017;color:#b6ff35;border:1px solid #48513f;border-radius:6px;width:260px;">
                    <button type="button" class="button secondary" id="btnCopyPass" style="padding:8px 14px;font-size:13px;">Copy Password</button>
                  </div>
                  <small style="display:block;margin-top:8px;color:var(--muted);">Provide this temporary password to the administrator to sign in.</small>
                </div>
              `;
              const copyBtn = document.querySelector('#btnCopyPass');
              if (copyBtn) {
                copyBtn.onclick = () => {
                  navigator.clipboard?.writeText(res.temporaryPassword);
                  copyBtn.textContent = 'Copied!';
                  setTimeout(() => { if (copyBtn) copyBtn.textContent = 'Copy Password'; }, 2000);
                };
              }
            }
          } catch (err) {
            message(err.message, true);
          }
        };
      });

      listEl.querySelectorAll('.btn-delete-admin').forEach(btn => {
        btn.onclick = async () => {
          const email = btn.dataset.userEmail;
          const uid = btn.dataset.userId;
          if (!confirm(`Are you sure you want to delete administrator "${email}"? This will revoke their access immediately.`)) return;
          try {
            const res = await api(`admin/users/${uid}`, 'DELETE');
            message(res.message || 'Administrator removed.');
            const updated = await api('admin/users');
            renderAdminList(updated.users, updated.currentUserId);
          } catch (err) {
            message(err.message, true);
          }
        };
      });
    }

    renderAdminList(cfg.adminUsers || [], cfg.currentAdminId || '');

    const btnAddAdmin = document.querySelector('#btnAddAdminUser');
    const newAdminNotice = document.querySelector('#newAdminNotice');
    if (btnAddAdmin) {
      btnAddAdmin.onclick = async () => {
        const emailEl = document.querySelector('#newAdminEmail');
        const passEl = document.querySelector('#newAdminPassword');
        const passConfirmEl = document.querySelector('#newAdminPasswordConfirm');
        const email = emailEl.value.trim();
        const pass = passEl.value;
        const passConfirm = passConfirmEl.value;

        if (!email || !email.includes('@')) {
          message('Please enter a valid email address.', true);
          emailEl.focus();
          return;
        }
        if (pass.length < 8) {
          message('Password must be at least 8 characters.', true);
          passEl.focus();
          return;
        }
        if (pass !== passConfirm) {
          message('Passwords do not match.', true);
          passConfirmEl.focus();
          return;
        }

        newAdminNotice.hidden = false;
        newAdminNotice.className = 'test-result testing';
        newAdminNotice.textContent = 'Creating administrator...';
        btnAddAdmin.disabled = true;

        try {
          const res = await api('admin/users', 'POST', { email, password: pass });
          newAdminNotice.className = 'test-result success';
          newAdminNotice.textContent = '✓ ' + (res.message || 'Administrator created successfully!');
          emailEl.value = '';
          passEl.value = '';
          passConfirmEl.value = '';
          message(res.message || 'Admin account created.');
          const updated = await api('admin/users');
          renderAdminList(updated.users, updated.currentUserId);
        } catch (err) {
          newAdminNotice.className = 'test-result error';
          newAdminNotice.textContent = '✕ ' + err.message;
          message(err.message, true);
        } finally {
          btnAddAdmin.disabled = false;
        }
      };
    }

    // Test DB connection button
    const testBtn = document.querySelector('#btnTestDbSettings');
    const testRes = document.querySelector('#testResultSettings');
    testBtn.onclick = async () => {
      testRes.hidden = false;
      testRes.className = 'test-result testing';
      testRes.textContent = 'Testing database connection...';
      try {
        const res = await api('setup/test-db', 'POST', {
          db: {
            driver: form.elements.db_driver.value,
            host: form.elements.db_host.value,
            port: Number(form.elements.db_port.value),
            name: form.elements.db_name.value,
            user: form.elements.db_user.value,
            pass: form.elements.db_pass.value,
            prefix: form.elements.db_prefix.value
          }
        });
        testRes.className = res.ok ? 'test-result success' : 'test-result error';
        testRes.textContent = (res.ok ? '✓ ' : '✕ ') + (res.message || res.error);
      } catch (err) {
        testRes.className = 'test-result error';
        testRes.textContent = '✕ ' + err.message;
      }
    };

    // Test Email Delivery button
    const testEmailBtn = document.querySelector('#btnTestEmail');
    const testEmailRes = document.querySelector('#testEmailResult');
    if (testEmailBtn) {
      testEmailBtn.onclick = async () => {
        const targetInput = document.querySelector('#testEmailTarget');
        const target = targetInput ? targetInput.value.trim() : '';
        if (!target || !target.includes('@')) {
          message('Please enter a valid destination email address for the test.', true);
          if (targetInput) targetInput.focus();
          return;
        }

        testEmailRes.hidden = false;
        testEmailRes.className = 'test-result testing';
        testEmailRes.textContent = 'Sending test email via Resend...';
        testEmailBtn.disabled = true;

        try {
          const res = await api('admin/email/test', 'POST', {
            email: target,
            api_key: form.elements.email_api_key.value,
            from_name: form.elements.email_from_name.value,
            from_email: form.elements.email_from_email.value,
            reply_to: form.elements.email_reply_to.value
          });
          testEmailRes.className = 'test-result success';
          testEmailRes.textContent = '✓ ' + (res.message || 'Test email dispatched successfully! Check your inbox.');
          message(res.message || 'Test email dispatched.');
        } catch (err) {
          testEmailRes.className = 'test-result error';
          testEmailRes.textContent = '✕ ' + err.message;
          message(err.message, true);
        } finally {
          testEmailBtn.disabled = false;
        }
      };
    }

    // Demo data controls
    const demoNotice = document.querySelector('#demoNotice');
    document.querySelector('#btnRestoreDemo').onclick = async () => {
      if (!confirm('Restore sample events and song requests? Existing events will be preserved or refreshed.')) return;
      demoNotice.hidden = false;
      demoNotice.className = 'test-result testing';
      demoNotice.textContent = 'Restoring demo data...';
      try {
        const res = await api('admin/seed-demo', 'POST');
        demoNotice.className = 'test-result success';
        demoNotice.textContent = '✓ ' + (res.message || 'Demo data restored successfully.');
      } catch (err) {
        demoNotice.className = 'test-result error';
        demoNotice.textContent = '✕ ' + err.message;
      }
    };

    document.querySelector('#btnClearDemo').onclick = async () => {
      if (!confirm('Are you sure you want to clear all sample events and requests? This action cannot be undone.')) return;
      demoNotice.hidden = false;
      demoNotice.className = 'test-result testing';
      demoNotice.textContent = 'Clearing sample data...';
      try {
        const res = await api('admin/clear-demo', 'POST');
        demoNotice.className = 'test-result success';
        demoNotice.textContent = '✓ ' + (res.message || 'Sample data cleared.');
      } catch (err) {
        demoNotice.className = 'test-result error';
        demoNotice.textContent = '✕ ' + err.message;
      }
    };

    // Desk Reset handlers
    const btnResetDesk = document.querySelector('#btnResetDesk');
    const btnResetDeskWipe = document.querySelector('#btnResetDeskWipe');
    const resetDeskNotice = document.querySelector('#resetDeskNotice');

    const handleDeskReset = async (wipeData = false) => {
      const promptMsg = wipeData
        ? 'Are you sure you want to FACTORY RESET DJ-Desk?\n\nThis will permanently delete all test events, bookings, song requests, and contracts, and reset configuration so you can run the Setup Wizard from scratch.'
        : 'Are you sure you want to reset the configuration?\n\nThis will return the system to initial setup mode so you can re-enter database and admin credentials. Existing database tables will be preserved.';
      if (!confirm(promptMsg)) return;

      if (resetDeskNotice) {
        resetDeskNotice.hidden = false;
        resetDeskNotice.className = 'test-result testing';
        resetDeskNotice.textContent = 'Resetting desk configuration...';
      }

      try {
        const res = await api('admin/reset-desk', 'POST', { wipe_data: wipeData });
        if (resetDeskNotice) {
          resetDeskNotice.className = 'test-result success';
          resetDeskNotice.textContent = '✓ ' + (res.message || 'Reset complete. Relaunching Setup Wizard...');
        }
        message('Desk reset successfully. Relaunching Setup Wizard...');
        setTimeout(() => {
          window.location.hash = '';
          window.location.reload();
        }, 1200);
      } catch (err) {
        if (resetDeskNotice) {
          resetDeskNotice.className = 'test-result error';
          resetDeskNotice.textContent = '✕ ' + err.message;
        }
        message(err.message, true);
      }
    };

    if (btnResetDesk) btnResetDesk.onclick = () => handleDeskReset(false);
    if (btnResetDeskWipe) btnResetDeskWipe.onclick = () => handleDeskReset(true);

    // Save form handler
    const saveHandler = async (e) => {
      if (e) e.preventDefault();
      const p1 = form.elements.admin_password.value;
      const p2 = form.elements.admin_password_confirm.value;
      if (p1 && p1 !== p2) {
        message('New passwords do not match. Please re-enter.', true);
        return;
      }

      const payload = {
        brand: {
          name: form.elements.brand_name.value,
          tip_link: form.elements.brand_tip_link.value,
          standard_deposit: Number(form.elements.brand_deposit.value || 250),
          deposit_percent: Number(form.elements.brand_percent.value || 20),
          deposit_mode: form.elements.brand_mode.value,
          deposit_policy: form.elements.brand_policy.value
        },
        admin: {
          email: form.elements.admin_email.value,
          password: p1 || undefined
        },
        email: {
          enabled: form.elements.email_enabled.checked,
          api_key: form.elements.email_api_key.value,
          from_name: form.elements.email_from_name.value,
          from_email: form.elements.email_from_email.value,
          reply_to: form.elements.email_reply_to.value,
          admin_copy: form.elements.email_admin_copy.checked
        },
        stripe: {
          enabled: form.elements.stripe_enabled.checked,
          mode: form.elements.stripe_mode.value,
          publishable_key: form.elements.stripe_publishable_key.value,
          secret_key: form.elements.stripe_secret_key.value || undefined,
          webhook_secret: form.elements.stripe_webhook_secret.value || undefined
        },
        security: {
          rate_limit_seconds: Number(form.elements.rate_limit_seconds.value || 15),
          max_requests_hour: Number(form.elements.max_requests_hour.value || 30),
          session_lifetime: Number(form.elements.session_days.value || 7) * 86400
        }
      };


      const statusEl = document.querySelector('#settingsSaveStatus');
      statusEl.textContent = 'Saving settings...';
      try {
        const res = await api('admin/settings', 'PUT', payload);
        statusEl.textContent = '✓ ' + (res.message || 'Settings saved successfully.');
        message('Settings updated successfully.');
        form.elements.admin_password.value = '';
        form.elements.admin_password_confirm.value = '';
        try {
          const updated = await api('admin/users');
          renderAdminList(updated.users, updated.currentUserId);
        } catch (e) {}
      } catch (err) {
        message(err.message, true);
        statusEl.textContent = '✕ Failed to save settings.';
      }
    };

    form.onsubmit = saveHandler;
    const topBtn = document.querySelector('#btnSaveSettingsTop');
    if (topBtn) topBtn.onclick = saveHandler;
  }

  function dbRecovery(initialStatus = {}) {
    const defaultDriver = initialStatus.db?.driver || 'mysql';
    const db = initialStatus.db || {};
    const dbError = initialStatus.dbError || 'Could not connect to database.';

    app.innerHTML = head(
      'DATABASE CONNECTION',
      'Database Connection Required',
      'DJ Desk is configured, but the database server could not be reached. Review your database credentials below or test the connection.',
      '<a class="button secondary" href="../" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none;font-weight:700;color:#b6ff35;padding:10px 16px;border:1px solid #64734e;border-radius:8px;">← Return to Main Website</a>'
    ) + `
    <div class="setup-wizard-card">
      <div class="test-result error" style="margin-bottom:24px;display:block;padding:16px;border-radius:8px;background:rgba(255,80,80,0.1);border:1px solid #ff5050;">
        <strong style="color:#ff6b6b;display:block;margin-bottom:6px;">Database Connection Error:</strong>
        <code style="word-break:break-all;color:#ffb0b0;">${esc(dbError)}</code>
        <p style="margin:10px 0 0;font-size:13px;color:#d0d0d0;">Tip: If using MySQL on a Linux server and <code>localhost</code> fails with error 2002, try setting Database Host to <code>127.0.0.1</code>.</p>
      </div>

      <form id="dbRecoveryForm">
        <fieldset>
          <legend>Update Database Connection</legend>
          <div class="grid">
            <label>Driver
              <input type="text" name="driver" value="${esc(defaultDriver)}" readonly style="opacity:0.8;">
            </label>
            <label>Database Host *
              <input type="text" name="db_host" value="${esc(db.host || 'localhost')}" required>
            </label>
            <label>Port
              <input type="number" name="db_port" value="${esc(db.port || 3306)}" required>
            </label>
            <label>Database Name *
              <input type="text" name="db_name" value="${esc(db.name || '')}" required>
            </label>
            <label>Database User *
              <input type="text" name="db_user" value="${esc(db.user || '')}" required>
            </label>
            <label>Database Password
              <input type="password" name="db_pass" placeholder="${db.hasPassword ? '(Saved password kept if blank)' : 'Enter database password'}">
            </label>
            <label>Table Prefix
              <input type="text" name="db_prefix" value="${esc(db.prefix || 'dj_')}">
            </label>
          </div>

          <div style="margin-top: 22px; display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
            <button type="button" id="btnTestRecoveryDb" class="button secondary">Test Connection</button>
            <button type="submit" id="btnSaveRecovery" class="button">Save & Reconnect →</button>
            <button type="button" id="btnRetryNow" class="button secondary">Retry Connection</button>
          </div>
          <div id="recoveryTestResult" class="test-result" hidden style="margin-top:14px;"></div>
        </fieldset>
      </form>
    </div>`;

    const form = document.querySelector('#dbRecoveryForm');
    const testBtn = document.querySelector('#btnTestRecoveryDb');
    const testResult = document.querySelector('#recoveryTestResult');
    const retryBtn = document.querySelector('#btnRetryNow');

    if (retryBtn) {
      retryBtn.onclick = () => window.location.reload();
    }

    testBtn.onclick = async () => {
      const dbPayload = {
        driver: defaultDriver,
        host: form.elements.db_host?.value || 'localhost',
        port: Number(form.elements.db_port?.value || 3306),
        name: form.elements.db_name?.value || '',
        user: form.elements.db_user?.value || '',
        pass: form.elements.db_pass?.value || '',
        prefix: form.elements.db_prefix?.value || 'dj_'
      };

      testResult.hidden = false;
      testResult.className = 'test-result testing';
      testResult.textContent = 'Testing connection...';
      testBtn.disabled = true;

      try {
        const res = await api('setup/test-db', 'POST', { db: dbPayload });
        if (res.ok) {
          testResult.className = 'test-result success';
          testResult.textContent = '✓ ' + (res.message || 'Connection verified successfully!');
          if (res.workingHost && res.workingHost !== form.elements.db_host.value) {
            form.elements.db_host.value = res.workingHost;
          }
        } else {
          testResult.className = 'test-result error';
          testResult.textContent = '✕ ' + (res.error || 'Connection failed.');
        }
      } catch (err) {
        testResult.className = 'test-result error';
        testResult.textContent = '✕ ' + (err.message || 'Connection failed.');
      } finally {
        testBtn.disabled = false;
      }
    };

    form.onsubmit = async (e) => {
      e.preventDefault();
      const saveBtn = document.querySelector('#btnSaveRecovery');
      saveBtn.disabled = true;
      testResult.hidden = false;
      testResult.className = 'test-result testing';
      testResult.textContent = 'Testing connection and saving...';

      const payload = {
        db: {
          driver: defaultDriver,
          host: form.elements.db_host?.value || 'localhost',
          port: Number(form.elements.db_port?.value || 3306),
          name: form.elements.db_name?.value || '',
          user: form.elements.db_user?.value || '',
          pass: form.elements.db_pass?.value || '',
          prefix: form.elements.db_prefix?.value || 'dj_'
        },
        admin: {
          email: initialStatus.admin?.email || 'admin@example.com'
        },
        brand: initialStatus.brand || {},
        seed_demo: false
      };

      try {
        const res = await api('setup/save', 'POST', payload);
        testResult.className = 'test-result success';
        testResult.textContent = '✓ Connected successfully! Launching...';
        message('Database reconnected successfully.');
        setTimeout(() => {
          if (onComplete && res.session) {
            onComplete(res.session);
          } else {
            window.location.reload();
          }
        }, 600);
      } catch (err) {
        testResult.className = 'test-result error';
        testResult.textContent = '✕ ' + (err.message || 'Save failed.');
        saveBtn.disabled = false;
      }
    };
  }

  return { wizard, dbRecovery, settings };
}
