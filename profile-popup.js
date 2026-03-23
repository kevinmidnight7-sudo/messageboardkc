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
        }
        @keyframes kcZoomIn { from { transform:scale(0.9); opacity:0 } to { transform:scale(1); opacity:1 } }

        #kcContentWrapper { display: flex; flex-direction: column; }
        .kc-popup-card { max-height: 90vh; overflow: hidden; }

        @media (min-width: 768px) {
            .kc-popup-card.kc-two-col {
                width: 720px;
                display: flex;
            }
            .kc-popup-card.kc-two-col #kcContentWrapper { flex-direction: row; }
            .kc-popup-card.kc-two-col .kc-popup-info-col { overflow-y: auto; max-height: 90vh; }
            .kc-popup-card.kc-two-col .kc-popup-posts-col { overflow-y: auto; max-height: 90vh; }
        }

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

        .kc-popup-info-col { flex: 1; overflow-y: auto; }

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

        /* Posts column */
        .kc-popup-posts-col {
            flex: 1;
            overflow-y: auto;
            border-left: 1px solid rgba(0,0,0,0.1);
            display: none;
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

    // ── Discord helpers ──────────────────────────────────────────────────────
    async function getDiscordIdFromKcUid(kcUid) {
        const database = getDb();
        if (!database) return null;
        try {
            const snap = await database.ref('discordLinks').once('value');
            const links = snap.val() || {};
            for (const [id, data] of Object.entries(links)) {
                if (data.uid === kcUid) return id;
            }
        } catch (e) { /* silent – not every user has a Discord link */ }
        return null;
    }

    async function loadDiscordStats(uid, userData) {
        const popupBody = document.getElementById('kcPopupBody');
        if (!popupBody) return;

        // Remove stale sections from previous open
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
        const discordId = await getDiscordIdFromKcUid(uid);

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
        postsCol.style.display = 'none';
        postsCol.innerHTML = '';
        card.classList.remove('kc-two-col');
        document.getElementById('kcBdSection')?.remove();
        document.getElementById('kcEconSection')?.remove();

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

            // ── Posts column (diamond / emerald / content users) ──
            const isEligible = !!(u.codesUnlocked?.diamond || u.codesUnlocked?.emerald || u.codesUnlocked?.content);
            if (isEligible) {
                card.classList.add('kc-two-col');
                postsCol.style.display = 'block';
                postsCol.innerHTML = `
                    <h4 class="kc-section-title" style="padding:1rem 1rem 0.5rem">POSTS</h4>
                    <div id="kcPostsContainer" class="kc-posts-list"></div>
                    <div class="kc-page-btns">
                        <button id="kcPrevPost" class="kc-page-btn" disabled>&#8592;</button>
                        <button id="kcNextPost" class="kc-page-btn" disabled>&#8594;</button>
                    </div>`;
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
