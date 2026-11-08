
const tabs = [...document.querySelectorAll('[role="tab"]')];
const panels = [...document.querySelectorAll('.depth-panel')];
const budget = document.getElementById('budget');
const source = document.getElementById('source-example');
let sourceTrigger;

function showDepth(key) {
  const active = document.getElementById(`panel-${key}`);
  if (!active) return;
  for (const tab of tabs) {
    const selected = tab.dataset.depth === key;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const panel of panels) panel.hidden = panel !== active;
  budget.textContent = `${active.dataset.count} / ${active.dataset.cap} characters`;
}

for (const [index, tab] of tabs.entries()) {
  tab.addEventListener('click', () => showDepth(tab.dataset.depth));
  tab.addEventListener('keydown', event => {
    const target = {
      ArrowLeft: (index + tabs.length - 1) % tabs.length,
      ArrowRight: (index + 1) % tabs.length,
      Home: 0,
      End: tabs.length - 1
    }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    showDepth(tabs[target].dataset.depth);
    tabs[target].focus();
  });
}

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
showDepth(location.hash.slice(1) || 'standard');
