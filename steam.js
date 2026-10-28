// On Steam's own pages this turns the extension into a Steam batch redeem tool, in a clean, modern panel.
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
    * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
    :host { --bg: #fff; --fg: #212529; --muted: #6c757d; --line: #dee2e6; --soft: #f8f9fa; --input: #fff; --primary: #0d6efd; --primary-h: #0b5ed7;
        --ok: #198754; --ok-h: #157347; --danger: #dc3545; --shadow: 0 .5rem 1.5rem rgba(0,0,0,.25); }
    @media (prefers-color-scheme: dark) { :host { --bg: #212529; --fg: #dee2e6; --muted: #9aa5b1; --line: #3d444b; --soft: #2b3035; --input: #1a1d20;
        --primary: #3d8bfd; --primary-h: #6ea8fe; --ok: #20a56a; --ok-h: #3bbf84; --shadow: 0 .5rem 1.5rem rgba(0,0,0,.6); } }
    .tab { position: fixed; right: 18px; bottom: 18px; z-index: 2147483646; display: flex; align-items: center; gap: 8px; padding: 9px 18px;
        border: 0; border-radius: 999px; cursor: pointer; color: #fff; font-size: 14px; font-weight: 500; background: var(--primary); box-shadow: var(--shadow); }
    .tab:hover { background: var(--primary-h); }
    .panel { position: fixed; right: 18px; bottom: 18px; z-index: 2147483647; width: min(460px, calc(100vw - 24px)); max-height: calc(100vh - 36px);
        display: none; flex-direction: column; color: var(--fg); background: var(--bg); border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow); overflow: hidden; }
    .panel.open { display: flex; }
    .panel.page { position: static; width: 100%; max-height: none; margin: 16px 0; box-shadow: 0 .125rem .5rem rgba(0,0,0,.15); }
    header { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--line); }
    header b { font-size: 17px; font-weight: 600; color: var(--fg); }
    header small { color: var(--muted); margin-left: 8px; font-size: 12px; font-weight: 400; }
    .x { background: none; border: 0; color: var(--muted); font-size: 22px; cursor: pointer; line-height: 1; padding: 2px 6px; border-radius: 6px; }
    .x:hover { color: var(--fg); background: var(--soft); }
    .body { padding: 18px; overflow: auto; }
    .banner { padding: 10px 14px; font-size: 14px; margin-bottom: 12px; border: 1px solid #9eeaf9; border-radius: 6px; background: #cff4fc; color: #055160; }
    .banner.ok { border-color: #a3cfbb; background: #d1e7dd; color: #0a3622; }
    .banner.bad { border-color: #f1aeb5; background: #f8d7da; color: #58151c; }
    .banner.warn { border-color: #ffe69c; background: #fff3cd; color: #664d03; }
    textarea { width: 100%; height: 120px; resize: vertical; padding: 10px 12px; color: var(--fg); font: 13px ui-monospace, SFMono-Regular, Consolas, monospace;
        background: var(--input); border: 1px solid var(--line); border-radius: 6px; }
    input[type=text] { width: 100%; padding: 8px 12px; color: var(--fg); background: var(--input); border: 1px solid var(--line); border-radius: 6px; font-size: 14px; }
    textarea:focus, input[type=text]:focus { outline: 0; border-color: #86b7fe; box-shadow: 0 0 0 .25rem rgba(13,110,253,.25); }
    @media (prefers-color-scheme: dark) { .banner { border-color: #087990; background: #032830; color: #6edff6; } .banner.ok { border-color: #0f5132; background: #051b11; color: #75b798; }
        .banner.bad { border-color: #842029; background: #2c0b0e; color: #ea868f; } .banner.warn { border-color: #997404; background: #332701; color: #ffda6a; } }
    ::placeholder { color: var(--muted); opacity: .85; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; align-items: center; }
    button.b { padding: 7px 16px; border-radius: 6px; border: 1px solid var(--primary); cursor: pointer; font-size: 14px; font-weight: 500; color: var(--primary); background: transparent;
        transition: background .12s, color .12s; }
    button.b:hover:not(:disabled) { background: var(--primary); color: #fff; }
    button.b.go { border-color: var(--ok); color: #fff; background: var(--ok); }
    button.b.go:hover:not(:disabled) { background: var(--ok-h); border-color: var(--ok-h); }
    button.b.stop { border-color: var(--danger); color: #fff; background: var(--danger); }
    button.b:disabled { opacity: .55; cursor: default; }
    label.chk { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--muted); margin-top: 12px; }
    .count { margin-left: auto; font-size: 13px; color: var(--muted); }
    .bar { height: 8px; margin-top: 14px; background: var(--soft); border: 1px solid var(--line); border-radius: 999px; overflow: hidden; }
    .bar i { display: block; height: 100%; width: 0; background: var(--primary); transition: width .2s; }
    .list { margin-top: 12px; max-height: 220px; overflow: auto; border: 1px solid var(--line); border-radius: 6px; }
    .item { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; padding: 8px 12px; font-size: 13px; border-bottom: 1px solid var(--line); }
    .item:last-child { border-bottom: 0; }
    .item code { color: var(--muted); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
    .item span.g { grid-column: 1 / 3; color: var(--fg); }
    .chip { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px; color: #fff; background: #6c757d; }
    .chip.redeemed { background: var(--ok); } .chip.owned, .chip.skipped { background: #0dcaf0; color: #052c65; }
    .chip.used, .chip.invalid, .chip.error, .chip.region, .chip.needs_base { background: var(--danger); }
    .chip.rate_limited, .chip.not_logged_in { background: #ffc107; color: #000; }
    .sum { margin-top: 12px; font-size: 14px; color: var(--fg); }
    .foot { margin-top: 14px; font-size: 12px; color: var(--muted); }
    details { margin-top: 14px; font-size: 13px; color: var(--muted); } summary { cursor: pointer; }
    .card { position: fixed; left: 18px; bottom: 18px; z-index: 2147483646; width: 260px; padding: 14px; color: var(--fg); font-size: 14px;
        background: var(--bg); border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow); }
    .card h4 { margin: 0 0 8px; color: var(--muted); font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
    .card .big { font-size: 24px; font-weight: 600; color: var(--ok); }
    .card .tag { display: inline-block; margin: 0 4px 6px 0; padding: 2px 9px; font-size: 11px; font-weight: 600; color: #fff; background: var(--ok); border-radius: 999px; }
    .card .tag.w { background: var(--primary); }
    .card .x { float: right; }
    .card.wide { width: 330px; } .card .line { margin: 4px 0; line-height: 1.4; }
    .card.ok { border-color: var(--ok); } .card.bad { border-color: var(--danger); }
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
