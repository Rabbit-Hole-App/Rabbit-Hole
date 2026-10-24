// Link recognition for the Start dialog and the server's link context (control-plane learn-context-link.js): by pattern, no request.
// Pure and free of imports so a worker can load it.
// Links: recognised by pattern on the client, no request. The type and identifier show at once; an article is only
// resolved after the destination exists, so its title is filled in later (retitle) and its idle status says so.

const clean = (value) => String(value || '').trim();
export function classifyLink(text) {
  const raw = clean(text);
  if (!raw) return { ok: false, error: 'Paste a link.' };
  if (/\s/.test(raw)) return { ok: false, error: 'Add one link at a time.' };
  let url;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`); } catch { return { ok: false, error: 'That is not a link.' }; }
  if (!/^https?:$/.test(url.protocol)) return { ok: false, error: 'Only web links can be added.' };
  if (url.username || url.password) return { ok: false, error: 'Links with a sign-in in them cannot be added.' };
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':')) return { ok: false, error: 'That is not a public web link.' };
  url.hash = '';
  const path = url.pathname.replace(/\/+$/, '');

  const arxiv = host === 'arxiv.org' && path.match(/^\/(?:abs|pdf)\/(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Za-z]{2})?\/\d{7})(v\d+)?(?:\.pdf)?$/i);
  if (arxiv) return { ok: true, type: 'arxiv', id: arxiv[1], url: `https://arxiv.org/abs/${arxiv[1]}${arxiv[2] || ''}`, key: `arxiv:${arxiv[1].toLowerCase()}`, label: `arXiv ${arxiv[1]}`, detail: 'arXiv paper' };
  const tube = (host === 'youtu.be' && path.match(/^\/([\w-]{11})$/))
    || (/^(?:m\.|music\.)?youtube\.com$/.test(host) && (path === '/watch' ? [0, url.searchParams.get('v')] : path.match(/^\/(?:shorts|embed|live)\/([\w-]{11})$/)));
  if (tube && /^[\w-]{11}$/.test(tube[1] || '')) return { ok: true, type: 'youtube', id: tube[1], url: `https://www.youtube.com/watch?v=${tube[1]}`, key: `youtube:${tube[1]}`, label: `YouTube video ${tube[1]}`, detail: 'YouTube video' };
  const wiki = host.match(/^([a-z-]{2,12})\.wikipedia\.org$/) && path.match(/^\/wiki\/([^/:]+)$/);
  if (wiki) {
    let title = wiki[1];
    try { title = decodeURIComponent(title); } catch { /* keep the raw title */ }
    const lang = host.split('.')[0];
    return { ok: true, type: 'wikipedia', id: title, url: `https://${host}/wiki/${wiki[1]}`, key: `wikipedia:${lang}:${title.toLowerCase()}`, label: title.replace(/_/g, ' '), detail: 'Wikipedia article' };
  }
  const shown = `${host}${path}`;
  return { ok: true, type: 'webpage', id: null, url: `${url.protocol}//${host}${path}${url.search}`, key: `url:${host}${path}${url.search}`, label: shown, detail: 'Web page' };
}

