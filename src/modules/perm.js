// Firefox does not grant host permissions at install; Chrome/Edge always report true.
export const hasHost = async () => { try { return await chrome.permissions.contains({ origins: ['<all_urls>'] }); } catch { return true; } };
export const requestHost = () => chrome.permissions.request({ origins: ['<all_urls>'] });
