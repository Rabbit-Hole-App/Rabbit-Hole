// Build-time renderer for the Features catalogue (vite.config.js replaces <!-- features-catalogue --> in
// design/rabbit-hole-features.html with this). Static pictures, no network call. The page's sections come from PAGE_GROUPS;
// features-demos.js runs each stack section's scroll-driven deck on its own (restored from e801cf290).
// Pictures live in src/landing/features/ so Vite emits only the ones this HTML references: an entry left out of a
// production build never ships its picture. Conventions: C:/s/spec/landing-features/CAPTURE-CONVENTIONS.md.

import { PAGE_GROUPS } from './features-data.js';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const anchorOf = id => id.replace(/^\d+-/, '');

// Entries a build shows from a list of ids, in that order: published ones (staged ones too in a preview build), only with
// a picture. Default: every section's entries.
export const visibleFeatures = (features, images, preview, order = PAGE_GROUPS.flatMap(g => g.ids)) => order.map(id => features.find(f => f.id === id))
  .filter(f => f && (f.published || preview) && images[f.id]);

const url = src => `../src/landing/features/${src}`;
function picture(part, alt, eager) {
  const { desktop, mobile } = part;
  const source = mobile ? `<source media="(max-width: 600px)" srcset="${esc(url(mobile.src))}" width="${mobile.w}" height="${mobile.h}">` : '';
  const img = `<img src="${esc(url(desktop.src))}" width="${desktop.w}" height="${desktop.h}" alt="${esc(alt)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async">`;
  return `<picture>${source}${img}</picture>`;
}
// Every entry shows its picture in the walkthrough's framed preview (header bar, layered back frames): one picture, or a
// composite (for example Original and Edited) whose parts are each captioned; the entry's alt names the whole.
function frame(image, title, alt, eager) {
  const parts = [].concat(image);
  const body = parts.length === 1 && !parts[0].caption ? picture(parts[0], alt, eager)
    : `<div class="feature-parts" role="group" aria-label="${esc(alt)}">${parts.map((p, i) =>
      `<figure>${picture(p, p.alt || `${alt} ${p.caption || i + 1}`, eager && i === 0)}${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}</figure>`).join('')}</div>`;
  return `<div class="feature-demo"><div class="demo-window"><div class="demo-toolbar" aria-hidden="true"><span class="demo-brand">Rabbit Hole</span><span>${esc(title)} <i></i></span></div><div class="demo-content">${body}</div></div></div>`;
}

const copy = (f, row) => `<div class="feature-copy"${row ? ` style="grid-row:${row}"` : ''}><h3>${esc(f.title)}</h3><p class="feature-subtitle">${esc(f.subtitle)}</p><p>${esc(f.description)}</p></div>`;

export function renderCatalogue(features, images, { preview = false, groups = PAGE_GROUPS } = {}) {
  let eager = true; // only the page's first picture loads eagerly
  const shot = f => { const html = frame(images[f.id], f.title, f.alt, eager); eager = false; return html; };
  return groups.map(g => {
    const list = visibleFeatures(features, images, preview, g.ids);
    if (!list.length) return ''; // no section heading without entries
    const stack = g.layout === 'stack' || g.layout === 'stack-mirrored';
    // Stack: every frame spans all rows (--features) of the picture column and stays sticky; copy i sits in row i.
    // 'wide' and 'tiles' scroll normally, outside the stack logic. Copy comes first in the DOM (the phone order).
    const entries = list.map((f, i) => stack
      ? `<article class="feature${i === 0 ? ' is-active' : ''}" id="${anchorOf(f.id)}" data-feature-step>${copy(f, i + 1)}${shot(f)}</article>`
      : `<article class="feature" id="${anchorOf(f.id)}">${copy(f)}${shot(f)}</article>`).join('\n');
    const open = stack ? `<div class="feature-stack${g.layout === 'stack-mirrored' ? ' is-mirrored' : ''}" data-feature-walkthrough style="--features:${list.length}">`
      : `<div class="feature-${g.layout}">`;
    return `<section class="feature-group" data-layout="${g.layout}"><h2 class="feature-group-title">${esc(g.title)}</h2>\n${open}\n${entries}\n</div>\n</section>`;
  }).filter(Boolean).join('\n');
}
