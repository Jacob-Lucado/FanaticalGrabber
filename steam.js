// On Steam's own pages this turns the extension into a Steam batch redeem tool, in a Steam-style panel.
// Keys go page -> extension -> Steam only. Nothing here sends a key to any server.
(() => {
    "use strict";
    if (window.top !== window) return;

    const VERSION = chrome.runtime.getManifest().version;
    const KEY_RE = /[A-Z0-9]{5}(?:-[A-Z0-9]{5}){2}/g;
    const FINAL = ["redeemed", "owned", "used", "invalid"];
    const DELAY_MS = 3000;
    const MAX_KEYS = 500;
    const onRegister = /^\/account\/registerkey/.test(location.pathname);
    const appMatch = /^\/app\/(\d{1,9})(?:\/|$)/.exec(location.pathname);

    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const el = (tag, props = {}, ...kids) => {
        const n = Object.assign(document.createElement(tag), props);
        for (const k of kids.flat()) if (k) n.append(k);
        return n;
    };
    const mask = k => k.slice(0, 5) + "-•••••-" + k.slice(-5);
    const send = msg => chrome.runtime.sendMessage(msg).catch(err => ({ status: "error", message: err.message }));

    const CSS = `
    :host { all: initial; }
    [hidden] { display: none !important; }
    * { box-sizing: border-box; font-family: "Motiva Sans", Arial, Helvetica, sans-serif; }
    .tab { position: fixed; right: 18px; bottom: 18px; z-index: 2147483646; display: flex; align-items: center; gap: 8px;
        padding: 10px 16px; border: 1px solid #4c6b22; border-radius: 3px; cursor: pointer; color: #d2efa9; font-size: 14px;
        background: linear-gradient(to right, #75b022 5%, #588a1b 95%); box-shadow: 0 2px 12px rgba(0,0,0,.5); }
    .tab:hover { filter: brightness(1.12); }
    .panel { position: fixed; right: 18px; bottom: 18px; z-index: 2147483647; width: min(440px, calc(100vw - 24px)); max-height: calc(100vh - 36px);
        display: none; flex-direction: column; color: #c7d5e0; background: #1b2838; border: 1px solid #000; box-shadow: 0 6px 28px rgba(0,0,0,.65); }
    .panel.open { display: flex; }
    .panel.page { position: static; width: 100%; max-height: none; margin: 16px 0; box-shadow: none; border-color: #2a475e; }
    header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; color: #fff;
        background: linear-gradient(to right, #2a475e, #1b2838); border-bottom: 1px solid #000; }
    header b { font-size: 15px; letter-spacing: .03em; text-transform: uppercase; font-weight: 600; }
    header small { color: #8ba4b6; margin-left: 8px; font-size: 11px; }
    .x { background: none; border: 0; color: #8ba4b6; font-size: 20px; cursor: pointer; line-height: 1; }
    .x:hover { color: #fff; }
    .body { padding: 14px; overflow: auto; }
    .banner { padding: 8px 10px; font-size: 13px; margin-bottom: 10px; border-left: 3px solid #66c0f4; background: rgba(102,192,244,.1); }
    .banner.ok { border-color: #a4d007; background: rgba(164,208,7,.1); color: #d2efa9; }
    .banner.bad { border-color: #c0392b; background: rgba(192,57,43,.15); color: #ffb4a8; }
    .banner.warn { border-color: #e2a400; background: rgba(226,164,0,.12); color: #f5deb3; }
    textarea { width: 100%; height: 110px; resize: vertical; padding: 8px; color: #fff; font: 13px Consolas, monospace;
        background: rgba(0,0,0,.35); border: 1px solid #000; border-radius: 2px; box-shadow: 0 1px 0 rgba(255,255,255,.08); }
    textarea:focus, input[type=text]:focus { outline: 1px solid #66c0f4; }
    input[type=text] { width: 100%; padding: 6px 8px; color: #fff; background: rgba(0,0,0,.35); border: 1px solid #000; border-radius: 2px; font-size: 13px; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; align-items: center; }
    button.b { padding: 7px 14px; border-radius: 2px; border: 0; cursor: pointer; font-size: 13px; color: #67c1f5;
        background: rgba(103,193,245,.2); }
    button.b:hover:not(:disabled) { background: rgba(103,193,245,.35); color: #fff; }
    button.b.go { color: #d2efa9; background: linear-gradient(to right, #75b022 5%, #588a1b 95%); }
    button.b.go:hover:not(:disabled) { filter: brightness(1.15); }
    button.b.stop { color: #fff; background: #a33a2f; }
    button.b:disabled { opacity: .5; cursor: default; }
    label.chk { display: flex; gap: 6px; align-items: center; font-size: 12px; color: #8ba4b6; margin-top: 10px; }
    .count { margin-left: auto; font-size: 12px; color: #8ba4b6; }
    .bar { height: 6px; margin-top: 12px; background: rgba(0,0,0,.4); border-radius: 3px; overflow: hidden; }
    .bar i { display: block; height: 100%; width: 0; background: linear-gradient(to right, #66c0f4, #a4d007); transition: width .2s; }
    .list { margin-top: 10px; max-height: 220px; overflow: auto; border-top: 1px solid #000; }
    .item { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; padding: 6px 2px; font-size: 12px; border-bottom: 1px solid rgba(0,0,0,.5); }
    .item code { color: #8ba4b6; font-family: Consolas, monospace; }
    .item span.g { grid-column: 1 / 3; color: #fff; }
    .chip { font-size: 11px; padding: 1px 7px; border-radius: 2px; color: #fff; background: #4b5b69; }
    .chip.redeemed { background: #4c6b22; } .chip.owned, .chip.skipped { background: #2a475e; }
    .chip.used, .chip.invalid, .chip.error, .chip.region, .chip.needs_base { background: #8a3a30; }
    .chip.rate_limited, .chip.not_logged_in { background: #8a6a10; }
    .sum { margin-top: 10px; font-size: 13px; color: #fff; }
    .foot { margin-top: 12px; font-size: 11px; color: #5c7080; }
    details { margin-top: 12px; font-size: 12px; color: #8ba4b6; } summary { cursor: pointer; }
    .card { position: fixed; left: 18px; bottom: 18px; z-index: 2147483646; width: 250px; padding: 12px; color: #c7d5e0; font-size: 13px;
        background: linear-gradient(#1b2838, #16202d); border: 1px solid #000; box-shadow: 0 4px 20px rgba(0,0,0,.6); }
    .card h4 { margin: 0 0 6px; color: #fff; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
    .card .big { font-size: 22px; color: #beee11; }
    .card .tag { display: inline-block; margin: 0 4px 6px 0; padding: 1px 7px; font-size: 11px; color: #d2efa9; background: #4c6b22; border-radius: 2px; }
    .card .tag.w { background: #2a475e; color: #67c1f5; }
    .card .x { float: right; }
    `;

    const host = el("div", { id: "fg-steam-host" });
    const root = host.attachShadow({ mode: "open" });
    root.append(el("style", { textContent: CSS }));

    // ---------- the batch redeem panel ----------
    let items = [];       // { key, title, status, message, game }
    let running = false, stopFlag = false;

    const panel = el("div", { className: "panel" + (onRegister ? " page open" : "") });
    const banner = el("div", { className: "banner", textContent: "Checking your Steam login…" });
    const box = el("textarea", { placeholder: "Paste Steam keys here, one per line or mixed in with other text. Format: AAAAA-BBBBB-CCCCC", spellcheck: false });
    const file = el("input", { type: "file", accept: ".txt,.csv,.json,.md,text/plain", hidden: true });
    const count = el("span", { className: "count" });
    const skipOwned = el("input", { type: "checkbox" });
    const bar = el("i");
    const list = el("div", { className: "list", hidden: true });
    const sum = el("div", { className: "sum", hidden: true });
    const goBtn = el("button", { className: "b go", textContent: "Redeem all" });
    const stopBtn = el("button", { className: "b stop", textContent: "Stop", hidden: true });
    const queueBtn = el("button", { className: "b", textContent: "Load keys from Fanatical", hidden: true });
    const fileBtn = el("button", { className: "b", textContent: "Open a .txt file" });
    const reportBtn = el("button", { className: "b", textContent: "Download report", hidden: true });
    const codeBox = el("input", { type: "text", placeholder: "svcg_… (from /library grabber in Discord)", spellcheck: false });

    const parseKeys = text => [...new Set((String(text).toUpperCase().match(KEY_RE) || []))];
    const refreshCount = () => { const n = parseKeys(box.value).length; count.textContent = n ? `${n} key${n === 1 ? "" : "s"} found` : ""; };
    box.addEventListener("input", refreshCount);

    async function checkLogin() {
        const r = await send({ type: "session-check" });
        banner.className = "banner " + (r?.loggedIn ? "ok" : "bad");
        banner.textContent = r?.loggedIn ? "You are logged into Steam. Keys will be redeemed on this account."
            : "You are not logged into Steam in this browser. Log in at store.steampowered.com first, then come back.";
        return Boolean(r?.loggedIn);
    }

    async function loadQueue() {
        const { pendingKeys = [] } = await chrome.storage.local.get("pendingKeys");
        queueBtn.hidden = !pendingKeys.length;
        queueBtn.textContent = `Load ${pendingKeys.length} key${pendingKeys.length === 1 ? "" : "s"} from Fanatical`;
        return pendingKeys;
    }
    let titles = new Map(); // key -> title, for keys loaded from Fanatical
    queueBtn.addEventListener("click", async () => {
        const q = await loadQueue();
        for (const x of q) titles.set(x.key, x.title);
        box.value = [...new Set([...parseKeys(box.value), ...q.map(x => x.key)])].join("\n");
        refreshCount();
    });
    fileBtn.addEventListener("click", () => file.click());
    file.addEventListener("change", async () => {
        const f = file.files?.[0];
        if (!f) return;
        if (f.size > 2_000_000) { banner.className = "banner bad"; banner.textContent = "That file is too big. Keys only need a plain text file."; return; }
        box.value = [...new Set([...parseKeys(box.value), ...parseKeys(await f.text())])].join("\n");
        file.value = ""; refreshCount();
    });

    function draw() {
        list.hidden = !items.length;
        list.replaceChildren(...items.map(i => el("div", { className: "item" },
            el("code", { textContent: mask(i.key) }), el("span", { className: "chip " + i.status, textContent: i.status.replace("_", " ") }),
            (i.game || i.title || i.message) && el("span", { className: "g", textContent: i.game || i.title || i.message }))));
        const done = items.filter(i => i.status !== "pending").length;
        bar.style.width = items.length ? Math.round(done / items.length * 100) + "%" : "0";
    }

    function summarize(note) {
        const n = s => items.filter(i => i.status === s).length;
        const other = items.filter(i => !["pending", ...FINAL, "skipped"].includes(i.status)).length;
        sum.hidden = false;
        sum.textContent = (note ? note + " " : "") + `${n("redeemed")} redeemed, ${n("owned")} already owned, ${n("used")} used, ${n("invalid")} invalid, ${n("skipped")} skipped, ${other} other.`;
        reportBtn.hidden = !items.length;
    }

    async function start() {
        if (running) return;
        const keys = parseKeys(box.value).slice(0, MAX_KEYS);
        if (!keys.length) { banner.className = "banner warn"; banner.textContent = "No Steam keys found. They look like AAAAA-BBBBB-CCCCC."; return; }
        if (!(await checkLogin())) return;
        if (!confirm(`Redeem ${keys.length} key${keys.length === 1 ? "" : "s"} on the Steam account you are logged into now? Redeeming cannot be undone.`)) return;
        running = true; stopFlag = false;
        goBtn.disabled = true; stopBtn.hidden = false; sum.hidden = true;
        const { redeemed = {} } = await chrome.storage.local.get("redeemed");
        items = keys.map(key => ({ key, title: titles.get(key) || "", status: "pending", message: "", game: "" }));
        draw();

        // Optional: skip games the account already owns, matched by exact title (only for keys that came with a title).
        if (skipOwned.checked) {
            const named = [...new Set(items.map(i => i.title).filter(Boolean))];
            if (named.length) {
                banner.className = "banner"; banner.textContent = "Checking which of these games you already own…";
                const r = await send({ type: "check-owned", titles: named });
                if (r?.owned) {
                    for (const i of items) if (i.title && r.owned[i.title] === true) { i.status = "skipped"; i.message = "Already owned (matched by title)"; }
                    await checkLogin();
                } else if (r?.error) { banner.className = "banner warn"; banner.textContent = r.error + ". Redeeming without the owned check."; }
                draw();
            }
        }

        let note = "";
        for (let n = 0; n < items.length; n++) {
            const it = items[n];
            if (it.status === "skipped") continue;
            if (stopFlag) { note = "Stopped."; break; }
            const known = redeemed[it.key];
            if (known && FINAL.includes(known.status)) { it.status = "skipped"; it.message = "Already handled earlier"; it.game = known.game || ""; draw(); continue; }
            const r = (await send({ type: "redeem-key", key: it.key })) || { status: "error", message: "No response from the extension" };
            it.status = r.status; it.message = r.message || ""; it.game = r.game || it.title;
            if (FINAL.includes(r.status)) { redeemed[it.key] = { status: r.status, game: r.game || it.title, at: new Date().toISOString() }; await chrome.storage.local.set({ redeemed }); }
            draw();
            if (r.status === "not_logged_in") { note = "Not logged into Steam. Log in and retry."; break; }
            if (r.status === "rate_limited") { note = "Steam rate limit hit. Wait about an hour, then retry the rest."; break; }
            if (n < items.length - 1) await sleep(DELAY_MS);
        }
        // Handled keys leave the Fanatical queue so they are not offered again.
        const { pendingKeys = [] } = await chrome.storage.local.get("pendingKeys");
        const doneKeys = new Set(items.filter(i => FINAL.includes(i.status) || i.status === "skipped").map(i => i.key));
        await chrome.storage.local.set({ pendingKeys: pendingKeys.filter(x => !doneKeys.has(x.key)) });
        running = false; goBtn.disabled = false; stopBtn.hidden = true;
        summarize(note); loadQueue();
    }
    goBtn.addEventListener("click", start);
    stopBtn.addEventListener("click", () => { stopFlag = true; stopBtn.textContent = "Stopping…"; setTimeout(() => (stopBtn.textContent = "Stop"), 4000); });
    reportBtn.addEventListener("click", () => {
        const cell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const csv = "﻿" + ["Key,Status,Game,Message", ...items.map(i => [i.key, i.status, i.game || i.title, i.message].map(cell).join(","))].join("\r\n") + "\r\n";
        const a = el("a", { href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })), download: `steam_redeem_${new Date().toISOString().slice(0, 10)}.csv` });
        a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    });

    const saveCode = el("button", { className: "b", textContent: "Save" });
    saveCode.addEventListener("click", async () => {
        const v = codeBox.value.trim();
        if (v && !/^svcg_[A-Za-z0-9_-]{43}$/.test(v)) { codeBox.value = ""; codeBox.placeholder = "That is not a link code"; return; }
        if (v) await chrome.storage.local.set({ svcToken: v }); else await chrome.storage.local.remove("svcToken");
        codeBox.value = ""; codeBox.placeholder = v ? "Saved. Reload a Steam game page to see prices." : "Removed.";
    });

    const closeBtn = el("button", { className: "x", textContent: "×", title: "Close", "aria-label": "Close" });
    panel.append(
        el("header", {}, el("div", {}, el("b", { textContent: "Steam batch redeem" }), el("small", { textContent: "FanaticalGrabber v" + VERSION })), onRegister ? "" : closeBtn),
        el("div", { className: "body" },
            banner,
            el("div", { className: "banner", textContent: "Make sure you are logged into the Steam account you want the games on. Keys are redeemed one at a time, about 3 seconds apart, using your signed-in session." }),
            box, file,
            el("div", { className: "row" }, goBtn, stopBtn, fileBtn, queueBtn, count),
            el("label", { className: "chk" }, skipOwned, "Skip games I already own (only for keys loaded from Fanatical, matched by exact title)"),
            el("div", { className: "bar" }, bar), sum, list,
            el("div", { className: "row" }, reportBtn),
            el("details", {}, el("summary", { textContent: "Price overlay: link code" }),
                el("p", { textContent: "Paste your Steam Value Checker link code to see your prices, all-time low and owned or wishlist tags on Steam game pages. Only the app number is sent." }),
                el("div", { className: "row" }, codeBox, saveCode)),
            el("div", { className: "foot", textContent: "Keys never leave your browser except to Steam. Already-handled keys are remembered and skipped. © 2026 Jacob Lucado" })));

    const tab = el("button", { className: "tab", innerHTML: "" });
    tab.append(el("span", { textContent: "🎟️" }), el("span", { textContent: "Batch redeem" }));
    const open = on => { panel.classList.toggle("open", on); tab.hidden = on; if (on) checkLogin(); loadQueue(); };
    tab.addEventListener("click", () => open(true));
    closeBtn.addEventListener("click", () => open(false));

    // ---------- price overlay on a store page ----------
    async function overlay() {
        if (!appMatch) return;
        const r = await send({ type: "game-info", appid: appMatch[1] });
        if (!r || r.status !== "ok" || !r.found) return;
        const money = n => (n == null ? "–" : new Intl.NumberFormat(undefined, { style: "currency", currency: r.currency || "USD" }).format(n));
        const close = el("button", { className: "x", textContent: "×", "aria-label": "Close" });
        const card = el("div", { className: "card" }, close, el("h4", { textContent: "Steam Value Checker" }),
            r.owned && el("span", { className: "tag", textContent: "In your library" }),
            r.wishlisted && el("span", { className: "tag w", textContent: "On your wishlist" }),
            el("div", {}, "Best price now ", el("span", { className: "big", textContent: money(r.best?.price ?? r.steam) })),
            r.best?.shop && el("div", { textContent: "at " + r.best.shop }),
            r.atl != null && el("div", { textContent: "All-time low " + money(r.atl) + (r.best && r.best.price <= r.atl ? " (matched now)" : "") }));
        close.addEventListener("click", () => card.remove());
        root.append(card);
    }

    root.append(panel, tab);
    if (onRegister) {
        // Show the panel in the page itself, under the redeem form.
        const anchor = document.querySelector("#registerkey_form, .registerkey_form, #register_btn")?.closest("div") || document.querySelector(".page_content_ctn, #main_content, .pagecontent") || document.body;
        tab.hidden = true;
        host.style.display = "block"; host.style.margin = "16px 0";
        anchor.insertAdjacentElement(anchor === document.body ? "afterbegin" : "afterend", host);
        checkLogin(); loadQueue();
    } else {
        document.body.append(host);
        loadQueue();
    }
    overlay();
})();
