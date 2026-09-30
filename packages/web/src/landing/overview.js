import './overview.css';

// Illustrative, local-only product scenes. These are not working app controls.
const scenes = [
  {
    label: 'Sources', title: 'Start with what <br>makes you curious.',
    copy: 'Bring a repository, a paper, or your own notes. Give your questions a place to begin.',
    status: 'Your material is the starting point.',
    description: 'A paper, a repository and personal notes come together in one learning project.',
    art: `<div class="overview-demo demo-gather"><span class="overview-demo-label">YOUR STARTING POINT</span>
      <div class="overview-source-card overview-beat"><span class="overview-file">≡</span><div><strong>A paper worth understanding</strong><small>Attention Is All You Need</small></div><span class="overview-check">✓</span></div>
      <div class="overview-source-card overview-beat"><span class="overview-file">{ }</span><div><strong>The code behind the idea</strong><small>model / attention.py</small></div><span class="overview-check">✓</span></div>
      <div class="overview-source-card overview-beat"><span class="overview-file">↳</span><div><strong>Your unfinished thoughts</strong><small>Notes, questions, possibilities</small></div><span class="overview-check">✓</span></div>
      <div class="overview-small-prompt overview-beat">How does it all connect? <span>↗</span></div></div>`,
  },
  {
    label: 'Questions', title: 'Ask the next <br>better question.',
    copy: 'Find the missing step. Ask for a simpler explanation, a different example, or another way in.',
    status: 'An answer opens the next question.',
    description: 'A learner question receives a short explanation with a source reference, then a visual follow-up.',
    art: `<div class="overview-demo demo-dialogue"><span class="overview-demo-label">FOLLOW THE THREAD</span>
      <div class="overview-ask overview-beat">Why does attention need context?</div>
      <div class="overview-response overview-beat"><span class="rh-mark"></span><div><strong>One word can mean different things.</strong><p>The surrounding words help us work out which meaning fits.</p><span class="overview-citation">↗ Attention Is All You Need</span></div></div>
      <div class="overview-follow-up overview-beat">Show me with an example. <span>↗</span></div></div>`,
  },
  {
    label: 'Canvas', title: 'See the idea. <br>Make the connection.',
    copy: 'Explore explanations on a visual canvas. Connect the pieces and build a picture that makes sense to you.',
    status: 'A space to think things through.',
    description: 'A visual canvas connects the word it to the cat in an example sentence, with a source note beside it.',
    art: `<div class="overview-demo demo-map"><span class="overview-demo-label">YOUR LEARNING CANVAS</span>
      <p class="overview-sentence">The cat sat down because <em>it</em> was tired.</p>
      <svg class="overview-map-lines" viewBox="0 0 500 270" fill="none"><path d="M260 86C260 160 130 118 130 197M260 86C260 130 390 118 390 197" stroke="#c4c8cd" stroke-width="1.5"/><path class="overview-beat" d="M260 86C260 160 130 118 130 197" stroke="#586f96" stroke-width="3"/></svg>
      <div class="overview-map-node map-word overview-beat">it</div><div class="overview-map-node map-cat overview-beat">the cat <small>useful context</small></div><div class="overview-map-node map-mat overview-beat">the mat</div>
      <div class="overview-map-note overview-beat">↳ The clue is in the relationship.</div></div>`,
  },
  {
    label: 'Practice', title: 'Turn a little clarity <br>into understanding.',
    copy: 'Try a question while the idea is fresh. Use the explanation to work through what you missed.',
    status: 'Learning you can put to the test.',
    description: 'An illustrative practice question selects the cat, then explains that it refers to the tired cat.',
    art: `<div class="overview-demo demo-check"><span class="overview-demo-label">A QUICK CHECK</span><p class="overview-practice-question">“The cat sat down because it was tired.”<br><strong>What does “it” refer to?</strong></p>
      <div class="overview-answer-option overview-beat"><span>A</span>The cat<i>✓</i></div><div class="overview-answer-option overview-beat"><span>B</span>The place it sat</div>
      <div class="overview-feedback overview-beat"><strong>Follow the context.</strong><p>The cat is tired. The surrounding words help us connect the idea.</p></div></div>`,
  },
  {
    label: 'Saved learning', title: 'Pick up the thread. <br>Keep going deeper.',
    copy: 'Keep your notes, sources and discoveries together. Come back with your context intact.',
    status: 'Your understanding has somewhere to stay.',
    description: 'A learning collection holds an explanation, a canvas and personal notes ready to revisit.',
    art: `<div class="overview-demo demo-library"><span class="overview-demo-label">YOUR LEARNING, TOGETHER</span><div class="overview-collection overview-beat"><span class="overview-collection-symbol">↳</span><div><small>LEARNING COLLECTION</small><strong>Attention, understood.</strong><span>Follow the connections you made.</span></div></div>
      <div class="overview-saved-row overview-beat"><span>01</span><div><strong>The idea in plain language</strong><small>Explanation · Sources attached</small></div><i>↗</i></div>
      <div class="overview-saved-row overview-beat"><span>02</span><div><strong>My visual map</strong><small>Canvas · Connections and examples</small></div><i>↗</i></div>
      <div class="overview-saved-row overview-beat"><span>03</span><div><strong>Questions to come back to</strong><small>Notes · The next way in</small></div><i>↗</i></div></div>`,
  },
];

const root = document.getElementById('observatory');
const stage = root.querySelector('.overview-stage');
const windowFrame = root.querySelector('.overview-window');
const tablist = root.querySelector('.overview-tabs');
const screens = root.querySelector('.overview-screens');
const counter = root.querySelector('.overview-count');
const status = root.querySelector('.overview-status');
const desktop = matchMedia('(min-width: 901px) and (min-height: 760px)');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = value => Math.max(0, Math.min(1, value));
let selected = -1, queued = false, gesture = null;

tablist.innerHTML = scenes.map((scene, index) => `<button type="button" role="tab" id="overview-tab-${index}" aria-controls="overview-panel-${index}" aria-selected="false" tabindex="-1"><span class="overview-tab-number" aria-hidden="true">0${index + 1}</span>${scene.label}</button>`).join('');
screens.innerHTML = scenes.map((scene, index) => `<div class="overview-panel" role="tabpanel" id="overview-panel-${index}" aria-labelledby="overview-tab-${index}" aria-hidden="true" inert>
  <div class="overview-panel-copy"><span class="overview-panel-eyebrow">0${index + 1} / ${scene.label}</span><h3>${scene.title}</h3><p>${scene.copy}</p></div>
  <div class="overview-illustration" role="img" aria-label="${scene.description}"><div aria-hidden="true">${scene.art}</div></div>
</div>`).join('');
const tabs = [...tablist.children], panels = [...screens.children];
panels.forEach(panel => panel.querySelectorAll('.overview-beat').forEach((element, index) => { element.style.animationDelay = `${Math.min(index, 4) * 180}ms`; }));

function show(index, instant = false) {
  if (selected === index) return;
  selected = index;
  root.dataset.overview = String(index + 1);
  root.classList.toggle('overview-instant', instant);
  tabs.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; });
  panels.forEach((panel, i) => {
    panel.classList.toggle('is-active', i === index);
    panel.setAttribute('aria-hidden', String(i !== index));
    panel.inert = i !== index;
  });
  status.textContent = scenes[index].status;
  counter.textContent = `0${index + 1} / 05`;
}
function geometry() {
  return { start: root.getBoundingClientRect().top + scrollY, travel: Math.max(1, root.clientHeight - stage.offsetHeight) };
}
function update() {
  queued = false;
  root.classList.toggle('overview-scroll', desktop.matches);
  const { start, travel } = geometry();
  if (desktop.matches) show(Math.min(4, Math.floor(clamp((scrollY - start) / travel) * 5)));
  const reveal = reduced.matches ? 1 : clamp((innerHeight * .85 - root.getBoundingClientRect().top) / (innerHeight * .7));
  windowFrame.style.transform = `translateY(${(1 - reveal) * 40}px) scale(${.94 + reveal * .06})`;
  windowFrame.style.opacity = String(.15 + reveal * .85);
}
function schedule() { if (!queued) { queued = true; requestAnimationFrame(update); } }
function choose(index, instant = false) {
  show(index, instant);
  if (desktop.matches) {
    const { start, travel } = geometry();
    scrollTo({ top: start + travel * (index + .5) / 5, behavior: 'instant' });
  }
  const tabBounds = tabs[index].getBoundingClientRect(), listBounds = tablist.getBoundingClientRect();
  if (tabBounds.left < listBounds.left) tablist.scrollBy({ left: tabBounds.left - listBounds.left - 8, behavior: 'instant' });
  else if (tabBounds.right > listBounds.right) tablist.scrollBy({ left: tabBounds.right - listBounds.right + 8, behavior: 'instant' });
}
tabs.forEach((tab, index) => tab.addEventListener('click', event => choose(index, event.detail === 0)));
tablist.addEventListener('keydown', event => {
  let index = tabs.indexOf(event.target);
  if (index < 0) return;
  if (event.key === 'ArrowRight') index = (index + 1) % scenes.length;
  else if (event.key === 'ArrowLeft') index = (index + scenes.length - 1) % scenes.length;
  else if (event.key === 'Home') index = 0;
  else if (event.key === 'End') index = scenes.length - 1;
  else return;
  event.preventDefault(); choose(index, true); tabs[index].focus({ preventScroll: true });
});
screens.addEventListener('pointerdown', event => { if (!desktop.matches && event.isPrimary && event.pointerType !== 'mouse') gesture = { x: event.clientX, y: event.clientY }; });
screens.addEventListener('pointerup', event => {
  if (!gesture) return;
  const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y; gesture = null;
  if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) choose(Math.max(0, Math.min(4, selected + (dx < 0 ? 1 : -1))));
});
screens.addEventListener('pointercancel', () => { gesture = null; });
addEventListener('scroll', schedule, { passive: true });
addEventListener('resize', schedule);
desktop.addEventListener('change', schedule);
reduced.addEventListener('change', schedule);
new ResizeObserver(schedule).observe(stage);
document.fonts.ready.then(schedule);
show(0); update();
