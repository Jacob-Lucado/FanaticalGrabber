// On Steam's own pages this turns the extension into a Steam batch redeem tool, in a panel styled like the dashboard.
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
    :host { --bg: #0f1724; --panel: #162134; --panel2: #1b2a40; --line: rgba(148,176,214,.16); --text: #cdd9e8; --muted: #8396ad; --white: #f4f8fd;
        --accent: #4da3ff; --accent2: #7c6cff; --good: #3ddc97; --bad: #ff6b6b; --warn: #f2b84b; --input: #0d1522; --soft: rgba(255,255,255,.07); --soft2: rgba(255,255,255,.12);
        --shadow: 0 14px 40px rgba(3,8,18,.55); }
    [hidden] { display: none !important; }
    * { scrollbar-width: thin; scrollbar-color: rgba(148,176,214,.35) transparent; }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    .tab { position: fixed; right: 18px; bottom: 18px; z-index: 2147483646; display: flex; align-items: center; justify-content: center; width: 260px; height: 44px; padding: 0 20px;
        border: 0; border-radius: 14px; cursor: pointer; color: #fff; font-size: 15px; font-weight: 700; user-select: none;
        background: linear-gradient(90deg, var(--accent), var(--accent2)); box-shadow: var(--shadow); transition: filter .12s; }
    .tab:hover { filter: brightness(1.1); }
    .tab span { animation: fg-fade 2.8s ease-in-out infinite; }
    @keyframes fg-fade { 0%, 100% { opacity: 1; } 50% { opacity: .25; } }
    @media (prefers-reduced-motion: reduce) { .tab span { animation: none; } }
    header.min { cursor: pointer; }
    .panel { position: fixed; right: 18px; bottom: 18px; z-index: 2147483647; width: min(460px, calc(100vw - 24px)); max-height: calc(100vh - 36px);
        display: none; flex-direction: column; color: var(--text); background: var(--panel); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow); overflow: hidden; }
    .panel.open { display: flex; }
    .panel.page { position: static; width: 100%; max-height: none; margin: 16px 0; box-shadow: 0 8px 24px rgba(3,8,18,.35); }
    header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--line); }
    header b { font-size: 13px; font-weight: 650; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); }
    header small { color: var(--muted); margin-left: 10px; font-size: 12px; font-weight: 400; letter-spacing: 0; text-transform: none; opacity: .8; }
    .x { background: var(--soft); border: 0; color: var(--muted); font-size: 18px; cursor: pointer; line-height: 1; width: 30px; height: 30px; border-radius: 50%; }
    .x:hover { color: var(--white); background: var(--soft2); }
    .body { padding: 18px 20px 20px; overflow: auto; }
    .banner { padding: 11px 14px; font-size: 14px; line-height: 1.45; margin-bottom: 12px; border-radius: 10px; border: 1px solid rgba(77,163,255,.28); background: rgba(77,163,255,.1); color: #bcdcff; }
    .banner.ok { border-color: rgba(61,220,151,.3); background: rgba(61,220,151,.1); color: #a8f0cf; }
    .banner.bad { border-color: rgba(255,107,107,.32); background: rgba(255,107,107,.1); color: #ffc2c2; }
    .banner.warn { border-color: rgba(242,184,75,.32); background: rgba(242,184,75,.1); color: #f6dba0; }
    textarea { width: 100%; height: 120px; resize: vertical; padding: 11px 13px; color: var(--white); font: 13px ui-monospace, SFMono-Regular, Consolas, monospace;
        background: var(--input); border: 1px solid var(--line); border-radius: 9px; }
    input[type=text] { width: 100%; padding: 9px 13px; color: var(--white); background: var(--input); border: 1px solid var(--line); border-radius: 9px; font-size: 14px; }
    textarea:focus, input[type=text]:focus { outline: 0; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(77,163,255,.2); }
    ::placeholder { color: var(--muted); opacity: .85; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; align-items: center; }
    button.b { height: 36px; padding: 0 18px; border-radius: 999px; border: 0; cursor: pointer; font-size: 14px; font-weight: 600; color: var(--text); background: var(--soft2);
        transition: background .12s, filter .12s, transform .12s; }
    button.b:hover:not(:disabled) { background: rgba(77,163,255,.25); color: var(--white); }
    button.b.go { color: #04150d; background: linear-gradient(90deg, #3ddc97, #5fe9b0); }
    button.b.go:hover:not(:disabled) { background: linear-gradient(90deg, #3ddc97, #5fe9b0); filter: brightness(1.08); transform: translateY(-1px); }
    button.b.stop { color: #fff; background: #d64545; }
    button.b.stop:hover:not(:disabled) { background: #e05555; }
    button.b:disabled { opacity: .5; cursor: default; }
    label.chk { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--muted); margin-top: 14px; }
    input[type=checkbox] { accent-color: var(--accent); width: 15px; height: 15px; }
    .count { margin-left: auto; font-size: 13px; color: var(--muted); }
    .bar { height: 6px; margin-top: 16px; background: var(--soft); border-radius: 999px; overflow: hidden; }
    .bar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, var(--accent), var(--good)); border-radius: 999px; transition: width .2s; }
    .list { margin-top: 14px; max-height: 220px; overflow: auto; border: 1px solid var(--line); border-radius: 10px; background: var(--panel2); }
    .item { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; padding: 9px 12px; font-size: 13px; border-bottom: 1px solid var(--line); }
    .item:last-child { border-bottom: 0; }
    .item code { color: var(--muted); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
    .item span.g { grid-column: 1 / 3; color: var(--white); }
    .chip { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 999px; color: #fff; background: #4b5b69; }
    .chip.redeemed { background: rgba(61,220,151,.2); color: var(--good); } .chip.owned, .chip.skipped { background: rgba(77,163,255,.2); color: var(--accent); }
    .chip.used, .chip.invalid, .chip.error, .chip.region, .chip.needs_base { background: rgba(255,107,107,.2); color: var(--bad); }
    .chip.rate_limited, .chip.not_logged_in { background: rgba(242,184,75,.2); color: var(--warn); }
    .sum { margin-top: 14px; font-size: 14px; color: var(--white); }
    .foot { margin-top: 16px; font-size: 12px; color: var(--muted); opacity: .8; }
    details { margin-top: 16px; font-size: 13px; color: var(--muted); } summary { cursor: pointer; }
    .card { position: fixed; left: 18px; bottom: 18px; z-index: 2147483646; width: 260px; padding: 16px; color: var(--text); font-size: 14px;
        background: var(--panel); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow); }
    .card h4 { margin: 0 0 8px; color: var(--muted); font-size: 12px; font-weight: 650; text-transform: uppercase; letter-spacing: .09em; }
    .card .big { font-size: 26px; font-weight: 700; color: var(--white); }
    .card .tag { display: inline-block; margin: 0 4px 6px 0; padding: 3px 10px; font-size: 11px; font-weight: 700; color: var(--good); background: rgba(61,220,151,.16); border-radius: 999px; }
    .card .tag.w { color: var(--accent); background: rgba(77,163,255,.18); }
    .card .x { float: right; }
    .card.wide { width: 330px; } .card .line { margin: 4px 0; line-height: 1.4; }
    .card.ok { border-color: rgba(61,220,151,.4); } .card.bad { border-color: rgba(255,107,107,.4); }
    `;

    const host = el("div", { id: "fg-steam-host" });
    const root = host.attachShadow({ mode: "open" });
    root.append(el("style", { textContent: CSS }));

    // ---------- drag to move ----------
    // Drag the bar or header to move the panel. The spot is remembered as the distance from the bottom-right corner, so the
    // panel keeps opening upward and leftward from where you put it. A tiny movement is still a click.
    function makeMovable(targets, handles, key) {
        const apply = (r, b) => targets.forEach(t => { t.style.right = r + "px"; t.style.bottom = b + "px"; t.style.left = "auto"; t.style.top = "auto"; t.style.maxHeight = Math.max(160, window.innerHeight - b - 12) + "px"; });
        const clamp = (t, r, b) => { const w = t.offsetWidth || 260, h = t.offsetHeight || 44;
            return [Math.max(0, Math.min(window.innerWidth - w, r)), Math.max(0, Math.min(window.innerHeight - h, b))]; };
        let pos = null;
        const place = () => { if (!pos) return; const [r, b] = clamp(targets.find(t => t.offsetWidth) || targets[0], pos[0], pos[1]); apply(r, b); };
        try { chrome.storage.local.get(key).then(v => { if (Array.isArray(v[key])) { pos = v[key]; place(); } }).catch(() => {}); } catch { /* storage is optional */ }
        window.addEventListener("resize", place);
        let wasDrag = false;
        for (const handle of handles) {
            handle.addEventListener("click", e => { if (wasDrag) { e.stopImmediatePropagation(); e.preventDefault(); wasDrag = false; } }, true);
            handle.addEventListener("pointerdown", e => {
                const hit = e.target.closest("button, a, input, textarea, select");
                if (e.button !== 0 || (hit && hit !== handle)) return;
                const t = targets.find(x => x.offsetWidth) || targets[0], rect = t.getBoundingClientRect();
                const sx = e.clientX, sy = e.clientY, r0 = window.innerWidth - rect.right, b0 = window.innerHeight - rect.bottom;
                let moved = false;
                const move = ev => {
                    const dx = ev.clientX - sx, dy = ev.clientY - sy;
                    if (!moved && Math.hypot(dx, dy) < 5) return;
                    moved = true;
                    const [r, b] = clamp(t, r0 - dx, b0 - dy); pos = [r, b]; apply(r, b);
                };
                const up = () => {
                    window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
                    if (moved) { wasDrag = true; setTimeout(() => { wasDrag = false; }, 0); try { chrome.storage.local.set({ [key]: pos }); } catch { /* ignore */ } }
                };
                window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
            });
        }
        return place;
    }

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
        const { pendingKeys: queued = [], vault = {}, redeemed = {} } = await chrome.storage.local.get(["pendingKeys", "vault", "redeemed"]);
        // Queued keys plus everything in the vault that has not been redeemed yet.
        const have = new Set(queued.map(x => x.key));
        const pendingKeys = [...queued, ...Object.entries(vault).filter(([k]) => !have.has(k) && !FINAL.includes(redeemed[k]?.status)).map(([key, v]) => ({ key, title: v.title }))].slice(0, MAX_KEYS);
        queueBtn.hidden = !pendingKeys.length;
        queueBtn.textContent = `Load ${pendingKeys.length} unredeemed key${pendingKeys.length === 1 ? "" : "s"} from Fanatical`;
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
        el("header", {}, el("div", {}, el("b", { textContent: "Batch Redeem" }), el("small", { textContent: "v" + VERSION })), onRegister ? "" : closeBtn),
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
    tab.append(el("span", { textContent: "🎮 Batch Redeem" }));
    tab.title = "Steam batch redeem";
    let placeSteam = null;
    const open = on => { panel.classList.toggle("open", on); tab.hidden = on; if (on) checkLogin(); loadQueue(); if (placeSteam) placeSteam(); };
    tab.addEventListener("click", () => open(true));
    if (!onRegister) placeSteam = makeMovable([panel, tab], [tab, panel.querySelector("header")], "fgPosSteam");
    closeBtn.addEventListener("click", e => { e.stopPropagation(); open(false); });
    // Like the Fanatical panel: click the header to minimise it back to the pulsing bar.
    if (!onRegister) { const head = panel.querySelector("header"); head.classList.add("min"); head.title = "Click to minimise"; head.addEventListener("click", () => open(false)); }

    // ---------- bundle verdict and checkout guard ----------
    const appIdsIn = scope => [...new Set([...scope.querySelectorAll('a[href*="/app/"]')].map(a => Number(/\/app\/(\d{1,9})/.exec(a.getAttribute("href"))?.[1])).filter(Boolean))];
    const priceNumber = text => { const m = /(\d[\d.,]*)/.exec(String(text ?? "").replace(/\s/g, "")); if (!m) return null; const raw = /,\d{1,2}$/.test(m[1]) ? m[1].replace(/\./g, "").replace(",", ".") : m[1].replace(/,/g, ""); const n = Number(raw); return Number.isFinite(n) ? n : null; };
    const fmt = (n, cur) => { try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur || "USD" }).format(n); } catch { return String(Math.round(n * 100) / 100); } };

    function infoCard(title, lines, tone) {
        const close = el("button", { className: "x", textContent: "×", "aria-label": "Close" });
        const card = el("div", { className: "card wide" }, close, el("h4", { textContent: title }), ...lines.map(l => typeof l === "string" ? el("div", { className: "line", textContent: l }) : l));
        if (tone) card.classList.add(tone);
        close.addEventListener("click", () => card.remove());
        root.append(card);
    }

    async function bundleHelper() {
        const scope = document.querySelector(".page_content_ctn, #game_area_bundle, .page_content") || document.body;
        const apps = appIdsIn(scope.querySelector(".bundle_package_item, .package_contents, .tab_item") ? scope : document.body).slice(0, 60);
        if (apps.length < 2) return;
        const owned = await send({ type: "owned-apps" });
        if (!owned?.apps) return;
        const mine = new Set(owned.apps);
        const have = apps.filter(a => mine.has(a)), fresh = apps.filter(a => !mine.has(a));
        const bundlePrice = priceNumber(document.querySelector(".discount_final_price, .game_purchase_price, .price")?.textContent);
        const lines = [`You own ${have.length} of ${apps.length} games in this.`];
        let tone = "";
        if (!fresh.length) { lines.push("You already own everything in it."); tone = "bad"; }
        else {
            if (bundlePrice) lines.push(`${fresh.length} new game${fresh.length === 1 ? "" : "s"}, so about ${bundlePrice / fresh.length >= 10 ? Math.round(bundlePrice / fresh.length) : (bundlePrice / fresh.length).toFixed(2)} each at the bundle price.`);
            const pr = await send({ type: "prices-for", appids: fresh });
            if (pr?.status === "ok" && pr.items.length) {
                const cur = pr.items[0].currency;
                const sep = pr.items.reduce((a, i) => a + (i.best?.price ?? i.steam ?? 0), 0);
                lines.push(`Buying the new ones separately costs about ${fmt(sep, cur)} now.`);
                if (bundlePrice) { const good = bundlePrice < sep * 0.9; lines.push(good ? "👍 The bundle is cheaper than buying them separately." : "👎 Buying separately is about as cheap, or cheaper."); tone = good ? "ok" : "bad"; }
            } else if (pr?.status === "no_code") lines.push("Add your link code (batch redeem panel, price overlay) to compare with buying separately.");
        }
        infoCard("Bundle check", lines, tone);
    }

    async function cartGuard() {
        const links = [...document.querySelectorAll('a[href*="/app/"]')].map(a => ({ id: Number(/\/app\/(\d{1,9})/.exec(a.getAttribute("href"))?.[1]), name: a.textContent.trim() })).filter(x => x.id && x.name);
        const seen = new Map(links.map(x => [x.id, x.name]));
        if (!seen.size) return;
        const owned = await send({ type: "owned-apps" });
        if (!owned?.apps) return;
        const mine = new Set(owned.apps);
        const dupes = [...seen].filter(([id]) => mine.has(id)).map(([, n]) => n);
        const lines = [];
        if (dupes.length) lines.push(`⚠️ You already own: ${dupes.slice(0, 6).join(", ")}${dupes.length > 6 ? " and more" : ""}.`);
        const pr = await send({ type: "prices-for", appids: [...seen.keys()].filter(id => !mine.has(id)) });
        if (pr?.status === "ok") {
            const cheaper = pr.items.filter(i => i.best && i.steam && i.best.shop !== "Steam" && i.best.price < i.steam * 0.9).slice(0, 5);
            for (const i of cheaper) lines.push(`💡 ${seen.get(i.appid)} is ${fmt(i.best.price, i.currency)} at ${i.best.shop} (Steam ${fmt(i.steam, i.currency)}).`);
        }
        if (lines.length) infoCard("Before you check out", lines, dupes.length ? "bad" : "");
    }

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
    if (/^\/(bundle|sub)\/\d+/.test(location.pathname)) bundleHelper();
    if (/^\/cart\/?$/.test(location.pathname)) cartGuard();
})();
