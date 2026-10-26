// Service worker: talks to Steam on behalf of the content script.
// Requests run from here (not the Fanatical page) so Steam's cookies are sent and CORS doesn't apply.
const STEAM = "https://store.steampowered.com";

// purchase_result_details -> [our status, message]
const DETAIL_MAP = {
    9:  ["owned",        "You already own this product"],
    13: ["region",       "Key is restricted to another country"],
    19: ["region",       "Region not supported"],
    14: ["invalid",      "Invalid key"],
    15: ["used",         "Key already redeemed"],
    24: ["needs_base",   "Requires a base game you don't own"],
    53: ["rate_limited", "Too many attempts, Steam is rate limiting you"],
    54: ["owned",        "You already own an excluded/conflicting product"]
};

// Read the sessionid straight from the cookie jar (no page scraping needed)
async function getSessionId() {
    try {
        const cookie = await chrome.cookies.get({ url: STEAM, name: "sessionid" });
        if (cookie?.value) return cookie.value;
    } catch (err) {
        console.warn("[FanaticalGrabber] cookies.get failed:", err);
    }

    // Fallback: scrape it from the redeem page
    const res = await fetch(`${STEAM}/account/registerkey`, { credentials: "include" });
    const html = await res.text();
    const m = html.match(/g_sessionID\s*=\s*"([0-9a-f]+)"/i) ||
              html.match(/"sessionid"\s*:\s*"([0-9a-f]+)"/i);
    return m ? m[1] : null;
}

async function redeemKey(key) {
    const sessionId = await getSessionId();
    if (!sessionId) {
        return { status: "not_logged_in", message: "No Steam session cookie found - open store.steampowered.com and log in" };
    }

    const res = await fetch(`${STEAM}/account/ajaxregisterkey/`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body: new URLSearchParams({ product_key: key, sessionid: sessionId })
    });

    const text = await res.text();
    console.log("[FanaticalGrabber] Steam response", res.status, text.slice(0, 500));

    let data;
    try {
        data = JSON.parse(text);
    } catch {
        // HTML back instead of JSON usually means a login redirect
        return { status: "not_logged_in", message: `Steam returned a non-JSON page (HTTP ${res.status}) - likely not logged in` };
    }

    if (data.success === 1) {
        const game = data.purchase_receipt_info?.line_items?.[0]?.line_item_description || "";
        return { status: "redeemed", message: "Redeemed", game };
    }
    if (data.success === 21) {
        return { status: "not_logged_in", message: "Steam says you are not logged in" };
    }
    if (data.success === 84) {
        return { status: "rate_limited", message: "Too many attempts, Steam is rate limiting you" };
    }

    const [status, message] = DETAIL_MAP[data.purchase_result_details] ||
        ["error", `Steam error (result ${data.success}, detail ${data.purchase_result_details})`];
    return { status, message };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type !== "redeem-key") return;
    if (sender.id !== chrome.runtime.id) return; // only our own content script

    redeemKey(String(msg.key).trim())
        .then(sendResponse)
        .catch(err => sendResponse({ status: "error", message: err.message }));
    return true; // keep the channel open for the async response
});