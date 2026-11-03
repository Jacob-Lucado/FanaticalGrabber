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
    })();
})();
