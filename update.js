// Update reminder. Shared by the Fanatical and Steam panels: asks the background script whether a newer version exists
// and, if so, shows a small notice with a button. "Later" hides it for three days.
(() => {
    const send = m => new Promise(r => { try { chrome.runtime.sendMessage(m, x => r(chrome.runtime.lastError ? null : x)); } catch { r(null); } });
    window.fgUpdateNotice = async parent => {
        const r = await send({ type: "update-status" });
        if (!r || !r.outdated || r.snoozed || !parent) return;
        const box = document.createElement("div");
        box.setAttribute("role", "status");
        box.style.cssText = "background:#2b2410;border:1px solid #f2b84b;color:#ffe9b3;border-radius:8px;padding:8px 10px;margin:8px 0;font:12px/1.4 system-ui,sans-serif;display:flex;flex-wrap:wrap;gap:6px;align-items:center";
        const text = document.createElement("span");
        text.style.flex = "1 1 100%";
        text.textContent = r.ready ? `FanaticalGrabber ${r.latest} is downloaded. Restart the extension to finish updating.` : `FanaticalGrabber ${r.latest} is available (you have ${r.current}).`;
        const btn = (label, fn, primary) => {
            const b = document.createElement("button");
            b.type = "button"; b.textContent = label;
            b.style.cssText = `cursor:pointer;border:0;border-radius:6px;padding:4px 10px;font:600 12px system-ui,sans-serif;${primary ? "background:#f2b84b;color:#231a00" : "background:#4a4326;color:#ffe9b3"}`;
            b.addEventListener("click", fn);
            return b;
        };
        box.append(text,
            btn(r.ready ? "Restart to update" : "Get the update", () => { if (r.ready) send({ type: "update-apply" }); else window.open(r.url, "_blank", "noopener,noreferrer"); }, true),
            btn("Later", () => { send({ type: "update-snooze" }); box.remove(); }, false));
        parent.prepend(box);
    };
})();
