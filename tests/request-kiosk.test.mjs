import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {cp, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import {randomInt, randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';

const php = process.env.PHP_BIN || 'php';
const phpOptions = process.env.PHP_TEST_INI ? ['-c', process.env.PHP_TEST_INI] : [];
const pin = String(randomInt(100000, 1000000));
const wrongPin = String(100000 + (Number(pin) - 99999) % 900000);
const adminCredentials = {email: 'kiosk-test@example.com', password: randomUUID()};

test('request kiosk, inquiry review, and existing guest and DJ flows', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dj-request-kiosk-'));
    const app = join(root, 'dj-desk');
    let server;
    let serverLog = '';
    try {
        await mkdir(join(app, 'api'), {recursive: true});
        for (const file of ['Auth.php', 'Database.php', 'EventPayments.php', 'GoogleCalendar.php', 'index.php', 'InquiryReview.php', 'Mailer.php', 'PaperContracts.php', 'QRCode.php', 'RequestKiosk.php', 'RequestLifecycle.php', 'SchoolInvoices.php']) {
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
        const original = await call('intake/requests', {body: {
            key: randomUUID(), name: 'Test Inquiry', email: 'inquiry@example.com', type: 'Private party', date: '2031-01-10'
        }});
        const inquiryId = original.result.reference;
        const adminInquiry = 'admin/requests/' + inquiryId + '/';
        const customerUpdate = 'intake/requests/' + inquiryId + '/details';
        const inquiry = async () => (await call('admin/requests', staff)).result.find(row => row.id === inquiryId);
        const travel = {outbound: '125', return: '125', setup: '120', breakdown: '50', scheduleChecked: true, lodging: 'Customer provides'};
        await call(adminInquiry + 'approve', {...staff, body: {version: 1, travel}, expect: 422});
        await call(adminInquiry + 'approve', {...staff, body: {version: 1, travel, acknowledgeReview: true}, expect: 422});
        const {result: link} = await call(adminInquiry + 'request-information', {...staff, body: {version: 1}});
        assert.equal((await inquiry()).state, 'Awaiting information');
        assert.equal((await inquiry()).informationRequest, undefined);
        await call(customerUpdate, {body: {token: 'a'.repeat(64)}, expect: 404});
        const {result: preview} = await call(customerUpdate, {body: {token: link.token, preview: true}});
        assert.equal(preview.date, '2031-01-10');
        assert.equal(preview.email, undefined);
        await call(customerUpdate, {body: {token: link.token, venue: 'Fixture Hall', address: '10 Main St, Albany, NY', startTime: '17:00', endTime: '23:30'}});
        await call(customerUpdate, {body: {token: link.token}, expect: 404});
        assert.equal((await inquiry()).state, 'Ready for review');
        await call(adminInquiry + 'approve', {...staff, body: {version: 2, travel}, expect: 409});
        await call(adminInquiry + 'approve', {...staff, body: {version: 3, travel: {...travel, lodging: 'Waive'}}, expect: 422});
        await call(adminInquiry + 'approve', {...staff, body: {version: 3, travel}, expect: 409});
        await call(adminInquiry + 'approve', {...staff, body: {version: 3, travel, acknowledgeTravel: true, holdHours: 24}});
        const preliminary = await inquiry();
        assert.equal(preliminary.state, 'Preliminarily approved');
        assert.equal(preliminary.eventId, null);
        assert.ok(preliminary.holdUntil);
        assert.deepEqual(preliminary.travelReview.warnings, ['Extended total day', 'Late arrival home']);
        await call(adminInquiry + 'revise-quote', {...staff, body: {version: 4, amount: '2150.00', reason: 'Revised coverage'}});
        const revised = await inquiry();
        assert.equal(revised.quote.total, 2150);
        assert.equal(revised.travelReview, undefined);
        await call(adminInquiry + 'prepare-contract', {...staff, body: {version: 5}, expect: 409});
        await call(adminInquiry + 'approve', {...staff, body: {version: 5, travel, acknowledgeTravel: true}});
        await call(adminInquiry + 'withdraw', {...staff, body: {version: 6, reason: 'Confirming details with venue'}});
        assert.equal((await inquiry()).state, 'Withdrawn');
        await call(adminInquiry + 'reopen', {...staff, body: {version: 7, reason: 'Venue confirmed'}});
        await call(adminInquiry + 'approve', {...staff, body: {version: 8, travel, acknowledgeTravel: true}});
        const {result: booking} = await call(adminInquiry + 'prepare-contract', {...staff, body: {version: 9}});
        const {result: bookedEvent} = await call('events/' + booking.eventId, staff);
        assert.equal(bookedEvent.status, 'Tentative');
        assert.equal(bookedEvent.amount, 2150);
        assert.equal(bookedEvent.address, '10 Main St, Albany, NY');
        assert.equal(bookedEvent.startTime, '17:00');
        assert.equal((await inquiry()).inquiryHistory.at(-1).action, 'Opened tentative booking for contract preparation');
        const currentTime = Math.floor(Date.now() / 1000);
        const local = stamp => new Date(stamp * 1000).toISOString().slice(0, 16);
        const {result: seeded} = await call('admin/music/events', staff);
        for (const row of seeded) {
            const eventPath = 'events/' + row.id;
            const {result: eventData} = await call(eventPath, staff);
            const date = local(currentTime - 7200).slice(0, 10);
            await call(eventPath, {...staff, method: 'PUT', body: {...eventData, status: 'Confirmed',
                date, timezone: 'UTC', startTime: local(currentTime - 7200).slice(11), endTime: local(currentTime + 7200).slice(11)}});
        }
        const {result: events} = await call('admin/music/events', staff);
        const event = events.find(row => row.enabled);
        const otherEvent = events.find(row => row.id !== event.id);
        const desk = 'admin/events/' + event.id + '/music';
        const kiosks = desk + '/kiosks';
        const {result: queue} = await call(desk, staff);
        let guest = 'music/' + queue.config.url.split('/').pop();
        const launch = () => call(kiosks, {...staff, body: {action: 'launch', pin}, expect: 201});
        const submit = (title, key = randomUUID()) => ({title, artist: 'Kiosk test artist', key});

        await call(kiosks, {body: {action: 'launch', pin}, expect: 401});
        await call(kiosks, {cookie: staff.cookie, body: {action: 'launch', pin}, expect: 403});
        await call('kiosk/requests', {body: submit('Unpaired'), expect: 403});
        await call('kiosk/requests', {kiosk: true, body: submit('Unpaired'), expect: 423});

        const {result: {code}} = await launch();
        assert.match(code, /^[0-9]{6}$/);
        for (const invalid of ['12345', '1234567', 123456, '12a456']) {
            await call('kiosk/pair', {kiosk: true, body: {code: invalid}, expect: 400});
        }
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
        await call('kiosk/exit', {...device, body: {pin: wrongPin}, expect: 403});
        await control('revoke');
        assert.equal(await status(), 'revoked');
        await call('kiosk/requests', {...device, body: submit('Revoked'), expect: 423});
        await call('kiosk/exit', {...device, body: {pin}});
        assert.equal(await status(), 'unpaired');

        const second = await launch();
        const {cookies} = await call('kiosk/pair', {kiosk: true, body: {code: second.result.code}});
        const secondDevice = {kiosk: true, cookie: cookies.find(value => value.startsWith('dj_desk_kiosk=')).split(';')[0]};
        const version = (await call(desk, staff)).result.config.version;
        await call(desk, {cookie: staff.cookie, body: {action: 'pause', version}, expect: 403});
        await call(desk, {...staff, body: {action: 'pause', version}});
        assert.equal((await call('kiosk/status', secondDevice)).result.state, 'paused');
        await call(guest, {body: {...submit('Closed'), deviceId: randomUUID()}, expect: 423});
        await call(desk, {...staff, body: {action: 'open', version: version + 1}});
        assert.equal((await call('kiosk/status', secondDevice)).result.state, 'active');

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
            await call('kiosk/exit', {...thirdDevice, body: {pin: wrongPin}, expect: 403});
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

        const setting = async (action, fields = {}, expect = 200) => {
            const {result} = await call(desk, staff);
            return (await call(desk, {...staff, body: {action, version: result.config.version, ...fields}, expect})).result;
        };
        const setWindow = (start, cutoff) => setting('schedule', {timezone: 'UTC', start: local(start), cutoff: local(cutoff)});

        if (process.env.KIOSK_PLAYWRIGHT_MODULE) {
            const {chromium} = createRequire(import.meta.url)(process.env.KIOSK_PLAYWRIGHT_MODULE);
            const browser = await chromium.launch({executablePath: process.env.KIOSK_CHROME_BIN});
            try {
                const page = await browser.newPage({viewport: {width: 768, height: 1024}, hasTouch: true});
                const errors = [];
                page.on('pageerror', error => errors.push(error.message));
                await setWindow(currentTime + 3600, currentTime + 7200);
                const {result: {code: browserCode}} = await launch();
                await page.goto('http://' + address + '/dj-desk/kiosk.html');
                await page.getByLabel('Pairing code').fill(browserCode);
                await page.getByRole('button', {name: 'Pair kiosk'}).click();
                await page.getByRole('heading', {name: 'The event hasn’t started yet'}).waitFor();
                await setWindow(currentTime - 3600, currentTime + 3600);
                await page.getByLabel('Song title').waitFor();
                await setting('pause');
                await page.getByRole('heading', {name: 'Song requests are paused'}).waitFor();
                await setting('resume');
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
        const assertState = async state => {
            assert.equal((await call(desk, staff)).result.config.lifecycle.state, state);
            assert.equal((await call(guest)).result.state, state);
            assert.equal((await call('kiosk/status', renewedDevice)).result.state, state);
        };
        const blocked = async () => {
            await call(guest, {body: {...submit('Outside request hours'), deviceId: randomUUID()}, expect: 423});
            await call('kiosk/requests', {...renewedDevice, body: submit('Outside request hours'), expect: 423});
        };
        await setWindow(currentTime + 3600, currentTime + 7200);
        await assertState('standby');
        await blocked();
        await setWindow(currentTime - 3600, currentTime + 3600);
        await assertState('active');
        await setWindow(currentTime - 3600, currentTime - 60);
        await assertState('closed');
        await blocked();
        const extended = await setting('extend', {minutes: 30});
        assert.ok(extended.config.lifecycle.cutoffAt >= currentTime + 1800);
        await assertState('active');
        const rotated = await setting('rotate');
        await call(guest, {expect: 404});
        await call(guest, {body: {...submit('Retired QR'), deviceId: randomUUID()}, expect: 404});
        guest = 'music/' + rotated.config.url.split('/').pop();
        const oldGuest = guest;
        await call('admin/events/' + otherEvent.id + '/close', {...staff, body: {status: 'Canceled'}});
        assert.equal((await call(otherGuest)).result.state, 'closed');
        await call(otherGuest, {body: {...submit('Canceled event'), deviceId: randomUUID()}, expect: 423});
        const canceled = (await call('events/' + otherEvent.id, staff)).result;
        await call('events/' + otherEvent.id, {...staff, method: 'PUT', body: {...canceled, status: 'Confirmed'}});
        await setting('end');
        await assertState('closed');
        await blocked();
        await setting('resume', {}, 409);
        await call('auth/login', {...renewedDevice, body: adminCredentials, expect: 403});
        await call('kiosk/exit', {...renewedDevice, body: {pin: wrongPin}, expect: 403});

        // Move only the persisted end marker to exercise the exact one-hour archive behavior.
        execFileSync(php, [...phpOptions, '-r',
            "require 'api/Database.php'; DJ_Database::init(require 'config.php'); DJ_Database::update('dj_music_request_lifecycle', ['ended_at' => time() - 3601], ['event_id' => '" + event.id + "']);"
        ], {cwd: app});
        await assertState('archived');
        await blocked();
        await call(reset, {...staff, body: {confirm: true}, expect: 409});
        const history = (await call(desk, staff)).result.requests;
        assert.ok(history.some(row => row.id === fresh.result.reference));
        const eventHq = (await call('admin/events/' + event.id + '/plan', staff)).result;
        assert.ok(eventHq.musicRequests.some(row => row.id === fresh.result.reference));
        const archivedEvent = (await call('events/' + event.id, staff)).result;
        await call('events/' + event.id, {...staff, method: 'PUT', body: {...archivedEvent, endTime: '23:59'}});
        await assertState('archived');
        await call(desk + '/requests/' + fresh.result.reference, {...staff, method: 'PUT', body: {status: 'Played', version: 1}, expect: 409});
        await call(oldGuest, {body: {...submit('Expired QR'), deviceId: randomUUID()}, expect: 423});
        assert.equal((await call(otherGuest)).result.state, 'active');
        await call('kiosk/exit', {...renewedDevice, body: {pin}});
        const otherPath = 'events/' + otherEvent.id;
        const {result: otherBooking} = await call(otherPath, staff);
        await call(otherPath, {...staff, method: 'PUT', body: {...otherBooking,
            date: local(currentTime - 86400).slice(0, 10), startTime: '00:00', endTime: '01:00'}});
        assert.equal((await call(otherGuest)).result.state, 'archived');
        const {result: previousDay} = await call(otherPath, staff);
        await call(otherPath, {...staff, method: 'PUT', body: {...previousDay,
            date: otherBooking.date, startTime: otherBooking.startTime, endTime: otherBooking.endTime}});
        assert.equal((await call(otherGuest)).result.state, 'archived');
        execFileSync(php, [...phpOptions, '-r',
            "require 'api/Database.php'; DJ_Database::init(require 'config.php'); DJ_Database::update('dj_music_kiosk_pair_rate', ['window_minute' => intdiv(time(), 60), 'attempts' => 20], ['id' => 1]);"
        ], {cwd: app});
        await call('kiosk/pair', {kiosk: true, body: {code}, expect: 429});
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
