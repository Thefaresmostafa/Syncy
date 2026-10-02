// ============================================================================
//  login.js - everything needed for "Log in" with Dropbox, Google Drive, OneDrive.
//  Put your app client IDs below. Users only click "Log in" in Options.
//
//  Redirect URI to register in each provider's developer console:
//    Chrome / Edge : https://<extension-id>.chromiumapp.org/
//    Firefox       : printed in Options > Activity log every time Log in is clicked
// ============================================================================
import { getSecrets, setSecrets } from './modules/storage-adapter.js';
import { log } from './modules/logger.js';
import { NetError } from './modules/util.js';

export const CONFIG = {
  dropbox: { clientId: '.APPDROP' },
  gdrive: { clientId: '', clientSecret: '' },  // Google needs the secret of a "Web application" client
  onedrive: { clientId: '' }
};
const P = {
  dropbox: { name: 'Dropbox', auth: 'https://www.dropbox.com/oauth2/authorize', token: 'https://api.dropboxapi.com/oauth2/token', extra: { token_access_type: 'offline' } },
  gdrive: { name: 'Google Drive', auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', extra: { scope: 'https://www.googleapis.com/auth/drive.appdata', access_type: 'offline', prompt: 'consent' } },
  onedrive: { name: 'OneDrive', auth: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token', extra: { scope: 'Files.ReadWrite.AppFolder offline_access' } }
};
export const redirectUri = () => chrome.identity.getRedirectURL();
const b64url = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const rand = n => b64url(crypto.getRandomValues(new Uint8Array(n)));

async function tokenRequest(name, params) {
  const cfg = CONFIG[name], id = (cfg.clientId || '').trim();
  if (!id) throw new Error(`${P[name].name} client ID is missing in login.js`);
  const body = new URLSearchParams({ client_id: id, ...params });
  if (cfg.clientSecret?.trim()) body.set('client_secret', cfg.clientSecret.trim());
  let r; try { r = await fetch(P[name].token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }); } catch (e) { throw new NetError('Cannot reach ' + new URL(P[name].token).host + ': ' + e.message); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(j.error_description || j.error || `${P[name].name} login failed (HTTP ${r.status})`);
  return j;
}
// Login always opens in a NEW TAB (never a popup window) and closes it when done.
function loginTab(url, state, openerId) {
  return new Promise(async (resolve, reject) => {
    const redirect = redirectUri(), tab = await chrome.tabs.create({ url, active: true, openerTabId: openerId });
    let done = false;
    const end = (fn, v) => {
      if (done) return; done = true;
      chrome.tabs.onUpdated.removeListener(onUp); chrome.tabs.onRemoved.removeListener(onRm);
      chrome.tabs.remove(tab.id).catch(() => {});
      if (openerId) chrome.tabs.update(openerId, { active: true }).catch(() => {});
      fn(v);
    };
    const onUp = (id, ci, t) => {
      const u = ci.url || t?.url;
      if (id !== tab.id || !u || !u.startsWith(redirect)) return;
      const q = new URL(u).searchParams;
      if (q.get('error')) end(reject, new Error(q.get('error_description') || q.get('error')));
      else if (q.get('state') !== state) end(reject, new Error('Login failed (state mismatch)'));
      else end(resolve, q.get('code'));
    };
    const onRm = id => { if (id === tab.id) end(reject, new Error('Login cancelled')); };
    chrome.tabs.onUpdated.addListener(onUp); chrome.tabs.onRemoved.addListener(onRm);
  });
}
export async function login(name) {
  const cfg = CONFIG[name], p = P[name];
  if (!cfg?.clientId) throw new Error(`${p.name} is not set up yet: add its client ID in login.js`);
  await log('info', `${p.name} login redirect URI: ${redirectUri()}`);
  const verifier = rand(64), state = rand(16);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const u = new URL(p.auth);
  const q = { client_id: cfg.clientId.trim(), response_type: 'code', redirect_uri: redirectUri(), state, code_challenge: challenge, code_challenge_method: 'S256', ...p.extra };
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  const me = await chrome.tabs.getCurrent().catch(() => null);
  const code = await loginTab(u.href, state, me?.id);
  const t = await tokenRequest(name, { grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri() });
  const sec = await getSecrets();
  sec.oauth = { ...sec.oauth, [name]: { token: t.access_token, refresh: t.refresh_token, exp: Date.now() + (t.expires_in || 3600) * 1000 } };
  await setSecrets(sec); await log('info', `${p.name} logged in`);
}
export async function logout(name) { const sec = await getSecrets(); if (sec.oauth) delete sec.oauth[name]; await setSecrets(sec); }
// Silently renews the access token. Returns true when secrets changed.
// Login is permanent: the refresh token is renewed automatically (also by a background alarm), so you log in once.
export async function refreshIfNeeded(sec, name, force = false) {
  const o = sec.oauth?.[name];
  if (!o?.refresh || (!force && o.exp > Date.now() + 60000)) return false;
  try {
    const t = await tokenRequest(name, { grant_type: 'refresh_token', refresh_token: o.refresh });
    o.token = t.access_token; o.refresh = t.refresh_token || o.refresh; o.exp = Date.now() + (t.expires_in || 3600) * 1000; return true;
  } catch (e) {
    if (e.name === 'NetError') throw e; // temporary network problem, keep the login
    throw new Error(`${P[name].name} login was rejected (${e.message}). Check the client ID in login.js, then log in again from Options.`);
  }
}
