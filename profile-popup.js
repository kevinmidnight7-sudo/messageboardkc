/**
 * profile-popup.js  –  Universal KC Profile Popup
 *
 * Include this <script> tag AFTER your Firebase SDK scripts on any page.
 * Firebase must be initialised and `db = firebase.database()` must exist
 * as a global variable before the user triggers the popup.
 *
 * Public API:
 *   window.openKcProfile(uid)  – opens the full profile card for that KC UID
 */
(function () {
    'use strict';

    // ── CSS ──────────────────────────────────────────────────────────────────
    const CSS = `
        #kcProfilePopup {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.65);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 999999;
            font-family: 'Poppins', sans-serif;
            animation: kcFadeIn 0.3s ease;
            overflow-y: auto;
        }
        @keyframes kcFadeIn { from { opacity:0 } to { opacity:1 } }

        .kc-popup-card {
            width: 360px;
            max-width: 95vw;
            border-radius: 1.5rem;
            overflow: hidden;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            animation: kcZoomIn 0.3s cubic-bezier(0.25,1,0.5,1);
            position: relative;
            background: #f1f3f5;
            transition: width 0.45s cubic-bezier(0.4,0,0.2,1),
                        max-width 0.45s cubic-bezier(0.4,0,0.2,1);
        }
        .kc-popup-card.kc-two-col { width: 720px; max-width: 95vw; }
        @keyframes kcZoomIn { from { transform:scale(0.9); opacity:0 } to { transform:scale(1); opacity:1 } }

        /* Always row so the posts panel can slide in from the right */
        #kcContentWrapper { display: flex; flex-direction: row; }

        /* ── Clips toggle button ── */
        .kc-clips-toggle {
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
            padding: 10px 12px;
            background: rgba(255,255,255,0.5);
            border-radius: 12px;
            border: none;
            cursor: pointer;
            font-family: inherit;
            font-size: 0.75rem;
            font-weight: 700;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 10px;
            box-sizing: border-box;
            transition: background 0.2s, box-shadow 0.2s;
        }
        .kc-clips-toggle:hover { background: rgba(255,255,255,0.8); box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
        .kc-clips-toggle-label { display: flex; align-items: center; gap: 6px; }
        .kc-clips-arrow {
            display: inline-block;
            font-style: normal;
            font-size: 0.8rem;
            line-height: 1;
            transition: transform 0.42s cubic-bezier(0.4,0,0.2,1);
        }
        /* Arrow points right by default (›), rotates 180° to point left when open */
        .kc-clips-toggle.kc-open .kc-clips-arrow { transform: rotate(180deg); }

        .kc-popup-banner {
            height: 120px;
            background-color: #ced4da;
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
            border-radius: 1.5rem 1.5rem 0 0;
            position: relative;
        }
        @media (min-width: 768px) {
            .kc-popup-card.kc-two-col .kc-popup-banner {
                border-radius: 1.5rem 0 0 0;
            }
        }

        .kc-popup-hdr {
            padding: 0 16px;
            position: relative;
            height: 48px;
        }

        .kc-popup-avatar {
            width: 96px;
            height: 96px;
            border-radius: 50%;
            object-fit: cover;
            position: absolute;
            top: -48px;
            left: 16px;
            border: 6px solid #fff;
            background-color: #f1f3f5;
            z-index: 10;
        }

        .kc-close-btn {
            position: absolute;
            top: 10px;
            right: 10px;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: none;
            background: rgba(0,0,0,0.3);
            color: white;
            font-size: 1.2rem;
            font-weight: 700;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 15;
            line-height: 1;
        }
        .kc-close-btn:hover { background: rgba(0,0,0,0.5); }

        /* Info col: fixed width, scrollable */
        .kc-popup-info-col {
            width: 360px;
            min-width: 0;
            flex-shrink: 0;
            overflow-y: auto;
            max-height: 90vh;
        }

        .kc-popup-body {
            padding: 12px 16px 16px;
            margin-top: 48px;
        }

        .kc-popup-username {
            font-size: 1.5rem;
            font-weight: 700;
            text-align: left;
            margin-bottom: 16px;
            color: #111827;
        }

        .kc-section {
            background: rgba(255,255,255,0.5);
            border-radius: 12px;
            padding: 12px;
            margin-bottom: 12px;
        }
        .kc-section:last-child { margin-bottom: 0; }

        .kc-section-title {
            font-size: 0.75rem;
            font-weight: 700;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin: 0 0 8px 0;
        }

        .kc-about-me {
            font-size: 0.95rem;
            color: #374151;
            line-height: 1.5;
            word-break: break-word;
            white-space: pre-wrap;
        }

        .kc-badges-wrap { display: flex; flex-wrap: wrap; gap: 8px; }
        .kc-badge {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 10px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 0.9rem;
            color: white;
            background: #6b7280;
        }
        .kc-badge img { width: 20px; height: 20px; object-fit: contain; }
        .kc-badge .kc-emoji { font-size: 1.2rem; line-height: 1; }

        .kc-streak {
            font-size: 1rem;
            font-weight: 600;
            color: #fde047;
        }

        /* Discord stats rows */
        .kc-stats { display: flex; flex-direction: column; gap: 6px; }
        .kc-stat-row { display: flex; align-items: center; gap: 8px; font-size: 0.88rem; }
        .kc-stat-icon { font-size: 1rem; flex-shrink: 0; }
        .kc-stat-label {
            color: #6b7280;
            font-size: 0.78rem;
            font-weight: 600;
            min-width: 90px;
            text-transform: uppercase;
            letter-spacing: 0.03em;
        }
        .kc-stat-value { font-weight: 700; color: #111827; }

        /* Discord linked row */
        .kc-discord-linked { display: flex; align-items: center; gap: 10px; }
        .kc-discord-logo { width: 20px; height: 20px; flex-shrink: 0; }
        .kc-discord-handle { font-weight: 700; color: #5865F2; font-size: 0.9rem; }
        .kc-discord-linked-label { color: #6b7280; font-size: 0.85rem; font-weight: 500; }

        /* Posts/clips column – slides in from the right via width transition */
        .kc-popup-posts-col {
            width: 0;
            min-width: 0;
            flex-shrink: 0;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            border-left: 1px solid rgba(0,0,0,0.1);
            transition: width 0.45s cubic-bezier(0.4,0,0.2,1);
        }
        .kc-popup-card.kc-two-col .kc-popup-posts-col {
            width: 360px;
            overflow-y: auto;
            max-height: 90vh;
        }
        .kc-posts-list {
            padding: 0.5rem;
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        }
        .kc-post-tile {
            background: rgba(0,0,0,0.08);
            border-radius: 0.75rem;
            overflow: hidden;
        }
        .kc-post-media {
            width: 100%;
            aspect-ratio: 16/9;
            border: none;
            display: block;
        }
        .kc-post-caption {
            padding: 0.5rem;
            font-size: 0.875rem;
            color: #374151;
        }
        .kc-post-ts {
            padding: 0 0.5rem 0.5rem;
            font-size: 0.75rem;
            color: #6b7280;
            text-align: right;
        }
        .kc-page-btns {
            display: flex;
            justify-content: center;
            gap: 1rem;
            padding: 0.75rem;
        }
        .kc-page-btn {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            border: none;
            background: rgba(0,0,0,0.1);
            cursor: pointer;
            font-size: 1rem;
            color: #374151;
        }
        .kc-page-btn:hover:not(:disabled) { background: rgba(0,0,0,0.2); }
        .kc-page-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        /* ── Friend bar ── */
        .kc-friend-bar {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 4px 1rem 10px;
            flex-wrap: wrap;
        }
        .kc-friend-count-btn {
            background: rgba(0,0,0,0.08);
            border: none;
            border-radius: 20px;
            padding: 5px 14px;
            font-size: 0.76rem;
            font-weight: 700;
            color: #374151;
            cursor: pointer;
            font-family: inherit;
            transition: background 0.2s;
        }
        .kc-friend-count-btn:hover { background: rgba(0,0,0,0.15); }
        .kc-friend-btn {
            flex: 1;
            min-width: 100px;
            border: none;
            border-radius: 12px;
            padding: 6px 14px;
            font-size: 0.78rem;
            font-weight: 700;
            cursor: pointer;
            font-family: inherit;
            transition: background 0.2s, transform 0.1s;
        }
        .kc-friend-btn:active { transform: scale(0.97); }
        .kc-friend-btn.add      { background: #3b82f6; color: #fff; }
        .kc-friend-btn.add:hover { background: #2563eb; }
        .kc-friend-btn.add-back { background: #ec4899; color: #fff; }
        .kc-friend-btn.add-back:hover { background: #db2777; }
        .kc-friend-btn.friends  { background: rgba(0,0,0,0.1); color: #374151; }
        .kc-friend-btn.friends:hover { background: #fee2e2; color: #ef4444; }
        /* Friends list panel */
        .kc-friend-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 12px;
            border-radius: 12px;
            cursor: pointer;
            transition: background 0.15s;
        }
        .kc-friend-item:hover { background: rgba(0,0,0,0.07); }
        .kc-friend-item img { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
        .kc-friend-item-name { font-weight: 700; font-size: 0.85rem; color: #111827; }
    `;

    // ── HTML ─────────────────────────────────────────────────────────────────
    const HTML = `
        <div id="kcProfilePopup">
            <div class="kc-popup-card" id="kcPopupCard">
                <div id="kcContentWrapper">
                    <div class="kc-popup-info-col" id="kcPopupInfoCol">
                        <div class="kc-popup-banner" id="kcPopupBanner"></div>
                        <div class="kc-popup-hdr">
                            <img id="kcPopupAvatar" src="" class="kc-popup-avatar" alt="avatar">
                            <button id="kcPopupCloseBtn" class="kc-close-btn">&times;</button>
                        </div>
                        <div class="kc-popup-body" id="kcPopupBody">
                            <div id="kcPopupUserName" class="kc-popup-username"></div>
                            <div class="kc-section">
                                <h4 class="kc-section-title">ABOUT ME</h4>
                                <div id="kcPopupAboutMe" class="kc-about-me"></div>
                            </div>
                            <div class="kc-section">
                                <h4 class="kc-section-title">BADGES</h4>
                                <div id="kcPopupBadges" class="kc-badges-wrap"></div>
                            </div>
                            <div class="kc-section" id="kcStreakSection" style="display:none">
                                <h4 class="kc-section-title">STREAK</h4>
                                <div id="kcPopupStreak" class="kc-streak"></div>
                            </div>
                        </div>
                    </div>
                    <div class="kc-popup-posts-col" id="kcPopupPostsCol"></div>
                </div>
            </div>
        </div>
    `;

    // ── Inject into page ─────────────────────────────────────────────────────
    function inject() {
        const styleEl = document.createElement('style');
        styleEl.textContent = CSS;
        document.head.appendChild(styleEl);

        const wrap = document.createElement('div');
        wrap.innerHTML = HTML.trim();
        document.body.appendChild(wrap.firstElementChild);

        document.getElementById('kcPopupCloseBtn').addEventListener('click', closePopup);
        document.getElementById('kcProfilePopup').addEventListener('click', function (e) {
            if (e.target === this) closePopup();
        });
    }

    function closePopup() {
        const el = document.getElementById('kcProfilePopup');
        if (el) el.style.display = 'none';
    }

    function _toggleFriendsList(friendUids, myFriendUids) {
        const postsCol = document.getElementById('kcPopupPostsCol');
        const card     = document.getElementById('kcPopupCard');
        if (!postsCol || !card) return;

        if (card.classList.contains('kc-two-col') && postsCol.dataset.panel === 'friends') {
            card.classList.remove('kc-two-col');
            postsCol.dataset.panel = '';
            return;
        }

        const mySet = new Set(myFriendUids || []);
        const mutualUids = friendUids.filter(u => mySet.has(u));
        const mutualCount = mutualUids.length;

        const subheading = mutualCount > 0
            ? `${friendUids.length} friend${friendUids.length !== 1 ? 's' : ''} · <span style="color:#3b82f6">${mutualCount} mutual</span>`
            : `${friendUids.length} friend${friendUids.length !== 1 ? 's' : ''}`;

        card.classList.add('kc-two-col');
        postsCol.dataset.panel = 'friends';
        postsCol.innerHTML = `
            <h4 class="kc-section-title" style="padding:1rem 1rem 0.4rem;font-size:0.72rem;letter-spacing:0.05em;color:#6b7280">
                FRIENDS
            </h4>
            <p style="margin:0;padding:0 1rem 0.75rem;font-size:0.78rem;font-weight:600;color:#374151">${subheading}</p>
            <div id="kcFriendsList" style="padding:0 0.5rem 1rem;display:flex;flex-direction:column;gap:2px;overflow-y:auto;max-height:calc(90vh - 100px)">
                <div style="text-align:center;padding:1.5rem;color:#9ca3af;font-size:0.8rem">Loading…</div>
            </div>`;

        const database = getDb();
        if (!database || !friendUids.length) {
            const el = document.getElementById('kcFriendsList');
            if (el) el.innerHTML = '<p style="text-align:center;color:#9ca3af;font-size:0.85rem;padding:1rem">No friends yet.</p>';
            return;
        }

        // Sort: mutuals first, then rest — cap at 30 total
        const sorted = [
            ...friendUids.filter(u => mySet.has(u)),
            ...friendUids.filter(u => !mySet.has(u))
        ];
        const toLoad = sorted.slice(0, 30);

        Promise.all(toLoad.map(fuid =>
            database.ref(`users/${fuid}`).once('value').then(s => ({ uid: fuid, isMutual: mySet.has(fuid), ...(s.val() || {}) }))
        )).then(users => {
            const container = document.getElementById('kcFriendsList');
            if (!container) return;

            // Section header for mutuals if any
            let html = '';
            if (mutualCount > 0) {
                html += `<p style="font-size:0.7rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;padding:4px 8px 2px">Mutual</p>`;
                users.filter(u => u.isMutual).forEach(u => {
                    html += `
                        <div class="kc-friend-item" onclick="window.openKcProfile('${esc(u.uid)}')">
                            <img src="${esc(u.avatar || 'https://kevinmidnight7-sudo.github.io/messageboardkc/1.png')}" alt="" onerror="this.src='https://kevinmidnight7-sudo.github.io/messageboardkc/1.png'">
                            <div>
                                <div class="kc-friend-item-name">${esc(u.displayName || 'Anonymous')}</div>
                                <div style="font-size:0.7rem;color:#3b82f6;font-weight:600">Mutual friend</div>
                            </div>
                        </div>`;
                });
                const nonMutuals = users.filter(u => !u.isMutual);
                if (nonMutuals.length > 0) {
                    html += `<p style="font-size:0.7rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;padding:8px 8px 2px">Other friends</p>`;
                    nonMutuals.forEach(u => {
                        html += `
                            <div class="kc-friend-item" onclick="window.openKcProfile('${esc(u.uid)}')">
                                <img src="${esc(u.avatar || 'https://kevinmidnight7-sudo.github.io/messageboardkc/1.png')}" alt="" onerror="this.src='https://kevinmidnight7-sudo.github.io/messageboardkc/1.png'">
                                <div class="kc-friend-item-name">${esc(u.displayName || 'Anonymous')}</div>
                            </div>`;
                    });
                }
            } else {
                users.forEach(u => {
                    html += `
                        <div class="kc-friend-item" onclick="window.openKcProfile('${esc(u.uid)}')">
                            <img src="${esc(u.avatar || 'https://kevinmidnight7-sudo.github.io/messageboardkc/1.png')}" alt="" onerror="this.src='https://kevinmidnight7-sudo.github.io/messageboardkc/1.png'">
                            <div class="kc-friend-item-name">${esc(u.displayName || 'Anonymous')}</div>
                        </div>`;
                });
            }

            if (friendUids.length > 30) {
                html += `<p style="text-align:center;color:#9ca3af;font-size:0.72rem;padding:0.5rem">+${friendUids.length - 30} more</p>`;
            }
            container.innerHTML = html;
        }).catch(() => {});
    }

    // ── Utility ──────────────────────────────────────────────────────────────
    function esc(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function getDb() {
        if (typeof db !== 'undefined') return db;
        console.error('KC Profile Popup: global `db` (firebase.database()) not found.');
        return null;
    }

    // ── Clan section ─────────────────────────────────────────────────────────
    async function loadClanSection(uid, userData) {
        const popupBody = document.getElementById('kcPopupBody');
        if (!popupBody) return;
        document.getElementById('kcClanSection')?.remove();

        const clanId = userData.clanId || null;
        if (!clanId) return;

        const database = getDb();
        if (!database) return;

        try {
            const snap = await database.ref(`clans/${clanId}`).once('value');
            const clan = snap.val();
            if (!clan || !clan.name) return;

            const memberCount = clan.members ? Object.keys(clan.members).length : 0;
            const iconHtml = clan.icon
                ? `<img src="${esc(clan.icon)}" alt="" style="width:28px;height:28px;border-radius:8px;object-fit:cover;flex-shrink:0;" onerror="this.style.display='none'">`
                : `<span style="font-size:1.25rem;line-height:1;flex-shrink:0;">🛡️</span>`;

            const sec = document.createElement('div');
            sec.id = 'kcClanSection';
            sec.className = 'kc-section';
            sec.style.cursor = 'pointer';
            sec.title = 'View clan';
            sec.innerHTML = `
                <h4 class="kc-section-title">CLAN</h4>
                <div style="display:flex;align-items:center;gap:10px;">
                    ${iconHtml}
                    <div style="min-width:0;">
                        <div style="font-weight:700;font-size:0.9rem;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(clan.name)}</div>
                        ${clan.tag ? `<div style="font-size:0.72rem;color:#6b7280;font-weight:600;">${esc(clan.tag)} · ${memberCount} member${memberCount !== 1 ? 's' : ''}</div>` : `<div style="font-size:0.72rem;color:#6b7280;">${memberCount} member${memberCount !== 1 ? 's' : ''}</div>`}
                    </div>
                </div>`;

            // Click the section to open the clan on kcnow.html if openClanDetails exists
            sec.addEventListener('click', () => {
                if (typeof openClanDetails === 'function') {
                    document.getElementById('kcProfilePopup').style.display = 'none';
                    openClanDetails(clanId);
                }
            });

            popupBody.appendChild(sec);
        } catch (e) { /* silent */ }
    }

    // ── Discord helpers ──────────────────────────────────────────────────────
    // Returns { id, username?, globalName?, tag?, ... } or null
    async function getDiscordIdFromKcUid(kcUid) {
        const database = getDb();
        if (!database) return null;
        try {
            const snap = await database.ref('discordLinks').once('value');
            const links = snap.val() || {};
            for (const [id, data] of Object.entries(links)) {
                if (data.uid === kcUid) return { id, ...data };
            }
        } catch (e) { /* silent – not every user has a Discord link */ }
        return null;
    }

    async function loadDiscordStats(uid, userData) {
        const popupBody = document.getElementById('kcPopupBody');
        if (!popupBody) return;

        // Remove stale sections from previous open
        document.getElementById('kcDiscordSection')?.remove();
        document.getElementById('kcBdSection')?.remove();
        document.getElementById('kcEconSection')?.remove();

        // Bot custom badge (users/{uid}/customBadge – set via /createbadge command)
        const botBadge = userData.customBadge;
        if (botBadge && botBadge.emoji && botBadge.name) {
            const badgesEl = document.getElementById('kcPopupBadges');
            if (badgesEl) {
                if (badgesEl.textContent.trim() === 'No badges to display.') badgesEl.innerHTML = '';
                const div = document.createElement('div');
                div.className = 'kc-badge';
                div.style.background = 'linear-gradient(90deg,#7c3aed,#2563eb)';
                div.title = botBadge.description || '';
                div.innerHTML = `<span class="kc-emoji">${esc(botBadge.emoji)}</span><span>${esc(botBadge.name)}</span>`;
                badgesEl.appendChild(div);
            }
        }

        const database = getDb();
        if (!database) return;

        const bdHighscore = userData.bdHighscore || 0;
        const discordLink = await getDiscordIdFromKcUid(uid);
        const discordId = discordLink?.id || null;

        // ── Discord linked indicator ──
        if (discordId) {
            const handle = discordLink.username || discordLink.globalName || discordLink.tag || null;
            const sec = document.createElement('div');
            sec.id = 'kcDiscordSection';
            sec.className = 'kc-section';
            sec.innerHTML = `
                <h4 class="kc-section-title">DISCORD</h4>
                <div class="kc-discord-linked">
                    <svg class="kc-discord-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#5865F2">
                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.08.11 18.1.128 18.11a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
                    </svg>
                    ${handle
                        ? `<span class="kc-discord-handle">@${esc(handle)}</span>`
                        : `<span class="kc-discord-linked-label">Linked</span>`}
                </div>`;
            popupBody.appendChild(sec);
        }

        // Battledome username
        let bdName = null;
        if (discordId) {
            try {
                const snap = await database.ref(`config/playerLinks/${discordId}`).once('value');
                bdName = snap.val()?.bdName || null;
            } catch (e) {}
        }

        if (bdHighscore > 0 || bdName) {
            const sec = document.createElement('div');
            sec.id = 'kcBdSection';
            sec.className = 'kc-section';
            sec.innerHTML = `
                <h4 class="kc-section-title">BATTLEDOME</h4>
                <div class="kc-stats">
                    ${bdName ? `<div class="kc-stat-row"><span class="kc-stat-icon">⚔️</span><span class="kc-stat-label">Username</span><span class="kc-stat-value">${esc(bdName)}</span></div>` : ''}
                    ${bdHighscore > 0 ? `<div class="kc-stat-row"><span class="kc-stat-icon">🏆</span><span class="kc-stat-label">Highscore</span><span class="kc-stat-value">${bdHighscore.toLocaleString()}</span></div>` : ''}
                </div>`;
            popupBody.appendChild(sec);
        }

        // Economy stats
        if (discordId) {
            try {
                const snap = await database.ref(`userEconomy/${discordId}`).once('value');
                const eco = snap.val();
                if (eco) {
                    const pts = eco.points || 0;
                    const rank = eco.rank;
                    const streak = eco.streaks?.login?.current || 0;
                    const ach = Object.keys(eco.badges || {}).length;

                    let rows = '';
                    if (pts > 0) rows += `<div class="kc-stat-row"><span class="kc-stat-icon">💰</span><span class="kc-stat-label">Points</span><span class="kc-stat-value">${pts.toLocaleString()}</span></div>`;
                    if (rank) rows += `<div class="kc-stat-row"><span class="kc-stat-icon">🏅</span><span class="kc-stat-label">Rank</span><span class="kc-stat-value">#${rank}</span></div>`;
                    if (streak > 0) rows += `<div class="kc-stat-row"><span class="kc-stat-icon">🔥</span><span class="kc-stat-label">Discord Streak</span><span class="kc-stat-value">${streak} days</span></div>`;
                    if (ach > 0) rows += `<div class="kc-stat-row"><span class="kc-stat-icon">🎖️</span><span class="kc-stat-label">Achievements</span><span class="kc-stat-value">${ach}</span></div>`;

                    if (rows) {
                        const sec = document.createElement('div');
                        sec.id = 'kcEconSection';
                        sec.className = 'kc-section';
                        sec.innerHTML = `<h4 class="kc-section-title">DISCORD STATS</h4><div class="kc-stats">${rows}</div>`;
                        popupBody.appendChild(sec);
                    }
                }
            } catch (e) { console.error('KC Profile Popup: economy load error', e); }
        }
    }

    // ── Posts ────────────────────────────────────────────────────────────────
    let _posts = [];
    let _postPage = 0;
    const POST_PER_PAGE = 2;

    function renderKcPosts() {
        const container = document.getElementById('kcPostsContainer');
        const prev = document.getElementById('kcPrevPost');
        const next = document.getElementById('kcNextPost');
        if (!container) return;

        container.innerHTML = '';
        if (!_posts.length) {
            container.innerHTML = '<p style="text-align:center;color:#6b7280;font-size:0.9rem;padding:1rem">No posts yet.</p>';
            if (prev) prev.disabled = true;
            if (next) next.disabled = true;
            return;
        }

        const start = _postPage * POST_PER_PAGE;
        _posts.slice(start, start + POST_PER_PAGE).forEach(post => {
            let media = '';
            if (post.type === 'youtube') {
                media = `<iframe class="kc-post-media" src="https://www.youtube.com/embed/${esc(post.ytId)}" frameborder="0" allowfullscreen></iframe>`;
            } else if (post.type === 'tiktok') {
                media = `<iframe class="kc-post-media" src="https://www.tiktok.com/embed/v2/${esc(post.videoId)}" frameborder="0" allowfullscreen></iframe>`;
            }
            const ts = new Date(post.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
            container.innerHTML += `
                <div class="kc-post-tile">
                    ${media}
                    <div class="kc-post-caption">${esc(post.caption || '')}</div>
                    <div class="kc-post-ts">${ts}</div>
                </div>`;
        });

        if (prev) prev.disabled = _postPage === 0;
        if (next) next.disabled = (start + POST_PER_PAGE) >= _posts.length;
    }

    async function loadKcPosts(uid) {
        _posts = [];
        _postPage = 0;
        const container = document.getElementById('kcPostsContainer');
        if (container) container.innerHTML = '<div style="text-align:center;padding:2rem;color:#9ca3af">Loading…</div>';

        const database = getDb();
        if (!database) return;
        try {
            const snap = await database.ref(`users/${uid}/posts`).orderByChild('createdAt').once('value');
            const tmp = [];
            snap.forEach(c => tmp.push({ postId: c.key, ...c.val() }));
            _posts = tmp.sort((a, b) => b.createdAt - a.createdAt);
        } catch (e) {}
        renderKcPosts();
    }

    // ── Badge helpers ────────────────────────────────────────────────────────
    const BADGE_SPECS = {
        verified: { label: 'Verified',       icon: 'https://kevinmidnight7-sudo.github.io/messageboardkc/verified.png',  bg: '#2dd4bf' },
        offence:  { label: 'Best Offence',   icon: 'https://kevinmidnight7-sudo.github.io/messageboardkc/red.png',       bg: '#ff6b6b' },
        defence:  { label: 'Best Defence',   icon: 'https://kevinmidnight7-sudo.github.io/messageboardkc/blue.png',      bg: '#74c0fc' },
        overall:  { label: 'Overall Winner', icon: 'https://kevinmidnight7-sudo.github.io/messageboardkc/kcevents.png',  bg: '#f9c74f' },
        diamond:  { label: 'Diamond User',   icon: 'https://kevinmidnight7-sudo.github.io/messageboardkc/diamond2.png', bg: '#55d9e5' },
        emerald:  { label: 'Emerald User',   icon: 'https://kevinmidnight7-sudo.github.io/messageboardkc/emeraldicon.png', bg: '#22c55e' },
    };

    function makeBadgeEl(bg, iconSrc, label) {
        const div = document.createElement('div');
        div.className = 'kc-badge';
        div.style.background = bg;
        div.innerHTML = `<img src="${iconSrc}" alt=""><span>${esc(label)}</span>`;
        return div;
    }

    // ── Main public function ─────────────────────────────────────────────────
    window.openKcProfile = async function (uid) {
        const database = getDb();
        if (!database) return;

        const overlay   = document.getElementById('kcProfilePopup');
        const card      = document.getElementById('kcPopupCard');
        const banner    = document.getElementById('kcPopupBanner');
        const avatar    = document.getElementById('kcPopupAvatar');
        const username  = document.getElementById('kcPopupUserName');
        const about     = document.getElementById('kcPopupAboutMe');
        const badgesEl  = document.getElementById('kcPopupBadges');
        const streakSec = document.getElementById('kcStreakSection');
        const streakEl  = document.getElementById('kcPopupStreak');
        const postsCol  = document.getElementById('kcPopupPostsCol');

        // ── Reset to loading state ──
        card.style.background = '#f1f3f5';
        banner.style.backgroundImage = 'none';
        banner.style.background = '';
        banner.style.backgroundColor = '#ced4da';
        avatar.src = 'https://kevinmidnight7-sudo.github.io/messageboardkc/1.png';
        username.textContent = 'Loading…';
        username.style.color = '#111827';
        about.textContent = '';
        badgesEl.textContent = 'Loading…';
        streakSec.style.display = 'none';
        postsCol.style.display = '';
        postsCol.innerHTML = '';
        card.classList.remove('kc-two-col');
        document.getElementById('kcClipsSection')?.remove();
        document.getElementById('kcDiscordSection')?.remove();
        document.getElementById('kcBdSection')?.remove();
        document.getElementById('kcEconSection')?.remove();
        document.getElementById('kcClanSection')?.remove();
        document.getElementById('kcFriendBar')?.remove();

        overlay.style.display = 'flex';

        try {
            const snap = await database.ref(`users/${uid}`).once('value');
            const u = snap.val() || {};

            // ── Basic info ──
            username.textContent = u.displayName || 'Anonymous';
            avatar.src = u.avatar || 'https://kevinmidnight7-sudo.github.io/messageboardkc/1.png';
            about.textContent = u.about || u.aboutMe || 'No "About Me" set.';

            // ── Profile customization ──
            const custom = u.profileCustomization || {};
            const hasCust = u.profileCustomizationUnlocked || !!(custom.gradient || custom.banner || custom.nameColor);
            if (hasCust) {
                if (custom.gradient) card.style.background = custom.gradient;
                if (custom.nameColor) username.style.color = custom.nameColor;
                if (custom.banner) {
                    banner.style.backgroundImage = `url('${custom.banner}')`;
                    banner.style.backgroundColor = 'transparent';
                } else if (custom.gradient) {
                    banner.style.background = custom.gradient;
                }
            }

            // ── Streak ──
            const streakNum = parseInt(u.loginStreak) || 0;
            if (streakNum > 0) {
                streakEl.textContent = `🔥 ${streakNum} Day Streak`;
                streakSec.style.display = 'block';
            }

            // ── Friend bar (hidden on own profile) ──
            const currentUid = (window.currentUser || null)?.uid || null;
            if (currentUid && currentUid !== uid) {
                const [mySnap, theirSnap, allFriendsSnap, myFriendsSnap] = await Promise.all([
                    database.ref(`users/${currentUid}/friends/${uid}`).once('value'),
                    database.ref(`users/${uid}/friends/${currentUid}`).once('value'),
                    database.ref(`users/${uid}/friends`).once('value'),
                    database.ref(`users/${currentUid}/friends`).once('value'),
                ]);
                let _iAdded = !!mySnap.val();
                const theyAdded = !!theirSnap.val();
                const friendUids = Object.keys(allFriendsSnap.val() || {});
                const myFriendUids = Object.keys(myFriendsSnap.val() || {});

                // If I've added them but they haven't added me back yet, still count me in their
                // displayed total so it doesn't show "0 friends" when we're friends
                const effectiveFriendUids = [...friendUids];
                if (_iAdded && !effectiveFriendUids.includes(currentUid)) {
                    effectiveFriendUids.unshift(currentUid);
                }

                const friendBar = document.createElement('div');
                friendBar.id = 'kcFriendBar';
                friendBar.className = 'kc-friend-bar';

                // Friend count chip
                const countBtn = document.createElement('button');
                countBtn.className = 'kc-friend-count-btn';
                countBtn.textContent = `${effectiveFriendUids.length} friend${effectiveFriendUids.length !== 1 ? 's' : ''}`;
                countBtn.onclick = () => _toggleFriendsList(effectiveFriendUids, myFriendUids);
                friendBar.appendChild(countBtn);

                // Add / Friends / Add back button
                const actionBtn = document.createElement('button');
                const refreshBtn = () => {
                    if (_iAdded) {
                        actionBtn.className = 'kc-friend-btn friends';
                        actionBtn.textContent = '✓ Friends';
                    } else if (theyAdded) {
                        actionBtn.className = 'kc-friend-btn add-back';
                        actionBtn.textContent = '+ Add back';
                    } else {
                        actionBtn.className = 'kc-friend-btn add';
                        actionBtn.textContent = '+ Add friend';
                    }
                };
                refreshBtn();
                actionBtn.onclick = async () => {
                    if (_iAdded) {
                        if (!confirm('Remove this friend?')) return;
                        await database.ref(`users/${currentUid}/friends/${uid}`).remove().catch(() => {});
                        _iAdded = false;
                    } else {
                        await database.ref(`users/${currentUid}/friends/${uid}`).set(true).catch(() => {});
                        _iAdded = true;
                    }
                    refreshBtn();
                };
                friendBar.appendChild(actionBtn);

                username.insertAdjacentElement('afterend', friendBar);
            }

            // ── Clips toggle button + right-side panel ──
            const isEligible = !!(u.codesUnlocked?.diamond || u.codesUnlocked?.emerald || u.codesUnlocked?.content);
            if (isEligible) {
                // Button inside the info column body
                const clipsSection = document.createElement('div');
                clipsSection.id = 'kcClipsSection';
                clipsSection.innerHTML = `
                    <button class="kc-clips-toggle" id="kcClipsToggleBtn">
                        <span class="kc-clips-toggle-label">🎬 <span>CLIPS</span></span>
                        <span class="kc-clips-arrow">›</span>
                    </button>`;
                document.getElementById('kcPopupBody').appendChild(clipsSection);

                // Populate the right-side posts column
                postsCol.innerHTML = `
                    <h4 class="kc-section-title" style="padding:1rem 1rem 0.5rem">CLIPS</h4>
                    <div id="kcPostsContainer" class="kc-posts-list"></div>
                    <div class="kc-page-btns">
                        <button id="kcPrevPost" class="kc-page-btn" disabled>&#8592;</button>
                        <button id="kcNextPost" class="kc-page-btn" disabled>&#8594;</button>
                    </div>`;

                // Toggle: slide the posts col in/out to the right
                document.getElementById('kcClipsToggleBtn').addEventListener('click', function () {
                    const isOpen = card.classList.contains('kc-two-col');
                    if (isOpen) {
                        card.classList.remove('kc-two-col');
                        this.classList.remove('kc-open');
                    } else {
                        card.classList.add('kc-two-col');
                        this.classList.add('kc-open');
                    }
                });

                document.getElementById('kcPrevPost').addEventListener('click', function () {
                    if (_postPage > 0) { _postPage--; renderKcPosts(); }
                });
                document.getElementById('kcNextPost').addEventListener('click', function () {
                    _postPage++;
                    renderKcPosts();
                });
                loadKcPosts(uid);
            }

            // ── Badges ──
            badgesEl.innerHTML = '';
            let hasAny = false;

            const [bSnap, cSnap] = await Promise.all([
                database.ref(`badges/${uid}`).once('value'),
                database.ref(`users/${uid}/customBadges`).once('value')
            ]);

            const addBadge = (spec, text, first) => {
                hasAny = true;
                const el = makeBadgeEl(spec.bg, spec.icon, text);
                if (first && badgesEl.firstChild) badgesEl.insertBefore(el, badgesEl.firstChild);
                else badgesEl.appendChild(el);
            };

            if (u.emailVerified === true || (u.badges && u.badges.verified === true)) {
                addBadge(BADGE_SPECS.verified, 'Verified', true);
            }

            const base = bSnap.val() || {};
            ['offence', 'defence', 'overall'].forEach(k => {
                const n = parseInt(base[k] || 0) || 0;
                if (n > 0) addBadge(BADGE_SPECS[k], `${BADGE_SPECS[k].label} x${n}`);
            });

            if (u.codesUnlocked?.diamond) addBadge(BADGE_SPECS.diamond, 'Diamond User');
            if (u.codesUnlocked?.emerald) addBadge(BADGE_SPECS.emerald, 'Emerald User');

            const customs = cSnap.val() || {};
            Object.values(customs).forEach(b => {
                hasAny = true;
                const div = document.createElement('div');
                div.className = 'kc-badge';
                div.style.background = `linear-gradient(90deg,${b.grad1 || '#6b7280'} 30%,${b.grad2 || '#6b7280'} 100%)`;
                div.style.color = b.textColor || '#fff';
                div.innerHTML = `<span class="kc-emoji">${b.icon || '🏷️'}</span><span>${esc(b.name || 'Badge')}</span>`;
                badgesEl.appendChild(div);
            });

            if (!hasAny) badgesEl.textContent = 'No badges to display.';

            // ── Clan membership ──
            loadClanSection(uid, u);

            // ── Discord bot stats (BD, economy, bot custom badge) ──
            loadDiscordStats(uid, u);

        } catch (e) {
            console.error('openKcProfile error:', e);
            document.getElementById('kcPopupUserName').textContent = 'Error loading profile';
        }
    };

    // ── Bootstrap ────────────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inject);
    } else {
        inject();
    }
}());
