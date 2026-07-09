# Cursor Dashboard Usage Viewer

## What is this

Adds a **Usage Balance** card on the official <a href="https://cursor.com" target="_blank" rel="noopener noreferrer">Cursor</a> usage page (`/dashboard/usage`), surfacing data from `/api/usage-summary` that the page does not fully display: Plan Included, API/Auto/Total breakdown, Personal / Team On-Demand, and more.

**Not an official Cursor project.** It only injects content locally in the browser and does not modify the Cursor client.

## Installation

### 1. Install Tampermonkey

- Chrome: <a href="https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo" target="_blank" rel="noopener noreferrer">Tampermonkey</a>
- Edge: <a href="https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd" target="_blank" rel="noopener noreferrer">Tampermonkey</a>
- Firefox: <a href="https://addons.mozilla.org/firefox/addon/tampermonkey/" target="_blank" rel="noopener noreferrer">Tampermonkey</a>

### 2. Install the script

Choose one method:

**Option A: Install from URL (recommended)**

1. Make sure Tampermonkey is installed.
2. Open the script URL:  
   <a href="https://cdn.jsdelivr.net/gh/zhujunsan/cursor-dashboard-usage-viewer@latest/cursor-dashboard-usage-viewer.user.js" target="_blank" rel="noopener noreferrer">https://cdn.jsdelivr.net/gh/zhujunsan/cursor-dashboard-usage-viewer@latest/cursor-dashboard-usage-viewer.user.js</a>
3. Tampermonkey will prompt you to install — confirm to proceed.

Version-pinned install (bypasses CDN cache for a specific release):  
<a href="https://cdn.jsdelivr.net/gh/zhujunsan/cursor-dashboard-usage-viewer@1.0.5/cursor-dashboard-usage-viewer.user.js" target="_blank" rel="noopener noreferrer">https://cdn.jsdelivr.net/gh/zhujunsan/cursor-dashboard-usage-viewer@1.0.5/cursor-dashboard-usage-viewer.user.js</a>

Fallback (may not trigger Tampermonkey install in some browsers):  
<a href="https://github.com/zhujunsan/cursor-dashboard-usage-viewer/raw/main/cursor-dashboard-usage-viewer.user.js" target="_blank" rel="noopener noreferrer">https://github.com/zhujunsan/cursor-dashboard-usage-viewer/raw/main/cursor-dashboard-usage-viewer.user.js</a>

**Option B: Install from the repository file**

1. Download `cursor-dashboard-usage-viewer.user.js` from this repository.
2. Tampermonkey → Dashboard → Utilities → drag and drop the file to import.

After installation, the script should appear as **Cursor Dashboard Usage Viewer** and be enabled.

## Usage

1. Sign in to Cursor and open <a href="https://cursor.com/dashboard/usage" target="_blank" rel="noopener noreferrer">https://cursor.com/dashboard/usage</a>
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

The script uses jsDelivr `@latest` for `@updateURL` / `@downloadURL`. Tampermonkey compares the remote `@version` with your installed copy.

**How jsDelivr caching works**

| URL pattern | Behavior |
|-------------|----------|
| `@latest` | Resolves to the highest semver Git tag (e.g. `v1.0.5`). Best for auto-updates when releases are tagged. |
| `@1.0.5` | Pinned to a specific version. No stale-cache surprises; use for manual installs. |
| `@main` | Tracks the branch; may lag up to ~12 hours after a push. |

**Recommended release flow** (keeps updates timely):

1. Bump `@version` in the userscript and push to `main`.
2. Create a matching Git tag: `git tag v1.0.5 && git push origin v1.0.5`
3. (Optional) Purge jsDelivr cache immediately:  
   <a href="https://purge.jsdelivr.net/gh/zhujunsan/cursor-dashboard-usage-viewer@latest/cursor-dashboard-usage-viewer.user.js" target="_blank" rel="noopener noreferrer">https://purge.jsdelivr.net/gh/zhujunsan/cursor-dashboard-usage-viewer@latest/cursor-dashboard-usage-viewer.user.js</a>

Without semver tags, `@latest` falls back to branch behavior and caching is less predictable. Always tag releases.

## Files

| File | Description |
|------|-------------|
| `cursor-dashboard-usage-viewer.user.js` | Tampermonkey userscript |

## License

<a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-NC-SA 4.0</a>
