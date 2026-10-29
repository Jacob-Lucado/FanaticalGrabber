// Steam licenses page -> retail prices for key activations. Runs only on store.steampowered.com/account/licenses.
// A key activation has no price on Steam, so the bot uses the game's retail (MSRP) price for it. Only titles are sent.
(() => {
    "use strict";
    if (!/^\/account\/licenses/.test(location.pathname) || window.__svcLicenses) return;
    window.__svcLicenses = true;

    const norm = t => String(t ?? "").replace(/\s+/g, " ").trim();

    /** Rows of the licenses table as { name, type }. The name is the first line of the product cell. */
    function readRows(root = document) {
        return [...root.querySelectorAll(".account_table tr, table.account_table tr")].map(tr => {
            const cells = [...tr.children];
            if (cells.length < 2) return null;
            const typeCell = tr.querySelector(".license_acquisition_col") || cells[cells.length - 1];
            const nameCell = tr.querySelector(".license_name_col") || cells[1];
            const firstLine = norm((nameCell.innerText ?? nameCell.textContent).split("\n").map(norm).find(Boolean));
            return { name: firstLine, type: norm(typeCell?.textContent) };
        }).filter(r => r && r.name);
    }

    /** Key activations only: "Retail" (a retail or store key). Complimentary, free, guest pass and gift licenses carry no retail value to record. */
    function keyTitles(rows) {
        const out = new Map();
        for (const r of rows) {
            if (!/retail|key/i.test(r.type) || /complimentary|free|guest|gift|beta|dev/i.test(r.type)) continue;
            const name = r.name.replace(/\s+-\s+(steam\s+)?(key|retail)\b.*$/i, "").trim();
            if (name && !out.has(name.toLowerCase())) out.set(name.toLowerCase(), name);
        }
        return [...out.values()];
    }

    window.__svcLicensesParse = { readRows, keyTitles };

    const host = document.createElement("div");
    host.style.cssText = "display:block;margin:0 0 16px";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>
      .box{font:13px/1.4 system-ui,sans-serif;background:#162134;color:#cdd9e8;border:1px solid #2f4a6d;border-radius:12px;padding:12px 14px;max-width:420px;box-shadow:0 8px 28px #0006}
      b{color:#fff;display:block;margin-bottom:4px} p{margin:4px 0 10px;color:#8396ad;font-size:12px}
      button{font:inherit;font-weight:600;background:#4da3ff;color:#06121f;border:0;border-radius:999px;padding:7px 14px;cursor:pointer;width:100%}
      button:disabled{opacity:.6;cursor:default} .s{margin-top:8px;color:#cdd9e8;font-size:12px;white-space:pre-line;max-height:240px;overflow:auto}
    </style><div class="box"><b>Steam Value Checker</b><p>Your key activations have no price on Steam. Record their retail price instead. Only titles are sent, and prices you already have are kept.</p><button>Record retail prices for my keys</button><div class="s" aria-live="polite"></div></div>`;
    const table = document.querySelector(".account_table")?.closest("table") || document.querySelector(".account_table");
    if (table?.parentElement) table.parentElement.insertBefore(host, table);
    else { host.style.cssText = "position:fixed;left:16px;bottom:16px;z-index:2147483000"; document.documentElement.appendChild(host); }
    const btn = root.querySelector("button"), status = root.querySelector(".s");
    const say = t => { status.textContent = t; };
    const wait = ms => new Promise(r => setTimeout(r, ms));
    say(`${keyTitles(readRows()).length} key activations found on this page.`);

    btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
            const titles = keyTitles(readRows());
            if (!titles.length) { say("No key activations found on this page."); return; }
            let { svcToken } = await chrome.storage.local.get("svcToken");
            if (!svcToken) {
                svcToken = (window.prompt("Paste your Steam Value Checker link code.\nGet one in Discord with /library grabber.") || "").trim();
                if (!svcToken) { say("Cancelled."); return; }
            }
            const BATCH = 400, total = { filled: 0, already: 0, missing: [], noRetail: [] };
            for (let i = 0; i < titles.length; i += BATCH) {
                if (i) { for (let s = 11; s > 0; s--) { say(`Sent ${i} of ${titles.length}. Next batch in ${s}s…`); await wait(1000); } }
                say(`Sending ${Math.min(i + BATCH, titles.length)} of ${titles.length}…`);
                const r = await chrome.runtime.sendMessage({ type: "send-to-checker", mode: "retail", token: svcToken, titles: titles.slice(i, i + BATCH), paid: [] });
                if (r?.status !== "sent") {
                    if (r?.status === "bad_code") await chrome.storage.local.remove("svcToken");
                    say(r?.message || "Could not send."); return;
                }
                total.filled += r.updated; total.already += r.alreadyPriced; total.missing.push(...r.missing); total.noRetail.push(...r.noRetail);
            }
            await chrome.storage.local.set({ svcToken });
            const list = (title, arr) => arr.length ? `\n\n${title}\n• ${arr.slice(0, 15).join("\n• ")}${arr.length > 15 ? `\n…and ${arr.length - 15} more` : ""}` : "";
            const lines = [`Done: retail price recorded for ${total.filled} game${total.filled === 1 ? "" : "s"}.`];
            if (total.already) lines.push(`${total.already} already had a price, so they were left alone.`);
            if (total.missing.length) lines.push(`${total.missing.length} are not in your library (not synced, or the name differs).`);
            if (total.noRetail.length) lines.push(`${total.noRetail.length} have no retail price available right now.`);
            say(lines.join(" ") + list("Not found in your library:", total.missing) + list("No retail price found:", total.noRetail));
        } catch (e) { say("Something went wrong: " + e.message); }
        finally { btn.disabled = false; }
    });
})();
