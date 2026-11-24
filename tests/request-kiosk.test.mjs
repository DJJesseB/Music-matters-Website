import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {cp, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';

const php = process.env.PHP_BIN || 'php';
const phpOptions = process.env.PHP_TEST_INI ? ['-c', process.env.PHP_TEST_INI] : [];
const pin = '873049';
const adminCredentials = {email: 'kiosk-test@example.com', password: 'LocalOnly-Test-Password'};

test('request kiosk and existing guest and DJ flows', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dj-request-kiosk-'));
    const app = join(root, 'dj-desk');
    let server;
    let serverLog = '';
    try {
        await mkdir(join(app, 'api'), {recursive: true});
        for (const file of ['Auth.php', 'Database.php', 'index.php', 'Mailer.php', 'PaperContracts.php', 'QRCode.php', 'RequestKiosk.php', 'SchoolInvoices.php']) {
            await cp(new URL('../public_html/dj-desk/api/' + file, import.meta.url), join(app, 'api', file));
        }
        for (const file of ['kiosk.html', 'kiosk.js', 'kiosk.css', 'kiosk.webmanifest']) {
            await cp(new URL('../public_html/dj-desk/' + file, import.meta.url), join(app, file));
        }
        await writeFile(join(app, 'config.php'), `<?php return [
            'configured' => true,
            'db' => ['driver' => 'sqlite', 'path' => __DIR__ . '/test.sqlite'],
            'admin' => ['email' => '${adminCredentials.email}', 'password' => '${adminCredentials.password}']
        ];`);
        execFileSync(php, [...phpOptions, '-r', "require 'api/Database.php'; DJ_Database::init(require 'config.php'); DJ_Database::seed_initial_data();"], {cwd: app});
        // The server is loopback-only. This simulates the HTTPS deployment at the PHP boundary.
        await writeFile(join(root, 'router.php'), `<?php
            if (preg_match('#^/dj-desk/kiosk\\.(html|js|css|webmanifest)$#', parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH))) return false;
            $_SERVER['HTTPS'] = 'on';
            $_SERVER['SCRIPT_NAME'] = '/dj-desk/api/index.php';
            require __DIR__ . '/dj-desk/api/index.php';`);
        const listener = createServer();
        await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
        const address = '127.0.0.1:' + listener.address().port;
        await new Promise(resolve => listener.close(resolve));
        server = spawn(php, [...phpOptions, '-S', address, 'router.php'], {cwd: root, stdio: ['ignore', 'ignore', 'pipe']});
        server.stderr.on('data', chunk => { serverLog += chunk; });
        const endpoint = 'http://' + address + '/dj-desk/api/index.php?route=';

        async function call(path, {body, method = body ? 'POST' : 'GET', cookie, csrf, kiosk = false, expect = 200} = {}) {
            const headers = {};
            if (body) headers['Content-Type'] = 'application/json';
            if (cookie) headers.Cookie = cookie;
            if (csrf) headers['X-CSRF-Token'] = csrf;
            if (kiosk) headers['X-DJ-Kiosk'] = '1';
            const response = await fetch(endpoint + path, {method, headers, body: body && JSON.stringify(body)});
            const raw = await response.text();
            let result;
            try {
                result = JSON.parse(raw);
            } catch {
                assert.fail(path + ' returned invalid JSON: ' + raw);
            }
            assert.equal(response.status, expect, path + ' ' + JSON.stringify(result));
            return {result, cookies: response.headers.getSetCookie()};
        }
        for (let attempt = 0; attempt < 30; attempt++) {
            try {
                await fetch(endpoint + 'auth/session');
                break;
            } catch (error) {
                if (attempt === 29) throw error;
                await delay(100);
            }
        }
        const staffLogin = await call('auth/login', {body: adminCredentials});
        const staff = {cookie: staffLogin.cookies[0].split(';')[0], csrf: staffLogin.result.csrf};
        const {result: events} = await call('admin/music/events', staff);
        const event = events.find(row => row.enabled);
        const otherEvent = events.find(row => row.id !== event.id);
        const desk = 'admin/events/' + event.id + '/music';
        const kiosks = desk + '/kiosks';
        const {result: queue} = await call(desk, staff);
        const guest = 'music/' + queue.config.url.split('/').pop();
        const launch = () => call(kiosks, {...staff, body: {action: 'launch', pin}, expect: 201});
        const submit = (title, key = randomUUID()) => ({title, artist: 'Kiosk test artist', key});

        await call(kiosks, {body: {action: 'launch', pin}, expect: 401});
        await call(kiosks, {cookie: staff.cookie, body: {action: 'launch', pin}, expect: 403});
        await call('kiosk/requests', {body: submit('Unpaired'), expect: 403});
        await call('kiosk/requests', {kiosk: true, body: submit('Unpaired'), expect: 423});

        const {result: {code}} = await launch();
        const sameDevice = await call('auth/login', {body: adminCredentials});
        const oldAdminCookie = sameDevice.cookies[0].split(';')[0];
        const paired = await call('kiosk/pair', {kiosk: true, cookie: oldAdminCookie, body: {code}});
        const kioskCookie = paired.cookies.find(value => value.startsWith('dj_desk_kiosk='));
        assert.match(kioskCookie, /secure/i);
        assert.match(kioskCookie, /httponly/i);
        assert.match(kioskCookie, /samesite=strict/i);
        assert.match(kioskCookie, /path=\/dj-desk/i);
        assert.ok(paired.cookies.some(value => value.startsWith('dj_desk_session=')));
        const device = {kiosk: true, cookie: kioskCookie.split(';')[0]};
        await call('kiosk/pair', {kiosk: true, body: {code}, expect: 410});
        await call(desk, {cookie: oldAdminCookie, expect: 401});
        await call(desk, {...device, expect: 401});
        await call('auth/login', {...device, body: adminCredentials, expect: 403});
        const status = () => call('kiosk/status', device).then(response => response.result.state);
        assert.equal(await status(), 'active');
        assert.equal(await status(), 'active');
        const active = (await call(desk, staff)).result.kiosks.find(row => row.state === 'active');
        assert.equal(active.connected, true);

        const first = submit('Mixed request');
        const {result: created} = await call('kiosk/requests', {...device, body: {...first, eventId: otherEvent.id}});
        const {result: retry} = await call('kiosk/requests', {...device, body: first});
        assert.equal(created.reference, retry.reference);
        const {result: duplicate} = await call('kiosk/requests', {...device, body: submit('  mixed   REQUEST ')});
        assert.equal(duplicate.reference, created.reference);
        await call('kiosk/requests', {...device, body: submit('Immediate next song')});
        const guestDevice = randomUUID();
        const {result: guestVote} = await call(guest, {body: {...submit('Mixed request'), deviceId: guestDevice}});
        assert.equal(guestVote.reference, created.reference);
        await call(guest, {...device, body: {...submit('Cooldown applies'), deviceId: guestDevice, source: 'kiosk'}, expect: 429});
        const saved = (await call(desk, staff)).result.requests.find(row => row.id === created.reference);
        const other = (await call('admin/events/' + otherEvent.id + '/music', staff)).result;
        assert.ok(!other.requests.some(row => row.id === created.reference));
        assert.deepEqual([saved.status, saved.votes, saved.kioskCount, saved.kioskOrigin], ['Pending', 2, 2, true]);
        const {result: moderated} = await call(desk + '/requests/' + saved.id, {
            ...staff, method: 'PUT', body: {status: 'Approved', version: saved.version}
        });
        assert.equal(moderated.requests.find(row => row.id === saved.id).status, 'Approved');

        const control = action => call(kiosks, {...staff, body: {action, id: active.id}});
        await call('admin/events/' + otherEvent.id + '/music/kiosks',
            {...staff, body: {action: 'revoke', id: active.id}, expect: 409});
        await control('pause');
        assert.equal(await status(), 'paused');
        await call('kiosk/requests', {...device, body: submit('Paused'), expect: 423});
        await control('resume');
        assert.equal(await status(), 'active');
        await call('kiosk/exit', {...device, body: {pin: '111111'}, expect: 403});
        await control('revoke');
        assert.equal(await status(), 'revoked');
        await call('kiosk/requests', {...device, body: submit('Revoked'), expect: 423});
        await call('kiosk/exit', {...device, body: {pin}});
        assert.equal(await status(), 'unpaired');

        const second = await launch();
        const {cookies} = await call('kiosk/pair', {kiosk: true, body: {code: second.result.code}});
        const secondDevice = {kiosk: true, cookie: cookies.find(value => value.startsWith('dj_desk_kiosk=')).split(';')[0]};
        const version = (await call(desk, staff)).result.config.version;
        await call(desk, {...staff, body: {action: 'pause', version}});
        assert.equal((await call('kiosk/status', secondDevice)).result.state, 'closed');
        await call(guest, {body: {...submit('Closed'), deviceId: randomUUID()}, expect: 423});
        await call(desk, {...staff, body: {action: 'open', version: version + 1}});
        await call('kiosk/requests', {...secondDevice, body: submit('Closed session stays closed'), expect: 423});

        const third = await launch();
        const pairedAgain = await call('kiosk/pair', {kiosk: true, body: {code: third.result.code}});
        const thirdDevice = {...device, cookie: pairedAgain.cookies.find(value => value.startsWith('dj_desk_kiosk=')).split(';')[0]};
        await call('admin/events/' + event.id + '/close', {...staff, body: {status: 'Completed'}});
        assert.equal((await call('kiosk/status', thirdDevice)).result.state, 'closed');
        await call('kiosk/requests', {...thirdDevice, body: submit('Completed event'), expect: 423});
        const closedEvent = (await call('events/' + event.id, staff)).result;
        await call('events/' + event.id, {...staff, method: 'PUT', body: {...closedEvent, status: 'Confirmed'}});
        assert.equal((await call('kiosk/status', thirdDevice)).result.state, 'revoked');
        for (let attempt = 0; attempt < 8; attempt++) {
            await call('kiosk/exit', {...thirdDevice, body: {pin: '111111'}, expect: 403});
        }
        const locked = await call('kiosk/exit', {...thirdDevice, body: {pin}, expect: 403});
        assert.match(locked.result.error, /locked/);
        const replacement = await launch();
        const renewed = await call('kiosk/pair', {...thirdDevice, body: {code: replacement.result.code}});
        const renewedDevice = {...device, cookie: renewed.cookies.find(value => value.startsWith('dj_desk_kiosk=')).split(';')[0]};

        const otherDesk = 'admin/events/' + otherEvent.id + '/music';
        const openOther = await call(otherDesk, {...staff, body: {action: 'open', version: other.config.version}});
        const otherGuest = 'music/' + openOther.result.config.url.split('/').pop();
        const otherSong = await call(otherGuest, {body: {...submit('Other event song'), deviceId: randomUUID()}});
        const reset = desk + '/reset';
        await call(reset, {body: {confirm: true}, expect: 401});
        await call(reset, {...renewedDevice, body: {confirm: true}, expect: 401});
        await call(reset, {cookie: staff.cookie, body: {confirm: true}, expect: 403});
        await call(reset, {...staff, body: {confirm: false}, expect: 400});
        const beforeReset = (await call(desk, staff)).result;
        assert.ok(beforeReset.requests.length);
        await call(reset, {...staff, body: {confirm: true}});
        const afterReset = (await call(desk, staff)).result;
        assert.deepEqual(afterReset.requests, []);
        assert.deepEqual(afterReset.counts, {Pending: 0, Approved: 0, Played: 0, Denied: 0});
        assert.deepEqual(afterReset.config, beforeReset.config);
        assert.equal((await call('kiosk/status', renewedDevice)).result.state, 'active');
        assert.ok((await call(otherDesk, staff)).result.requests.some(row => row.id === otherSong.result.reference));
        await call(desk + '/requests/' + saved.id, {...staff, method: 'PUT', body: {action: 'block'}, expect: 404});
        const fresh = await call(guest, {body: {...submit('Mixed request'), deviceId: guestDevice}});
        assert.equal(fresh.result.consolidated, false);
        await call(guest, {body: {...submit('Still rate limited after a new submission'), deviceId: guestDevice}, expect: 429});

        if (process.env.KIOSK_PLAYWRIGHT_MODULE) {
            const {chromium} = createRequire(import.meta.url)(process.env.KIOSK_PLAYWRIGHT_MODULE);
            const browser = await chromium.launch({executablePath: process.env.KIOSK_CHROME_BIN});
            try {
                const page = await browser.newPage({viewport: {width: 768, height: 1024}, hasTouch: true});
                const errors = [];
                page.on('pageerror', error => errors.push(error.message));
                const {result: {code: browserCode}} = await launch();
                await page.goto('http://' + address + '/dj-desk/kiosk.html');
                await page.getByLabel('Pairing code').fill(browserCode);
                await page.getByRole('button', {name: 'Pair kiosk'}).click();
                await page.getByLabel('Song title').fill('Browser request');
                await page.getByLabel('Artist').fill('Browser artist');
                await page.getByRole('button', {name: 'Send request'}).click();
                await page.getByRole('heading', {name: 'Request received'}).waitFor();
                await page.getByLabel('Song title').waitFor();
                assert.equal(await page.getByLabel('Song title').inputValue(), '');
                await page.reload();
                await page.getByLabel('Song title').waitFor();
                await page.getByRole('button', {name: 'Admin exit'}).click();
                await page.getByLabel('Kiosk exit PIN').fill(pin);
                await page.getByRole('button', {name: 'Exit kiosk', exact: true}).click();
                await page.getByRole('link', {name: 'Return to DJ Desk sign-in'}).waitFor();
                assert.deepEqual(errors, []);
            } finally {
                await browser.close();
            }
        }
    } catch (error) {
        if (serverLog) error.message += '\n' + serverLog;
        throw error;
    } finally {
        if (server && server.exitCode === null) {
            const closed = new Promise(resolve => server.once('close', resolve));
            server.kill();
            await closed;
        }
        await rm(root, {recursive: true, force: true});
    }
});
