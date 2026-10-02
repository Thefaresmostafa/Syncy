export const CHANGELOG = [{
  version: '1.2.2', date: '2026-10-01',
  added: ['Remote tabs are now cards you can tap, each with a close button', 'Save button for the device name', 'Standard settings (gear) icon'],
  improved: ['Log in once: Dropbox, Google Drive and OneDrive renew their login automatically in the background', 'Logo is an accent-colored S with a black outline'],
  fixed: ['Closing a remote tab no longer fails with HTTP 403 on WebDAV servers that refuse new folders']
}, {
  version: '1.2.1', date: '2026-10-01',
  added: ['Toolbar icon is now a transparent S that follows your accent color', 'Info button on GitHub explaining how to create the token and which permission to give'],
  improved: ['Opening a cloud that is already encrypted asks for its existing passphrase and never creates a new one', 'Firefox 140+ tab groups supported'],
  fixed: []
}, {
  version: '1.2.0', date: '2026-10-01',
  added: ['Log in with one click for Dropbox, Google Drive and OneDrive (opens in a new tab)', 'Close a tab on another device from Remote tabs', 'Firefox and Edge support', 'Quick theme panel with accent-colored palette icon', 'Large-library support: chunked uploads, minimal bookmark diffing, hash sidecars'],
  improved: ['WebDAV is more reliable: URL normalization, retries, automatic reconnect', 'GitHub provider is now simply called GitHub'],
  fixed: ['"Failed to fetch" on WebDAV now shows the real reason and retries automatically']
}, {
  version: '1.1.0', date: '2026-09-30',
  added: ['End-to-end encryption (AES-GCM-256)', 'Sync history, integrity checks, conflict resolution', 'Settings export/import, badges, offline alert'],
  improved: [], fixed: []
}];
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
export function renderChangelog(el, limit = 1) {
  el.innerHTML = CHANGELOG.slice(0, limit).map(v => `<h4>Version ${v.version} <span class="muted small">${v.date}</span></h4>` +
    [['New', v.added], ['Improved', v.improved], ['Fixed', v.fixed]].filter(([, a]) => a.length)
      .map(([t, a]) => `<strong class="small">${t}</strong><ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`).join('')).join('');
}
