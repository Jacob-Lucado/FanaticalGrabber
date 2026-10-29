// Steam purchase history -> what you paid. Runs only on store.steampowered.com/account/history.
// Reads the rows already on the page (your own, in your own browser) and sends game titles with the price paid
// to your Steam Value Checker library, so nobody has to type prices by hand. Nothing else leaves the page.
(() => {
    "use strict";
    if (!/^\/account\/history/.test(location.pathname) || window.__svcHistory) return;
    window.__svcHistory = true;

    // "$14.99", "14,99€", "R$ 1.299,00", "¥1,200" -> number. Null when there is no price (free items, wallet credit).
    function parsePrice(text) {
        const m = String(text ?? "").replace(/\s/g, "").match(/\d[\d.,]*/);
        if (!m) return null;
        let s = m[0].replace(/[.,]$/, "");
        const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
        const sep = Math.max(lastDot, lastComma);
        // The last separator is the decimal point only when one or two digits follow it ("14,99"), otherwise it groups thousands ("1,200").
        if (sep >= 0 && s.length - sep - 1 <= 2) s = s.slice(0, sep).replace(/[.,]/g, "") + "." + s.slice(sep + 1);
        else s = s.replace(/[.,]/g, "");
        const n = Number(s);
        return Number.isFinite(n) ? n : null;
    }

    const norm = t => String(t ?? "").replace(/\s+/g, " ").trim();
    const key = t => norm(t).toLowerCase();

    /**
     * rows: [{ type, items: [title], total }] straight off the page.
     * Only a single-game "Purchase" has an exact price, so those are the ones used. Carts, bundles and gifts are skipped,
     * and a game that was refunded is left out.
     */
    function pricesFrom(rows) {
        const refunded = new Set();
        for (const r of rows) if (/refund/i.test(r.type)) r.items.forEach(t => refunded.add(key(t)));
        const out = new Map();
        let skipped = 0;
        for (const r of rows) {
            // Game purchases and gift purchases count. Market, in-game, wallet, subscription and refund rows are ignored.
            if (!/purchase/i.test(r.type) || /market|in-?game|wallet|subscription|refund/i.test(r.type)) continue;
            const price = parsePrice(r.total);
            if (price === null || price <= 0) continue;
            if (r.items.length !== 1) { skipped++; continue; }
            const title = norm(r.items[0]);
            if (!title || refunded.has(key(title))) continue;
            if (!out.has(key(title))) out.set(key(title), { title, paid: price });
        }
        return { entries: [...out.values()], skipped };
    }

    function readRows(root = document) {
        return [...root.querySelectorAll(".wallet_table_row")].map(row => {
            const cell = s => row.querySelector(s);
            const itemsEl = cell(".wht_items");
            const items = itemsEl ? [...itemsEl.children].map(c => norm(c.textContent)).filter(Boolean) : [];
            if (itemsEl && !items.length && norm(itemsEl.textContent)) items.push(norm(itemsEl.textContent));
            return { type: norm(cell(".wht_type")?.textContent), items, total: norm(cell(".wht_total")?.textContent) };
        });
    }

    window.__svcHistoryParse = { parsePrice, pricesFrom, readRows };

    // ---------- the button ----------
    const host = document.createElement("div");
    host.style.cssText = "display:block;margin:0 0 16px";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>
      .box{font:13px/1.4 system-ui,sans-serif;background:#162134;color:#cdd9e8;border:1px solid #2f4a6d;border-radius:12px;padding:12px 14px;max-width:420px;box-shadow:0 8px 28px #0006}
      b{color:#fff;display:block;margin-bottom:4px} p{margin:4px 0 10px;color:#8396ad;font-size:12px}
      button{font:inherit;font-weight:600;background:#4da3ff;color:#06121f;border:0;border-radius:999px;padding:7px 14px;cursor:pointer;width:100%}
      button:disabled{opacity:.6;cursor:default} .s{margin-top:8px;color:#cdd9e8;font-size:12px;white-space:pre-line;max-height:240px;overflow:auto}
    </style><div class="box"><b>Steam Value Checker</b><p>Fill in what you paid for your games from this page. Only titles and prices are sent.</p><button>Send what I paid</button><div class="s" aria-live="polite"></div></div>`;
    // Sit at the top of the history list, in the page itself, so it never covers another floating button (like batch redeem).
    // Steam draws the list as a table, so climb out of any table parts first: a box inside the table becomes a squashed column.
    const firstRow = document.querySelector(".wallet_table_row") || document.querySelector(".wallet_table");
    let anchor = firstRow?.closest("table") || null;
    if (!anchor && firstRow) {
        anchor = firstRow;
        while (anchor.parentElement && anchor.parentElement !== document.body && /^(table|inline-table)/.test(getComputedStyle(anchor.parentElement).display)) anchor = anchor.parentElement;
    }
    if (anchor?.parentElement) anchor.parentElement.insertBefore(host, anchor);
    else { host.style.cssText = "position:fixed;left:16px;bottom:16px;z-index:2147483000"; document.documentElement.appendChild(host); }
    const btn = root.querySelector("button"), status = root.querySelector(".s");
    const say = t => { status.textContent = t; };
    const wait = ms => new Promise(r => setTimeout(r, ms));

    async function loadAll() {
        for (let i = 0; i < 200; i++) {
            const more = document.querySelector("#load_more_button") || [...document.querySelectorAll("a,button")].find(e => /load more/i.test(e.textContent) && e.offsetParent !== null);
            if (!more || more.offsetParent === null || getComputedStyle(more).display === "none") return;
            const before = document.querySelectorAll(".wallet_table_row").length;
            more.click();
            for (let t = 0; t < 40 && document.querySelectorAll(".wallet_table_row").length === before; t++) await wait(250);
            if (document.querySelectorAll(".wallet_table_row").length === before) return;
            say(`Loading your history… ${document.querySelectorAll(".wallet_table_row").length} rows`);
        }
    }

    // Press "Load more transactions" over and over as soon as the page opens, so every purchase is on the page.
    let loaded = false;
    btn.disabled = true; btn.textContent = "Loading your history…";
    (async () => {
        try { say("Loading your whole history…"); await loadAll(); }
        catch { /* the button still works with what is loaded */ }
        loaded = true; btn.disabled = false; btn.textContent = "Send what I paid";
        const n = pricesFrom(readRows()).entries.length;
        say(n ? `Loaded ${document.querySelectorAll(".wallet_table_row").length} rows. ${n} games with a price found.` : "Nothing with a price found on this page yet.");
    })();

    btn.addEventListener("click", async () => {
        if (!loaded) return;
        btn.disabled = true;
        try {
            let { svcToken } = await chrome.storage.local.get("svcToken");
            if (!svcToken) {
                svcToken = (window.prompt("Paste your Steam Value Checker link code.\nGet one in Discord with /library grabber.") || "").trim();
                if (!svcToken) { say("Cancelled."); return; }
            }
            await loadAll(); // in case more rows appeared
            const { entries, skipped } = pricesFrom(readRows());
            if (!entries.length) { say("No single-game purchases with a price found on this page."); return; }
            // The bot allows one send every ten seconds, so a long history goes in batches.
            const BATCH = 400, total = { filled: 0, added: 0, missing: [], unpriced: 0, unpricedTitles: [] };
            let last = null;
            for (let i = 0; i < entries.length; i += BATCH) {
                if (i) { for (let s = 11; s > 0; s--) { say(`Sent ${i} of ${entries.length}. Next batch in ${s}s…`); await wait(1000); } }
                const part = entries.slice(i, i + BATCH);
                say(`Sending ${Math.min(i + BATCH, entries.length)} of ${entries.length} games…`);
                const r = await chrome.runtime.sendMessage({ type: "send-to-checker", mode: "prices", token: svcToken, titles: part.map(e => e.title), paid: part.map(e => e.paid) });
                if (r?.status !== "sent") {
                    if (r?.status === "bad_code") await chrome.storage.local.remove("svcToken");
                    say(r?.message || "Could not send."); return;
                }
                last = r;
                total.filled += r.updated; total.added += r.added; total.missing.push(...r.missing);
                total.unpriced = r.unpriced; total.unpricedTitles = r.unpricedTitles;
            }
            await chrome.storage.local.set({ svcToken });
            const list = (title, arr, n) => arr.length ? `\n\n${title}\n• ${arr.slice(0, 15).join("\n• ")}${n > 15 ? `\n…and ${n - 15} more` : ""}` : "";
            const lines = [`Done: prices filled in for ${total.filled} game${total.filled === 1 ? "" : "s"}${total.added ? `, ${total.added} added to your library` : ""}.`];
            if (skipped) lines.push(`${skipped} cart or bundle purchase${skipped === 1 ? "" : "s"} skipped (Steam shows one total for several games).`);
            if (total.missing.length) lines.push(`${total.missing.length} not in your library: they were not synced, or the name differs.`);
            if (total.unpriced) lines.push(`${total.unpriced} synced game${total.unpriced === 1 ? "" : "s"} still have no price (free, a cart or key purchase, or not in this history).`);
            say(lines.join(" ") + list("Not found in your library:", total.missing, total.missing.length) + list("Still without a price:", total.unpricedTitles, total.unpriced));
        } catch (e) { say("Something went wrong: " + e.message); }
        finally { btn.disabled = false; }
    });
})();
