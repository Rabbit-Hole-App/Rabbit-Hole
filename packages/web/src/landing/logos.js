import './logos.css';
import { logoHeading, logos } from './logos-data.js';

// Organisation-logo strip, rendered into the empty <section id="used-by"> (brief 2026-10-28, section 3).
// Only entries with a file are shown; with none, the section stays empty.
const root = document.getElementById('used-by');
const shown = logos.filter(l => l.file);

if (root && shown.length) {
  const SPEED = 32; // px per second, slow on purpose
  const item = (l, hidden) => `<li${hidden ? ' aria-hidden="true"' : ''}><img src="/landing/logos/${l.file}" alt="${l.name}" width="${Math.round(l.height * l.w / l.h)}" height="${l.height}" style="--h:${l.height}" decoding="async" draggable="false"></li>`;
  const group = (repeats, hiddenGroup) => `<ul class="logos-group"${hiddenGroup ? ' aria-hidden="true"' : ''}>${Array.from({ length: repeats }, (_, i) => shown.map(l => item(l, hiddenGroup || i > 0)).join('')).join('')}</ul>`;
  root.innerHTML = `<h2 id="used-by-title">${logoHeading}</h2><div class="logos-strip"><div class="logos-track">${group(1, false)}${group(1, true)}</div></div>`;

  // One set of twelve is wider than the screen, so no logo repeats before the seam. Only on a screen wider than the set
  // is the set repeated, until one group is wider than the screen.
  const track = root.querySelector('.logos-track');
  const repeats = Math.max(1, Math.ceil((Math.max(innerWidth, screen.width || 0) + 200) / track.querySelector('.logos-group').scrollWidth));
  if (repeats > 1) track.innerHTML = group(repeats, false) + group(repeats, true);
  track.style.setProperty('--logos-dur', `${Math.round(track.scrollWidth / 2 / SPEED)}s`);
}
