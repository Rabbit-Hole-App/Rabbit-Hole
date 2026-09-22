// What a link inside a Wikipedia article should do on our canvas.
//
// Every internal link is dead on arrival: Parsoid writes them as `./Article`,
// resolved only by a <base href> in the head we strip. So rewriting them is
// not a feature we chose to add, it is the minimum needed for the article not
// to be broken. Given that, pointing them back at the card costs nothing and
// keeps the learner inside the lesson.
//
// Pure, so the decision can be tested without a DOM. The walk that applies it
// lives in the component.

const FILE = ['file', 'image', 'media'];
const NAMESPACES = ['talk', 'user', 'wikipedia', 'mediawiki', 'template', 'help', 'category', 'portal', 'draft', 'special', 'module', 'timedtext', ...FILE];

const WIKI_HOST = /^([a-z]{2,3}(-[a-z]+)?\.)?(m\.)?wikipedia\.org$/i;
const namespaceOf = title => {
  const prefix = title.split(':')[0].trim().toLowerCase();
  return title.includes(':') && NAMESPACES.includes(prefix) ? prefix : null;
};
const titleOf = value => decodeURIComponent(value).replace(/_/g, ' ').replace(/\s+/g, ' ').trim().replace(/ /g, '_');

// `current` is the article on screen, so a link into it scrolls instead of
// refetching the page the learner is already reading.
export function classifyHref(href, current = null) {
  const raw = String(href ?? '').trim();
  if (!raw) return { kind: 'none' };
  // A fragment on its own: a citation jump or a section of this article.
  if (raw.startsWith('#')) {
    const anchor = decodeURIComponent(raw.slice(1));
    if (!anchor) return { kind: 'none' };
    return { kind: /^cite_(note|ref)/.test(anchor) ? 'reference' : 'section', anchor };
  }
  let path = raw, hash = '', query = '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    // Anything with a scheme is only safe if it is http(s). javascript: and
    // data: are the whole reason this is an allowlist and not a blocklist.
    let url;
    try { url = new URL(raw); } catch { return { kind: 'none' }; }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return { kind: 'none' };
    // An http article is still fine - we refetch it over our own https route -
    // but an http link to anywhere else is dropped rather than silently handed
    // to the learner as a plaintext navigation.
    if (!WIKI_HOST.test(url.hostname) || !url.pathname.startsWith('/wiki/')) return url.protocol === 'https:' ? { kind: 'external', url: url.href } : { kind: 'none' };
    path = url.pathname.slice('/wiki/'.length); hash = url.hash; query = url.search;
  } else if (raw.startsWith('//')) {
    let url;
    try { url = new URL(`https:${raw}`); } catch { return { kind: 'none' }; }
    if (!WIKI_HOST.test(url.hostname) || !url.pathname.startsWith('/wiki/')) return { kind: 'external', url: url.href };
    path = url.pathname.slice('/wiki/'.length); hash = url.hash; query = url.search;
  } else {
    path = raw.replace(/^\.\//, '').replace(/^\/wiki\//, '');
    const at = path.search(/[#?]/);
    if (at >= 0) { const rest = path.slice(at); path = path.slice(0, at); hash = rest.startsWith('#') ? rest : ''; query = rest.startsWith('?') ? rest : ''; }
  }
  if (!path) return hash ? classifyHref(hash, current) : { kind: 'none' };
  // A red link is an invitation to write the article, which is not something
  // this product does. It reads as a link and must not behave as one.
  if (/[?&]redlink=1/.test(query) || /[?&]action=edit/.test(query)) return { kind: 'dead' };
  const title = titleOf(path);
  const namespace = namespaceOf(title);
  const anchor = hash ? decodeURIComponent(hash.slice(1)) : null;
  if (namespace && FILE.includes(namespace)) return { kind: 'file', title };
  if (namespace) return { kind: 'external', url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}` };
  if (current && titleOf(current) === title) return anchor ? { kind: 'section', anchor } : { kind: 'section', anchor: null };
  return { kind: 'article', title, anchor };
}

// Wikipedia serves images protocol-relative, which is fine inside a browser on
// https and broken everywhere else. Anything that is not https is dropped
// rather than passed through.
export function absoluteUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (raw.startsWith('//')) return `https:${raw}`;
  // https only: an http image on an https page is blocked by the browser
  // anyway, and dropping it is better than a broken-image icon mid-article.
  if (/^https:\/\//i.test(raw)) return raw;
  return null;
}

// srcset is a comma-separated list of "url descriptor" pairs, and every url in
// it needs the same treatment as src or the browser picks a broken one.
export function rewriteSrcset(value) {
  const parts = String(value ?? '').split(',').map(part => {
    const [url, ...descriptor] = part.trim().split(/\s+/);
    const absolute = absoluteUrl(url);
    return absolute ? [absolute, ...descriptor].join(' ') : null;
  }).filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}
