const find = selector => document.querySelector(selector);
const heading = find('#heading');
const notice = find('#notice');
const connection = find('#connection');
const pair = find('#pair');
const request = find('#request');
const confirmation = find('#confirmation');
const exit = find('#exit');
const exitDialog = find('#exit-dialog');
const exitForm = find('#exit-form');
const exitError = find('#exit-error');
const rePair = find('#re-pair');
const pairingCode = new URLSearchParams(location.hash.slice(1)).get('pair');
if (location.hash) history.replaceState(null, '', location.pathname + location.search);

let state = null;
let online = false;
let working = false;
let checking = false;
let finished = false;
let pairingAgain = false;
let confirmationTimer;
let previousSubmission;

async function api(path, data) {
    const headers = {'X-DJ-Kiosk': '1'};
    if (data) headers['Content-Type'] = 'application/json';
    const response = await fetch('./api/index.php?route=kiosk/' + path, {
        method: data ? 'POST' : 'GET',
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
        body: data ? JSON.stringify(data) : undefined,
        signal: AbortSignal.timeout(10000)
    });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || 'Please try again.'), {status: response.status});
    return result;
}

function render() {
    const confirmed = Boolean(confirmationTimer);
    pair.hidden = finished || (state !== 'unpaired' && !pairingAgain);
    request.hidden = finished || state !== 'active' || confirmed;
    confirmation.hidden = finished || state !== 'active' || !confirmed;
    exit.hidden = finished || state === 'unpaired' || state === null;
    rePair.hidden = state !== 'revoked';
    find('#signin').hidden = !finished;
    for (const form of [pair, request, exitForm]) {
        form.querySelector('button[type="submit"]').disabled = working || !online;
    }
    connection.textContent = finished ? '' : online ? 'Connected' : 'Reconnecting…';
    heading.textContent = finished ? 'Kiosk ended' : pairingAgain ? 'Pair request kiosk' : ({
        active: confirmed ? 'Request received' : 'What’s your song?',
        unpaired: 'Set up request kiosk',
        standby: 'The event hasn’t started yet',
        paused: 'Song requests are paused',
        closed: 'Requests closed',
        archived: 'This event has ended',
        revoked: 'Kiosk ended'
    })[state] || 'Song requests';
}

function resetRequest() {
    clearTimeout(confirmationTimer);
    confirmationTimer = null;
    previousSubmission = null;
    request.reset();
    render();
}

async function refresh() {
    if (document.hidden || working || checking || finished) return;
    checking = true;
    try {
        const result = await api('status');
        if (working || finished) return;
        online = true;
        if (state !== result.state) {
            state = result.state;
            if (state !== 'active') resetRequest();
            notice.textContent = '';
        }
        find('#school').hidden = !result.school;
    } catch {
        if (!working) online = false;
    } finally {
        checking = false;
        render();
    }
}

async function run(operation, errorElement = notice) {
    if (working || !online) return;
    working = true;
    errorElement.textContent = '';
    render();
    try {
        await operation();
    } catch (error) {
        errorElement.textContent = error.status ? error.message : 'Connection interrupted. Please try again.';
        if (!error.status) online = false;
    } finally {
        working = false;
        render();
        await refresh();
    }
}

pair.addEventListener('submit', event => {
    event.preventDefault();
    if (state !== 'unpaired' && !pairingAgain) return;
    const code = pair.elements.code.value.trim();
    void run(async () => {
        await api('pair', {code});
        pairingAgain = false;
        pair.reset();
    });
});

request.addEventListener('submit', event => {
    event.preventDefault();
    if (state !== 'active' || confirmationTimer) return;
    const title = request.elements.title.value.trim();
    const artist = request.elements.artist.value.trim();
    if (!title || !artist) {
        notice.textContent = 'Enter a song title and artist.';
        return;
    }
    if (previousSubmission?.title !== title || previousSubmission?.artist !== artist) {
        previousSubmission = {title, artist, key: crypto.randomUUID()};
    }
    void run(async () => {
        await api('requests', previousSubmission);
        request.reset();
        previousSubmission = null;
        confirmationTimer = setTimeout(resetRequest, 2600);
        render();
        heading.focus();
    });
});

find('#next').onclick = () => {
    resetRequest();
    heading.focus();
};
exit.onclick = () => {
    exitForm.reset();
    exitError.textContent = '';
    exitDialog.showModal();
};
find('#cancel').onclick = () => exitDialog.close();
rePair.onclick = () => {
    exitDialog.close();
    pairingAgain = true;
    notice.textContent = '';
    render();
    pair.elements.code.focus();
};
exitForm.addEventListener('submit', event => {
    event.preventDefault();
    const pin = exitForm.elements.pin.value;
    exitForm.reset();
    void run(async () => {
        await api('exit', {pin});
        finished = true;
        exitDialog.close();
        resetRequest();
        notice.textContent = '';
        heading.focus();
    }, exitError);
});

render();
await refresh();
if (pairingCode && ['unpaired', 'closed', 'revoked'].includes(state)) {
    pairingAgain = state !== 'unpaired';
    pair.elements.code.value = pairingCode;
    pair.requestSubmit();
}
setInterval(refresh, 6500);
addEventListener('online', refresh);
addEventListener('offline', () => { online = false; render(); });
document.addEventListener('visibilitychange', refresh);
