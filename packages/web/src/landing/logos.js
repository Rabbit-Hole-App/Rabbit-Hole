import './logos.css';
import { logoHeading, logos } from './logos-data.js';

// Organisation-logo strip, rendered into the empty <section id="used-by"> (brief 2026-10-28, section 3).
// Only entries with an official file are shown; with none, the section stays empty.
const root = document.getElementById('used-by');
const shown = logos.filter(l => l.file);

if (root && shown.length) {
  const SPEED = 32; // px per second, slow on purpose
  const MIN_GAP = 48; // the narrowest gap in logos.css, used to size how many repeats fill a wide screen
  const setWidth = shown.reduce((sum, l) => sum + l.height * l.w / l.h + MIN_GAP, 0);
  const repeats = Math.ceil(2600 / setWidth);
  const item = (l, hidden) => {
    const px = Math.round(l.height * l.w / l.h);
    return `<li${hidden ? ' aria-hidden="true"' : ''}><img src="/landing/logos/${l.file}" alt="${l.name}" width="${px}" height="${l.height}" loading="lazy" decoding="async" draggable="false"></li>`;
  };
  const group = hiddenGroup => `<ul class="logos-group"${hiddenGroup ? ' aria-hidden="true"' : ''}>${Array.from({ length: repeats }, (_, i) => shown.map(l => item(l, hiddenGroup || i > 0)).join('')).join('')}</ul>`;
  root.innerHTML = `<div class="logos-head"><h2 id="used-by-title">${logoHeading}</h2>
    <button type="button" class="logos-toggle" aria-pressed="false" aria-label="Pause logo scrolling"><svg class="logos-i-pause" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" focusable="false"><path d="M2.5 1.5h2.5v9H2.5zM7 1.5h2.5v9H7z" fill="currentColor"/></svg><svg class="logos-i-play" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" focusable="false"><path d="M3 1.5l7 4.5-7 4.5z" fill="currentColor"/></svg></button></div>
    <div class="logos-strip"><div class="logos-track">${group(false)}${group(true)}</div></div>`;

  const track = root.querySelector('.logos-track');
  const toggle = root.querySelector('.logos-toggle');
  const setDuration = () => { track.style.setProperty('--logos-dur', `${Math.round(track.scrollWidth / 2 / SPEED)}s`); };
  setDuration();
  addEventListener('resize', setDuration);
  toggle.addEventListener('click', () => {
    const paused = toggle.getAttribute('aria-pressed') !== 'true';
    toggle.setAttribute('aria-pressed', String(paused));
    root.toggleAttribute('data-paused', paused);
  });
}
