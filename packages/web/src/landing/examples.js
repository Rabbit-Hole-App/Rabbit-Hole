import './examples-art.css';
import { examples } from './examples-data.js';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const countLabel = n => `${n} ${n === 1 ? 'canvas' : 'canvases'}`;
// Same card as the Blog's (shared .card and .card-hover); the whole card opens the canvas, the arrow button below says so.
export const renderExamples = list => list.map((e, i) => `<li><article>
    <a class="card example-card card-hover" href="${esc(e.href)}" aria-labelledby="example-${esc(e.slug)}">
      <div class="example-canvas"><img src="${esc(e.image.src)}" width="${e.image.w}" height="${e.image.h}" alt="${esc(e.image.alt)}" loading="${i < 3 ? 'eager' : 'lazy'}" decoding="async"></div>
      <div class="example-copy">
        <h3 id="example-${esc(e.slug)}">${esc(e.title)}</h3><p>${esc(e.description)}</p>
        <div class="example-meta"><span>${esc(e.category)}</span><span class="card-action" aria-hidden="true"><span class="card-action-label">Open canvas</span><span class="card-action-icon"><span class="card-action-arrow">↗</span></span></span></div>
      </div>
    </a></article></li>`).join('');

const grid = document.getElementById('examples-grid');
if (grid) {
  grid.innerHTML = renderExamples(examples);
  document.getElementById('examples-count').textContent = countLabel(examples.length);
}
