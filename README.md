# Cursor Dashboard Usage Viewer

## What is this

Adds a **Usage Balance** card on the official [Cursor](https://cursor.com) usage page (`/dashboard/usage`), surfacing data from `/api/usage-summary` that the page does not fully display: Plan Included, API/Auto/Total breakdown, Personal / Team On-Demand, and more.

**Not an official Cursor project.** It only injects content locally in the browser and does not modify the Cursor client.

## Installation

### 1. Install Tampermonkey

- Chrome: [Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
- Edge: [Tampermonkey](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)
- Firefox: [Tampermonkey](https://addons.mozilla.org/firefox/addon/tampermonkey/)

### 2. Install the script

Choose one method:

**Option A: Install from URL (recommended)**

1. Make sure Tampermonkey is installed.
2. Open the script URL:  
   https://github.com/zhujunsan/cursor-dashboard-usage-viewer/raw/main/cursor-dashboard-usage-viewer.user.js  
3. Tampermonkey will prompt you to install — confirm to proceed.

If `raw.githubusercontent.com` fails to load in your browser, use the `github.com/.../raw/...` link above instead. Mirror:  
https://cdn.jsdelivr.net/gh/zhujunsan/cursor-dashboard-usage-viewer@main/cursor-dashboard-usage-viewer.user.js

**Option B: Install from the repository file**

1. Download `cursor-dashboard-usage-viewer.user.js` from this repository.
2. Tampermonkey → Dashboard → Utilities → drag and drop the file to import.

After installation, the script should appear as **Cursor Dashboard Usage Viewer** and be enabled.

## Usage

1. Sign in to Cursor and open https://cursor.com/dashboard/usage
2. A **Usage Balance** card should appear above the **Included Usage** card
3. Click **Refresh** to fetch the latest data

### What success looks like

| Area | Content |
|------|---------|
| Title | Usage Balance + Refresh |
| Subtitle | Account type, limit type, billing period |
| Table | Plan Included, API/Auto/Total, On-Demand, etc. |

### If the card does not appear

1. Hard refresh: `Cmd+Shift+R` / `Ctrl+Shift+R`
2. Confirm Tampermonkey is enabled on `cursor.com`
3. In the Console, search for `[Cursor Dashboard Usage Viewer]` — you should see a `script loaded v…` log
4. Enterprise accounts require a `team_id` cookie

## Updates

The script is configured with `@updateURL` / `@downloadURL` (using `github.com/.../raw/...`, not `raw.githubusercontent.com`, for better accessibility). Tampermonkey will periodically check for new versions; you can also manually check for updates in the dashboard.

## Files

| File | Description |
|------|-------------|
| `cursor-dashboard-usage-viewer.user.js` | Tampermonkey userscript |

## License

[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
