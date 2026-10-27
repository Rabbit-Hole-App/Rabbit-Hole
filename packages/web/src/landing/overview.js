import './overview.css';

// AI Tutor is a recorded take of the real app (scripted, see TUTOR_LINES); the other four are still illustrative,
// local-only scenes until their own films exist. None of them are working app controls.
const scenes = [
  {
    label: 'AI Tutor', title: 'A tutor that helps you <br>work it out.', video: true,
    copy: 'Explore an idea, test your reasoning and get guidance that responds to what you understand.',
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

// The recorded conversation, as text: the transcript beside the silent video (C:/s/spec/landing-tutor/capture/script.json).
const TUTOR_LINES = [
  ['You', 'I want to understand what affects a pendulum’s swing.'],
  ['Tutor', 'Good goal. Start with a prediction: which would make a pendulum swing more slowly, a heavier weight or a longer string?'],
  ['You', 'A heavier weight. It would take longer to move.'],
  ['Tutor', 'Let’s test your idea: change only the mass and keep the length fixed. Open the two-pendulum experiment.'],
  ['On the canvas', 'The learner types /explain and the prepared card “What changes a pendulum’s swing?” opens. A is fixed at 1 m and 1 kg; B has mass and length controls. B is set to 4 kg; both show one full swing in 2.01 s.'],
  ['You', 'Changing only the mass didn’t change the swing time. My heavier-means-slower prediction was wrong.'],
  ['Tutor', 'You’ve ruled out mass in this model. With equal masses again, what will a longer string do?'],
  ['You', 'Swing more slowly.'],
  ['Tutor', 'Try it: reset, then change only B’s length to 2 m.'],
  ['On the canvas', 'Reset puts both back to 1 m and 1 kg; B at 2 m now shows one full swing in 2.84 s against A’s 2.01 s.'],
  ['You', 'Longer string, longer swing time, even with equal masses.'],
  ['Tutor', 'That supports your prediction about length. At four times the length, would the swing time double or quadruple?'],
];
const ICONS = {
  play: '<svg class="overview-icon-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7Z" fill="currentColor"/></svg>',
  pause: '<svg class="overview-icon-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zm6 0h4v14h-4z" fill="currentColor"/></svg>',
  replay: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
};
const media = `<div class="overview-media">
  <div class="overview-video-frame">
    <video muted playsinline preload="none" width="1400" height="950" poster="/landing/ai-tutor-demo-poster-v1.jpg" aria-label="Recorded demo: the Rabbit Hole canvas with the Tutor panel. A learner predicts that a heavier pendulum swings more slowly, tests it with a two-pendulum card and revises the idea. Silent; the conversation is also below as text." aria-describedby="overview-transcript-text">
      <source src="/landing/ai-tutor-demo-v1.webm" type="video/webm">
    </video>
    <p class="overview-video-error" role="status" hidden>The demo video could not load. The conversation is below as text.</p>
  </div>
  <div class="overview-video-bar">
    <button type="button" class="overview-video-play" aria-label="Play demo">${ICONS.play}${ICONS.pause}<span>Play</span></button>
    <button type="button" class="overview-video-replay" aria-label="Replay demo from the start">${ICONS.replay}<span>Replay</span></button>
    <span class="overview-disclosure">Scripted product demo · generation time omitted.</span>
  </div>
  <details class="overview-transcript"><summary>Read the conversation</summary><ol id="overview-transcript-text">${TUTOR_LINES.map(([who, line]) => `<li><strong>${who}</strong> ${line}</li>`).join('')}</ol></details>
</div>`;

const root = document.getElementById('observatory');
const stage = root.querySelector('.overview-stage');
const windowFrame = root.querySelector('.overview-window');
const tablist = root.querySelector('.overview-tabs');
const screens = root.querySelector('.overview-screens');
const status = root.querySelector('.overview-status');
const preview = root.querySelector('.overview-preview-label');
const compact = matchMedia('(max-width: 900px)');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = value => Math.max(0, Math.min(1, value));
let selected = -1, queued = false, gesture = null;

tablist.innerHTML = scenes.map((scene, index) => `<button type="button" role="tab" id="overview-tab-${index}" aria-controls="overview-panel-${index}" aria-selected="false" tabindex="-1">${scene.label}</button>`).join('');
screens.innerHTML = scenes.map((scene, index) => `<div class="overview-panel${scene.video ? ' overview-panel-video' : ''}" role="tabpanel" id="overview-panel-${index}" aria-labelledby="overview-tab-${index}" aria-hidden="true" inert>
  <div class="overview-panel-copy"><span class="overview-panel-eyebrow">${scene.label}</span><h3>${scene.title}</h3><p>${scene.copy}</p></div>
  ${scene.video ? media : `<div class="overview-illustration" role="img" aria-label="${scene.description}"><div aria-hidden="true">${scene.art}</div></div>`}
</div>`).join('');
const tabs = [...tablist.children], panels = [...screens.children];
panels.forEach(panel => panel.querySelectorAll('.overview-beat').forEach((element, index) => { element.style.animationDelay = `${Math.min(index, 4) * 180}ms`; }));

// The demo video: played only by its own controls, never looped, paused whenever it cannot be seen and never resumed by itself.
const video = root.querySelector('.overview-media video');
const playButton = root.querySelector('.overview-video-play'), replayButton = root.querySelector('.overview-video-replay');
const syncPlay = () => {
  const playing = !video.paused && !video.ended;
  playButton.classList.toggle('is-playing', playing);
  playButton.setAttribute('aria-label', playing ? 'Pause demo' : 'Play demo');
  playButton.querySelector('span').textContent = playing ? 'Pause' : 'Play';
};
const failed = () => { root.querySelector('.overview-video-error').hidden = false; playButton.disabled = replayButton.disabled = true; };
const start = () => video.play().catch(error => { if (error.name !== 'AbortError') failed(); });
playButton.addEventListener('click', () => (video.paused || video.ended ? start() : video.pause()));
replayButton.addEventListener('click', () => { video.currentTime = 0; start(); });
['play', 'pause', 'ended'].forEach(name => video.addEventListener(name, syncPlay));
video.querySelector('source').addEventListener('error', failed);
video.addEventListener('error', failed);
const stop = () => { if (!video.paused) video.pause(); };
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) stop(); }).observe(windowFrame);

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
  if (!scenes[index].video) stop();
  status.textContent = scenes[index].status;
  // The recorded tab carries its own disclosure under the video; the other four are illustrations.
  preview.hidden = !!scenes[index].video;
}
function update() {
  queued = false;
  const reveal = reduced.matches ? 1 : clamp((innerHeight * .85 - root.getBoundingClientRect().top) / (innerHeight * .7));
  windowFrame.style.transform = `translateY(${(1 - reveal) * 40}px) scale(${.94 + reveal * .06})`;
  windowFrame.style.opacity = String(.15 + reveal * .85);
}
function schedule() { if (!queued) { queued = true; requestAnimationFrame(update); } }
function choose(index, instant = false) {
  show(index, instant);
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
// Touch swipes change tabs on compact layouts, except over the video and its controls.
screens.addEventListener('pointerdown', event => { if (compact.matches && event.isPrimary && event.pointerType !== 'mouse' && !event.target.closest('.overview-media')) gesture = { x: event.clientX, y: event.clientY }; });
screens.addEventListener('pointerup', event => {
  if (!gesture) return;
  const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y; gesture = null;
  if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) choose(Math.max(0, Math.min(scenes.length - 1, selected + (dx < 0 ? 1 : -1))));
});
screens.addEventListener('pointercancel', () => { gesture = null; });
addEventListener('scroll', schedule, { passive: true });
addEventListener('resize', schedule);
reduced.addEventListener('change', schedule);
new ResizeObserver(schedule).observe(stage);
show(0); update();
