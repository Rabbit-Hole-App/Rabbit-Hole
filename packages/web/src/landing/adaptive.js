import './adaptive.css';
import './adaptive-softmax.css';
import { createSoftmaxPreview, createGuidedPreview } from './adaptive-softmax.js';
import { softmaxValues } from './adaptive-softmax-math.js';

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
    guided.select(root.dataset.mode === 'guided', instant);
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

  const sliders = [...root.querySelectorAll('[data-score-input]')];
  function updateScores() {
    const scores = [Number(sliders[0].value), 1, 0, -1];
    const { probabilities } = softmaxValues(scores);
    root.querySelector('[data-score-vector]').textContent = `[${scores.join(', ')}]`;
    root.querySelector('[data-prob-vector]').textContent = `[${probabilities.map(value => value.toFixed(3)).join(', ')}]`;
    for (const [i, probability] of probabilities.entries()) {
      root.querySelector(`[data-prob="${i}"]`).textContent = `${(probability * 100).toFixed(1)}%`;
      root.querySelector(`[data-prob-bar="${i}"]`).style.transform = `scaleY(${probability})`;
    }
    root.querySelector('[data-score-output="0"]').textContent = scores[0].toFixed(2);
    root.querySelector('.softmax-graph').setAttribute('aria-label', `Softmax probabilities: ${probabilities.map((value, i) => `${'ABCD'[i]} ${(value * 100).toFixed(1)}%`).join(', ')}.`);
  }
  const guided = createGuidedPreview(root.querySelector('.softmax-guided'), updateScores);
  for (const slider of sliders) slider.addEventListener('input', updateScores);
  updateScores();
  const quiz = root.querySelector('[data-guided-quiz]');
  quiz.addEventListener('change', event => {
    const correct = event.target.value === '25';
    quiz.dataset.result = correct ? 'correct' : 'retry';
    quiz.querySelector('.softmax-quiz-feedback').textContent = correct
      ? 'Correct. Equal scores have equal exponential weights. Each gets one quarter of the total: 25%.'
      : 'Not quite. Four equal shares must add up to 100%. Divide 100% by 4 and try again.';
  });
}
