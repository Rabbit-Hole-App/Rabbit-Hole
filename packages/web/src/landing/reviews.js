import './reviews.css';
import { reviews as published } from './reviews-data.js';

// User reviews, rendered into the empty <section id="reviews"> (brief 2026-10-28, section 4). Genuine reviews only:
// with none, the section stays empty (no heading, no placeholder). The layout fixture below exists only in a dev build.
const root = document.getElementById('reviews');
const FIRST = 6;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const X = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
const valid = r => r && r.source === 'x' && r.name && r.handle && r.quote && /^https:\/\//.test(r.url || '');
const initials = name => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

const card = r => `<li class="review-card"><article>
  <header><span class="review-avatar" aria-hidden="true">${r.avatar ? `<img src="${esc(r.avatar)}" alt="" width="40" height="40" loading="lazy" decoding="async">` : esc(initials(r.name))}</span>
    <span class="review-who"><strong>${esc(r.name)}</strong><small>${esc(r.handle)}</small></span><span class="review-source">${X}</span></header>
  <blockquote cite="${esc(r.url)}"><p>${esc(r.quote)}</p></blockquote>
  <a class="review-link" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">View the post on X<span class="review-sr"> by ${esc(r.name)} (opens in a new tab)</span></a>
</article></li>`;

async function mount() {
  let list = published;
  // import.meta.env.DEV is false in production builds, so the fixture module is dropped from the bundle.
  if (import.meta.env.DEV && location.search.includes('reviews-fixture')) list = (await import('./reviews-fixture.dev.js')).reviewFixtures;
  list = list.filter(valid);
  if (!root || !list.length) return;
  root.innerHTML = `<h2 id="reviews-title">What people are saying</h2><ul class="review-grid">${list.map(card).join('')}</ul>${list.length > FIRST ? '<button type="button" class="review-more">Show more</button>' : ''}`;
  const cards = [...root.querySelectorAll('.review-card')];
  cards.slice(FIRST).forEach(c => { c.hidden = true; });
  const more = root.querySelector('.review-more');
  more?.addEventListener('click', () => {
    const revealed = cards.slice(FIRST);
    revealed.forEach(c => { c.hidden = false; });
    more.remove();
    revealed[0].querySelector('a').focus();
  });
}
mount();
