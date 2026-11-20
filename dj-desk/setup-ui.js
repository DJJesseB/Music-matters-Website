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
      'Configure your database and administrator account. These settings can also be updated anytime from the Admin Settings workspace.'
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

    app.innerHTML = head(
      'SYSTEM ADMINISTRATION',
      'Desk Settings & Configuration',
      'Manage branding, database connection, payment gateways, anti-spam rate limits, and demo data.',
      '<button type="button" id="btnSaveSettingsTop" class="button">Save Settings</button>'
    ) + `
    <form id="settingsForm">
      <div class="tabs" role="group" aria-label="Settings categories">
        <button type="button" class="active" data-set-tab="brand">Brand & Retainer</button>
        <button type="button" data-set-tab="admin">Admin Account</button>
        <button type="button" data-set-tab="database">Database</button>
        <button type="button" data-set-tab="stripe">Stripe Payments</button>
        <button type="button" data-set-tab="security">Anti-Spam & Security</button>
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

      <!-- Tab: Admin Account -->
      <section class="card" data-settings-panel="admin" hidden>
        <fieldset>
          <legend>Administrator Login Credentials</legend>
          <div class="grid">
            <label>Admin Email *
              <input type="email" name="admin_email" value="${esc(admin.email || '')}" required>
            </label>
            <div></div>
            <label>New Password (Optional)
              <input type="password" name="admin_password" placeholder="Leave blank to keep current password" minlength="8">
              <small class="input-guidance">Only enter if you wish to change your login password.</small>
            </label>
            <label>Confirm New Password
              <input type="password" name="admin_password_confirm" placeholder="Confirm new password" minlength="8">
            </label>
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
        </fieldset>
      </section>

      <div class="actions">
        <button type="submit" id="btnSaveSettingsBottom">Save Settings</button>
        <small id="settingsSaveStatus">All changes write to config.php directly.</small>
      </div>
    </form>`;

    const form = document.querySelector('#settingsForm');

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
      } catch (err) {
        message(err.message, true);
        statusEl.textContent = '✕ Failed to save settings.';
      }
    };

    form.onsubmit = saveHandler;
    const topBtn = document.querySelector('#btnSaveSettingsTop');
    if (topBtn) topBtn.onclick = saveHandler;
  }

  return { wizard, settings };
}
