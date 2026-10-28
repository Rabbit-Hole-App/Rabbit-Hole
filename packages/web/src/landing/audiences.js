import './audiences.css';

// Draft positioning. Every audience carries real captures of Rabbit Hole cards (stills, prepared content) inside the
// section's rounded frame; the words around them are HTML. No model calls or working product interactions here.
const audiences = [
  { name: 'University students', kind: 'university', context: 'Lectures, assignments and exams', title: 'Connect the concepts. Build understanding that stays with you.', benefit: 'Support for your coursework, assignments and exams.' },
  { name: 'AI / ML engineers', kind: 'ml', context: 'Papers and repositories', title: 'From the paper to the code.', benefit: 'Understand new ideas and apply them to your work.' },
  { name: 'Interview preparation', kind: 'interview', context: 'Technical reasoning', title: 'Practise explaining your solution.', benefit: 'Prepare for interviews and practise explaining your thinking.' },
  { name: 'Educators', kind: 'educators', context: 'Lessons and examples', title: 'Prepare your next lesson.', benefit: 'Support for planning, explaining and teaching.' },
  { name: 'Content creators', kind: 'creators', context: 'Shared canvas', title: 'Give your audience more to explore.', benefit: 'Share your knowledge and learn from your audience.' },
  { name: 'Enterprise onboarding', kind: 'enterprise', context: 'New teams and unfamiliar codebases', title: 'Understand the code you inherit.', benefit: 'Help new teammates learn and contribute.' },
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
  { name: 'quiz', w: 706, h: 450, phone: [364, 444], alt: 'A Rabbit Hole practice quiz beside the lecture PDF Linear algebra, Lecture 04. The question asks which condition lets (A − λI)x = 0 have a non-zero solution. The chosen answer, det(A − λI) = 0, is marked right, and the feedback explains that A − λI must be singular, giving λ = 1 or λ = 3 for the matrix with rows 2, 1 and 1, 2.',
    title: 'Prepare for an exam.', question: '“Could I answer questions on this without looking at my notes?”', support: 'Practise with questions from your course material and identify gaps.' },
];
const NOTEBOOK = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="1.8" width="10" height="12.4" rx="1.6"/><path d="M6 1.8v12.4M8.4 5.2h2.6M8.4 8h2.6"/></svg>';
// The learner's drawing for the Interview preparation illustration: hand-drawn feel (slightly uneven strokes), inline SVG.
const SKETCH = `<svg viewBox="0 0 400 270" role="img" aria-hidden="true" class="aud-iv-draw" fill="none" stroke="#2b2a27" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
  <g font-family="'Bradley Hand','Segoe Print','Comic Sans MS',cursive" fill="#2b2a27" stroke="none" font-size="19">
    <text x="22" y="52">nums</text>
    <text x="119" y="24" font-size="13" fill="#8a857c">0</text><text x="171" y="24" font-size="13" fill="#8a857c">1</text><text x="223" y="24" font-size="13" fill="#8a857c">2</text><text x="275" y="24" font-size="13" fill="#8a857c">3</text>
    <text x="119" y="56">2</text><text x="171" y="56">7</text><text x="217" y="56">11</text><text x="269" y="56">15</text>
    <text x="22" y="108">Target: 9</text>
    <text x="30" y="150" font-size="15" fill="#6b6760">seen</text><text x="38" y="188" font-size="20">seen: 2 → index 0</text>
    <text x="250" y="148" font-size="20">9 − 7 = 2</text>
    <text x="150" y="250" fill="#955169" font-size="18">store numbers as i go</text>
  </g>
  <path d="M100 30 C150 27 290 29 298 33 C297 52 296 64 297 70 C240 73 150 71 101 69 C98 56 100 42 100 30"/>
  <path d="M152 31 C150 45 153 58 151 69"/><path d="M204 31 C206 45 203 57 205 69"/><path d="M256 30 C257 44 255 58 256 70"/>
  <path d="M26 158 C23 176 25 196 28 204 C90 209 190 206 242 203 C245 188 243 170 241 158 C170 155 80 157 26 158"/>
  <path d="M300 158 C292 148 160 133 91 167 M91 167 L105 157 M91 167 L104 172" stroke="#955169"/>
</svg>`;
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
  // Enterprise onboarding: an ILLUSTRATIVE example (heat1d, a small solver written for this page), shown as real Rabbit Hole cards captured with prepared content.
  // The captions and arrows are landing text and decoration. The notebook is an extracted example; nothing says the whole repository runs in Rabbit Hole.
  enterprise: () => `<div class="audience-body aud-enterprise">
      <p class="aud-ent-ask"><span class="aud-label">A new teammate asks</span>i’m new to this repo. how do i run it, and what is this solver actually doing?</p>
      <div class="aud-ent-grid">
        <div class="aud-ent-col aud-ent-a"><p class="aud-label">How do I run this?</p>
          <figure class="aud-capture">${img('ent-readme', 342, 214, 'Rabbit Hole code card for README.md of the illustrative heat1d example, lines 7 to 10: install Python 3.10 or newer, create a virtual environment with python -m venv .venv, activate it with source .venv/bin/activate, then run python solver.py.', [362, 214])}</figure>
          <figure class="aud-capture">${img('ent-solver', 342, 280, 'Rabbit Hole code card for solver.py, the step function of the illustrative heat1d example: each new temperature is T[i] + r * (T[i - 1] - 2 * T[i] + T[i + 1]).', [362, 280])}</figure></div>
        <span class="aud-arrow" aria-hidden="true">→</span>
        <div class="aud-ent-col aud-ent-c"><p class="aud-label">What is this code doing, and why?</p>
          <figure class="aud-capture">${img('ent-explain', 312, 342, 'A Rabbit Hole explanation card, What the solver is doing: each interior node moves toward the average of its neighbours, with r = alpha times dt over dx squared; stable only while r is at most 0.5, so run sets dt to 0.4 times dx squared over alpha. The left end is held at t_left and the right end at 20 degrees Celsius.', [362, 342])}</figure></div>
        <span class="aud-arrow" aria-hidden="true">→</span>
        <div class="aud-ent-col aud-ent-b"><p class="aud-label">Can I try a change? Did it help? <em>Extracted example</em></p>
          <figure class="aud-capture">${img('ent-nb', 612, 552, 'The Rabbit Hole notebook card holding an extracted example of the heat1d solver. The edited line sets the left boundary temperature from 100 to 150 degrees Celsius. The printed result: the midpoint temperature at 3000 seconds is 57.39 degrees (exact 57.36) for the original and 80.76 degrees (exact 80.72) for the modified run. A plot compares the two temperature profiles along the rod.', [362, 652])}</figure></div>
      </div></div>`,
  // PREPARED FUTURE-UI ILLUSTRATION (owner-approved, landing only, 2026-10-28). Built in HTML/CSS/SVG with prepared content. It is NOT the real Explain-back
  // card and not implemented product functionality: no microphone, recording, upload, assessment, model call or network. Its controls only change this page's visuals.
  interview: () => `<div class="audience-body aud-interview" data-mockup="interview">
      <svg class="aud-iv-wire" aria-hidden="false" focusable="false"><path class="aud-iv-wire-hit" d="" tabindex="0" role="button" aria-label="Connection from the notebook two_sum.ipynb to this card’s Input. Press Delete to disconnect it; the notebook stays."/><path class="aud-iv-wire-line" d="" aria-hidden="true"/></svg>
      <article class="aud-iv-nb" aria-label="Source notebook two_sum.ipynb"><span class="aud-iv-nbicon" aria-hidden="true">${NOTEBOOK}</span><span><strong>two_sum.ipynb</strong><small>Notebook · source</small></span></article>
      <div class="aud-iv-pair">
        <article class="aud-iv-card" aria-label="Explain back">
          <span class="aud-iv-port" aria-hidden="true"><i></i><b>Input</b></span>
          <div class="aud-iv-handle" data-drag title="Drag to move the card and its sketch together"><span></span></div>
          <p class="aud-iv-kicker"><i aria-hidden="true"></i>Explain back</p>
          <p class="aud-iv-q">You used a hash map instead of checking every pair. Why? What’s the trade-off?</p>
          <div class="aud-iv-answer" role="textbox" aria-readonly="true" aria-multiline="true" aria-label="Your answer, not yet submitted">i check whether the other number is already in the map. that saves checking every pair, but the map uses extra memory.</div>
          <div class="aud-iv-pill" data-pill><span class="aud-iv-nbicon" aria-hidden="true">${NOTEBOOK}</span>two_sum.ipynb<button type="button" data-unlink aria-label="Disconnect two_sum.ipynb from this card" title="Disconnect (the notebook stays)">×</button></div>
          <div class="aud-iv-foot"><button type="button" class="aud-iv-ghost" data-sketch-toggle aria-pressed="true">Hide sketch</button><button type="button" class="aud-iv-submit" tabindex="-1">Submit answer</button></div>
        </article>
        <div class="aud-iv-link" aria-hidden="true"><i></i><span><svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6.5 9.5l3-3M5 8L3.6 9.4a2.4 2.4 0 003.4 3.4L8.4 11.4M11 8l1.4-1.4A2.4 2.4 0 009 3.2L7.6 4.6"/></svg>Linked</span><i></i></div>
        <div class="aud-iv-side" data-side>
          <figure class="aud-iv-sketch" data-sketch aria-label="Sketch, linked to the explain-back card. Drawing: the array 2, 7, 11, 15; target 9; a box seen holding 2 at index 0; 9 minus 7 equals 2 with an arrow to the stored 2; the note store numbers as i go.">
            <div class="aud-iv-handle" data-drag title="Drag to move the sketch and the card together"><span></span></div>
            <div class="aud-iv-bar"><span class="aud-iv-label">Sketch <em>Linked</em></span>
              <span class="aud-iv-tools" role="toolbar" aria-label="Drawing tools (illustration)">
                <button type="button" aria-pressed="true" aria-label="Pen" title="Pen"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 2.5l3 3-8 8H2.5v-3z"/></svg></button>
                <button type="button" aria-pressed="false" aria-label="Shapes" title="Shapes"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><rect x="2.5" y="2.5" width="7" height="7" rx="1"/><circle cx="10.5" cy="10.5" r="3.2"/></svg></button>
                <button type="button" aria-pressed="false" aria-label="Text" title="Text"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3.5 4V3h9v1M8 3v10M6 13h4"/></svg></button>
              </span></div>
            <div class="aud-iv-dots">${SKETCH}</div>
            <i class="aud-iv-h tl" aria-hidden="true"></i><i class="aud-iv-h tr" aria-hidden="true"></i><i class="aud-iv-h bl" aria-hidden="true"></i>
            <button type="button" class="aud-iv-h br" data-resize aria-label="Resize the sketch" title="Resize the sketch"></button>
          </figure>
          <div class="aud-iv-rec" role="group" aria-label="Recording controls for the sketch (simulated)">
            <button type="button" data-rec="record"><i class="dot" aria-hidden="true"></i>Record</button>
            <button type="button" data-rec="pause">Pause</button>
            <button type="button" data-rec="stop">Stop</button>
            <button type="button" data-rec="audio" aria-pressed="true">Audio on</button>
            <output class="aud-iv-time" aria-live="off">00:00</output>
          </div>
        </div>
      </div></div>`,
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
// Interview preparation illustration (prepared future UI, landing only): local visual interactions only. Dragging a header moves the card and sketch together,
// the sketch resizes within bounds, the notebook connection can be disconnected (pill x, or select the line and press Delete), and recording is simulated
// (a counter and button states; no microphone, nothing stored). Wheel scrolling is never intercepted: only the handles take pointer capture.
(() => {
  const box = root.querySelector('[data-mockup="interview"]');
  if (!box) return;
  const nb = box.querySelector('.aud-iv-nb'), pair = box.querySelector('.aud-iv-pair'), port = box.querySelector('.aud-iv-port i'), side = box.querySelector('[data-side]');
  const link = box.querySelector('.aud-iv-link'), sketch = box.querySelector('[data-sketch]'), toggle = box.querySelector('[data-sketch-toggle]');
  const svg = box.querySelector('.aud-iv-wire'), hit = svg.querySelector('.aud-iv-wire-hit'), line = svg.querySelector('.aud-iv-wire-line'), narrow = matchMedia('(max-width: 900px)');
  let dx = 0, dy = 0, linked = true, shown = true, scale = 1;
  // all offsets are layout offsets (unaffected by the pinned fit scale)
  const at = (el, stop) => { let x = 0, y = 0; for (; el && el !== stop; el = el.offsetParent) { x += el.offsetLeft; y += el.offsetTop; } return [x, y]; };
  function draw() {
    const move = narrow.matches ? [0, 0] : [dx, dy];
    pair.style.transform = `translate(${move[0]}px,${move[1]}px)`;
    box.classList.toggle('is-unlinked', !linked);
    box.classList.toggle('is-nosketch', !shown);
    svg.style.display = linked ? '' : 'none';
    if (!linked) return;
    const [nx, ny] = at(nb, box), [px, py] = at(port, box);
    const ex = px + port.offsetWidth / 2 + move[0], ey = py + port.offsetHeight / 2 + move[1];
    svg.setAttribute('width', box.offsetWidth); svg.setAttribute('height', box.offsetHeight);
    let d;
    if (narrow.matches) { const sx = nx + 18, sy = ny + nb.offsetHeight; d = `M${sx} ${sy} L${sx} ${ey} L${ex} ${ey}`; }
    else { const sx = nx + nb.offsetWidth, sy = ny + nb.offsetHeight / 2, m = (ex - sx) / 2; d = `M${sx} ${sy} C${sx + m} ${sy} ${ex - m} ${ey} ${ex} ${ey}`; }
    hit.setAttribute('d', d); line.setAttribute('d', d);
  }
  const unlink = () => { linked = false; draw(); };
  box.querySelector('[data-unlink]').addEventListener('click', unlink);
  hit.addEventListener('keydown', event => { if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); unlink(); } });
  hit.addEventListener('click', () => hit.focus());
  toggle.addEventListener('click', () => { shown = !shown; toggle.textContent = shown ? 'Hide sketch' : 'Add sketch'; toggle.setAttribute('aria-pressed', String(shown)); draw(); });
  // drag the pair by either header (disabled on phones, where the stack scrolls with the page)
  let drag = null;
  const k = () => box.getBoundingClientRect().width / box.offsetWidth || 1;
  box.querySelectorAll('[data-drag]').forEach(handle => handle.addEventListener('pointerdown', event => {
    if (narrow.matches) return;
    drag = { x: event.clientX, y: event.clientY, dx, dy, k: k() }; handle.setPointerCapture(event.pointerId); event.preventDefault();
  }));
  // resize the sketch independently: its width (the drawing scales with it), bounded by its column and a minimum
  let size = null, width = null;
  const handle = box.querySelector('[data-resize]');
  handle.addEventListener('pointerdown', event => { size = { x: event.clientX, w: sketch.offsetWidth, k: k() }; handle.setPointerCapture(event.pointerId); event.preventDefault(); });
  const move = event => {
    if (drag) { dx = Math.max(-18, Math.min(18, drag.dx + (event.clientX - drag.x) / drag.k)); dy = Math.max(-28, Math.min(28, drag.dy + (event.clientY - drag.y) / drag.k)); draw(); }
    if (size) { const max = side.offsetWidth, w = Math.max(max * .7, Math.min(max, size.w + (event.clientX - size.x) / size.k)); sketch.style.width = `${w}px`; draw(); }
  };
  handle.addEventListener('keydown', event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const max = side.offsetWidth, w = Math.max(max * .7, Math.min(max, sketch.offsetWidth + (event.key === 'ArrowRight' ? 20 : -20))); sketch.style.width = `${w}px`; draw(); } });
  box.addEventListener('pointermove', move);
  const end = () => { drag = null; size = null; };
  box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
  // tool buttons: selectable states only
  box.querySelectorAll('.aud-iv-tools button').forEach(button => button.addEventListener('click', () => { box.querySelectorAll('.aud-iv-tools button').forEach(other => other.setAttribute('aria-pressed', String(other === button))); }));
  // simulated recording: record counts up, pause holds, stop resets, audio toggles
  const rec = box.querySelector('.aud-iv-rec'), time = rec.querySelector('output');
  let state = 'idle', seconds = 0, timer = null;
  const paint = () => { rec.dataset.state = state; time.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; };
  const stopTimer = () => { clearInterval(timer); timer = null; };
  rec.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    const kind = button.dataset.rec;
    if (kind === 'audio') { const on = button.getAttribute('aria-pressed') !== 'true'; button.setAttribute('aria-pressed', String(on)); button.textContent = on ? 'Audio on' : 'Audio off'; return; }
    if (kind === 'record' && state !== 'recording') { state = 'recording'; stopTimer(); timer = setInterval(() => { seconds += 1; paint(); }, 1000); }
    if (kind === 'pause' && state === 'recording') { state = 'paused'; stopTimer(); }
    if (kind === 'stop') { state = 'idle'; seconds = 0; stopTimer(); }
    paint();
  });
  new ResizeObserver(draw).observe(box);
  addEventListener('resize', draw);
  draw(); paint();
})();
show(0);
update();
