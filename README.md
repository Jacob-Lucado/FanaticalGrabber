<div align="center">

# 🎮 FanaticalGrabber

**Reveal, export and redeem your Fanatical game keys from one panel.**

![Version](https://img.shields.io/badge/version-2.8.0-ff9800)
![Manifest](https://img.shields.io/badge/manifest-v3-107c41)
![Browsers](https://img.shields.io/badge/browsers-Chromium-66c0f4)
![Status](https://img.shields.io/badge/steam%20redeem-beta-orange)

[Website](https://jacob-lucado.github.io/FanaticalGrabber/) •
[Privacy Policy](https://jacob-lucado.github.io/FanaticalGrabber/privacy.html) •
[Install](#-installation) •
[FAQ](#-faq)

</div>

---

## 📖 About

FanaticalGrabber is a Chromium browser extension that adds a small panel to your Fanatical orders page. It helps you manage the game keys from your own purchases without clicking "Reveal Key" on every single game.

- Reveal every key in one click
- Export keys in seven different ways
- Redeem them on Steam (beta)
- Everything runs locally in your browser

> **Note:** This is an independent project. It is not affiliated with, endorsed by, or sponsored by Fanatical or Valve. Steam is a trademark of Valve Corporation.

---

## ✨ Features

### 🔓 Reveal All
Clicks every "Reveal Key" button on the page for you. Clicks are spaced out slightly so the site isn't flooded with requests, and the extension waits for the keys to appear before continuing.

### 📤 Export menu
A single **Export ▾** button opens a menu of formats. Any unrevealed keys are revealed first, so exports are always complete.

| Format | Extension | Notes |
| --- | --- | --- |
| Text | `.txt` | Readable report with title, date and totals |
| CSV | `.csv` | UTF-8 with BOM so Excel shows special characters correctly |
| JSON | `.json` | Includes export timestamp and key count |
| Markdown | `.md` | Table format, good for notes apps |
| HTML | `.html` | Standalone, printable page with a table |
| Excel | `.xlsx` | Uses the bundled SheetJS library |
| Clipboard | n/a | Copies `Game \| Key` lines, no file downloaded |

### 🎟️ Steam batch redeem panel (new in 2.4)
On Steam itself the extension becomes a batch redeem tool with a clean, modern panel. On **store.steampowered.com/account/registerkey** it sits right under the form, and on every other Steam store page it is a pulsing **Batch Redeem** bar (click it to open). Both panels can be dragged anywhere by their bar or header, and remember where you put them.
- Paste keys (any text, they are picked out for you) or open a `.txt` file, check the login banner, and press **Redeem all**
- **Queue for the Steam batch redeem** in the Fanatical export menu hands your revealed keys to this panel through the extension's own storage, so keys never go to any server
- Optional **Skip games I already own**, matched by exact title for keys that came from Fanatical
- Live progress, a per-key result list and a CSV report; stops on a Steam login problem or rate limit
- **Price overlay** on Steam game pages: paste your Steam Value Checker link code in the panel and a card shows your best price, the all-time low and whether you own or wishlisted the game. Only the app number is sent.

### 🧩 New in 2.5
- **Bundle check:** on a Steam bundle or package page it shows how many of the games you already own, the price per new game, and (with your link code) whether buying separately is cheaper.
- **Checkout guard:** on the Steam cart it warns about games you already own and points out ones that are clearly cheaper at another store.
- **Key vault:** every Steam-format key you reveal on Fanatical is remembered locally until it is redeemed. The dashboard's Batch redeem page lists them, prices them by title and loads them into the box. The Steam panel's Load button includes them too. Keys never leave your browser.

### 🛒 Fanatical bundle and cart check (2.6)
On a Fanatical bundle page or your cart, a small card at the bottom right compares what you would pay with Steam's own prices for the games you do not own yet. It says whether the deal is worth it, and ends with "You're seeing the best deals available" when you are well under Steam. If it cannot read the cart, find the games or get prices, the card says which step failed instead of staying blank. Works when you open the cart from inside Fanatical without reloading. Needs your link code for the price comparison; only game titles are sent.

### 🔔 Update reminder (2.8)
When a newer version is out, the Fanatical and Steam panels show a small notice with a **Get the update** button (or **Restart to update** once Chrome has downloaded it). **Later** hides it for three days. The extension only asks the Steam Value Checker site for the newest version number about every six hours; no sign-in, nothing about you is sent. Web Store installs also update by themselves.

### 🔗 One-click connect (2.7)
Sign in on the [Steam Value Checker](https://steamvaluechecker.fly.dev/) dashboard (with Steam or Discord), open **Library** and press **Connect the extension**. The dashboard hands the extension its link code directly, so there is nothing to copy or paste. The code stays in the extension's own storage and is only sent to that dashboard.

### 🔑 Batch redeem from the Steam Value Checker dashboard
With the extension installed (2.3+), the dashboard's **Batch redeem** page (Games menu) can redeem pasted or uploaded Steam keys using your signed-in Steam session. Log into store.steampowered.com first. Keys go page -> extension -> Steam and never reach the dashboard's server.

### 💰 Fill in what you paid (Steam purchase history)
Open [your Steam purchase history](https://store.steampowered.com/account/history) and press **Send what I paid**. The extension loads your history, reads each single-game purchase and its price, and fills in the price on games already in your Steam Value Checker library (a Steam sync's games are matched, never duplicated), then lists any it could not match and any synced games still without a price (same link code). Game and gift purchases are read; market, in-game, wallet and refunded items are ignored; cart and bundle purchases are skipped because Steam shows one total for several games.

### 🔑 Retail prices for key activations (Steam licenses)
Open [your Steam licenses](https://store.steampowered.com/account/licenses/) and press **Record retail prices for my keys and gifts**. Gifted games are recorded at retail, marked Gifted (a tooltip in the Paid column) and left out of your spend and savings. Key activations have no price on Steam, so the bot records each game's retail price instead (only for games already in your library, and never over a price you already have). Only titles are sent.

### 📤 Send to Steam Value Checker
One click sends your game titles (**never your keys**) to your library in the [Steam Value Checker](https://steamvaluechecker.fly.dev/) Discord bot, with what you paid for the order. Get a link code once with `/library grabber` in Discord and paste it into the panel. The order total is split evenly across the games on the page, since Fanatical shows one total per order.

### 🎟️ Redeem on Steam (Beta)
Redeems your **already revealed** keys on the Steam account you're logged into.

- Only redeems keys that are already revealed. It never reveals keys on its own
- Skips keys that aren't in Steam's `XXXXX-XXXXX-XXXXX` format
- Remembers keys that were redeemed, already owned, already used, or invalid, and skips them on later runs
- Waits 3 seconds between keys
- **Stop** button to cancel a run
- Stops automatically if you're logged out or Steam rate-limits you
- Downloads a CSV report with the result for every key

> ⚠️ **Beta:** this feature calls Steam's own redeem endpoint, which is not an official API. It can stop working if Steam changes it. Try one or two keys first.

### 🧰 Other details
- Live status panel that shows progress and the reason when something fails
- Smarter game title detection
- Collapsible panel that stays out of the way
- No servers, analytics or advertising

---

## 📥 Installation

FanaticalGrabber works on Chromium-based browsers: **Chrome, Edge, Brave, Opera, Vivaldi, Arc**. Firefox and Safari are not supported.

### Chrome Web Store (easiest)
**[Add FanaticalGrabber from the Chrome Web Store](https://chromewebstore.google.com/detail/fanaticalgrabber/kmbpdeglijkfbkifilcckkeljagcdbnb)**. It updates by itself. Brave, Opera and Vivaldi can install from the Web Store too; Edge asks you to allow extensions from other stores first.

### Manual install (.zip)
The **Download ZIP** from this repository is always the latest version. The Web Store copy updates after each review, so the ZIP can be a little ahead. It is installed as an unpacked extension:

1. **Download** the project: click **Code → Download ZIP** at the top of this repository, then extract it to a folder you'll keep.
2. Open your browser's extensions page:

   | Browser | Address |
   | --- | --- |
   | Chrome | `chrome://extensions` |
   | Edge | `edge://extensions` |
   | Brave | `brave://extensions` |
   | Opera | `opera://extensions` |
   | Vivaldi | `vivaldi://extensions` |

3. Turn on **Developer mode** (top right, or the sidebar on Edge).
4. Click **Load unpacked** and select the folder that **directly contains** `manifest.json`.
5. Open your Fanatical orders page and click the orange **🎮 FanaticalGrabber** bar in the bottom right.

> Keep the folder somewhere permanent. If you move or delete it, the extension stops working.

### 🔄 Updating
Web Store installs update by themselves. For the ZIP:

1. Replace the old files with the new ones, overwriting everything.
2. On your extensions page, click **Reload** on FanaticalGrabber.
3. Hard-refresh the Fanatical tab with `Ctrl + Shift + R`.

The panel footer shows the installed version. Note that this number comes from `manifest.json`, so make sure **all** files were replaced, not only the manifest.

---

## ▶️ Usage

1. Log into **fanatical.com** and open the page that lists your keys.
2. Click the orange **FanaticalGrabber** bar to expand the panel.
3. Choose an action:

| Button | What it does |
| --- | --- |
| **Export ▾** | Reveals all keys, then exports in the format you pick |
| **Reveal All** | Reveals every key on the page |
| **Redeem on Steam (Beta)** | Redeems the keys that are currently revealed |
| **Stop** | Appears during a redeem run and cancels it after the current key |

### Redeeming on Steam
1. Log into [store.steampowered.com](https://store.steampowered.com) **in the same browser profile**. The Steam desktop app does not count.
2. On Fanatical, use **Reveal All** (or reveal individual keys).
3. Click **Redeem on Steam (Beta)** and confirm the dialog, which shows how many keys will be redeemed.
4. When the run finishes, a CSV report downloads with the status and message for each key.

Possible statuses in the report:

| Status | Meaning |
| --- | --- |
| `redeemed` | Added to your Steam library |
| `owned` | You already own the product |
| `used` | The key was already redeemed |
| `invalid` | Steam doesn't recognize the key |
| `region` | The key is locked to another region |
| `needs_base` | Requires a base game you don't own |
| `rate_limited` | Steam is throttling you, wait before retrying |
| `not_logged_in` | No valid Steam session found |
| `error` | Something unexpected, see the message column |

`redeemed`, `owned`, `used` and `invalid` are remembered and not retried. Everything else is retried on the next run.

---

## 🔐 Permissions & privacy

| Permission | Why it's needed |
| --- | --- |
| `clipboardWrite` | Copy keys when you choose "Copy to clipboard" |
| `storage` | Remember which keys were already redeemed (stored locally) |
| `cookies` | Read your Steam `sessionid` to redeem keys on your account |
| `https://store.steampowered.com/*` | Send redeem requests to Steam, show the batch redeem panel and read which games your account owns |
| `https://www.fanatical.com/*`, `https://fanatical.com/*` | Run on Fanatical pages to reveal and read keys |

**Privacy summary**
- Keys and titles are read from the page you have open and used only for the actions you trigger.
- Keys are sent to Steam **only** when you click Redeem.
- The redeemed-key history stays in your browser's local extension storage.
- No data is sent to the developer or any third party. There are no servers, analytics or ads.

Full details: **[Privacy Policy](https://jacob-lucado.github.io/FanaticalGrabber/privacy.html)**

---

## ❓ FAQ

<details>
<summary><b>Does it send my keys anywhere?</b></summary>

No. Reading, exporting and copying all happen in your browser. Keys go to Steam only when you click Redeem.
</details>

<details>
<summary><b>Does Redeem work for non-Steam keys?</b></summary>

No. It only handles keys in Steam's format and skips everything else. Exports include every key.
</details>

<details>
<summary><b>Redeem says I'm not logged in, but I am.</b></summary>

Log into `store.steampowered.com` in the same browser profile as the extension, then try again. If it still fails, open `chrome://extensions`, click the **service worker** link on the extension card, and check the console for the `[FanaticalGrabber] Steam response` line.
</details>

<details>
<summary><b>What happens if Steam rate-limits me?</b></summary>

The extension stops immediately. Wait about an hour before trying again, and redeem in smaller batches.
</details>

<details>
<summary><b>The Redeem button or a new feature is missing after updating.</b></summary>

You're probably running an older `content.js`. Overwrite all files, click **Reload** on the extensions page, and hard-refresh the Fanatical tab. The footer version only reflects `manifest.json`, so it can look right while `content.js` is outdated.
</details>

<details>
<summary><b>The panel doesn't show up.</b></summary>

It only appears on pages that contain "Reveal Key" buttons or already-revealed key fields. Reload the extension and refresh the page. If the extension card shows errors, click **Errors** and check that every file listed below is present.
</details>

<details>
<summary><b>Excel export says the library isn't loaded.</b></summary>

`xlsx.full.min.js` is missing from the extension folder. It must be bundled with the extension.
</details>

---

## 🗂️ Project structure

```
FanaticalGrabber/
├─ manifest.json        Extension manifest (MV3)
├─ content.js           Panel UI, reveal, export and redeem logic
├─ background.js        Service worker that talks to Steam
├─ xlsx.full.min.js     SheetJS, used for .xlsx export
├─ icon16.png
├─ icon48.png
├─ icon128.png
└─ docs/                Project website (GitHub Pages)
   ├─ index.html
   ├─ privacy.html
   └─ ...
```

### How it works
- **`content.js`** is injected into Fanatical pages. It builds the panel, clicks the reveal buttons, collects keys from the page, and creates exports.
- **`background.js`** is a Manifest V3 service worker. The content script messages it with a key, and it sends the request to Steam using your session so the cookies are included.
- **`chrome.storage.local`** holds the redeemed-key history so finished keys aren't submitted twice.

---

## 🛠️ Development

No build step is required.

1. Clone the repository.
2. Load the folder as an unpacked extension (see [Installation](#-installation)).
3. After editing a file, click **Reload** on the extension card and refresh the Fanatical tab.
4. To debug the Steam requests, open the extension's **service worker** console from the extensions page.

The selectors that read the Fanatical page (`input[aria-label="reveal-key"]`, `article`, and the "Reveal Key" button text) depend on Fanatical's markup. If the site changes, these are the first things to update, and they are defined at the top of `content.js`.

---

## 🗺️ Ideas & roadmap

- [ ] Language-independent reveal button detection
- [ ] Platform and order metadata columns in exports
- [ ] Selective export (choose specific games)
- [ ] Options page (clipboard behavior, delay, filename format)
- [ ] Shadow DOM for the panel to isolate styles
- [x] Chrome Web Store release

Have an idea? Open an [issue](../../issues) or message [@twit_user69](https://x.com/twit_user69).

---

## 🐛 Reporting problems

Please include:
- Your browser and version
- The extension version shown in the panel footer
- The status message from the panel, or the redeem CSV report
- Any errors from the extension card or the service worker console

Please **don't post real game keys** in public issues.

---

## ⚖️ Disclaimer

This tool automates actions on your own account for keys you have purchased. You are responsible for following the terms of service of Fanatical and Steam. Redeeming many keys quickly can trigger Steam's rate limits. The Steam redeem feature uses an undocumented endpoint and may break at any time. Use at your own risk.

---

## 📄 License

See the [LICENSE](LICENSE) file.

---

<div align="center">

Made by **[Jacob Lucado](https://x.com/twit_user69)** 💛

</div>
