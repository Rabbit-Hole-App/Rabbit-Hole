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

// The canvas's content drawn into 800 x 400, from its own DOM (html-to-image, already the canvas's area and sketch
// capture): the camera layer restyled onto the region; iframes and videos (cross-origin pixels), toolbars, the hover-only
// connection ports and card tools, and a selected shape's outline and handles left out; the app font skipped (the system
// font reads the same at this size, and embedding it is the slow part). html-to-image copies an <svg> whole, past its filter
// and without the stylesheet that hides its ports, so those are hidden inline for the copy and shown again after.
const CHROME = '[data-port],[data-node-tool],[data-thumbnail-hide],[role="toolbar"]';
export async function drawThumbnail(node, region, background = '#ffffff') {
  if (!node || !region) return null;
  const { width, height } = THUMBNAIL, scale = width / region.w;
  const { toCanvas } = await import('html-to-image');
  const skip = el => el.nodeType === 1 && (el.tagName === 'IFRAME' || el.tagName === 'VIDEO' || el.matches?.(CHROME));
  const hidden = [...node.querySelectorAll(`svg :is(${CHROME})`)].filter(el => !el.style.display);
  for (const el of hidden) el.style.display = 'none';
  try {
    const canvas = await toCanvas(node, {
      width, height, pixelRatio: 1, cacheBust: false, skipFonts: true, backgroundColor: background, filter: el => !skip(el),
      style: { transform: `translate(${-region.x * scale}px, ${-region.y * scale}px) scale(${scale})`, transformOrigin: '0 0', transition: 'none' },
    });
    return await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.85));
  } finally {
    for (const el of hidden) el.style.removeProperty('display');
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
