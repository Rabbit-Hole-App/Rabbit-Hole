// Build-time renderer for the static Features catalogue (vite.config.js replaces <!-- features-catalogue --> in
// design/rabbit-hole-features.html with this). Static HTML only: no runtime script, no network call.
// Pictures live in src/landing/features/ so Vite emits only the ones this HTML references: an entry left out of a
// production build never ships its picture. Conventions: C:/s/spec/landing-features/CAPTURE-CONVENTIONS.md.

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const anchorOf = id => id.replace(/^\d+-/, '');

// Entries a build shows, in order: published ones (staged ones too in a preview build), only with a picture.
export const visibleFeatures = (features, images, preview) => features.filter(f => (f.published || preview) && images[f.id]);

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
  return `<div class="feature-demo"><div class="demo-window"><div class="demo-toolbar" aria-hidden="true"><span class="demo-brand">Rabbit Hole</span><span>${esc(title)} <i></i></span></div>${body}</div></div>`;
}

export function renderCatalogue(features, images, { preview = false } = {}) {
  const list = visibleFeatures(features, images, preview);
  if (!list.length) return '';
  const index = `<nav class="features-index" aria-label="Features">${list.map(f => `<a href="#${anchorOf(f.id)}">${esc(f.title)}</a>`).join('')}</nav>`;
  const entries = list.map((f, i) => `<article class="feature" id="${anchorOf(f.id)}">${frame(images[f.id], f.title, f.alt, i === 0)}`
    + `<div class="feature-copy"><h2>${esc(f.title)}</h2><p class="feature-subtitle">${esc(f.subtitle)}</p><p>${esc(f.description)}</p></div></article>`).join('\n');
  return `${index}\n<div class="features-catalogue">\n${entries}\n</div>`;
}
