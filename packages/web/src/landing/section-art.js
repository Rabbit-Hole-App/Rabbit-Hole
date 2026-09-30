import './section-art.css';

// Decorative depth: only two transforms, updated when scroll or layout changes.
// Keep the art independent from the interactive demo and audience state.
const pieces = [...document.querySelectorAll('[data-section-art]')].map(element => ({
  section: element.closest('section'),
  image: element.querySelector('img'),
  direction: element.dataset.sectionArt === 'depth' ? 1 : -1,
}));
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let queued = false;

function update() {
  queued = false;
  for (const { section, image, direction } of pieces) {
    if (reduced.matches) { image.style.transform = 'none'; continue; }
    const bounds = section.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (innerHeight - bounds.top) / (innerHeight + bounds.height))) - .5;
    image.style.transform = `translate3d(${(progress * 16 * direction).toFixed(2)}px, ${(progress * 48).toFixed(2)}px, 0)`;
  }
}
function schedule() {
  if (!queued) { queued = true; requestAnimationFrame(update); }
}
addEventListener('scroll', schedule, { passive: true });
addEventListener('resize', schedule);
reduced.addEventListener('change', schedule);
document.fonts.ready.then(schedule);
update();
