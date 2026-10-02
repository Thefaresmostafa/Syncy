export const CHANGELOG = [{
  version: '1.0', date: '2026-10-01',
  added: [
    'Sync bookmarks, history, open tabs, tab groups and settings across Chrome, Edge and Firefox',
    'WebDAV, Dropbox, GitHub, Google Drive and OneDrive (one-time login, renewed automatically)',
    'End-to-end encryption (AES-GCM-256, PBKDF2 key from your passphrase) with join-existing-passphrase detection',
    'Remote tabs as tappable cards, with a button to close a tab on the other device',
    'Sync history with exact timestamps, activity log, conflict resolution and SHA-256 integrity checks',
    'Settings export/import, factory reset, device list, master password, exclusion filters',
    'Accent-colored S icon, quick theme panel, Light / Dark / AMOLED / System themes',
    'Automatic reconnect: sync keeps retrying until the cloud is reachable'
  ],
  improved: ['Large libraries: chunked uploads and minimal bookmark diffing'], fixed: []
}];
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
export function renderChangelog(el, limit = 1) {
  el.innerHTML = CHANGELOG.slice(0, limit).map(v => `<h4>Version ${v.version} <span class="muted small">${v.date}</span></h4>` +
    [['New', v.added], ['Improved', v.improved], ['Fixed', v.fixed]].filter(([, a]) => a.length)
      .map(([t, a]) => `<strong class="small">${t}</strong><ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`).join('')).join('');
}
