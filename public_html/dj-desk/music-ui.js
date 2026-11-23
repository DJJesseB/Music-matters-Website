import {schoolSongs, partySongs, spellingSuggestion} from './request-songs.js?v=1';
import {newId} from './request-id.js?v=180';
import {guestPhotoForm, mountAdminPhotos} from './event-photos-ui.js?v=180';

function guestDevice() {
    try {
        const saved = localStorage.getItem('jesseb-request-device');
        if (saved) return saved;
        const id = newId();
        localStorage.setItem('jesseb-request-device', id);
        return id;
    } catch {
        return window.jessebRequestDevice ??= newId();
    }
}

export function musicUI({api, app, head, esc, date, message}) {
    let timer, generation = 0;
    function stop() {
        generation++;
        clearInterval(timer);
        document.body.classList.remove('music-performance-mode');
    }
    window.addEventListener('hashchange', stop);

    async function guest(token) {
        stop();
        const expected = generation;
        const path = 'music/' + token;
        const deviceId = guestDevice();
        const fetchEvent = () => api(path, 'GET', undefined, {'X-Request-Device': deviceId});
        const current = () => generation === expected;
        let data, view = 'home', refreshPending = false;
        app.innerHTML = '<section class="card"><p>Opening your event…</p></section>';
        try {
            data = await fetchEvent();
        } catch (error) {
            if (current()) app.innerHTML = head('DJ JESSE B', 'Find your event', '')
                + '<section class="card"><p>' + esc(error.message) + '</p><p>Scan the event QR again or check with your DJ.</p></section>';
            return;
        }
        if (!current()) return;
        const banner = () => head('DJ JESSE B', esc(data.event.name), date(data.event.date));
        function navigation() {
            const nav = document.createElement('div');
            nav.className = 'guest-hub-nav music-guest-nav';
            nav.innerHTML = (data.photos?.enabled ? '<button type="button" class="secondary" data-guest-home>Event home</button>' : '')
                + '<button type="button" data-guest-song>Request a song</button>'
                + '<button type="button" class="secondary" data-guest-mine>My requests</button>'
                + (data.photos?.enabled ? '<button type="button" class="secondary" data-guest-photo>Share photos</button>' : '');
            app.querySelector('.heading').after(nav);
            nav.querySelector('[data-guest-song]').onclick = form;
            nav.querySelector('[data-guest-mine]').onclick = historyView;
            const photos = nav.querySelector('[data-guest-photo]');
            if (photos) photos.onclick = showPhotos;
            const homeButton = nav.querySelector('[data-guest-home]');
            if (homeButton) homeButton.onclick = home;
        }
        function home() {
            if (!data.photos?.enabled) {
                form();
                return;
            }
            view = 'home';
            app.innerHTML = banner() + '<section class="card guest-event-home"><h2>Join the celebration</h2></section>';
            navigation();
        }
        function showPhotos() {
            view = 'photos';
            guestPhotoForm({app, token, esc, banner, navigation, home, isCurrent: current});
        }
        function renderOpen() {
            const status = app.querySelector('[data-guest-open]');
            const submit = app.querySelector('#guestSong button[type=submit]');
            if (status) status.textContent = data.open ? '' : 'Song requests are paused.';
            if (submit) submit.disabled = !data.open || submit.dataset.sending === 'yes';
            const picks = app.querySelector('[data-song-picks]');
            if (picks) picks.disabled = !data.open;
        }
        function renderHistory() {
            const list = app.querySelector('[data-guest-history]');
            if (!list) return;
            const labels = {Pending: 'Received', Approved: 'Approved by the DJ', Played: 'Played', Denied: 'Closed'};
            const content = data.mine?.map(song => '<li><strong>' + esc(song.title) + '</strong><span>'
                + esc(song.artist) + '</span><small>' + esc(labels[song.status] ?? 'Received') + '</small></li>').join('');
            const html = content || '<li>No requests from this browser yet.</li>';
            if (list.innerHTML !== html) list.innerHTML = html;
        }
        async function refresh() {
            if (!current() || refreshPending || document.hidden || view === 'photos') return;
            refreshPending = true;
            try {
                const latest = await fetchEvent();
                if (!current()) return;
                data = latest;
                renderOpen();
                renderSuggestions();
                renderHistory();
                const state = app.querySelector('[data-guest-connection]');
                if (state) state.textContent = '';
            } catch (error) {
                if (!current()) return;
                const state = app.querySelector('[data-guest-connection]');
                if (state) state.textContent = error.status === 404
                    ? 'This link has changed. Scan the latest event QR.' : 'Live updates are reconnecting.';
                if (error.status === 404) {
                    data.open = false;
                    renderOpen();
                }
            } finally {
                refreshPending = false;
            }
        }
        function historyView() {
            view = 'history';
            app.innerHTML = banner() + '<section class="card song-guest-card"><h2>My requests</h2>'
                + '<p>Requests and votes from this browser.</p><p data-guest-connection role="status"></p>'
                + '<ul class="music-guest-history" data-guest-history></ul></section>';
            navigation();
            renderHistory();
            void refresh();
        }
        function renderSuggestions() {
            const form = app.querySelector('#guestSong');
            if (!form) return;
            const area = form.querySelector('[data-suggestions]');
            const query = [form.elements.title.value, form.elements.artist.value].join(' ').toLowerCase().trim();
            const songs = data.open ? (data.suggestions || []).filter(song =>
                (song.title + ' ' + song.artist).toLowerCase().includes(query)).slice(0, 5) : [];
            const html = songs.length ? '<h3>' + (query ? 'Matching approved requests' : 'Popular approved requests')
                + '</h3>' + songs.map((song, index) => '<button type="button" class="secondary" data-suggestion="' + index
                + '">Vote for ' + esc(song.title) + ' · ' + esc(song.artist) + '</button>').join('') : '';
            if (area.innerHTML === html) return;
            area.innerHTML = html;
            for (const button of area.querySelectorAll('button')) button.onclick = () => {
                const song = songs[Number(button.dataset.suggestion)];
                form.elements.title.value = song.title;
                form.elements.artist.value = song.artist;
                form.dataset.voteFor = song.id;
                form.requestSubmit();
                delete form.dataset.voteFor;
            };
        }
        function mountSongPicks(requestForm, picks) {
            const dropdown = requestForm.querySelector('[data-song-picks]');
            const corrections = requestForm.querySelector('[data-spelling]');
            if (dropdown) dropdown.onchange = () => {
                if (dropdown.value === '') return;
                const [title, artist] = picks[Number(dropdown.value)];
                requestForm.elements.title.value = title;
                requestForm.elements.artist.value = artist;
                corrections.replaceChildren();
                renderSuggestions();
            };

            requestForm.addEventListener('input', event => {
                const field = event.target;
                if (field.name !== 'title' && field.name !== 'artist') return;
                if (dropdown) dropdown.value = '';
                corrections.replaceChildren();
                if (event.isComposing || !data.open) return;

                const index = field.name === 'title' ? 0 : 1;
                const choices = picks.map(song => song[index]).concat(
                    (data.suggestions || []).map(song => song[field.name])
                );
                const suggestion = spellingSuggestion(field.value, choices);
                if (!suggestion) return;

                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'secondary';
                button.textContent = 'Use ' + suggestion;
                button.onclick = () => {
                    field.value = suggestion;
                    field.focus();
                    corrections.replaceChildren();
                    renderSuggestions();
                };
                corrections.append(button);
            });
        }

        function form() {
            view = 'form';
            const party = /wedding|private/i.test(data.event.type || '');
            const picks = data.school ? schoolSongs : party ? partySongs : [];
            const listLabel = data.school ? '50 school dance picks' : 'Wedding and party favorites';
            const pickOptions = picks.map(([title, artist], index) =>
                '<option value="' + index + '">' + esc(title) + ' · ' + esc(artist) + '</option>').join('');
            const dropdown = picks.length ? '<label>' + listLabel
                + '<select data-song-picks><option value="">Choose a song</option>' + pickOptions + '</select></label>' : '';
            app.innerHTML = banner() + '<section class="card song-guest-card"><h2>What would you love to hear?</h2>'
                + '<p data-guest-open role="status"></p><p data-guest-connection role="status"></p>'
                + '<form id="guestSong">' + dropdown
                + '<label>Song title<input name="title" required maxlength="160" spellcheck="true" autocorrect="on" enterkeyhint="next" placeholder="Enter a song title"></label>'
                + '<label>Artist<input name="artist" required maxlength="160" spellcheck="true" autocorrect="on" enterkeyhint="done" placeholder="Enter the artist"></label>'
                + '<div class="music-suggestions" data-spelling aria-live="polite"></div><div class="music-suggestions" data-suggestions></div>'
                + '<button type="submit">Send request</button><p data-song-error role="alert"></p></form>'
                + '<p class="music-disclaimer">' + esc(data.disclaimer) + '</p></section>';
            navigation();
            renderOpen();
            const formElement = app.querySelector('#guestSong');
            mountSongPicks(formElement, picks);
            const button = formElement.querySelector('button[type=submit]');
            formElement.addEventListener('input', renderSuggestions);
            renderSuggestions();
            let key = newId(), lastSong;
            formElement.onsubmit = async event => {
                event.preventDefault();
                if (button.disabled) return;
                const title = formElement.elements.title.value.trim();
                const artist = formElement.elements.artist.value.trim();
                const voteFor = formElement.dataset.voteFor;
                const song = JSON.stringify([title, artist, voteFor]);
                if (lastSong && song !== lastSong) key = newId();
                lastSong = song;
                button.dataset.sending = 'yes';
                renderOpen();
                try {
                    const result = await api(path, 'POST', {key, deviceId, title, artist, voteFor});
                    if (!current()) return;
                    void refresh();
                    if (!formElement.isConnected) return;
                    view = 'confirmation';
                    app.innerHTML = banner() + '<section class="card song-thankyou"><h2>'
                        + (result.consolidated ? 'You backed this request' : 'Request received')
                        + '</h2><p><strong>' + esc(title) + '</strong><br>' + esc(artist) + '</p>'
                        + '<p>' + esc(data.disclaimer) + '</p><button id="trackSong" type="button">See my requests</button></section>';
                    navigation();
                    app.querySelector('#trackSong').onclick = historyView;
                    app.querySelector('.song-thankyou h2').tabIndex = -1;
                    app.querySelector('.song-thankyou h2').focus();
                } catch (error) {
                    if (!current() || !formElement.isConnected) return;
                    formElement.querySelector('[data-song-error]').textContent = error instanceof TypeError
                        ? 'Connection interrupted. Your song is still here. Try again when you reconnect.' : error.message;
                    if (error.status === 423) data.open = false;
                } finally {
                    delete button.dataset.sending;
                    if (current()) renderOpen();
                }
            };
        }
        home();
        timer = setInterval(refresh, 6000);
    }

 async function events(){stop();const rows=await api('admin/music/events');app.innerHTML=head('LIVE REQUEST DESK','The soundtrack starts with your guests.','Open an event to manage its event QR and song requests.')+`<div class="columns">${rows.map(e=>`<section class="card"><span class="badge ${e.enabled?'':'purple'}">${e.enabled?'Requests open':'Requests paused'}</span><h2>${esc(e.name)}</h2><p>${date(e.date)} · ${esc(e.type)}</p><p>${e.counts.Pending} pending · ${e.counts.Approved} approved · ${e.counts.Played} played</p><a class="button" href="#music-admin/${e.id}">Open request desk →</a></section>`).join('')||'<section class="card">Create an event first to get started.</section>'}</div>`;}

    async function queue(id) {
        stop();
        const expected = generation;
        const current = () => generation === expected;
        const path = 'admin/events/' + id + '/music';
        let data = await api(path);
        if (!current()) return;
        let previousRows, previousConfig, busy = false, pending, photoController, undo, sortByVotes = false;
        document.body.classList.add('music-performance-mode');
        app.innerHTML = head('DJ JESSE B · LIVE REQUEST DESK', esc(data.event.name), date(data.event.date),
            '<a class="button secondary" href="#event/' + id + '">Event HQ</a>') + `
            <section class="music-booth">
                <div class="music-booth-toolbar card">
                    <div data-connection role="status">Live · connected</div>
                    <div class="music-booth-controls">
                        <button type="button" data-pause></button>
                        <button type="button" class="secondary" data-qr>Show guest QR</button>
                        <button type="button" class="secondary" data-sort-votes aria-pressed="false">Sort incoming by votes</button>
                        <button type="button" class="secondary" data-fullscreen>Full screen</button>
                    </div>
                    <div class="music-undo"><span data-action-feedback role="status"></span>
                        <button type="button" class="secondary" data-undo hidden>Undo</button></div>
                </div>
                <div class="music-booth-queues">
                    <section class="card" aria-labelledby="incoming-title"><h2 id="incoming-title">Incoming <span data-count="Pending"></span></h2><div data-queue="Pending"></div></section>
                    <section class="card" aria-labelledby="approved-title"><h2 id="approved-title">Approved <span data-count="Approved"></span></h2><div data-queue="Approved"></div></section>
                </div>
                <details class="card music-booth-history"><summary>Played <span data-count="Played"></span></summary><div data-queue="Played"></div></details>
                <details class="card music-booth-history"><summary>Denied <span data-count="Denied"></span></summary><div data-queue="Denied"></div></details>
                <details class="card music-booth-history"><summary>Event request analytics</summary><div data-analytics></div></details>
                <details class="card music-booth-history"><summary>Guest link settings</summary>
                    <div data-link></div><p>Approved titles and artists can appear in guest search and voting for this event.</p><button type="button" class="secondary" data-preferences></button> <button type="button" class="secondary" data-rotate>Replace guest link</button>
                </details>
                <dialog class="music-qr-dialog" aria-labelledby="event-qr-title"><h2 id="event-qr-title">${esc(data.event.name)}</h2>
                    <p>Scan to request a song</p><div data-qr-content></div>
                    <form method="dialog"><button type="submit" class="secondary">Close QR</button></form>
                </dialog>
            </section>`;
        const booth = app.querySelector('.music-booth');
        const find = selector => booth.querySelector(selector);
        const pause = find('[data-pause]');
        const undoButton = find('[data-undo]');
        const feedback = find('[data-action-feedback]');
        const connection = find('[data-connection]');
        function renderConfig() {
            const serialized = JSON.stringify(data.config);
            if (serialized === previousConfig) return;
            previousConfig = serialized;
            const {enabled, url, version} = data.config;
            pause.textContent = enabled ? 'Pause requests' : 'Open requests';
            pause.setAttribute('aria-pressed', String(!enabled));
            find('[data-qr]').disabled = !url;
            find('[data-rotate]').hidden = !url;
            const preferences = find('[data-preferences]');
            preferences.disabled = !url;
            preferences.setAttribute('aria-pressed', String(!!data.config.showApproved));
            preferences.textContent = data.config.showApproved ? 'Hide approved songs from guests' : 'Show approved songs to guests';
            const qrUrl = (window.djDeskConfig?.apiBase || './api/') + path + '/qr?v=' + version;
            find('[data-link]').innerHTML = url ? '<label>Guest event URL<input readonly value="' + esc(url) + '"></label>'
                + '<a class="button secondary" target="_blank" rel="noopener" href="' + esc(url) + '">Open guest page</a>'
                : '<p>Open requests to create the event link.</p>';
            find('[data-qr-content]').innerHTML = url ? '<img width="320" height="320" src="' + esc(qrUrl)
                + '" alt="QR code for this event"><a class="button secondary" download="event-request-qr.svg" href="'
                + esc(qrUrl) + '">Download QR</a>' : '';
        }
        const action = (status, label, secondary = false) => '<button type="button" data-status="' + status
            + '"' + (secondary ? ' class="secondary"' : '') + '>' + label + '</button>';
        function songCard(song) {
            const support = Number(song.votes || 0) + 1;
            const controls = {
                Pending: action('Approved', 'Approve') + action('Denied', 'Deny', true),
                Approved: action('Played', 'Mark played') + action('Pending', 'Return to incoming', true),
                Denied: action('Approved', 'Approve', true),
                Played: ''
            };
            return '<article class="music-booth-song" data-song="' + esc(song.id) + '"><div><h3>' + esc(song.title) + '</h3><p>'
                + esc(song.artist) + '</p><small>' + support + (support === 1 ? ' request' : ' requests & votes')
                + (song.requesterBlocked ? ' · Requester blocked' : '') + '</small></div><div class="music-song-actions">'
                + controls[song.status] + '<button type="button" class="secondary" data-block>'
                + (song.requesterBlocked ? 'Unblock requester' : 'Block requester') + '</button></div></article>';
        }
        function render() {
            renderConfig();
            const serialized = JSON.stringify([data.requests, data.counts, sortByVotes]);
            if (serialized === previousRows) return;
            previousRows = serialized;
            for (const status of ['Pending', 'Approved', 'Played', 'Denied']) {
                const rows = data.requests.filter(song => song.status === status);
                if (status === 'Pending' && sortByVotes) rows.sort((a, b) => Number(b.votes || 0) - Number(a.votes || 0));
                const panel = find('[data-queue=' + status + ']');
                const html = rows.map(songCard).join('') || '<p class="music-empty">No ' + (status === 'Pending' ? 'incoming' : status.toLowerCase()) + ' requests.</p>';
                if (panel.innerHTML !== html) {
                    const focused = panel.contains(document.activeElement) ? document.activeElement : null;
                    const id = focused?.closest('[data-song]')?.dataset.song;
                    const selector = focused?.dataset.status ? '[data-status=' + focused.dataset.status + ']' : '[data-block]';
                    panel.innerHTML = html;
                    if (id) [...panel.querySelectorAll('[data-song]')].find(row => row.dataset.song === id)?.querySelector(selector)?.focus();
                }
                find('[data-count=' + status + ']').textContent = rows.length;
            }
            const total = data.requests.length;
            const votes = data.requests.reduce((sum, song) => sum + Number(song.votes || 0), 0);
            const played = Number(data.counts.Played || 0);
            const top = [...data.requests].filter(song => song.votes > 0).sort((a, b) => b.votes - a.votes).slice(0, 5);
            find('[data-analytics]').innerHTML = '<p>' + total + ' queue entries · ' + votes + ' additional votes · '
                + played + ' played' + (total ? ' (' + Math.round(played * 100 / total) + '%)' : '') + '</p>'
                + (top.length ? '<h3>Most backed requests</h3><ol>' + top.map(song => '<li>' + esc(song.title)
                + ' — ' + esc(song.artist) + ' (' + (Number(song.votes) + 1) + ')</li>').join('') + '</ol>' : '');
            if (undo && !data.requests.some(song => song.id === undo.id && song.version === undo.version)) undo = null;
            undoButton.hidden = !undo;
        }
        async function refresh() {
            if (!current() || document.hidden || pending) return pending;
            pending = (async () => {
                try {
                    const next = await api(path);
                    if (!current()) return;
                    data = next;
                    render();
                    connection.textContent = 'Live · updated ' + new Date().toLocaleTimeString();
                } catch {
                    if (current()) connection.textContent = 'Reconnecting · showing last saved queue';
                }
            })();
            try {
                await pending;
            } finally {
                pending = null;
            }
        }
        async function mutate(button, operation) {
            if (busy) return;
            busy = true;
            button.disabled = true;
            try {
                await pending;
                if (!current()) return;
                await operation();
                if (current()) render();
            } catch (error) {
                if (current()) {
                    message(error.message, true);
                    await refresh();
                }
            } finally {
                busy = false;
                if (button.isConnected) button.disabled = false;
            }
        }
        async function setStatus(song, status, version = song.version) {
            const result = await api(path + '/requests/' + song.id, 'PUT', {status, version});
            if (!current()) return;
            data = {...data, ...result};
            const updated = data.requests.find(request => request.id === song.id);
            undo = updated?.version === version + 1 ? {id: song.id, status: song.status, version: updated.version} : null;
            feedback.textContent = song.title + ' · ' + status;
        }
        booth.addEventListener('click', event => {
            const button = event.target.closest('button');
            const id = button?.closest('[data-song]')?.dataset.song;
            const song = data.requests.find(row => row.id === id);
            if (!song) return;
            if (button.dataset.status) {
                void mutate(button, () => setStatus(song, button.dataset.status));
                return;
            }
            if (button.hasAttribute('data-block')) {
                if (!song.requesterBlocked && !confirm('Block this requester’s browser for this event?')) return;
                void mutate(button, async () => {
                    const action = song.requesterBlocked ? 'unblock' : 'block';
                    const result = await api(path + '/requests/' + song.id, 'PUT', {action, expectedBlocked: !!song.requesterBlocked});
                    if (!current()) return;
                    data = {...data, ...result};
                    feedback.textContent = song.requesterBlocked ? 'Requester unblocked' : 'Requester blocked';
                });
            }
        });
        undoButton.onclick = () => {
            const change = undo;
            const song = data.requests.find(row => row.id === change?.id);
            if (!song) return;
            void mutate(undoButton, async () => {
                await setStatus(song, change.status, change.version);
                undo = null;
                feedback.textContent = 'Undid change to ' + song.title;
            });
        };
        async function updateSettings(action, options = {}) {
            const result = await api(path, 'POST', {action, version: data.config.version, ...options});
            if (current()) data = result;
        }
        pause.onclick = () => void mutate(pause, () => updateSettings(data.config.enabled ? 'pause' : 'open'));
        const preferences = find('[data-preferences]');
        preferences.onclick = () => void mutate(preferences, () => updateSettings('preferences', {showApproved: !data.config.showApproved}));
        const rotate = find('[data-rotate]');
        rotate.onclick = () => {
            if (confirm('Replace the guest link? Printed QR codes and previous links will stop working.'))
                void mutate(rotate, () => updateSettings('rotate'));
        };
        find('[data-qr]').onclick = () => find('dialog').showModal();
        const sort = find('[data-sort-votes]');
        sort.onclick = () => {
            sortByVotes = !sortByVotes;
            sort.textContent = sortByVotes ? 'Sort incoming by arrival' : 'Sort incoming by votes';
            sort.setAttribute('aria-pressed', String(sortByVotes));
            render();
        };
        const fullscreen = find('[data-fullscreen]');
        fullscreen.hidden = !booth.requestFullscreen;
        fullscreen.onclick = async () => {
            try {
                if (document.fullscreenElement) await document.exitFullscreen();
                else await booth.requestFullscreen();
            } catch {
                message('Full screen is unavailable on this device.', true);
            }
        };
        render();
        timer = setInterval(() => {
            if (!busy) {
                void refresh();
                if (photoController) void photoController.refresh().catch(() => {});
            }
        }, 4000);
        if (data.config.photos?.eligible) photoController = await mountAdminPhotos({
            app, event: data.event, api, esc, message, afterChange: refresh, isCurrent: current
        });
    }

    return {guest, events, queue, stop};
}
export function mountPlannerMusic({app,event,requests,esc}){const card=document.createElement('section');card.className='card planner-music-history';card.innerHTML=`<div class="heading"><div><span class="badge purple">SAVED TO THIS EVENT</span><h2>Guest song request history</h2><p>${requests?.length||0} requests retained for future reference.</p></div><a class="button" href="#music-admin/${event.id}">Open live request desk →</a></div><details><summary>View saved requests</summary>${(requests||[]).map(r=>`<div class="event"><span><b>${esc(r.title)}</b> — ${esc(r.artist)}</span><span class="badge">${esc(r.status)}</span></div>`).join('')||'<p>No guest requests yet.</p>'}</details>`;app.querySelector('#clientPlan').before(card);}
