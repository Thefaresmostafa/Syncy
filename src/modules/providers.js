import * as webdav from './provider-webdav.js';
import * as dropbox from './provider-dropbox.js';
import * as github from './provider-github.js';
import * as gdrive from './provider-gdrive.js';
import * as onedrive from './provider-onedrive.js';
export const OAUTH_PROVIDERS = ['dropbox', 'gdrive', 'onedrive'];
export function createProvider(name, sec) {
  const m = { webdav, dropbox, github, gdrive, onedrive }[name];
  if (!m) throw new Error('Unknown provider: ' + name);
  if (OAUTH_PROVIDERS.includes(name)) {
    const o = sec.oauth?.[name];
    if (!o?.token) throw new Error('You are not logged in. Open Options and log in.');
    if (o.exp && o.exp < Date.now() && !o.refresh) throw new Error('Login expired. Log in again from Options.');
  }
  const p = m.create(sec);
  p.maxChunk = { github: 700000, onedrive: 900000 }[name] || 8000000;
  return p;
}
