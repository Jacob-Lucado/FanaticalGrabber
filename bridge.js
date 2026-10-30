// Lets the Steam Value Checker dashboard (and only that site) hand a list of Steam keys to this extension.
// Keys stay in your browser: they go page -> extension -> Steam, never to the dashboard's server.
(() => {
    const VERSION = chrome.runtime.getManifest().version;
    const KEY_RE = /^[A-Z0-9]{5}(-[A-Z0-9]{5}){2}$/i;
    const FINAL = ["redeemed", "owned", "used", "invalid"];
    const DELAY_MS = 3000;
    const MAX_KEYS = 500;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const say = msg => window.postMessage({ svc: "ext", ...msg }, location.origin);
    const stops = new Set();
    let running = false;

    window.addEventListener("message", async e => {
        if (e.source !== window || e.origin !== location.origin) return;
        const m = e.data;
        if (!m || m.svc !== "page") return;
        if (m.type === "ping") return say({ type: "pong", version: VERSION });
        if (m.type === "stop") return void stops.add(m.id);
        if (m.type === "connect") {
            // The dashboard hands over a fresh link code so nothing has to be copied and pasted.
            if (typeof m.token !== "string" || !/^svcg_[A-Za-z0-9_-]{43}$/.test(m.token)) return say({ type: "connected", ok: false });
            await chrome.storage.local.set({ svcToken: m.token });
            return say({ type: "connected", ok: true });
        }
        if (m.type === "vault") {
            // Revealed keys not yet redeemed, for the dashboard's key vault. The page gets them like a paste; they are never sent to the server.
            const { vault = {}, redeemed = {} } = await chrome.storage.local.get(["vault", "redeemed"]);
            const items = Object.entries(vault).filter(([k]) => !FINAL.includes(redeemed[k]?.status)).map(([key, v]) => ({ key, title: v.title || "Unknown", at: v.at || null })).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, MAX_KEYS);
            return say({ type: "vault", items });
        }
        if (m.type !== "redeem" || typeof m.id !== "string" || !Array.isArray(m.items)) return;
        if (running) return say({ type: "busy", id: m.id });
        running = true;
        try {
            const items = m.items.slice(0, MAX_KEYS).map(x => String(x || "").trim().toUpperCase()).filter(k => KEY_RE.test(k));
            const { redeemed = {} } = await chrome.storage.local.get("redeemed");
            let aborted = "";
            for (let i = 0; i < items.length; i++) {
                if (stops.has(m.id)) { aborted = "Stopped"; break; }
                const key = items[i];
                let res;
                const known = redeemed[key];
                if (known && FINAL.includes(known.status)) {
                    res = { status: known.status, message: "Already handled earlier", game: known.game || "", skipped: true };
                } else {
                    try { res = await chrome.runtime.sendMessage({ type: "redeem-key", key }); }
                    catch (err) { res = { status: "error", message: err.message }; }
                    res = res || { status: "error", message: "No response from the extension" };
                    if (FINAL.includes(res.status)) {
                        redeemed[key] = { status: res.status, game: res.game || "", at: new Date().toISOString() };
                        await chrome.storage.local.set({ redeemed });
                    }
                }
                say({ type: "result", id: m.id, index: i, total: items.length, key, status: res.status, message: res.message, game: res.game || "" });
                if (res.status === "not_logged_in") { aborted = "Not logged into Steam. Log in at store.steampowered.com and retry."; break; }
                if (res.status === "rate_limited") { aborted = "Steam rate limit hit. Wait about an hour, then retry the rest."; break; }
                if (i < items.length - 1 && !res.skipped) await sleep(DELAY_MS);
            }
            say({ type: "done", id: m.id, aborted });
        } finally { running = false; stops.delete(m.id); }
    });
    say({ type: "pong", version: VERSION });
})();
