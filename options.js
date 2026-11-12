// The options page: file names, clipboard format, extra columns and the two delays. Saved in this browser's extension storage.
(async () => {
    const L = globalThis.FGLib;
    const $ = id => document.getElementById(id);
    const TEXT = ["fileName", "clipboardFormat", "revealLabel"], NUM = ["revealDelayMs", "redeemDelayMs"];
    const note = text => { $("note").textContent = text; if (text) setTimeout(() => { if ($("note").textContent === text) $("note").textContent = ""; }, 2500); };
    const show = o => { for (const k of [...TEXT, ...NUM]) $(k).value = o[k]; $("extraColumns").checked = o.extraColumns; };
    const read = () => L.cleanOptions({ ...Object.fromEntries(TEXT.map(k => [k, $(k).value])), ...Object.fromEntries(NUM.map(k => [k, $(k).value])), extraColumns: $("extraColumns").checked });

    show(L.cleanOptions((await chrome.storage.local.get("opts")).opts));
    $("save").addEventListener("click", async () => { const o = read(); await chrome.storage.local.set({ opts: o }); show(o); note("Saved."); });
    $("reset").addEventListener("click", async () => { await chrome.storage.local.remove("opts"); show(L.cleanOptions()); note("Back to the defaults."); });

    // The list behind "Include every order I've opened".
    async function ledgerInfo() {
        const n = Object.keys((await chrome.storage.local.get("ledger")).ledger ?? {}).length;
        $("ledgerInfo").textContent = n ? `The extension remembers ${n} revealed key${n === 1 ? "" : "s"} from the order pages you've opened, so one export can cover all of them. They never leave this browser.` : "No keys from other orders are remembered yet. Each order page you open and reveal is added, so one export can cover all of them.";
        $("forget").disabled = !n;
    }
    $("forget").addEventListener("click", async () => {
        if (!window.confirm("Forget every key remembered from your order pages? Your keys on Fanatical are not touched.")) return;
        await chrome.storage.local.remove("ledger"); ledgerInfo(); note("Forgotten.");
    });
    ledgerInfo();
})();
