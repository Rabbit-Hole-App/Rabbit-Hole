
const reading = document.getElementById('reading');
const controls = [...document.querySelectorAll('[data-explain-more]')];
let savedScroll = 0;
const expanded = () => controls.some(button => button.getAttribute('aria-expanded') === 'true');
for (const button of controls) {
  button.addEventListener('click', () => {
    const panel = document.getElementById(button.getAttribute('aria-controls'));
    const opening = panel.hidden;
    if (opening && !expanded()) savedScroll = reading.scrollTop;
    panel.hidden = !opening;
    button.setAttribute('aria-expanded', String(opening));
    if (opening) {
      const top = panel.getBoundingClientRect().top - reading.getBoundingClientRect().top + reading.scrollTop - 12;
      reading.scrollTop = Math.max(0, top);
    } else if (!expanded()) {
      reading.scrollTop = savedScroll;
    }
  });
}

const viewport = document.getElementById('target-viewport');
const markdown = document.getElementById('markdown-reading');
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
let emphasized;
let emphasisTimer;

function revealInside(scroller, target, inset, behavior) {
  const top = scroller.scrollTop + target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - inset;
  scroller.scrollTo({ top: Math.max(0, top), behavior });
}

function emphasize(target) {
  clearTimeout(emphasisTimer);
  emphasized?.classList.remove('target-emphasis');
  emphasized = target;
  target.classList.add('target-emphasis');
  emphasisTimer = setTimeout(() => target.classList.remove('target-emphasis'), 1800);
}

for (const button of document.querySelectorAll('[data-view-card]')) {
  button.addEventListener('click', () => {
    const card = document.getElementById(button.dataset.viewCard);
    const behavior = motion.matches ? 'auto' : 'smooth';
    revealInside(viewport, card, 4, behavior);
    viewport.scrollIntoView({ block: 'nearest', behavior });
    card.focus({ preventScroll: true });
    emphasize(card);
  });
}

for (const button of document.querySelectorAll('[data-view-section]')) {
  button.addEventListener('click', () => {
    const section = document.getElementById(button.dataset.viewSection);
    const behavior = motion.matches ? 'auto' : 'smooth';
    revealInside(markdown, section, 12, behavior);
    markdown.closest('.markdown-card').scrollIntoView({ block: 'nearest', behavior });
    section.focus({ preventScroll: true });
    emphasize(section);
  });
}
