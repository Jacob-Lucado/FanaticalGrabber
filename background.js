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
const SVC = "https://steamvaluechecker.fly.dev";
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

async function gameInfo(appid, cc) {
    const { svcToken } = await chrome.storage.local.get("svcToken");
    if (!svcToken) return { status: "no_code" };
    let res;
    try { res = await fetch(`${SVC}/api/grabber/game?appid=${encodeURIComponent(appid)}${cleanCc(cc) ? "&cc=" + cleanCc(cc) : ""}`, { headers: { Authorization: `Bearer ${svcToken}` } }); }
    catch { return { status: "network" }; }
    if (res.status === 401) return { status: "bad_code" };
    if (!res.ok) return { status: "error" };
    return { status: "ok", ...(await res.json()) };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return;
    const job = msg?.type === "session-check" ? sessionCheck()
        : msg?.type === "check-owned" ? checkOwned(Array.isArray(msg.titles) ? msg.titles.map(String) : [])
        : msg?.type === "game-info" ? gameInfo(Number(msg.appid), msg.cc)
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
// which matters most for the .zip install. It asks the dashboard for the newest version number: no sign-in, nothing about you is sent.
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
