import './adaptive.css';
import './adaptive-softmax.css';
import { createSoftmaxPreview } from './adaptive-softmax.js';

const root = document.getElementById('adaptive-learning');
if (root) {
  const tabs = [...root.querySelectorAll('[data-adaptive-mode]')];
  const copies = [...root.querySelectorAll('[data-adaptive-copy]')];
  const scenes = [...root.querySelectorAll('[data-adaptive-scene]')];
  const panel = root.querySelector('[role="tabpanel"]');
  const preview = createSoftmaxPreview(root.querySelector('.softmax-overview .softmax-canvas'), root.querySelector('[data-softmax-status]'));
  let codeLoading = false;

  function select(tab, instant) {
    root.toggleAttribute('data-instant', instant);
    root.dataset.mode = tab.dataset.adaptiveMode;
    for (const button of tabs) {
      const selected = button === tab;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    for (const copy of copies) copy.hidden = copy.dataset.adaptiveCopy !== root.dataset.mode;
    for (const scene of scenes) {
      scene.hidden = scene.dataset.adaptiveScene !== root.dataset.mode;
      scene.inert = scene.hidden;
    }
    panel.setAttribute('aria-labelledby', tab.id);
    preview.select(root.dataset.mode === 'overview', instant);
    if (root.dataset.mode === 'deep' && !codeLoading) {
      codeLoading = true;
      // Keep the plain source visible if the optional shared highlighter cannot load.
      import('./adaptive-code.jsx').then(({ mountCode }) => mountCode(root.querySelector('.softmax-code'))).catch(() => { codeLoading = false; });
    }
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

  const score = root.querySelector('#softmax-score');
  score.addEventListener('input', () => {
    const scores = [Number(score.value), 1, 0, -1];
    const weights = scores.map(value => Math.exp(value));
    const sum = weights.reduce((a, b) => a + b, 0);
    const probabilities = weights.map(value => value / sum);
    root.querySelector('[data-score="0"]').textContent = scores[0];
    root.querySelector('[data-score-output]').textContent = scores[0].toFixed(2);
    root.querySelector('[data-weight-sum]').textContent = sum.toFixed(2);
    root.querySelector('[data-score-vector]').textContent = `[${scores.join(', ')}]`;
    root.querySelector('[data-prob-vector]').textContent = `[${probabilities.map(value => value.toFixed(3)).join(', ')}]`;
    for (const [i, probability] of probabilities.entries()) {
      root.querySelector(`[data-weight="${i}"]`).textContent = weights[i].toFixed(2);
      root.querySelector(`[data-prob="${i}"]`).textContent = `${(probability * 100).toFixed(1)}%`;
      root.querySelectorAll('.softmax-shares span')[i].style.width = `${probability * 100}%`;
    }
    root.querySelector('.softmax-shares').setAttribute('aria-label', `Probability shares: ${probabilities.map((value, i) => `${'ABCD'[i]} ${(value * 100).toFixed(1)}%`).join(', ')}.`);
  });
}
