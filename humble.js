// Humble's keys page (humblebundle.com/home/keys) and its download pages: export the keys that are showing, and
// optionally reveal the rest first. Beta: it reads Humble's own markup, which can change without notice.
// Nothing is sent anywhere. Revealing on Humble can't be undone (a revealed key can no longer be gifted), so it asks first.
(() => {
    "use strict";
    if (window.__fgHumble) return; window.__fgHumble = true;
    const L = window.FGLib;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let opts = L.cleanOptions();
    try { chrome.storage.local.get("opts").then(v => { opts = L.cleanOptions(v.opts); }).catch(() => {}); } catch { /* defaults */ }

    // One key box per game. A revealed box holds the key itself; an unrevealed one holds "Reveal your Steam key".
    const boxes = () => [...document.querySelectorAll(".keyfield")];
    const valueOf = box => (box.querySelector(".keyfield-value")?.textContent ?? "").trim();
    const looksLikeKey = t => /^[A-Z0-9]{2,}(?:[- ][A-Z0-9]{2,}){1,7}$/i.test(t) && /\d|-/.test(t) && t.length >= 8 && t.length <= 60;
    const isRevealed = box => looksLikeKey(valueOf(box));
    const canReveal = box => !isRevealed(box) && !box.classList.contains("expired") && !/gift|expired/i.test(valueOf(box)) && box.offsetParent !== null;
    function titleOf(box) {
        const row = box.closest("tr, .key-redeemer, .key-container, li") ?? box.parentElement;
        const el = row?.querySelector(".game-name h4, .heading-text h4, h4, h3, .game-name, [class*='title' i]");
        const t = (el?.textContent ?? "").trim();
        return t || (box.getAttribute("title") ?? "").replace(/^reveal your\s*/i, "").replace(/\s*key$/i, "").trim() || "Unknown game";
    }
    function collect() {
        const seen = new Set(), rows = [];
        for (const box of boxes()) {
            if (!isRevealed(box)) continue;
            const key = valueOf(box), title = titleOf(box);
            if (seen.has(key)) continue; seen.add(key);
            rows.push({ title, key, order: "", date: "" });
        }
        return rows;
    }
    async function remember(rows) {
        try {
            if (!rows.length) return;
            const { ledger = {}, vault = {} } = await chrome.storage.local.get(["ledger", "vault"]);
            const changed = L.mergeLedger(ledger, rows, { store: "humble" });
            let v = false;
            for (const r of rows) { const k = r.key.toUpperCase(); if (L.STEAM_KEY_RE.test(k) && !vault[k]) { vault[k] = { title: r.title, store: "humble", at: new Date().toISOString() }; v = true; } }
            if (changed || v) await chrome.storage.local.set({ ...(changed ? { ledger } : {}), ...(v ? { vault } : {}) });
        } catch { /* a convenience */ }
    }
    function download(blob, name) {
        const url = URL.createObjectURL(blob), a = document.createElement("a");
        a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    const CSS = `
        :host { all: initial; position: fixed; right: 20px; bottom: 20px; width: 250px; max-width: calc(100vw - 40px); z-index: 2147483647; font-family: "Segoe UI", system-ui, sans-serif;
            background: #1b1830; color: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 5px 20px rgba(0,0,0,.45); }
        #head { background: linear-gradient(90deg,#7c3bed,#9b6bf5); padding: 11px; font-weight: 700; text-align: center; cursor: pointer; user-select: none; }
        #body { display: none; padding: 10px; }
        #body.open { display: block; }
        #status { background: #262244; border-radius: 8px; padding: 8px 10px; font-size: 12.5px; color: #ddd; margin-bottom: 8px; text-align: center; }
        button { width: 100%; padding: 9px; margin-bottom: 7px; border: 0; border-radius: 6px; cursor: pointer; font: 600 13px "Segoe UI", system-ui, sans-serif; }
        button:disabled { opacity: .6; cursor: default; }
        .main { background: #7c3bed; color: #fff; }
        .plain { background: #3a3560; color: #fff; }
        #menu { display: none; background: #262244; border-radius: 6px; overflow: hidden; margin: -2px 0 7px; }
        #menu.open { display: block; }
        #menu button { background: none; color: #eee; text-align: left; margin: 0; border-radius: 0; border-bottom: 1px solid #332e55; }
        #menu button:hover { background: #332e55; }
        small { display: block; color: #a9a4c9; font-size: 11px; text-align: center; }
    `;
    function build() {
        if (document.getElementById("fg-humble") || !boxes().length) return;
        const host = document.createElement("div"); host.id = "fg-humble";
        const root = host.attachShadow({ mode: "open" });
        const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
        const status = el("div", { id: "status", textContent: "Ready" });
        const say = t => { status.textContent = t; };
        const menu = el("div", { id: "menu" });
        const exportBtn = el("button", { className: "main", type: "button", textContent: "Export ▾" });
        const revealBtn = el("button", { className: "plain", type: "button", textContent: "Reveal the keys on this page" });
        const body = el("div", { id: "body" }, status, exportBtn, menu, revealBtn, el("small", { textContent: `FanaticalGrabber v${chrome.runtime.getManifest().version} · Humble keys (beta)` }));
        const head = el("div", { id: "head", textContent: "FanaticalGrabber" });
        head.addEventListener("click", () => { body.classList.toggle("open"); if (body.classList.contains("open")) say(`${collect().length} key${collect().length === 1 ? "" : "s"} showing`); });
        exportBtn.addEventListener("click", () => menu.classList.toggle("open"));

        async function exportAs(id) {
            menu.classList.remove("open");
            const rows = collect();
            if (!rows.length) return say("No keys are showing. Reveal them first.");
            remember(rows);
            const name = L.fileName(opts.fileName.replace(/FanaticalGrabber/g, "FanaticalGrabber_Humble"), { count: rows.length });
            if (id === "clipboard") { try { await navigator.clipboard.writeText(L.clipboardText(rows, opts.clipboardFormat)); say(`Copied ${rows.length} keys`); } catch { say("The browser blocked the clipboard"); } return; }
            if (id === "xlsx") { download(new Blob([L.xlsxExport(rows, {})], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${name}.xlsx`); return say(`Exported ${rows.length} keys`); }
            const f = L.FORMATS.find(x => x.id === id);
            download(new Blob([L.buildExport(id, rows, { version: chrome.runtime.getManifest().version, store: "Humble" })], { type: `${f.mime};charset=utf-8` }), `${name}.${f.ext}`);
            say(`Exported ${rows.length} keys`);
        }
        for (const [id, label] of [...L.FORMATS.map(f => [f.id, f.label]), ["xlsx", "Excel (.xlsx)"], ["clipboard", "Copy to clipboard"]]) {
            const b = el("button", { type: "button", textContent: label }); b.addEventListener("click", () => exportAs(id)); menu.append(b);
        }

        let busy = false;
        revealBtn.addEventListener("click", async () => {
            if (busy) return;
            const todo = boxes().filter(canReveal);
            if (!todo.length) return say("Nothing left to reveal on this page.");
            if (!window.confirm(`Reveal ${todo.length} key${todo.length === 1 ? "" : "s"} on this page?\n\nOn Humble this can't be undone: a revealed key can no longer be given away as a gift.`)) return say("Cancelled");
            busy = true; revealBtn.disabled = true;
            try {
                let done = 0;
                for (const box of todo) {
                    say(`Revealing ${++done} of ${todo.length}…`);
                    box.click();
                    for (let i = 0; i < 40 && !isRevealed(box); i++) await sleep(150); // up to six seconds each
                    await sleep(Math.max(400, opts.revealDelayMs));
                }
                const rows = collect(); remember(rows);
                say(`${rows.length} key${rows.length === 1 ? "" : "s"} showing`);
            } finally { busy = false; revealBtn.disabled = false; }
        });
        root.append(el("style", { textContent: CSS }), head, body);
        document.body.appendChild(host);
    }
    let timer = null;
    new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(build, 400); }).observe(document.body, { childList: true, subtree: true });
    build();
})();
