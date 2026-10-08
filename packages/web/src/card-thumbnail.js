// Card thumbnails (docs/features/card-thumbnails.md, owner 2026-10-08): a wide picture of a canvas on its Home, Library and
// Explore cards. The browser draws it from the canvas itself when the board saves - no AI, no upload by default - and the
// owner may replace it with a picture of their own (the card's ⋮). The server keeps both (learn-boards.js) and serves the
// owner theirs, and anyone else only a canvas published to Explore.

// 2:1, the card's image slot (LearningCard.jsx): wide like distill.pub's, at twice the size the card shows it.
export const THUMBNAIL = { width: 800, height: 400 };
// What a picture chosen for Change thumbnail may be before it is redrawn at 800 x 400 (the server takes at most 1 MB).
export const COVER_LIMIT = 10 * 1024 * 1024;
const COVER_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

// A changed thumbnail gets a new address in this page, so a card that showed the old one loads the new one at once; a
// fresh page revalidates by ETag (private, no-cache).
const versions = new Map();
export const bumpThumbnail = name => versions.set(name, Date.now());
export const ownThumbnail = name => `/api/learn/boards/${encodeURIComponent(name)}/main/thumbnail${versions.has(name) ? `?v=${versions.get(name)}` : ''}`;
// Your own card's picture (Home, the Library): a canvas or project, never a review fixture or an archived canvas (the
// server shows those to nobody) or a canvas you cannot edit.
export const cardThumbnail = a => ((a.kind === 'canvas' && a.canEdit !== false) || a.kind === 'repository') && !a.fixture && !a.archived_at ? ownThumbnail(a.name) : null;
// A published canvas by the publication token its card already links (/e/<token>), never its name or its owner.
export const publishedThumbnail = url => `/api/learn/boards/published/${encodeURIComponent(String(url).split('/').pop())}/thumbnail`;

// The part of the canvas a thumbnail shows, in canvas units, from its content boxes ({ x, y, w, h }): the content with a
// margin, made 2:1. Wide content is centred vertically. Tall content keeps its top - widened by at most half again, so a
// long column still reads instead of shrinking to a sliver. Never smaller than 400 wide (at most 2x zoom). null: empty.
export function thumbnailRegion(boxes, { aspect = 2, margin = 24, minWidth = 400 } = {}) {
  const live = (boxes || []).filter(b => b && [b.x, b.y, b.w, b.h].every(Number.isFinite));
  if (!live.length) return null;
  const left = Math.min(...live.map(b => b.x)) - margin, top = Math.min(...live.map(b => b.y)) - margin;
  const w = Math.max(...live.map(b => b.x + b.w)) + margin - left, h = Math.max(...live.map(b => b.y + b.h)) + margin - top;
  let height = w / aspect >= h ? w / aspect : Math.min(h, (1.5 * w) / aspect);
  let width = height * aspect;
  if (width < minWidth) { width = minWidth; height = minWidth / aspect; }
  const y = w / aspect >= h || height >= h ? top + (h - height) / 2 : top;
  return { x: left + (w - width) / 2, y, w: width, h: height };
}

// What a picture never shows (Parallel, 2026-10-08: "the picture must never show canvas chrome"): everything a selection,
// a hover or an edit adds - the Open pill and the Ask in chat / Explain / Continue pill rows, ports, card and item tools,
// a shape's outline, handles and label handle, the text-level ladder, the group Ask, the sketch hint, toolbars, comment
// pins - by the canvas's own data attributes, with data-thumbnail-hide where an element had none; and iframes, videos
// and audio (cross-origin pixels, and a copy of one would start loading).
export const CHROME = ['[data-thumbnail-hide]', '[data-card-open]', '[data-port]', '[data-node-tool]', '[data-group-ask]', '[data-sketch-chrome]',
  '[data-label-handle]', '[data-comment-pins]', '[data-view-selection]', '[role="toolbar"]', 'iframe', 'video', 'audio'].join(',');
// Selection drawn on the content itself: a selected card's, note's or text's ring, an active sketch's, a group's accent
// outline. Undone for the picture by the same attributes (Tailwind's ring is these two variables).
export const UNSELECTED = `[data-block-id], [data-item-id], [data-item-id] *, [data-sketch] { --tw-ring-shadow: 0 0 #0000 !important; --tw-ring-offset-shadow: 0 0 #0000 !important; }
[data-sketch] { border-color: var(--color-line) !important; }
[data-group-box] { border-color: var(--color-line-strong) !important; background-color: transparent !important; }`;

// A hidden same-origin frame holding the app's own stylesheets without .dark (api.js toggles only that class), so a
// picture is always in the light theme whatever the owner's (Parallel: a light Home never shows a dark picture), and at
// a desktop width, so nothing hover-only shows. Its nodes are not the page's, so no page query ever meets the copy.
async function lightFrame() {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;left:-20000px;top:0;width:1440px;height:900px;border:0;pointer-events:none';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.documentElement.className = document.documentElement.className.replace(/\bdark\b/g, '').trim();
  const sheets = [...document.querySelectorAll('link[rel="stylesheet"], style')].map(el => doc.head.appendChild(doc.importNode(el, true)));
  doc.head.appendChild(Object.assign(doc.createElement('style'), { textContent: UNSELECTED }));
  await Promise.all(sheets.filter(el => el.tagName === 'LINK' && !el.sheet).map(el => new Promise(resolve => { el.onload = el.onerror = resolve; })));
  return frame;
}

// The canvas's content drawn into 800 x 400 from a copy of its DOM (html-to-image, already the canvas's area and sketch
// capture): the camera layer, without CHROME, restyled onto the region in the light frame; the app font skipped (the
// system font reads the same at this size, and embedding it is the slow part). The chrome is removed from the copy
// rather than by html-to-image's filter, which never reaches inside an <svg> (a shape's handles).
export async function drawThumbnail(node, region) {
  if (!node || !region) return null;
  const { width, height } = THUMBNAIL, scale = width / region.w;
  const copy = node.cloneNode(true);
  // A <canvas> copies blank: its pixels come over by hand.
  const live = node.querySelectorAll('canvas');
  copy.querySelectorAll('canvas').forEach((c, i) => { try { c.getContext('2d').drawImage(live[i], 0, 0); } catch { /* left blank */ } });
  for (const el of copy.querySelectorAll(CHROME)) el.remove();
  const frame = await lightFrame();
  try {
    frame.contentDocument.body.appendChild(copy);
    const { toCanvas } = await import('html-to-image');
    const canvas = await toCanvas(copy, {
      width, height, pixelRatio: 1, cacheBust: false, skipFonts: true, backgroundColor: frame.contentWindow.getComputedStyle(frame.contentDocument.body).backgroundColor,
      style: { transform: `translate(${-region.x * scale}px, ${-region.y * scale}px) scale(${scale})`, transformOrigin: '0 0', transition: 'none' },
    });
    return await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.85));
  } finally {
    frame.remove();
  }
}

// One snapshot per pause in saving (owner: "taken in the browser when it saves", never on every keystroke). `saved(text)`
// after each board save that changed its content; the capture runs `delay` ms after the last one, at most once per `gap`,
// and only for content that differs from the last snapshot sent. A capture with nothing to draw (null) counts as sent.
// ponytail: a change made in the last `delay` before leaving the canvas waits for the next save there; drawing needs the
// canvas on screen. Flush on leave if stale cards are reported.
export function thumbnailScheduler({ capture, upload, delay = 4000, gap = 30000, now = () => Date.now(), timers = globalThis }) {
  let timer = null, pending = null, sent = null, last = -Infinity, busy = false;
  const schedule = wait => { timers.clearTimeout(timer); timer = timers.setTimeout(run, wait); };
  async function run() {
    timer = null;
    if (busy || pending === sent) return;
    const wait = last + gap - now();
    if (wait > 0) return schedule(wait);
    busy = true;
    const text = pending;
    try {
      const blob = await capture();
      if (blob) { await upload(blob); last = now(); }
      sent = text;
    } catch { /* the next save tries again */ } finally { busy = false; }
    if (pending !== sent && pending !== text) schedule(delay);
  }
  return {
    saved(text) { pending = text; if (!busy) schedule(delay); },
    stop() { timers.clearTimeout(timer); timer = null; },
  };
}

// A picture chosen for Change thumbnail: what is wrong with it, in one line, or null.
export function coverProblem(file) {
  if (!file) return 'Choose an image.';
  if (!COVER_TYPES.includes(file.type)) return 'Choose a PNG, JPEG or WebP image.';
  if (file.size > COVER_LIMIT) return 'Choose an image of at most 10 MB.';
  return null;
}

// The chosen picture cropped to 2:1 from its centre (object-fit: cover) and redrawn at 800 x 400, so every cover is the
// card's shape and a small file.
export async function coverBlob(file) {
  const bitmap = await createImageBitmap(file);
  const { width, height } = THUMBNAIL;
  const scale = Math.max(width / bitmap.width, height / bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, (width - bitmap.width * scale) / 2, (height - bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale);
  bitmap.close?.();
  return new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.85));
}
