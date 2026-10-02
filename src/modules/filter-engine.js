const toRe = p => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
export async function loadFilter(text = '') {
  const urls = [], folders = [];
  for (const l of text.split('\n').map(x => x.trim()).filter(Boolean)) (/\*|:\/\//.test(l) ? urls : folders).push(l);
  const rx = urls.map(toRe), fs = new Set(folders.map(f => f.toLowerCase()));
  return { isUrlExcluded: u => rx.some(r => r.test(u)), isFolderExcluded: t => fs.has((t || '').toLowerCase()) };
}
