import './overview.css';

// AI Tutor is a recorded take of the real app; the other four are still illustrative,
// local-only scenes until their own films exist. None of them are working app controls.
const scenes = [
  {
    label: 'AI Tutor', eyebrow: 'AI Tutor · Adaptive learning', title: 'A tutor that adapts to your understanding.', video: true,
    copy: 'Ask questions, try an example and explain your thinking. The tutor uses your answers to decide what to explain or ask next.',
    status: 'Guidance that responds to your understanding.',
  },
  {
    label: 'Explanations', title: 'See the idea. <br>Make the connection.',
    copy: 'A difficult concept becomes a clear visual explanation with meaningful interactions.',
    status: 'A space to think things through.',
    description: 'A visual canvas connects the word it to the cat in an example sentence, with a source note beside it.',
    art: `<div class="overview-demo demo-map"><span class="overview-demo-label">YOUR LEARNING CANVAS</span>
      <p class="overview-sentence">The cat sat down because <em>it</em> was tired.</p>
      <svg class="overview-map-lines" viewBox="0 0 500 270" fill="none"><path d="M260 86C260 160 130 118 130 197M260 86C260 130 390 118 390 197" stroke="#c4c8cd" stroke-width="1.5"/><path class="overview-beat" d="M260 86C260 160 130 118 130 197" stroke="#586f96" stroke-width="3"/></svg>
      <div class="overview-map-node map-word overview-beat">it</div><div class="overview-map-node map-cat overview-beat">the cat <small>useful context</small></div><div class="overview-map-node map-mat overview-beat">the mat</div>
      <div class="overview-map-note overview-beat">↳ The clue is in the relationship.</div></div>`,
  },
  {
    label: 'Your materials', title: 'Start with what <br>makes you curious.',
    copy: 'Bring a PDF or webpage, select something, ask about it and retain its source.',
    status: 'Your material is the starting point.',
    description: 'A paper, a repository and personal notes come together in one learning project.',
    art: `<div class="overview-demo demo-gather"><span class="overview-demo-label">YOUR STARTING POINT</span>
      <div class="overview-source-card overview-beat"><span class="overview-file">≡</span><div><strong>A paper worth understanding</strong><small>Attention Is All You Need</small></div><span class="overview-check">✓</span></div>
      <div class="overview-source-card overview-beat"><span class="overview-file">{ }</span><div><strong>The code behind the idea</strong><small>model / attention.py</small></div><span class="overview-check">✓</span></div>
      <div class="overview-source-card overview-beat"><span class="overview-file">↳</span><div><strong>Your unfinished thoughts</strong><small>Notes, questions, possibilities</small></div><span class="overview-check">✓</span></div>
      <div class="overview-small-prompt overview-beat">How does it all connect? <span>↗</span></div></div>`,
  },
  {
    label: 'Learn by doing', title: 'Turn a little clarity <br>into understanding.',
    copy: 'Work through problems, write, run code or experiment beside the learning material.',
    status: 'Learning you can put to the test.',
    description: 'An illustrative practice question selects the cat, then explains that it refers to the tired cat.',
    art: `<div class="overview-demo demo-check"><span class="overview-demo-label">A QUICK CHECK</span><p class="overview-practice-question">“The cat sat down because it was tired.”<br><strong>What does “it” refer to?</strong></p>
      <div class="overview-answer-option overview-beat"><span>A</span>The cat<i>✓</i></div><div class="overview-answer-option overview-beat"><span>B</span>The place it sat</div>
      <div class="overview-feedback overview-beat"><strong>Follow the context.</strong><p>The cat is tired. The surrounding words help us connect the idea.</p></div></div>`,
  },
  {
    label: 'Rabbit Holes', title: 'Pick up the thread. <br>Keep going deeper.',
    copy: 'Branch into a question, explore connected canvases and return without losing your place.',
    status: 'Your understanding has somewhere to stay.',
    description: 'A learning collection holds an explanation, a canvas and personal notes ready to revisit.',
    art: `<div class="overview-demo demo-library"><span class="overview-demo-label">YOUR LEARNING, TOGETHER</span><div class="overview-collection overview-beat"><span class="overview-collection-symbol">↳</span><div><small>LEARNING COLLECTION</small><strong>Attention, understood.</strong><span>Follow the connections you made.</span></div></div>
      <div class="overview-saved-row overview-beat"><span>01</span><div><strong>The idea in plain language</strong><small>Explanation · Sources attached</small></div><i>↗</i></div>
      <div class="overview-saved-row overview-beat"><span>02</span><div><strong>My visual map</strong><small>Canvas · Connections and examples</small></div><i>↗</i></div>
      <div class="overview-saved-row overview-beat"><span>03</span><div><strong>Questions to come back to</strong><small>Notes · The next way in</small></div><i>↗</i></div></div>`,
  },
];

// The recorded take's conversation as text, for screen readers (the video itself is silent).
const TUTOR_LINES = [
  ['Learner', 'I want to understand what affects a pendulum’s swing.'],
  ['Tutor', 'What would make a pendulum swing more slowly: more weight or a longer string?'],
  ['Learner', 'More weight?'],
  ['Tutor', 'Let’s compare two pendulums. Type /explain to open the example.'],
  ['Learner', '/explain compare how mass and length affect a pendulum’s swing'],
  ['Canvas', 'The card “What changes a pendulum’s swing?” opens with A, the reference, and B, your experiment, both at 1 kg and 1 m.'],
  ['Learner', 'What should I change?'],
  ['Tutor', 'Change B’s mass to 2 kg, keep its length unchanged, then press Play.'],
  ['Canvas', 'B’s mass is set to 2 kg and Play starts both: they swing together, 2.01 s per swing each.'],
  ['Learner', 'They’re still swinging together.'],
  ['Tutor', 'Right, the extra mass didn’t change the timing. Now try a longer string.'],
  ['Canvas', 'B goes back to 1 kg and its length to 2 m, then Play: B swings more slowly, 2.84 s per swing against A’s 2.01 s.'],
  ['Learner', 'The longer string makes it slower, not the extra weight.'],
  ['Tutor', 'Exactly. The longer pendulum takes more time to complete each swing.'],
]
// Two edits of one take: a wide one, and a closer one for phones (the stacked panel is nearly square there).
const narrow = matchMedia('(max-width: 700px)').matches;
const media = `<div class="overview-media">
  <video muted playsinline loop preload="none" poster="/landing/ai-tutor-demo${narrow ? '-phone' : ''}-poster-v3.jpg" aria-label="The Rabbit Hole canvas with the Tutor beside it: a learner tests a prediction about pendulums" aria-describedby="overview-transcript-text">
    <source src="/landing/ai-tutor-demo${narrow ? '-phone' : ''}-v5.webm" type="video/webm">
  </video>
  <span class="overview-progress" aria-hidden="true"><i></i></span>
  <ol class="overview-transcript" id="overview-transcript-text">${TUTOR_LINES.map(([who, line]) => `<li>${who}: ${line}</li>`).join('')}</ol>
</div>`;

const root = document.getElementById('observatory');
const stage = root.querySelector('.overview-stage');
const windowFrame = root.querySelector('.overview-window');
const tablist = root.querySelector('.overview-tabs');
const screens = root.querySelector('.overview-screens');
const status = root.querySelector('.overview-status');
const preview = root.querySelector('.overview-preview-label');
const desktop = matchMedia('(min-width: 901px) and (min-height: 700px)');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = value => Math.max(0, Math.min(1, value));
let selected = -1, queued = false, gesture = null;

tablist.innerHTML = scenes.map((scene, index) => `<button type="button" role="tab" id="overview-tab-${index}" aria-controls="overview-panel-${index}" aria-selected="false" tabindex="-1">${scene.label}</button>`).join('');
screens.innerHTML = scenes.map((scene, index) => `<div class="overview-panel${scene.video ? ' overview-panel-video' : ''}" role="tabpanel" id="overview-panel-${index}" aria-labelledby="overview-tab-${index}" aria-hidden="true" inert>
  <div class="overview-panel-copy"><span class="overview-panel-eyebrow">${scene.eyebrow || scene.label}</span><h3>${scene.title}</h3><p>${scene.copy}</p></div>
  ${scene.video ? media : `<div class="overview-illustration" role="img" aria-label="${scene.description}"><div aria-hidden="true">${scene.art}</div></div>`}
</div>`).join('');
const tabs = [...tablist.children], panels = [...screens.children];
// The AI Tutor take plays silently on a loop only while its tab is shown, the window is on screen and the page is visible;
// with reduced motion it stays on its poster. There are no player controls: it is a picture of the product, not a player.
const video = root.querySelector('.overview-media video'), progress = root.querySelector('.overview-progress i');
let onScreen = false, frame = 0;
const track = () => { progress.style.transform = `scaleX(${video.duration ? video.currentTime / video.duration : 0})`; frame = requestAnimationFrame(track); };
video.addEventListener('playing', () => { cancelAnimationFrame(frame); track(); });
video.addEventListener('pause', () => cancelAnimationFrame(frame));
function syncVideo() {
  const play = scenes[selected]?.video && onScreen && !document.hidden && !reduced.matches;
  if (play && video.paused) video.play().catch(() => {});
  else if (!play && !video.paused) video.pause();
}
document.addEventListener('visibilitychange', syncVideo);
reduced.addEventListener('change', syncVideo);
new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; syncVideo(); }, { threshold: .4 }).observe(windowFrame);
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
  // The recorded tab is the product itself; the other four are illustrations.
  preview.hidden = !!scenes[index].video;
  syncVideo();
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
