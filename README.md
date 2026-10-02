# Syncy

Sync bookmarks, history, open tabs, tab groups and settings between Chrome, Edge and Firefox through your own cloud:
WebDAV, Dropbox, GitHub (Gist), Google Drive or OneDrive. Optional end-to-end encryption (AES-GCM-256, key derived with PBKDF2 from your passphrase).

## Build
```
python3 build.py            # dist/syncy-chrome|edge|firefox-<today>.zip
```
Load unpacked: Chrome/Edge `chrome://extensions` > Developer mode > Load unpacked > `dist/chrome`.
Firefox: `about:debugging` > This Firefox > Load Temporary Add-on > `dist/firefox/manifest.json`.
Firefox asks you to grant access to your sync server on first use (banner in the popup).

## Dropbox / Google Drive / OneDrive login
Put your OAuth client IDs in `src/login.js`. Users only press **Log in** (it opens in a new tab, PKCE + refresh token).
Register this redirect URI in each provider console: Chrome/Edge `https://<extension-id>.chromiumapp.org/`;
Firefox: the exact URI is written to Options > Activity log when Log in is pressed.

## Browser support (checked 2026-10-01)
| Browser | Minimum | Current stable | Pre-release channel |
|---|---|---|---|
| Chrome | 120 | 154 | Canary 156 |
| Edge (Chromium) | 120 | follows Chromium | Canary |
| Firefox | 140 | 156 | Nightly 159 |

Stores: Chrome Web Store and Edge Add-ons take the Chrome/Edge zip; Firefox Add-ons (AMO) takes the Firefox zip.
Google Drive refresh tokens only last forever if your Google OAuth app is published (apps in *Testing* expire after 7 days).

## Releases
Push a tag like `v1.2.1` (must match the manifest version) and `.github/workflows/release.yml` builds Chrome, Edge and Firefox zips and attaches them to a GitHub Release.

## Limits
`src/modules/limits.js` caps history (5000) and tabs per device (3000). Bookmarks are unlimited; large files are split into parts automatically.
