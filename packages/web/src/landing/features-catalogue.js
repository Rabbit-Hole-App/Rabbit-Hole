// Build-time renderer for the static Features catalogue (vite.config.js replaces <!-- features-catalogue --> in
// design/rabbit-hole-features.html with this). Static HTML only: no runtime script, no network call.
// Pictures live in src/landing/features/ so Vite emits only the ones this HTML references: an entry left out of a
// production build never ships its picture. Conventions: C:/s/spec/landing-features/CAPTURE-CONVENTIONS.md.

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const anchorOf = id => id.replace(/^\d+-/, '');

// Entries a build shows, in order: published ones (staged ones too in a preview build), only with a picture.
export const visibleFeatures = (features, images, preview) => features.filter(f => (f.published || preview) && images[f.id]);

// A grid entry pairs with the next one; a grid entry with no grid partner spans the full width, so no half-empty rows.
export function layoutsOf(list) {
  let open = false;
  return list.map((f, i) => {
    if (f.layout !== 'grid') return (open = false, 'full');
    if (open) return (open = false, 'grid');
    return list[i + 1]?.layout === 'grid' ? (open = true, 'grid') : 'full';
  });
}

const url = src => `../src/landing/features/${src}`;
function picture(part, alt, eager) {
  const { desktop, mobile } = part;
  const source = mobile ? `<source media="(max-width: 600px)" srcset="${esc(url(mobile.src))}" width="${mobile.w}" height="${mobile.h}">` : '';
  const img = `<img src="${esc(url(desktop.src))}" width="${desktop.w}" height="${desktop.h}" alt="${esc(alt)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async">`;
  return `<picture>${source}${img}</picture>`;
}
function media(image, alt, eager) {
  const parts = [].concat(image);
  if (parts.length === 1 && !parts[0].caption) return `<div class="feature-media">${picture(parts[0], alt, eager)}</div>`;
  // Composite (for example Original and Edited): each part is its own captioned picture; the entry's alt names the whole.
  return `<div class="feature-media feature-parts" role="group" aria-label="${esc(alt)}">${parts.map((p, i) =>
    `<figure>${picture(p, p.alt || `${alt} ${p.caption || i + 1}`, eager && i === 0)}${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}</figure>`).join('')}</div>`;
}

export function renderCatalogue(features, images, { preview = false } = {}) {
  const list = visibleFeatures(features, images, preview);
  if (!list.length) return '';
  const layouts = layoutsOf(list);
  const index = `<nav class="features-index" aria-label="Features">${list.map(f => `<a href="#${anchorOf(f.id)}">${esc(f.title)}</a>`).join('')}</nav>`;
  const entries = list.map((f, i) => `<article class="feature feature-${layouts[i]}" id="${anchorOf(f.id)}">`
    + `<div class="feature-copy"><h2>${esc(f.title)}</h2><p class="feature-subtitle">${esc(f.subtitle)}</p><p>${esc(f.description)}</p></div>`
    + `${media(images[f.id], f.alt, i === 0)}</article>`).join('\n');
  return `${index}\n<div class="features-catalogue">\n${entries}\n</div>`;
}
