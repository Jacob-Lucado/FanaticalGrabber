// Toolbar popup: the link status with the Steam Value Checker bot, and what is new since you last looked.
(() => {
    "use strict";
    const SVC = "https://steamvaluechecker.com";
    const ask = m => new Promise(r => { try { chrome.runtime.sendMessage(m, x => r(chrome.runtime.lastError ? null : x)); } catch { r(null); } });
    const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); for (const k of kids.flat()) if (k) n.append(k); return n; };
    const open = url => { chrome.tabs.create({ url }); window.close(); };
    document.getElementById("ver").textContent = "v" + chrome.runtime.getManifest().version;
    for (const a of document.querySelectorAll("a[data-go]")) a.addEventListener("click", e => { e.preventDefault(); open(SVC + a.dataset.go); });
    for (const a of document.querySelectorAll("a[data-steam]")) a.addEventListener("click", e => { e.preventDefault(); open("https://store.steampowered.com" + a.dataset.steam); });

    const FEATURES = ["Prices, your library and wishlist on Steam store pages", "Playtest and demo badges", "How many people in your server own a game", "One-click wishlist and stream spotlight", "This count of new free games and alerts"];
    function linkBox(bad) {
        return el("div", { className: "box" + (bad ? " bad" : "") },
            el("b", { textContent: bad ? "Your link stopped working." : "Link with the Steam Value Checker bot." }),
            el("div", { textContent: bad ? " Link again to switch these back on:" : " Most of this extension needs it. Without the link you only get key reveal and redeem. Linking switches on:" }),
            el("ul", {}, FEATURES.map(f => el("li", { textContent: f }))),
            el("div", { textContent: "You need to sign in with Discord on the dashboard first, with the bot in one of your servers. Only game names are sent, never keys." }),
            el("button", { className: "btn", type: "button", textContent: "Link now", onclick: () => open(SVC + "/#/library") }));
    }
    const row = (label, n, newN, path) => el("a", { className: "row", href: "#", onclick: e => { e.preventDefault(); open(SVC + path); } }, el("div", {}, label, el("br"), el("span", { textContent: newN ? `${newN} new` : "Nothing new" })), el("div", { className: "pill" + (n ? "" : " none"), textContent: String(n) }));

    (async () => {
        const main = document.getElementById("main");
        await ask({ type: "badge-refresh" });
        const b = await ask({ type: "badge-status" });
        if (!b || b.state === "no_code") return main.replaceChildren(linkBox(false));
        if (b.state === "bad_code") return main.replaceChildren(linkBox(true));
        if (b.state !== "ok") return main.replaceChildren(el("p", { className: "muted", textContent: "Could not reach the bot just now. Try again in a minute." }));
        main.replaceChildren(row("Free games right now", b.free.length, b.newFree, "/#/free"), row("Playtests and demos", b.playtests.length, b.newTests, "/#/playtests"), row("Unread alerts", b.unread, b.unread, "/#/notifications"));
        ask({ type: "badge-seen" });
        main.append(...tools(b));
    })();

    // ----- the things you press a button for -----
    const money = (n, cur) => { try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur || "USD" }).format(n); } catch { return String(n); } };
    const section = (title, ...kids) => el("div", { className: "sec" }, el("h5", { textContent: title }), ...kids);
    const say = (box, text, bad) => { box.textContent = text; box.className = "note" + (bad ? " bad" : ""); };
    function tools(b) {
        const out = [];
        // Sale helper: wishlist games on sale right now.
        if (b.hits?.length) out.push(section("On sale from your wishlist", ...b.hits.map(h => el("a", { className: "deal", href: "#", onclick: e => { e.preventDefault(); open(h.appid ? `https://store.steampowered.com/app/${h.appid}` : SVC + "/#/wishlist"); } }, el("span", { textContent: h.title }), el("b", { textContent: `${money(h.price, h.currency)} \u00b7 -${h.cut}%` })))));
        // Free Steam games to keep: one press adds them to the signed-in account.
        if (b.claimable?.length) {
            const note = el("div", { className: "note" });
            const btn = el("button", { className: "btn small", type: "button", textContent: `Add ${b.claimable.length} free game${b.claimable.length === 1 ? "" : "s"} to my Steam account`, onclick: async () => {
                btn.disabled = true; let got = 0, had = 0, failed = 0;
                for (const g of b.claimable) { say(note, `Adding ${g.title}\u2026`); const r = await ask({ type: "claim-free", appid: g.appid }); if (r?.status === "claimed") got++; else if (r?.status === "owned") had++; else if (r?.status === "not_logged_in") { say(note, "Sign in to Steam in this browser first.", true); btn.disabled = false; return; } else failed++; await new Promise(r => setTimeout(r, 1500)); }
                say(note, `Added ${got}${had ? `, ${had} already yours` : ""}${failed ? `, ${failed} didn't work (open its Steam page to claim it)` : ""}.`, failed && !got);
            } });
            out.push(section("Free to keep on Steam", el("div", { className: "muted", textContent: b.claimable.map(g => g.title).join(", ") }), btn, note));
        }
        // Optional automatic claiming, off until switched on.
        const auto = el("input", { type: "checkbox" }), autoNote = el("div", { className: "note" });
        chrome.storage.local.get(["autoClaim", "autoClaimed"]).then(v => { auto.checked = Boolean(v.autoClaim); if (v.autoClaimed?.titles?.length) say(autoNote, `Last added: ${v.autoClaimed.titles.join(", ")}`); });
        auto.addEventListener("change", () => chrome.storage.local.set({ autoClaim: auto.checked }));
        out.push(section("Automatic claiming", el("label", { className: "check" }, auto, " Add new free Steam games to my account automatically"), el("div", { className: "muted", textContent: "Checks every half hour while you're signed in to Steam in this browser. Free weekends are never added." }), autoNote));
        // Library sync.
        const syncNote = el("div", { className: "note" });
        const sync = el("button", { className: "btn small gray", type: "button", textContent: "Sync my Steam library", onclick: async () => {
            sync.disabled = true; say(syncNote, "Reading your library\u2026"); const r = await ask({ type: "sync-library" }); sync.disabled = false;
            say(syncNote, r?.status === "ok" ? `Done. ${r.added} new game${r.added === 1 ? "" : "s"} added (${r.total} on your account).` : r?.status === "not_logged_in" ? "Sign in to Steam in this browser first." : r?.status === "bad_code" ? "Your link stopped working. Link again." : "That didn't work. Try again in a minute.", r?.status !== "ok");
        } });
        out.push(section("Library", sync, syncNote));
        // Spare keys and the gift board.
        const spareBox = el("div", {}), giftBox = el("div", {});
        const drawGifts = async () => {
            const r = await ask({ type: "gifts", action: "list" });
            if (r?.status !== "ok") return giftBox.replaceChildren(el("div", { className: "muted", textContent: "Couldn't load the board." }));
            if (r.noServer) return giftBox.replaceChildren(el("div", { className: "muted", textContent: "Join a server with the bot to use the board." }));
            giftBox.replaceChildren(...(r.gifts.length ? r.gifts.map(g => el("div", { className: "deal" }, el("span", { textContent: g.title + (g.mine ? "" : ` \u00b7 ${g.from}`) }),
                g.mine ? el("button", { className: "tiny", type: "button", textContent: g.claimed ? `${g.claimedBy} claimed it` : "Remove", disabled: g.claimed && false, onclick: async () => { await ask({ type: "gifts", action: "withdraw", id: g.id }); drawGifts(); } })
                    : g.claimedByMe ? el("b", { textContent: "Yours \u2014 message them" }) : el("button", { className: "tiny", type: "button", textContent: "Claim", onclick: async () => { await ask({ type: "gifts", action: "claim", id: g.id }); drawGifts(); } }))) : [el("div", { className: "muted", textContent: "No spare copies listed in your server yet." })]));
        };
        const find = el("button", { className: "btn small gray", type: "button", textContent: "Find my spare keys", onclick: async () => {
            find.disabled = true; spareBox.replaceChildren(el("div", { className: "muted", textContent: "Checking your vault against your library\u2026" }));
            const r = await ask({ type: "spare-keys" }); find.disabled = false;
            if (r?.status !== "ok") return spareBox.replaceChildren(el("div", { className: "note bad", textContent: r?.message || "Couldn't check right now." }));
            if (!r.spares.length) return spareBox.replaceChildren(el("div", { className: "muted", textContent: r.checked ? "No spares. You don't own any game you have an unused key for." : "Your key vault is empty." }));
            spareBox.replaceChildren(el("div", { className: "muted", textContent: "You already own these, so the keys are spare. Only the game name is shared, never the key." }), ...r.spares.map(sp => el("div", { className: "deal" }, el("span", { textContent: sp.title }), el("button", { className: "tiny", type: "button", textContent: "Offer to my server", onclick: async e => { e.target.disabled = true; const x = await ask({ type: "gifts", action: "offer", title: sp.title }); e.target.textContent = x?.status === "ok" ? "Listed" : (x?.message || "Failed"); drawGifts(); } }))));
        } });
        out.push(section("Spare keys and gifts", find, spareBox, el("h5", { className: "sub", textContent: "Spare copies in your server" }), giftBox));
        drawGifts();
        return out;
    }
})();
