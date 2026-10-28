(() => {
    "use strict";

    const SEL_KEY_INPUT = 'input[aria-label="reveal-key"]';
    const REVEAL_TEXT = "reveal key";
    const REVEAL_TIMEOUT_MS = 15000;
    const CLICK_DELAY_MS = 150;

    let busy = false;

    // ---------- helpers ----------
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const today = () => new Date().toISOString().slice(0, 10);
    const version = () => chrome.runtime.getManifest().version;

    function findRevealButtons() {
        return [...document.querySelectorAll("button")].filter(
            btn => btn.textContent.trim().toLowerCase() === REVEAL_TEXT
        );
    }

    function getVisibleKeys() {
        return [...document.querySelectorAll(SEL_KEY_INPUT)].map(x => x.value).filter(Boolean);
    }

    function getTitle(article) {
        const el = article.querySelector("h1, h2, h3, h4, [class*='title' i], a[href*='/game/'], a[href*='/bundle/']");
        const fromEl = el?.textContent.trim();
        if (fromEl) return fromEl;
        const line = article.innerText?.split("\n").map(s => s.trim()).find(Boolean);
        return line || "Unknown Game";
    }

    // The order page shows one TOTAL for the whole order (per-game prices are not shown), so that total is split evenly
    // across the keys on the page. Returns a number, or null when there is not exactly one order total to read.
    function orderTotal() {
        // Fanatical's order header is a row of `.column-cell` divs (number, date, status, total); only the total is money.
        const money = [...document.querySelectorAll(".column-cell")].map(el => el.textContent.trim()).filter(t => /^[$€£]\s?\d[\d.,]*$/.test(t));
        if (money.length === 1) return parseAmount(money[0]);
        const labels = [...document.querySelectorAll("th, td, div, span, dt, p")]
            .filter(el => !el.children.length && el.textContent.trim().toLowerCase() === "total");
        if (labels.length !== 1) return null;
        const label = labels[0];
        // The amount is in the cell under the label (table header row) or right after it.
        let amount = null;
        const cell = label.closest("th, td");
        const table = label.closest("table");
        if (cell && table) {
            const i = [...cell.parentElement.children].indexOf(cell);
            amount = table.querySelector(`tbody tr td:nth-child(${i + 1}), tr + tr td:nth-child(${i + 1})`)?.textContent;
        }
        amount ??= label.nextElementSibling?.textContent ?? label.parentElement?.nextElementSibling?.textContent;
        return parseAmount(amount);
    }

    function parseAmount(text) {
        const m = String(text ?? "").match(/[$€£]\s?(\d[\d.,]*)/);
        if (!m) return null;
        const raw = /,\d{1,2}$/.test(m[1]) ? m[1].replace(/\./g, "").replace(",", ".") : m[1].replace(/,/g, "");
        const n = Number(raw);
        return Number.isFinite(n) && n >= 0 ? n : null;
    }

    // Every revealed Steam-format key is remembered locally (title and time), so the dashboard's key vault can list what is still unredeemed.
    async function saveToVault(rows) {
        try {
            const mine = rows.filter(r => /^[A-Z0-9]{5}(-[A-Z0-9]{5}){2}$/i.test(String(r.key).trim()));
            if (!mine.length) return;
            const { vault = {} } = await chrome.storage.local.get("vault");
            let changed = false;
            for (const r of mine) {
                const k = r.key.trim().toUpperCase();
                if (!vault[k]) { vault[k] = { title: r.title, store: "fanatical", at: new Date().toISOString() }; changed = true; }
            }
            if (changed) await chrome.storage.local.set({ vault });
        } catch { /* the vault is a convenience */ }
    }

    function collectKeys() {
        const seen = new Set();
        const rows = [];
        document.querySelectorAll("article").forEach(article => {
            const key = article.querySelector(SEL_KEY_INPUT)?.value;
            if (!key) return;
            const title = getTitle(article);
            const id = `${title}|${key}`;
            if (seen.has(id)) return;
            seen.add(id);
            rows.push({ title, key });
        });
        saveToVault(rows);
        const total = orderTotal();
        if (total !== null && rows.length) {
            const each = Math.round(total / rows.length * 100) / 100;
            rows.forEach(r => { r.paid = each; });
        }
        return rows;
    }

    function setStatus(text, count = null) {
        const status = document.getElementById("fg-status");
        if (!status) return;
        status.style.display = "block";
        document.getElementById("fg-status-text").textContent = `Status: ${text}`;
        document.getElementById("fg-keys-count").textContent =
            `Keys Revealed: ${count ?? getVisibleKeys().length}`;
    }

    async function waitFor(predicate, timeout) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (predicate()) return true;
            await sleep(200);
        }
        return predicate();
    }

    async function revealKeys() {
        const buttons = findRevealButtons();
        if (!buttons.length) return 0;

        const before = getVisibleKeys().length;
        setStatus("Revealing keys...");

        for (const btn of buttons) {
            btn.click();
            await sleep(CLICK_DELAY_MS);
        }
        await waitFor(() => getVisibleKeys().length >= before + buttons.length, REVEAL_TIMEOUT_MS);
        return buttons.length;
    }

    async function run(label, fn) {
        if (busy) return;
        busy = true;
        setBusyUI(true);
        try {
            await fn();
        } catch (err) {
            console.error(`[FanaticalGrabber] ${label} failed:`, err);
            setStatus(`${label} failed (see console)`);
        } finally {
            busy = false;
            setBusyUI(false);
        }
    }

    function setBusyUI(on) {
        document.querySelectorAll("#fg-body button:not(#fg-stop)").forEach(b => (b.disabled = on));
    }

    function download(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // ---------- formatters ----------
    const csvCell = v => `"${String(v).replace(/"/g, '""')}"`;
    const mdCell = v => String(v).replace(/\|/g, "\\|");
    const htmlEsc = v =>
        String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    // Each exporter: build(rows) -> string. XLSX is handled separately (needs the library).
    // To add a format, just add an entry here.
    const FORMATS = [
        {
            id: "txt", icon: "📄", label: "Text (.txt)", ext: "txt", mime: "text/plain",
            build: rows => [
                "FanaticalGrabber",
                "© 2026 Jacob Lucado",
                `Version: ${version()}`,
                "",
                "Fanatical Key Export Report",
                "",
                `Export Date: ${new Date().toLocaleString()}`,
                "",
                "========================================",
                "",
                ...rows.map(r => `${r.title} | ${r.key}`),
                "",
                "========================================",
                "",
                `Games Exported: ${rows.length}`,
                "",
                "Created By: Jacob Lucado",
                "Follow: https://x.com/twit_user69",
                ""
            ].join("\n")
        },
        {
            id: "csv", icon: "🧾", label: "CSV (.csv)", ext: "csv", mime: "text/csv",
            // BOM so Excel reads UTF-8 titles correctly
            build: rows => "\uFEFF" + [rows.some(r => r.paid != null) ? "Game,Key,Paid" : "Game,Key", ...rows.map(r => `${csvCell(r.title)},${csvCell(r.key)}` + (rows.some(x => x.paid != null) ? `,${r.paid ?? ""}` : ""))].join("\r\n") + "\r\n"
        },
        {
            id: "json", icon: "🧩", label: "JSON (.json)", ext: "json", mime: "application/json",
            build: rows => JSON.stringify(
                { exportedAt: new Date().toISOString(), count: rows.length, keys: rows.map(r => ({ game: r.title, key: r.key, ...(r.paid != null ? { paid: r.paid } : {}) })) },
                null, 2
            )
        },
        {
            id: "md", icon: "📝", label: "Markdown (.md)", ext: "md", mime: "text/markdown",
            build: rows => [
                "# Fanatical Keys",
                "",
                `Exported ${new Date().toLocaleString()} — ${rows.length} keys`,
                "",
                "| Game | Key |",
                "| --- | --- |",
                ...rows.map(r => `| ${mdCell(r.title)} | \`${r.key}\` |`),
                ""
            ].join("\n")
        },
        {
            id: "html", icon: "🌐", label: "HTML page (.html)", ext: "html", mime: "text/html",
            build: rows => `<!doctype html>
<html><head><meta charset="utf-8"><title>Fanatical Keys</title>
<style>body{font-family:Segoe UI,sans-serif;margin:2rem}table{border-collapse:collapse}
td,th{border:1px solid #ccc;padding:6px 12px;text-align:left}code{font-size:1.05em}</style></head>
<body><h1>Fanatical Keys</h1><p>Exported ${htmlEsc(new Date().toLocaleString())} — ${rows.length} keys</p>
<table><tr><th>Game</th><th>Key</th></tr>
${rows.map(r => `<tr><td>${htmlEsc(r.title)}</td><td><code>${htmlEsc(r.key)}</code></td></tr>`).join("\n")}
</table></body></html>`
        }
    ];

    // ---------- send to Steam Value Checker ----------
    async function sendToChecker(rows) {
        let { svcToken } = await chrome.storage.local.get("svcToken");
        if (!svcToken) {
            svcToken = (window.prompt("Paste your Steam Value Checker link code.\nGet one in Discord with /library grabber (or on the dashboard's Library page).\nOnly game titles are sent, never keys.") || "").trim();
            if (!svcToken) return setStatus("Cancelled");
        }
        setStatus("Sending titles to Steam Value Checker...", rows.length);
        const r = await chrome.runtime.sendMessage({ type: "send-to-checker", token: svcToken, titles: rows.map(x => x.title), paid: rows.map(x => x.paid ?? null) });
        if (r?.status === "sent") {
            await chrome.storage.local.set({ svcToken });
            return setStatus(`Sent: ${r.added} added, ${r.updated} updated` + (r.notFound ? `, ${r.notFound} not matched` : ""), rows.length);
        }
        if (r?.status === "bad_code") await chrome.storage.local.remove("svcToken");
        setStatus(r?.message || "Could not send", rows.length);
    }

    // ---------- export actions ----------
    function exportAs(formatId) {
        return run("Export", async () => {
            await revealKeys();
            const rows = collectKeys();
            if (!rows.length) return setStatus("No keys found", 0);

            if (formatId === "svc") return sendToChecker(rows);
            if (formatId === "queue") {
                // Keys stay in this browser: they are handed to the Steam panel through extension storage, never to a server.
                const steamRows = rows.filter(r => STEAM_KEY_RE.test(r.key.trim()));
                if (!steamRows.length) return setStatus("No Steam-format keys to queue", rows.length);
                const { pendingKeys = [] } = await chrome.storage.local.get("pendingKeys");
                const have = new Set(pendingKeys.map(x => x.key));
                const merged = [...pendingKeys, ...steamRows.filter(r => !have.has(r.key.toUpperCase())).map(r => ({ key: r.key.trim().toUpperCase(), title: r.title }))].slice(0, 500);
                await chrome.storage.local.set({ pendingKeys: merged });
                return setStatus(`Queued ${steamRows.length} key${steamRows.length === 1 ? "" : "s"}. Open Steam's Activate a Product page to redeem them all`, rows.length);
            }

            setStatus(`Exporting ${formatId.toUpperCase()}...`, rows.length);

            if (formatId === "xlsx") {
                if (typeof XLSX === "undefined") return setStatus("xlsx.full.min.js not loaded");
                const exportDate = new Date().toLocaleString();
                const sheet = XLSX.utils.json_to_sheet(
                    rows.map(r => ({ Game: r.title, Key: r.key, ...(r.paid != null ? { Paid: r.paid } : {}), ExportDate: exportDate }))
                );
                sheet["!cols"] = [{ wch: 50 }, { wch: 30 }, { wch: 25 }];
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, sheet, "Keys");
                XLSX.writeFile(wb, `FanaticalGrabber_${today()}.xlsx`);
                return setStatus("Exported XLSX", rows.length);
            }

            if (formatId === "clipboard") {
                const text = rows.map(r => `${r.title} | ${r.key}`).join("\n");
                try {
                    await navigator.clipboard.writeText(text);
                    setStatus("Copied to clipboard", rows.length);
                } catch {
                    setStatus("Clipboard blocked by browser", rows.length);
                }
                return;
            }

            const fmt = FORMATS.find(f => f.id === formatId);
            if (!fmt) return setStatus(`Unknown format: ${formatId}`);
            download(new Blob([fmt.build(rows)], { type: `${fmt.mime};charset=utf-8` }),
                `FanaticalGrabber_${today()}.${fmt.ext}`);
            setStatus(`Exported ${fmt.ext.toUpperCase()}`, rows.length);
        });
    }

    // ---------- Steam redeem ----------
    const STEAM_KEY_RE = /^[A-Z0-9]{5}(-[A-Z0-9]{5}){2}$/i; // Steam keys are 5-5-5; skips other platforms
    const REDEEM_DELAY_MS = 3000;
    const FINAL_STATUSES = ["redeemed", "owned", "used", "invalid"]; // never retried
    let stopRequested = false;

    async function loadRedeemed() {
        const { redeemed = {} } = await chrome.storage.local.get("redeemed");
        return redeemed;
    }

    function showStop(on) {
        const btn = document.getElementById("fg-stop");
        if (btn) btn.style.display = on ? "block" : "none";
    }

    function redeemOnSteam() {
        return run("Redeem", async () => {
            // Only redeem keys that are already revealed (no auto-reveal)
            const all = collectKeys();
            if (!all.length) return setStatus("No revealed keys - click Reveal All first", 0);

            const steamRows = all.filter(r => STEAM_KEY_RE.test(r.key.trim()));
            const history = await loadRedeemed();
            const todo = steamRows.filter(r => !FINAL_STATUSES.includes(history[r.key]?.status));

            if (!todo.length) {
                return setStatus(
                    `Nothing to redeem (${all.length - steamRows.length} non-Steam, ` +
                    `${steamRows.length - todo.length} already handled)`
                );
            }

            const ok = confirm(
                `Redeem ${todo.length} key(s) on the Steam account currently logged in?\n\n` +
                `Skipping ${all.length - steamRows.length} non-Steam-format key(s) and ` +
                `${steamRows.length - todo.length} already processed.\n` +
                `Redeeming cannot be undone.`
            );
            if (!ok) return setStatus("Redeem cancelled");

            stopRequested = false;
            showStop(true);
            const results = [];
            let abortMsg = null;

            for (let i = 0; i < todo.length; i++) {
                if (stopRequested) break;
                const { title, key } = todo[i];
                setStatus(`Redeeming ${i + 1}/${todo.length}: ${title}`);

                let res;
                try {
                    res = await chrome.runtime.sendMessage({ type: "redeem-key", key });
                } catch (err) {
                    res = { status: "error", message: err.message };
                }
                res = res || { status: "error", message: "No response from background" };

                results.push({ title, key, status: res.status, message: res.message, steamName: res.game || "" });

                if (FINAL_STATUSES.includes(res.status)) {
                    history[key] = { status: res.status, game: res.game || title, at: new Date().toISOString() };
                    await chrome.storage.local.set({ redeemed: history });
                }

                if (res.status === "not_logged_in") {
                    abortMsg = "Not logged into Steam - log in at store.steampowered.com and retry";
                    break;
                }
                if (res.status === "rate_limited") {
                    abortMsg = "Steam rate limit hit - wait about an hour, then retry";
                    break;
                }
                if (i < todo.length - 1) await sleep(REDEEM_DELAY_MS);
            }

            showStop(false);
            if (!results.length) return;

            const count = s => results.filter(r => r.status === s).length;
            const others = results.filter(r => !FINAL_STATUSES.includes(r.status));
            const summary =
                `Done: ${count("redeemed")} redeemed, ${count("owned")} owned, ${count("used")} used, ` +
                `${count("invalid")} invalid, ${others.length} other` +
                (others.length ? ` (${others[0].message})` : "");
            setStatus(abortMsg || summary);

            // Save a report so failures are easy to look at
            const csv = "\uFEFF" + ["Game,Key,Status,Message,SteamName",
                ...results.map(r => [r.title, r.key, r.status, r.message, r.steamName].map(csvCell).join(","))
            ].join("\r\n") + "\r\n";
            download(new Blob([csv], { type: "text/csv;charset=utf-8" }), `FanaticalGrabber_redeem_${today()}.csv`);
        });
    }

    function revealAll() {
        return run("Reveal", async () => {
            const clicked = await revealKeys();
            setStatus(clicked ? "Ready" : "No keys to reveal");
        });
    }

    // ---------- drag to move ----------
    // Drag the bar or header to move the panel. The spot is remembered as the distance from the bottom-right corner, so the
    // panel keeps opening upward and leftward from where you put it. A tiny movement is still a click.
    function makeMovable(targets, handles, key, startParked) {
        const apply = (r, b) => targets.forEach(t => { t.style.right = r + "px"; t.style.bottom = b + "px"; t.style.left = "auto"; t.style.top = "auto"; });
        const clamp = (t, r, b) => { const w = t.offsetWidth || 260, h = t.offsetHeight || 44;
            return [Math.max(0, Math.min(window.innerWidth - w, r)), Math.max(0, Math.min(window.innerHeight - h, b))]; };
        let pos = null, parked = !!startParked;
        // While minimised the bar sits at its default corner; the saved spot is only used when it is open.
        const place = () => { if (!pos || parked) return; const [r, b] = clamp(targets.find(t => t.offsetWidth) || targets[0], pos[0], pos[1]); apply(r, b); };
        try { chrome.storage.local.get(key).then(v => { if (Array.isArray(v[key])) { pos = v[key]; place(); } }).catch(() => {}); } catch { /* storage is optional */ }
        place.park = on => {
            parked = on;
            if (on) targets.forEach(t => { t.style.right = ""; t.style.bottom = ""; t.style.left = ""; t.style.top = ""; });
            else place();
        };
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
                    const [r, b] = clamp(t, r0 - dx, b0 - dy); pos = [r, b]; parked = false; apply(r, b);
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

    // ---------- UI ----------
    const CSS = `
        #fg-panel { position: fixed; bottom: 20px; right: 20px; width: 260px; background: #1e1e1e; color: #fff;
            border-radius: 12px; overflow: hidden; z-index: 2147483647; font-family: "Segoe UI", sans-serif;
            box-shadow: 0 5px 20px rgba(0,0,0,.4); }
        #fg-header { background: #ff9800; color: #000; padding: 12px; font-size: 16px; font-weight: bold;
            cursor: pointer; user-select: none; text-align: center; }
        #fg-header.collapsed span { animation: fg-fade 2.8s ease-in-out infinite; }
        @keyframes fg-fade { 0%, 100% { opacity: 1; } 50% { opacity: .25; } }
        #fg-body { padding: 10px; display: none; }
        #fg-status { display: none; margin-bottom: 12px; font-size: 13px; }
        #fg-status-text, #fg-keys-count { background: #2a2a2a; padding: 8px 12px; border-radius: 8px;
            margin-bottom: 6px; text-align: center; color: #ddd; }
        #fg-body button { width: 100%; padding: 10px; margin-bottom: 8px; border: none; border-radius: 6px;
            cursor: pointer; font-weight: bold; font-family: inherit; }
        #fg-body button:disabled { opacity: .6; cursor: default; }
        #fg-export { background: #ff9800; color: #000; }
        #fg-reveal { background: #444; color: #fff; }
        #fg-redeem { background: #1b2838; color: #66c0f4; }
        #fg-stop { background: #b3261e; color: #fff; }

        #fg-menu { display: none; margin: -2px 0 8px; background: #2a2a2a; border-radius: 6px; overflow: hidden; }
        #fg-menu.open { display: block; }
        #fg-menu button.fg-item { background: transparent; color: #eee; text-align: left; margin: 0;
            border-radius: 0; font-weight: 600; padding: 9px 12px; border-bottom: 1px solid #333; }
        #fg-menu button.fg-item:last-child { border-bottom: none; }
        #fg-menu button.fg-item:hover:not(:disabled) { background: #3a3a3a; }
        #fg-sub { display: none; background: #202020; }
        #fg-sub.open { display: block; }
        #fg-sub button.fg-item { padding-left: 26px; font-weight: 500; }
        #fg-menu .fg-parent { color: #ffb74d; }
        #fg-menu .fg-sep { height: 1px; background: #555; }

        #fg-twitter { display: block; text-align: center; text-decoration: none; background: #1DA1F2; color: #fff;
            padding: 10px; margin-bottom: 10px; border-radius: 6px; font-weight: bold; }
        #fg-twitter:hover { opacity: .9; }
        #fg-footer { text-align: center; color: #bbb; font-size: 11px; }
    `;

    function menuItem(id, icon, label) {
        return `<button class="fg-item" data-format="${id}">${icon} ${label}</button>`;
    }

    function createPanel() {
        if (document.getElementById("fg-panel")) return;
        if (!findRevealButtons().length && !document.querySelector(SEL_KEY_INPUT)) return;

        const style = document.createElement("style");
        style.id = "fg-style";
        style.textContent = CSS;
        document.head.appendChild(style);

        const panel = document.createElement("div");
        panel.id = "fg-panel";
        panel.innerHTML = `
            <div id="fg-header" class="collapsed"><span>🎮 FanaticalGrabber</span></div>
            <div id="fg-body">
                <div id="fg-status">
                    <div id="fg-status-text">Status: Ready</div>
                    <div id="fg-keys-count">Keys Revealed: 0</div>
                </div>

                <button id="fg-export" aria-haspopup="true" aria-expanded="false">🚀 Export ▾</button>
                <div id="fg-menu" role="menu">
                    <button class="fg-item fg-parent" id="fg-files" aria-expanded="false">💾 Save as file ▾</button>
                    <div id="fg-sub">
                        ${FORMATS.map(f => menuItem(f.id, f.icon, f.label)).join("")}
                        ${menuItem("xlsx", "📊", "Excel (.xlsx)")}
                    </div>
                    <div class="fg-sep"></div>
                    ${menuItem("clipboard", "📋", "Copy to clipboard")}
                    ${menuItem("queue", "⏩", "Queue for the Steam batch redeem")}
                    ${menuItem("svc", "📤", "Send to Steam Value Checker")}
                </div>

                <button id="fg-reveal">🔓 Reveal All</button>
                <button id="fg-redeem" title="Beta: may fail if Steam changes or rate-limits you">🎟️ Redeem on Steam (Beta)</button>
                <button id="fg-stop" style="display:none">⏹ Stop</button>

                <a id="fg-twitter" href="https://x.com/twit_user69" target="_blank" rel="noopener noreferrer">
                    🐦 Follow Jacob Lucado
                </a>
                <div id="fg-footer">© 2026 Jacob Lucado<br>FanaticalGrabber v${version()}</div>
            </div>
        `;
        document.body.appendChild(panel);

        const header = panel.querySelector("#fg-header");
        const body = panel.querySelector("#fg-body");
        const exportBtn = panel.querySelector("#fg-export");
        const menu = panel.querySelector("#fg-menu");

        const sub = panel.querySelector("#fg-sub");
        const filesBtn = panel.querySelector("#fg-files");
        const setSub = open => {
            sub.classList.toggle("open", open);
            filesBtn.setAttribute("aria-expanded", String(open));
            filesBtn.textContent = open ? "💾 Save as file ▴" : "💾 Save as file ▾";
        };
        filesBtn.addEventListener("click", e => { e.stopPropagation(); setSub(!sub.classList.contains("open")); place(); });
        const setMenu = open => {
            if (!open) setSub(false);
            menu.classList.toggle("open", open);
            exportBtn.setAttribute("aria-expanded", String(open));
        };

        const place = makeMovable([panel], [header], "fgPosFanatical", true);
        header.title = "Click to open or close. Drag to move.";
        header.addEventListener("click", () => {
            const open = body.style.display === "block";
            body.style.display = open ? "none" : "block";
            header.classList.toggle("collapsed", open);
            place.park(open);
            if (open) setMenu(false);
        });

        exportBtn.addEventListener("click", () => setMenu(!menu.classList.contains("open")));

        menu.addEventListener("click", e => {
            const item = e.target.closest("[data-format]");
            if (!item) return;
            setMenu(false);
            exportAs(item.dataset.format);
        });

        panel.querySelector("#fg-reveal").addEventListener("click", revealAll);
        panel.querySelector("#fg-redeem").addEventListener("click", redeemOnSteam);
        panel.querySelector("#fg-stop").addEventListener("click", () => {
            stopRequested = true;
            setStatus("Stopping after current key...");
        });

        // Close the menu on outside click or Escape
        document.addEventListener("click", e => {
            if (!panel.contains(e.target)) setMenu(false);
        });
        document.addEventListener("keydown", e => {
            if (e.key === "Escape") setMenu(false);
        });
    }

    let timer = null;
    new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(createPanel, 300);
    }).observe(document.body, { childList: true, subtree: true });

    createPanel();
})();
