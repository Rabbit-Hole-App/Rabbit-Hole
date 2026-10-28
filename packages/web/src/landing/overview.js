import './overview.css';

// AI Tutor, Beyond lecture notes and Bring your materials are recorded takes of the real app; the other two are still illustrative,
// local-only scenes until their own films exist. None of them are working app controls.
const scenes = [
  {
    label: 'AI Tutor', eyebrow: 'AI Tutor · Adaptive learning', title: 'A tutor that adapts to your understanding.', video: true,
    copy: 'Ask questions, try an example and explain your thinking. The tutor uses your answers to decide what to explain or ask next.',
    status: 'Guidance that responds to your understanding.',
  },
  {
    label: 'Beyond lecture notes', eyebrow: 'Beyond lecture notes', title: 'See the same idea in different ways.', video: true,
    copy: 'Turn a concept from your slides into a video, a 3D model or an interactive graph.',
    status: 'Your slides, in more than one form.',
  },
  {
    label: 'Bring your materials', eyebrow: 'Bring your materials', title: 'Understand your papers and code together.', video: true,
    copy: 'Upload a paper or connect a GitHub repository. Explore the code, highlight a passage and ask questions with both sources in context.',
    status: 'Your paper and your code, in one conversation.',
  },
  {
    label: 'Learn by doing', eyebrow: 'Learn by doing', title: 'Put what you read into practice.', video: true,
    copy: 'Keep a paper in view while you work in a notebook. Then explain the idea in your own words and get feedback.',
    status: 'Read it. Work through it. Explain it back.',
  },
  {
    label: 'Rabbit Holes', eyebrow: 'Rabbit Holes', title: 'Follow a question further.', video: true,
    copy: 'Explore a related question in its own canvas. Bring in videos and articles, link your ideas, and find your way back.',
    status: 'Connected ideas. Room to explore.',
  },
];

// Each recorded take's conversation as text, for screen readers (the videos are silent).
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
];
const BEYOND_LINES = [
  ['Learner', 'Drops the lecture slide “Gear ratios and rotational speed” onto the canvas and selects it.'],
  ['Learner', '/motion Explain why the 24-tooth gear turns half as fast as the 12-tooth gear in this slide.'],
  ['Canvas', 'A short silent video shows gear A, 12 teeth at 120 RPM, driving gear B, 24 teeth at 60 RPM. Two turns of A make one turn of B, in the opposite direction.'],
  ['Learner', '/cad Create a 3D model of the 12-tooth and 24-tooth gear pair in this slide.'],
  ['Canvas', 'The design is reviewed, then a 3D model of the two gears opens and is turned to show the teeth, the thickness and the bores.'],
  ['Learner', '/graph Compare output speed for 24 and 36 driven teeth, with a 12-tooth driver.'],
  ['Canvas', 'An interactive graph plots output speed against input speed. Changing the driven gear from 24 to 36 teeth lowers the output at 120 RPM from 60 RPM to 40 RPM.'],
  ['Canvas', 'The slide and the video, the model and the graph sit together on one canvas.'],
];
const MATERIALS_LINES = [
  ['Learner', 'Starts a rabbit hole from the Start dialog, adds the paper Attention Is All You Need as a PDF and connects the GitHub repository karpathy/nanoGPT.'],
  ['Canvas', 'The workspace opens with the paper on the canvas and both sources available to Chat. The learner opens the repository graph, selects the forward method of CausalSelfAttention in model.py and adds it to Chat.'],
  ['Learner', 'What does this part do?'],
  ['Chat', 'It updates each token using information from itself and earlier tokens. Later tokens are masked.'],
  ['Canvas', 'The learner adds the method to the canvas as a code card, showing model.py lines 67 to 71, the attention calculation.'],
  ['Learner', 'Opens the paper, goes to page 4, selects the sentence about dot products in Section 3.2.1, highlights it and adds the highlight to Chat.'],
  ['Learner', 'Which lines implement this part of the paper?'],
  ['Chat', 'Lines 67–71 implement the paper’s attention calculation. Line 68 adds the causal mask, preventing attention to future tokens.'],
];
// Two edits of each take: a wide one, and a closer one for phones (the stacked panel is nearly square there).
const narrow = matchMedia('(max-width: 700px)').matches;
const mediaFor = (take, index) => `<div class="overview-media">
  <video muted playsinline loop preload="none" poster="${take.poster(narrow)}" aria-label="${take.label}" aria-describedby="overview-transcript-text-${index}">
    ${take.sources(narrow).map(([src, type]) => `<source src="${src}" type="${type}">`).join('')}
  </video>
  <span class="overview-progress" aria-hidden="true"><i></i></span>
  <ol class="overview-transcript" id="overview-transcript-text-${index}">${(take.linesFor ? take.linesFor(narrow) : take.lines).map(([who, line]) => `<li>${who}: ${line}</li>`).join('')}</ol>
</div>`;
const takes = {
  0: { label: 'The Rabbit Hole canvas with the Tutor beside it: a learner tests a prediction about pendulums', lines: TUTOR_LINES,
    poster: n => `/landing/ai-tutor-demo${n ? '-phone' : ''}-poster-v3.jpg`, sources: n => [[`/landing/ai-tutor-demo${n ? '-phone' : ''}-v5.webm`, 'video/webm']] },
  1: { label: 'The Rabbit Hole canvas: a lecture slide on gear ratios becomes a video, a 3D model and an interactive graph', lines: BEYOND_LINES,
    poster: n => `/landing/beyond-notes-${n ? 'phone' : 'wide'}-poster-v3.jpg`,
    // WebM first; the MP4 (H.264, faststart) is for browsers without WebM. Both lead with the same 2.5 s hold of the empty canvas.
    sources: n => [[`/landing/beyond-notes-${n ? 'phone' : 'wide'}-v3.webm`, 'video/webm'], [`/landing/beyond-notes-${n ? 'phone' : 'wide'}-v3.mp4`, 'video/mp4']] },
  2: { label: 'The Rabbit Hole workspace: a paper and the nanoGPT repository open together, with a code card, a highlighted passage and a conversation about both', lines: MATERIALS_LINES,
    poster: n => `/landing/materials-${n ? 'phone-v6' : 'wide-v4'}-poster.jpg`,
    sources: n => [[`/landing/materials-${n ? 'phone-v6' : 'wide-v4'}.webm`, 'video/webm'], [`/landing/materials-${n ? 'phone-v6' : 'wide-v4'}.mp4`, 'video/mp4']] },
  3: { label: 'The Rabbit Hole workspace: a pinned paper beside a Python notebook that computes attention weights, then a practice card where the learner explains the result and gets feedback',
    lines: [['Learner', 'Pins the paper Attention Is All You Need beside the notebook and completes the weights line in the notebook.'],
      ['Notebook', 'Run all prints [0.27, 0.73, 0.0]: the third weight is zero because that position is masked.'],
      ['Learner', '/practice explain it back: why is the third attention weight zero?'],
      ['Canvas', 'An Explain back card asks why the third attention weight is zero even though its original score is the largest.'],
      ['Learner', 'It is less relevant.'],
      ['Feedback', 'Here it is excluded because it is a future token. Masking sets its score to −∞ before softmax, making its weight zero.']],
    poster: () => '/landing/learn-wide-v1-poster.jpg',
    // ponytail: no separate phone cut yet; phones use the wide files until learn-phone-v1 exists.
    sources: () => [['/landing/learn-wide-v1.webm', 'video/webm'], ['/landing/learn-wide-v1.mp4', 'video/mp4']] },
  4: { label: 'The Rabbit Hole canvas: a question opens its own Rabbit Hole with a video, a link leads to a second Rabbit Hole with a Wikipedia article, and the backlink leads home', lines: [
      ['Canvas', 'The canvas Understanding transformers shows two question cards, How does attention use context? and How does the model know word order?, and a three-entry table of contents.'],
      ['Learner', 'Right-clicks How does attention use context? and chooses Enter Rabbit Hole.'],
      ['Canvas', 'A separate canvas, Attention and context, opens with a YouTube video card from 3Blue1Brown and a card, What about word order?, carrying a link to Position and word order.'],
      ['Learner', 'Follows the link to Position and word order, which holds the Wikipedia article Positional encoding, and scrolls to its Sinusoidal section.'],
      ['Learner', 'Opens Search, filters to Links and follows the backlink from Attention and context back to the exact card, What about word order?.'],
      ['Learner', 'Goes up to the parent Rabbit Hole and marks Attention done in the table of contents.'],
    ],
    // The phone cut ends on the parent canvas returning after Up to the parent hole; only the wide cut marks Attention done.
    linesFor(n) { return n ? this.lines.slice(0, -1).concat([['Learner', 'Goes up to the parent Rabbit Hole with Up to the parent hole, and the Understanding transformers canvas returns.']]) : this.lines; },
    poster: n => `/landing/rabbitholes-${n ? 'phone' : 'wide'}-v2-poster.jpg`,
    sources: n => [[`/landing/rabbitholes-${n ? 'phone' : 'wide'}-v2.webm`, 'video/webm'], [`/landing/rabbitholes-${n ? 'phone' : 'wide'}-v2.mp4`, 'video/mp4']] },
};

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
  ${scene.video ? mediaFor(takes[index], index) : `<div class="overview-illustration" role="img" aria-label="${scene.description}"><div aria-hidden="true">${scene.art}</div></div>`}
</div>`).join('');
const tabs = [...tablist.children], panels = [...screens.children];
// A recorded take plays silently on a loop only while its tab is shown, the window is on screen and the page is visible;
// with reduced motion it stays on its poster. There are no player controls: it is a picture of the product, not a player.
const recorded = panels.map(panel => ({ video: panel.querySelector('video'), progress: panel.querySelector('.overview-progress i') })).map((entry, index) => ({ ...entry, index }));
let onScreen = false;
recorded.forEach(entry => {
  if (!entry.video) return;
  const track = () => { entry.progress.style.transform = `scaleX(${entry.video.duration ? entry.video.currentTime / entry.video.duration : 0})`; entry.frame = requestAnimationFrame(track); };
  entry.video.addEventListener('playing', () => { cancelAnimationFrame(entry.frame); track(); });
  entry.video.addEventListener('pause', () => cancelAnimationFrame(entry.frame));
});
function syncVideo() {
  for (const { video, index } of recorded) {
    if (!video) continue;
    const play = index === selected && onScreen && !document.hidden && !reduced.matches;
    if (play && video.paused) video.play().catch(() => {});
    else if (!play && !video.paused) video.pause();
  }
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
  // The recorded tabs are the product itself; the others are illustrations.
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
