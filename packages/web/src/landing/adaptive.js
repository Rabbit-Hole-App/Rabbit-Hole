import './adaptive.css';

const root = document.getElementById('adaptive-learning');
if (root) {
  const tabs = [...root.querySelectorAll('[data-adaptive-mode]')];
  const copies = [...root.querySelectorAll('[data-adaptive-copy]')];
  const panel = root.querySelector('[role="tabpanel"]');

  function select(tab, instant) {
    root.toggleAttribute('data-instant', instant);
    root.dataset.mode = tab.dataset.adaptiveMode;
    for (const button of tabs) {
      const selected = button === tab;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    for (const copy of copies) copy.hidden = copy.dataset.adaptiveCopy !== root.dataset.mode;
    panel.setAttribute('aria-labelledby', tab.id);
  }

  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener('click', event => select(tab, event.detail === 0));
    tab.addEventListener('keydown', event => {
      const next = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      select(tabs[next], true);
      tabs[next].focus();
    });
  }
}
