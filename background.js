// Service worker: talks to Steam on behalf of the content script.
// Requests run from here (not the Fanatical page) so Steam's cookies are sent and CORS doesn't apply.
const STEAM = "https://store.steampowered.com";

// purchase_result_details -> [our status, message]
const DETAIL_MAP = {
    9:  ["owned",        "You already own this product"],
    13: ["region",       "Key is restricted to another country"],
    19: ["region",       "Region not supported"],
    14: ["invalid",      "Invalid key"],
    15: ["used",         "Key already redeemed"],
    24: ["needs_base",   "Requires a base game you don't own"],
    53: ["rate_limited", "Too many attempts, Steam is rate limiting you"],
    54: ["owned",        "You already own an excluded/conflicting product"]
};

// Read the sessionid straight from the cookie jar (no page scraping needed)
async function getSessionId() {
    try {
        const cookie = await chrome.cookies.get({ url: STEAM, name: "sessionid" });
        if (cookie?.value) return cookie.value;
    } catch (err) {
        console.warn("[FanaticalGrabber] cookies.get failed:", err);
    }

    // Fallback: scrape it from the redeem page
    const res = await fetch(`${STEAM}/account/registerkey`, { credentials: "include" });
    const html = await res.text();
    const m = html.match(/g_sessionID\s*=\s*"([0-9a-f]+)"/i) ||
              html.match(/"sessionid"\s*:\s*"([0-9a-f]+)"/i);
    return m ? m[1] : null;
}

async function redeemKey(key) {
    const sessionId = await getSessionId();
    if (!sessionId) {
        return { status: "not_logged_in", message: "No Steam session cookie found - open store.steampowered.com and log in" };
    }

    const res = await fetch(`${STEAM}/account/ajaxregisterkey/`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body: new URLSearchParams({ product_key: key, sessionid: sessionId })
    });

    const text = await res.text();
    console.log("[FanaticalGrabber] Steam response", res.status, text.slice(0, 500));

    let data;
    try {
        data = JSON.parse(text);
    } catch {
        // HTML back instead of JSON usually means a login redirect
        return { status: "not_logged_in", message: `Steam returned a non-JSON page (HTTP ${res.status}) - likely not logged in` };
    }

    if (data.success === 1) {
        const game = data.purchase_receipt_info?.line_items?.[0]?.line_item_description || "";
        return { status: "redeemed", message: "Redeemed", game };
    }
    if (data.success === 21) {
        return { status: "not_logged_in", message: "Steam says you are not logged in" };
    }
    if (data.success === 84) {
        return { status: "rate_limited", message: "Too many attempts, Steam is rate limiting you" };
    }

    const [status, message] = DETAIL_MAP[data.purchase_result_details] ||
        ["error", `Steam error (result ${data.success}, detail ${data.purchase_result_details})`];
    return { status, message };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type !== "redeem-key") return;
    if (sender.id !== chrome.runtime.id) return; // only our own content script

    redeemKey(String(msg.key).trim())
        .then(sendResponse)
        .catch(err => sendResponse({ status: "error", message: err.message }));
    return true; // keep the channel open for the async response
});
// One-click send to the Steam Value Checker bot. Only game titles go out (never keys), with the member's own link code.
const SVC = "https://steamvaluechecker.com";
async function sendToChecker(token, titles, paid = [], mode = null) {
    if (!/^svcg_[A-Za-z0-9_-]{43}$/.test(token)) return { status: "bad_code", message: "That does not look like a link code. Use /library grabber in Discord." };
    const seen = new Set();
    const entries = [];
    titles.forEach((t, i) => {
        const title = String(t).trim();
        if (!title || seen.has(title.toLowerCase()) || entries.length >= 500) return;
        seen.add(title.toLowerCase());
        const p = Number(paid[i]);
        entries.push(paid[i] != null && Number.isFinite(p) && p >= 0 && p <= 10000 ? { title, paid: p } : { title });
    });
    if (!entries.length) return { status: "empty", message: "No games to send" };
    let res;
    try {
        res = await fetch(`${SVC}/api/grabber/import`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(mode ? { entries, mode } : { entries })
        });
    } catch {
        return { status: "network", message: "Could not reach Steam Value Checker" };
    }
    let data = {};
    try { data = await res.json(); } catch { /* not json */ }
    if (res.status === 401) return { status: "bad_code", message: "That link code is no longer valid. Make a new one with /library grabber." };
    if (!res.ok) return { status: "error", message: data.error || `Steam Value Checker said HTTP ${res.status}` };
    return { status: "sent", added: data.added ?? 0, updated: data.updated ?? 0, notFound: data.notFound ?? 0, missing: Array.isArray(data.missing) ? data.missing.map(String).slice(0, 50) : [], unpriced: data.unpriced ?? 0, unpricedTitles: Array.isArray(data.unpricedTitles) ? data.unpricedTitles.map(String).slice(0, 50) : [], mode: data.mode ?? null, alreadyPriced: data.alreadyPriced ?? 0, noRetail: Array.isArray(data.noRetail) ? data.noRetail.map(String).slice(0, 50) : [], noRetailCount: data.noRetailCount ?? 0 };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type !== "send-to-checker") return;
    if (sender.id !== chrome.runtime.id) return;
    sendToChecker(String(msg.token ?? ""), Array.isArray(msg.titles) ? msg.titles : [], Array.isArray(msg.paid) ? msg.paid : [], ["prices", "retail", "gifted"].includes(msg.mode) ? msg.mode : null)
        .then(sendResponse)
        .catch(err => sendResponse({ status: "error", message: err.message }));
    return true;
});


// ---------- Steam page helpers (batch redeem panel and price overlay) ----------
async function sessionCheck() {
    try {
        const c = await chrome.cookies.get({ url: STEAM, name: "steamLoginSecure" });
        return { loggedIn: Boolean(c?.value) };
    } catch { return { loggedIn: false }; }
}

const normTitle = s => String(s).toLowerCase().replace(/[\u2122\u00ae\u00a9]/g, "").replace(/\b(steam|key|pc|digital)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

/** Which of these game titles does the logged-in Steam account already own? Exact title matches only; anything unsure comes back null. */
async function checkOwned(titles) {
    let owned;
    try {
        const r = await fetch(`${STEAM}/dynamicstore/userdata/`, { credentials: "include" });
        owned = new Set((await r.json()).rgOwnedApps || []);
    } catch { return { error: "Could not read your Steam library" }; }
    if (!owned.size) return { error: "Steam did not return your library. Are you logged in?" };
    const out = {};
    for (const title of titles.slice(0, 60)) {
        let appid = null;
        try {
            const r = await fetch(`${STEAM}/api/storesearch/?term=${encodeURIComponent(title)}&l=english&cc=us`, { credentials: "omit" });
            const hit = ((await r.json()).items || []).find(i => normTitle(i.name) === normTitle(title));
            appid = hit ? hit.id : null;
        } catch { /* leave unknown */ }
        out[title] = appid === null ? null : owned.has(appid);
        await new Promise(r => setTimeout(r, 350));
    }
    return { owned: out };
}

const cleanCc = cc => (/^[A-Za-z]{2}$/.test(String(cc ?? "")) ? String(cc).toUpperCase() : undefined);

/** A button press that changes something (wishlist, spotlight). Only the app number and the game's name go out, with the member's link code. */
async function svcPost(path, body) {
    const { svcToken } = await chrome.storage.local.get("svcToken");
    if (!svcToken) return { status: "no_code" };
    let res;
    try { res = await fetch(`${SVC}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${svcToken}` }, body: JSON.stringify(body) }); }
    catch { return { status: "network" }; }
    if (res.status === 401) return { status: "bad_code" };
    let data = {};
    try { data = await res.json(); } catch { /* not json */ }
    if (!res.ok) return { status: "error", message: data.error || `HTTP ${res.status}` };
    return { status: data.status ?? "ok", ...data };
}

async function gameInfo(appid, cc, name) {
    const { svcToken } = await chrome.storage.local.get("svcToken");
    if (!svcToken) return { status: "no_code" };
    let res;
    try { res = await fetch(`${SVC}/api/grabber/game?appid=${encodeURIComponent(appid)}${cleanCc(cc) ? "&cc=" + cleanCc(cc) : ""}${name ? "&name=" + encodeURIComponent(String(name).slice(0, 100)) : ""}`, { headers: { Authorization: `Bearer ${svcToken}` } }); }
    catch { return { status: "network" }; }
    if (res.status === 401) return { status: "bad_code" };
    if (!res.ok) return { status: "error" };
    return { status: "ok", ...(await res.json()) };
}

// Prices for a game found by title on another shop's page. Only the title and the member's link code are sent.
async function compareTitles(titles, regions) {
    const body = { titles: titles.map(t => String(t).slice(0, 120)).slice(0, 30) };
    if (Array.isArray(regions)) body.regions = regions.map(String).slice(0, 4);
    return svcPost("/api/grabber/compare", body);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return;
    const job = msg?.type === "compare" ? compareTitles(Array.isArray(msg.titles) ? msg.titles : [], msg.regions)
        : msg?.type === "session-check" ? sessionCheck()
        : msg?.type === "check-owned" ? checkOwned(Array.isArray(msg.titles) ? msg.titles.map(String) : [])
        : msg?.type === "game-info" ? gameInfo(Number(msg.appid), msg.cc, msg.name)
        : msg?.type === "wishlist-add" ? svcPost("/api/grabber/wishlist", { appid: Number(msg.appid), name: String(msg.name ?? "") })
        : msg?.type === "spotlight" ? svcPost("/api/grabber/spotlight", { appid: Number(msg.appid), name: String(msg.name ?? ""), cc: cleanCc(msg.cc) })
        : null;
    if (!job) return;
    job.then(sendResponse).catch(err => sendResponse({ status: "error", message: err.message }));
    return true;
});


// ---------- bundle and cart helpers ----------
let ownedCache = { at: 0, apps: null };
async function ownedAppIds() {
    if (ownedCache.apps && Date.now() - ownedCache.at < 60_000) return { apps: ownedCache.apps };
    try {
        const r = await fetch(`${STEAM}/dynamicstore/userdata/`, { credentials: "include" });
        const apps = (await r.json()).rgOwnedApps || [];
        if (!apps.length) return { error: "not_logged_in" };
        ownedCache = { at: Date.now(), apps };
        return { apps };
    } catch { return { error: "failed" }; }
}

async function pricesFor(appids, cc) {
    const { svcToken } = await chrome.storage.local.get("svcToken");
    if (!svcToken) return { status: "no_code" };
    let res;
    try {
        res = await fetch(`${SVC}/api/grabber/prices`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${svcToken}` }, body: JSON.stringify({ appids: appids.slice(0, 60), cc: cleanCc(cc) }) });
    } catch { return { status: "network" }; }
    if (res.status === 401) return { status: "bad_code" };
    if (!res.ok) return { status: "error" };
    return { status: "ok", ...(await res.json()) };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return;
    const job = msg?.type === "owned-apps" ? ownedAppIds()
        : msg?.type === "prices-for" ? pricesFor(Array.isArray(msg.appids) ? msg.appids.map(Number).filter(Number.isInteger) : [], msg.cc)
        : null;
    if (!job) return;
    job.then(sendResponse).catch(err => sendResponse({ status: "error", message: err.message }));
    return true;
});


// ---------- Fanatical bundle and cart verdict: title -> Steam app number ----------
async function titleAppIds(titles) {
    const out = {};
    for (const title of titles.slice(0, 40)) {
        try {
            const r = await fetch(`${STEAM}/api/storesearch/?term=${encodeURIComponent(title)}&l=english&cc=us`, { credentials: "omit" });
            const hit = ((await r.json()).items || []).find(i => normTitle(i.name) === normTitle(title));
            out[title] = hit ? hit.id : null;
        } catch { out[title] = null; }
        await new Promise(r => setTimeout(r, 300));
    }
    return { ids: out };
}
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || msg?.type !== "title-appids") return;
    titleAppIds(Array.isArray(msg.titles) ? msg.titles.map(String) : []).then(sendResponse).catch(err => sendResponse({ status: "error", message: err.message }));
    return true;
});

// ---------- Update reminder ----------
// Chrome updates Web Store installs by itself; this tells people when a newer version exists (and when it is ready to restart into),
// and it asks the dashboard for the newest version number: no sign-in, nothing about you is sent.
const UPDATE_CHECK_MS = 6 * 3600_000, UPDATE_SNOOZE_MS = 3 * 86400_000;
const verLess = (a, b) => { const x = String(a).split(".").map(n => parseInt(n, 10) || 0), y = String(b).split(".").map(n => parseInt(n, 10) || 0); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); return false; };
chrome.runtime.onUpdateAvailable?.addListener(d => { chrome.storage.local.set({ updReady: d?.version || true }); });
async function updateStatus() {
    const current = chrome.runtime.getManifest().version;
    const s = await chrome.storage.local.get(["updInfo", "updAt", "updSnooze", "updReady"]);
    let info = s.updInfo;
    if (!info || Date.now() - (s.updAt || 0) > UPDATE_CHECK_MS) {
        try {
            const res = await fetch(`${SVC}/api/extension/latest`, { credentials: "omit" });
            const j = res.ok ? await res.json() : null;
            if (j && /^\d+\.\d+\.\d+$/.test(j.latest) && typeof j.url === "string" && /^https:\/\//.test(j.url)) info = { latest: j.latest, url: j.url };
        } catch { /* offline: use what we knew */ }
        await chrome.storage.local.set({ updAt: Date.now(), ...(info ? { updInfo: info } : {}) });
        try { chrome.runtime.requestUpdateCheck?.()?.catch?.(() => {}); } catch { /* sideloaded installs have no store to ask */ }
    }
    if (s.updReady && typeof s.updReady === "string" && !verLess(current, s.updReady)) { await chrome.storage.local.remove("updReady"); s.updReady = null; } // already running it
    const ready = Boolean(s.updReady);
    const outdated = Boolean(info) && verLess(current, info.latest);
    return { current, latest: info?.latest ?? current, url: info?.url ?? null, outdated, ready: outdated && ready, snoozed: Date.now() < (s.updSnooze || 0) };
}
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return;
    if (msg?.type === "update-status") { updateStatus().then(sendResponse).catch(() => sendResponse(null)); return true; }
    if (msg?.type === "update-snooze") { chrome.storage.local.set({ updSnooze: Date.now() + UPDATE_SNOOZE_MS }).then(() => sendResponse({ ok: true })); return true; }
    if (msg?.type === "update-apply") { sendResponse({ ok: true }); setTimeout(() => chrome.runtime.reload(), 200); }
});


// ---------- Toolbar badge ----------
// Every half hour: how many new free games, playtests and unread bot alerts there are since the member last opened the popup.
// Without a link code the badge shows "!" so people know most features are switched off until they link with the bot.
const BADGE_ALARM = "svc-badge";
async function refreshBadge() {
    const { svcToken, badgeSeen } = await chrome.storage.local.get(["svcToken", "badgeSeen"]);
    const set = async (text, color, title) => { try { await chrome.action.setBadgeText({ text }); await chrome.action.setBadgeBackgroundColor({ color }); await chrome.action.setTitle({ title }); } catch { /* no toolbar */ } };
    if (!svcToken) { await chrome.storage.local.set({ badgeNow: { state: "no_code" } }); return set("!", "#f2b84b", "FanaticalGrabber: link with the Steam Value Checker bot to switch on prices, playtests and more"); }
    let res;
    try { res = await fetch(`${SVC}/api/grabber/badge`, { headers: { Authorization: `Bearer ${svcToken}` } }); } catch { return; }
    if (res.status === 401) { await chrome.storage.local.set({ badgeNow: { state: "bad_code" } }); return set("!", "#ff6b6b", "FanaticalGrabber: your link code stopped working. Link again on the dashboard"); }
    if (!res.ok) return;
    const d = await res.json(), seen = badgeSeen || { free: [], playtests: [] };
    const newFree = d.free.filter(x => !seen.free.includes(x)).length, newTests = d.playtests.filter(x => !seen.playtests.includes(x)).length, unread = Number(d.unread) || 0;
    await chrome.storage.local.set({ badgeNow: { state: "ok", free: d.free, claimable: Array.isArray(d.claimable) ? d.claimable : [], hits: Array.isArray(d.hits) ? d.hits : [], playtests: d.playtests, newFree, newTests, unread, at: Date.now() } });
    autoClaim(Array.isArray(d.claimable) ? d.claimable : []).catch(() => {});
    const n = newFree + newTests + unread;
    await set(n ? String(Math.min(n, 99)) : "", "#4da3ff", n ? `Steam Value Checker: ${newFree} new free, ${newTests} new playtests, ${unread} unread alerts` : "FanaticalGrabber");
}
chrome.alarms?.create(BADGE_ALARM, { periodInMinutes: 30 });
chrome.alarms?.onAlarm.addListener(a => { if (a.name === BADGE_ALARM) refreshBadge(); });
chrome.runtime.onInstalled.addListener(() => { chrome.alarms?.create(BADGE_ALARM, { periodInMinutes: 30 }); refreshBadge(); });
chrome.runtime.onStartup.addListener(refreshBadge);
chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && c.svcToken) refreshBadge(); }); // linking or unlinking updates it straight away
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return;
    if (msg?.type === "badge-status") { chrome.storage.local.get("badgeNow").then(r => sendResponse(r.badgeNow || { state: "unknown" })); return true; }
    if (msg?.type === "badge-seen") {
        chrome.storage.local.get("badgeNow").then(async r => {
            const b = r.badgeNow;
            if (b?.state === "ok") { await chrome.storage.local.set({ badgeSeen: { free: b.free, playtests: b.playtests }, badgeNow: { ...b, newFree: 0, newTests: 0 } }); await chrome.action.setBadgeText({ text: b.unread ? String(Math.min(b.unread, 99)) : "" }).catch(() => {}); }
            sendResponse({ ok: true });
        });
        return true;
    }
    if (msg?.type === "badge-refresh") { refreshBadge().then(() => sendResponse({ ok: true })); return true; }
});


// ---------- Popup actions: claim free Steam games, sync the library, spare keys and the gift board ----------
// Everything here runs only when the member presses its button in the popup.

/** Adds one free-to-keep Steam game to the account the member is signed in to. Steam's own "Add to Account" call, nothing else. */
async function claimFree(appid) {
    const sessionId = await getSessionId();
    if (!sessionId) return { status: "not_logged_in" };
    let subid = null;
    try {
        const r = await fetch(`${STEAM}/api/appdetails?appids=${appid}&filters=packages,price_overview`, { credentials: "omit" });
        const d = (await r.json())?.[String(appid)]?.data;
        subid = Array.isArray(d?.packages) ? d.packages[0] : null;
    } catch { return { status: "error" }; }
    if (!subid) return { status: "no_package" };
    let res;
    try { res = await fetch(`${STEAM}/freelicense/addfreelicense/${subid}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ajax: "true", sessionid: sessionId }) }); }
    catch { return { status: "error" }; }
    const text = await res.text();
    if (/already (own|in)/i.test(text)) return { status: "owned" };
    if (res.ok && /success|added/i.test(text)) return { status: "claimed" };
    return { status: res.status === 401 || res.status === 403 ? "not_logged_in" : "error" };
}

/** Sends the app numbers of the games the member owns (read from the Steam page they are signed in to) so the bot's library matches. */
async function syncLibrary() {
    const { svcToken } = await chrome.storage.local.get("svcToken");
    if (!svcToken) return { status: "no_code" };
    let apps = [];
    try { apps = (await (await fetch(`${STEAM}/dynamicstore/userdata/`, { credentials: "include" })).json()).rgOwnedApps || []; } catch { return { status: "steam_error" }; }
    if (!apps.length) return { status: "not_logged_in" };
    let added = 0, notFound = 0;
    // 150 new games per round trip; each round only adds games the bot doesn't have yet, so repeating is safe.
    for (let round = 0; round < 40; round++) {
        let res;
        try { res = await fetch(`${SVC}/api/grabber/sync`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${svcToken}` }, body: JSON.stringify({ appids: apps.slice(0, 5000) }) }); } catch { return { status: "network", added }; }
        if (res.status === 401) return { status: "bad_code" };
        if (res.status === 429) { await new Promise(r => setTimeout(r, 4500)); continue; }
        if (!res.ok) return { status: "error", added };
        const d = await res.json();
        added += d.added || 0; notFound = d.notFound || 0;
        if (!d.remaining || !d.added) return { status: "ok", added, total: apps.length, notFound, skippedForLimit: d.skippedForLimit || 0 };
        await new Promise(r => setTimeout(r, 4200));
    }
    return { status: "ok", added, total: apps.length, notFound };
}

/** Vault keys whose game the account already owns. The keys themselves stay in the browser; only names are ever offered on the board. */
async function spareKeys() {
    const { vault = {}, redeemed = {} } = await chrome.storage.local.get(["vault", "redeemed"]);
    const open = Object.entries(vault).filter(([k]) => !["redeemed", "owned", "used", "invalid"].includes(redeemed[k]?.status));
    const titles = [...new Set(open.map(([, v]) => v.title).filter(Boolean))].slice(0, 40);
    if (!titles.length) return { status: "ok", spares: [], checked: 0 };
    const r = await checkOwned(titles);
    if (r.error) return { status: "error", message: r.error };
    return { status: "ok", checked: titles.length, spares: open.filter(([, v]) => r.owned[v.title] === true).map(([key, v]) => ({ key, title: v.title })) };
}

async function gifts(action, payload) {
    const { svcToken } = await chrome.storage.local.get("svcToken");
    if (!svcToken) return { status: "no_code" };
    const init = action === "list" ? { headers: { Authorization: `Bearer ${svcToken}` } } : { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${svcToken}` }, body: JSON.stringify({ action, ...payload }) };
    let res; try { res = await fetch(`${SVC}/api/grabber/gifts`, init); } catch { return { status: "network" }; }
    if (res.status === 401) return { status: "bad_code" };
    let d = {}; try { d = await res.json(); } catch { /* none */ }
    return res.ok ? { status: "ok", ...d } : { status: "error", message: d.error || `HTTP ${res.status}` };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return;
    const job = msg?.type === "claim-free" ? claimFree(Number(msg.appid))
        : msg?.type === "sync-library" ? syncLibrary()
        : msg?.type === "spare-keys" ? spareKeys()
        : msg?.type === "gifts" ? gifts(["list", "offer", "claim", "withdraw"].includes(msg.action) ? msg.action : "list", { title: String(msg.title ?? "").slice(0, 100), id: String(msg.id ?? "").slice(0, 20) })
        : null;
    if (!job) return;
    job.then(sendResponse).catch(err => sendResponse({ status: "error", message: err.message }));
    return true;
});


// Optional, off until the member switches it on in the popup: on each half-hour check, add new free-to-keep Steam games to the account.
// Each game is tried once, so a game that can't be added doesn't get hammered, and it only works while signed in to Steam.
async function autoClaim(list) {
    const { autoClaim: on, autoTried = [] } = await chrome.storage.local.get(["autoClaim", "autoTried"]);
    if (!on || !list.length) return;
    const tried = new Set(autoTried), got = [];
    for (const g of list.slice(0, 6)) {
        if (tried.has(g.appid)) continue;
        const r = await claimFree(Number(g.appid));
        if (r.status === "not_logged_in") return; // try again next check, once signed in
        tried.add(g.appid); if (r.status === "claimed") got.push(g.title);
        await new Promise(r => setTimeout(r, 2000));
    }
    await chrome.storage.local.set({ autoTried: [...tried].slice(-300) });
    if (got.length) { try { await chrome.action.setTitle({ title: `Added to your Steam account: ${got.join(", ")}` }); } catch { /* no toolbar */ } await chrome.storage.local.set({ autoClaimed: { at: Date.now(), titles: got } }); }
}
