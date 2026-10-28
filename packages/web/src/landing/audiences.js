import './audiences.css';

// Draft positioning. Every audience carries real captures of Rabbit Hole cards (stills, prepared content) inside the
// section's rounded frame; the words around them are HTML. No model calls or working product interactions here.
const audiences = [
  { name: 'University students', kind: 'university', context: 'Lectures, assignments and exams', title: 'For university students.', benefit: 'Support for your coursework, assignments and exams.' },
  { name: 'AI / ML engineers', kind: 'ml', context: 'Papers and repositories', title: 'From the paper to the code.', benefit: 'Understand new ideas and apply them to your work.' },
  { name: 'Interview preparation', kind: 'interview', context: 'Technical reasoning', title: 'Practise explaining your solution.', benefit: 'Prepare for interviews and practise explaining your thinking.' },
  { name: 'Educators', kind: 'educators', context: 'Lessons and examples', title: 'Prepare your next lesson.', benefit: 'Support for planning, explaining and teaching.' },
  { name: 'Content creators', kind: 'creators', context: 'Shared canvas', title: 'Give your audience more to explore.', benefit: 'Share your knowledge and learn from your audience.' },
  { name: 'Team onboarding', kind: 'enterprise', context: 'New teams and unfamiliar codebases', title: 'Understand the code you inherit.', benefit: 'Help new teammates learn and contribute.' },
];

const root = document.getElementById('who-is-it-for');
const stage = root.querySelector('.audience-stage');
const stories = root.querySelector('.audience-slides');
const picker = root.querySelector('select');
const previous = root.querySelector('[data-audience-prev]');
const next = root.querySelector('[data-audience-next]');
const nextLabel = next.querySelector('.audience-next-label');
const count = root.querySelector('.audience-count');
const progressBar = root.querySelector('.audience-progress span');
const announcement = root.querySelector('.audience-announcement');
// The same pin conditions as What is Rabbit Hole? (overview.js): wide enough and at least 700px tall. Content is scaled to fit the stage (fit below), never spilled.
const scrollMode = matchMedia('(min-width: 901px) and (min-height: 700px)');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = value => Math.max(0, Math.min(1, value));
let selected = -1, queued = false, gesture = null;

// Real Rabbit Hole captures (stills of the product's own cards; docs/features/rabbit-hole-audiences.md). The text around them is HTML.
// width/height are the shipped image's css size (pixels / 3); the browser scales the image to its layout.
const img = (name, w, h, alt, phone = null) => {
  const main = `<img src="/landing/audience-${name}-v1.webp" width="${w}" height="${h}" alt="${alt}" loading="lazy" decoding="async" draggable="false">`;
  // phone: a dedicated capture at a narrow readable width, not the desktop one shrunk (brief 2, 3, 4, 5)
  return phone ? `<picture><source media="(max-width:700px)" srcset="/landing/audience-${name}-phone-v1.webp" width="${phone[0]}" height="${phone[1]}">${main}</picture>` : main;
};
const situations = [
  { name: 'lecture', w: 500, h: 336, phone: [352, 400], alt: 'Rabbit Hole’s PDF reader open on Linear algebra, Lecture 04, showing the equations Ax = λx, Ax − λx = 0 and (A − λI)x = 0, with the last equation highlighted.',
    title: 'Understand a lecture.', question: '“How did they get from this equation to the next?”', support: 'Work through the missing steps using your lecture material.' },
  { name: 'problems', w: 500, h: 360, phone: [352, 350], alt: 'Rabbit Hole’s PDF reader open on Problem set 03: find the eigenvalues of A, where A is the two-by-two matrix with first row 2, 1 and second row 1, 2.',
    title: 'Work through an assignment.', question: '“I followed the example. Why can’t I solve this one?”', support: 'Get guidance where you’re stuck and practise applying the idea.' },
  { name: 'eigen', w: 472, h: 258, phone: [362, 258], alt: 'A Rabbit Hole explain-back card asking: What does an eigenvector represent? Explain it in your own words. The answer field is empty.',
    title: 'Prepare for an exam.', question: '“Could I explain this without looking at my notes?”', support: 'Explain it back, answer practice questions and identify gaps.' },
];
const layouts = {
  university: () => `<div class="audience-body aud-university"><ul class="aud-situations">${situations.map(item => `<li class="aud-situation">
      <figure class="aud-capture">${img(item.name, item.w, item.h, item.alt, item.phone)}</figure>
      <h4>${item.title}</h4><p class="aud-question">${item.question}</p><p class="aud-support">${item.support}</p></li>`).join('')}</ul></div>`,
  ml: () => `<div class="audience-body aud-ml">
      <figure class="aud-capture aud-paper">${img('paper', 540, 330, 'Rabbit Hole’s PDF reader open on Attention Is All You Need, page 4, section 3.2.1 Scaled Dot-Product Attention, showing the equation Attention(Q, K, V) = softmax(QKᵀ / √dₖ)V.', [352, 460])}<span class="aud-mark aud-mark-eq" aria-hidden="true"></span></figure>
      <figure class="aud-capture aud-code" data-no-swipe><div class="aud-pan">${img('code', 548, 252, 'A Rabbit Hole code card for model.py, lines 66 to 71 of karpathy/nanoGPT: the manual attention calculation. It multiplies the queries by the transposed keys and scales by 1.0 / math.sqrt(k.size(-1)), applies a causal mask, takes a softmax and multiplies by the values.')}<span class="aud-mark aud-mark-l67" aria-hidden="true"></span><span class="aud-mark aud-mark-l69" aria-hidden="true"></span><span class="aud-mark aud-mark-l71" aria-hidden="true"></span></div></figure>
      <svg class="aud-links" viewBox="0 0 1120 342" preserveAspectRatio="none" aria-hidden="true"><path d="M394 266 C480 266 480 194 571 194"/><path d="M394 266 C480 266 480 234 571 234"/><path d="M394 266 C480 266 480 274 571 274"/></svg>
      <p class="aud-ask">Why divide by √d<sub>k</sub>?</p></div>`,
  creators: () => `<div class="audience-body aud-creators">
      <div class="aud-post"><p class="aud-label">Your post</p>
        <article class="aud-postcard" aria-label="Example post by an example creator">
          <header><span class="aud-avatar" aria-hidden="true">EC</span><span><strong>Example Creator</strong><small>Audio explainers</small></span></header>
          <p>What changes when you reverse an audio recording?</p>
          <p>I put the explanation in a Rabbit Hole canvas so you can explore it and try your own version.</p>
          <img src="/landing/audience-creators-post-v1.webp" width="1200" height="640" alt="The post’s picture: two spectrograms of the same synthetic plucked tone, Original and Reversed. The reversed one is the original mirrored left to right." loading="lazy" decoding="async" draggable="false">
          <div class="aud-postlink"><strong>Audio reversal: waveform and spectrum</strong><span>Link to the canvas</span></div>
        </article></div>
      <span class="aud-arrow aud-arrow-1" aria-hidden="true">→</span>
      <div class="aud-shared"><p class="aud-label">Your shared canvas</p>
        <figure class="aud-capture">${img('creators-canvas', 537, 414, 'The shared Rabbit Hole canvas Audio reversal: waveform and spectrum, opened from the post. The header shows the creator’s @handle, a Star button and Fork with a count of 1. The Explanation card shows bar charts of the loudness over time, original and reversed, and the same spectrum for both.', [390, 716])}</figure></div>
      <span class="aud-arrow aud-arrow-2" aria-hidden="true">→</span>
      <div class="aud-reader">
        <figure class="aud-capture">${img('creators-comment', 375, 221, 'A reader’s comment in the canvas’s Comments panel: what happens if you reverse only part of the audio?')}</figure>
        <p class="aud-idea">An idea for the next post</p>
        <figure class="aud-capture">${img('creators-fork', 431, 252, 'A reader’s fork in their Rabbit Hole Library: What if only part is reversed? It reads Forked from Audio reversal: waveform and spectrum, with the original creator’s @handle.')}</figure></div></div>`,
  enterprise: () => `<div class="audience-body aud-enterprise">
      <figure class="aud-capture aud-graph">${img('enterprise-graph', 560, 470, 'Rabbit Hole’s Graph view of the karpathy/nanoGPT repository at commit 3adf61e: the files and the classes and functions in them as a connected map, with a search field for files or symbols and the count 15 files, 58 nodes, 70 relationships.', [372, 520])}</figure>
      <figure class="aud-capture aud-explain-back">${img('enterprise-q', 472, 237, 'A Rabbit Hole explain-back card asking: Where does this request go next? The answer field is empty.', [362, 237])}</figure></div>`,
  interview: () => `<div class="audience-body aud-interview"><figure class="aud-capture">${img('twosum', 672, 312, 'A Rabbit Hole explain-back card for Two Sum. Question: You used a hash map instead of checking every pair. Why? What’s the trade-off? The learner’s answer: i can check if the other number is already in the map instead of going through the whole list again. Feedback under Understanding evidence: That explains the speed advantage. What happens to memory usage as you store more numbers?', [362, 374])}</figure></div>`,
  educators: () => `<div class="audience-body aud-educators">
      <div class="aud-source"><p class="aud-label">Your lecture slide</p><figure class="aud-capture">${img('slide', 500, 345, 'Rabbit Hole’s PDF reader open on linear-algebra-eigenvectors-slide.pdf: a lecture slide titled Eigenvectors with Av = λv, v ≠ 0, the sentence The transformation scales v by λ, and an example matrix with first row 2, 0 and second row 0, 1.', [352, 340])}</figure>
        <blockquote class="aud-request"><span class="aud-label">Teacher’s request</span><p>this slide is pretty abstract. give me a visual example and a question i can ask the class</p></blockquote></div>
      <div class="aud-result"><p class="aud-label">A question for the class</p><figure class="aud-capture">${img('explain', 752, 404, 'A Rabbit Hole Explanation card titled Which direction stays the same? Two coordinate diagrams, Before and After applying A, share one origin and scale. Vector 1 runs along the horizontal axis and stays on it; Vector 2 points up and to the right and changes direction. The question reads: Which vector is an eigenvector? How can you tell without calculating?', [392, 502])}</figure></div></div>`,
};
// The section's rounded frame with the Rabbit Hole header row and the product's dotted canvas (audiences.css), around every audience's captures.
const frame = item => `<div class="audience-workflow is-real">
    <div class="audience-canvas-toolbar" aria-hidden="true"><span><span class="rh-mark"></span>Rabbit Hole <i>/</i> <span class="audience-canvas-name">${item.context}</span></span></div>
    <div class="audience-canvas is-real">${layouts[item.kind]()}</div>
  </div>`;
stories.innerHTML = audiences.map((item, index) => `<article class="audience-slide" data-layout="${item.kind}" role="group" aria-roledescription="slide" aria-label="${index + 1} of 6: ${item.name}" aria-hidden="true" inert>
  <div class="audience-copy-mask"><div class="audience-copy"><h3>${item.name}</h3><p class="audience-subtitle">${item.title}</p><p class="audience-lede">${item.benefit}</p></div></div>
  ${frame(item)}
</article>`).join('');
picker.innerHTML = audiences.map((item, index) => `<option value="${index}">${item.name}</option>`).join('');
const slides = [...stories.children];

function show(index, source = 'scroll') {
  if (index === selected) return;
  root.classList.toggle('is-instant', source === 'keyboard' || source === 'selection');
  selected = index;
  root.dataset.audience = String(index + 1);
  root.dataset.layout = audiences[index].kind;
  slides.forEach((slide, i) => {
    slide.classList.toggle('is-active', i === index);
    slide.classList.toggle('is-before', i < index);
    slide.setAttribute('aria-hidden', String(i !== index));
    slide.inert = i !== index;
  });
  picker.value = String(index);
  count.innerHTML = `${String(index + 1).padStart(2, '0')} <span>/ 06</span>`;
  previous.disabled = index === 0;
  nextLabel.textContent = index < 5 ? audiences[index + 1].name : 'Keep exploring';
  next.setAttribute('aria-label', index < 5 ? `Next audience: ${audiences[index + 1].name}` : 'Continue to the next section');
  if (source !== 'scroll') announcement.textContent = `${index + 1} of 6. ${audiences[index].name}. ${audiences[index].title} ${audiences[index].benefit}`;
}

// Pinned: every composition is laid out at one design width (DESIGN px) and scaled as a whole to the framed canvas (never larger than its room,
// never spilling), so heading + frame + navigation stay together on a short window. Manual mode (phones, short windows) keeps natural size.
const DESIGN = 1100;
function fit() {
  for (const slide of slides) {
    const body = slide.querySelector('.audience-body'), canvas = slide.querySelector('.audience-canvas');
    body.style.cssText = '';
    if (!scrollMode.matches) continue;
    const style = getComputedStyle(canvas);
    const room = canvas.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const wide = canvas.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    body.style.width = `${DESIGN}px`;
    const height = body.offsetHeight, z = Math.min(1.04, wide / DESIGN, room / height);
    body.style.transformOrigin = '50% 0';
    body.style.transform = `scale(${z})`;
    body.style.marginBottom = `${height * (z - 1)}px`;
  }
}
function geometry() {
  const style = getComputedStyle(root);
  const top = parseFloat(style.paddingTop);
  return {
    start: root.getBoundingClientRect().top + scrollY + top - parseFloat(getComputedStyle(stage).top),
    travel: Math.max(1, root.clientHeight - top - parseFloat(style.paddingBottom) - stage.offsetHeight),
  };
}
function update() {
  queued = false;
  root.classList.toggle('is-scroll', scrollMode.matches);
  if (!scrollMode.matches) {
    progressBar.style.transform = `scaleX(${(selected + 1) / 6})`;
    return;
  }
  const { start, travel } = geometry();
  const progress = clamp((scrollY - start) / travel);
  show(Math.min(5, Math.floor(progress * 6)));
  progressBar.style.transform = `scaleX(${progress})`;
}
function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(update);
}
// size changes (resize, mode, fonts, the stage itself) re-fit the content, then update; plain scrolling only updates
let refitting = false;
function refit() {
  if (refitting) return;
  refitting = true;
  requestAnimationFrame(() => { refitting = false; root.classList.toggle('is-scroll', scrollMode.matches); fit(); update(); });
}
function choose(index, source = 'button') {
  if (index < 0) return;
  if (index > 5) {
    const faq = document.getElementById('faq');
    const heading = document.getElementById('faq-title');
    heading.tabIndex = -1;
    faq.scrollIntoView({ behavior: 'instant', block: 'start' });
    heading.focus({ preventScroll: true });
    return;
  }
  // A direct choice moves to the center of its scroll chapter immediately.
  // Smooth-scrolling through five intervening states would fight that choice.
  show(index, source);
  if (scrollMode.matches) {
    const { start, travel } = geometry();
    window.scrollTo({ top: start + travel * (index + .5) / 6, behavior: 'instant' });
  }
  progressBar.style.transform = `scaleX(${(index + 1) / 6})`;
}
picker.addEventListener('change', () => choose(Number(picker.value), 'selection'));
previous.addEventListener('click', event => choose(selected - 1, event.detail === 0 ? 'keyboard' : 'button'));
next.addEventListener('click', event => choose(selected + 1, event.detail === 0 ? 'keyboard' : 'button'));
root.addEventListener('keydown', event => {
  if (event.target.closest('select') || !event.target.closest('.audience-navigation')) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    choose(selected + (event.key === 'ArrowRight' ? 1 : -1), 'keyboard');
  }
});
// Vertical touch scroll stays native. Only a deliberate horizontal gesture
// in the preview changes the mobile audience; controls remain an alternative.
stories.addEventListener('pointerdown', event => {
  // A capture that scrolls sideways on a phone (the code card) keeps its own horizontal drag.
  if (!scrollMode.matches && event.isPrimary && event.pointerType !== 'mouse' && !event.target.closest('[data-no-swipe]')) gesture = { x: event.clientX, y: event.clientY };
});
stories.addEventListener('pointerup', event => {
  if (!gesture) return;
  const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
  gesture = null;
  if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) choose(Math.max(0, Math.min(5, selected + (dx < 0 ? 1 : -1))), 'swipe');
});
stories.addEventListener('pointercancel', () => { gesture = null; });
addEventListener('scroll', schedule, { passive: true });
addEventListener('resize', refit);
scrollMode.addEventListener('change', refit);
reduced.addEventListener('change', refit);
new ResizeObserver(refit).observe(stage);
document.fonts.ready.then(refit);
slides.forEach(slide => slide.querySelectorAll('img').forEach(image => { if (!image.complete) image.addEventListener('load', refit, { once: true }); }));
show(0);
update();
