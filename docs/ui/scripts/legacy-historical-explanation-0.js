
const source = document.getElementById('source-example');
let sourceTrigger;

for (const button of document.querySelectorAll('[data-reveal]')) {
  const detail = document.getElementById(button.getAttribute('aria-controls'));
  button.addEventListener('click', () => {
    const opening = detail.hidden;
    detail.hidden = !opening;
    button.setAttribute('aria-expanded', String(opening));
  });
}

for (const button of document.querySelectorAll('[data-source]')) {
  button.addEventListener('click', () => {
    sourceTrigger = button;
    source.hidden = false;
    source.focus({ preventScroll: true });
    source.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}
function closeSource() {
  source.hidden = true;
  sourceTrigger?.focus();
}
document.getElementById('close-source').addEventListener('click', closeSource);
source.addEventListener('keydown', event => { if (event.key === 'Escape') closeSource(); });
