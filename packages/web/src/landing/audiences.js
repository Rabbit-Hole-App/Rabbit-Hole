import './audiences.css';

// Draft positioning and deliberately neutral canvas placeholders. No generated
// artwork, model calls or working product interactions inside these previews.
const audiences = [
  { name: 'Creators & writers', title: 'For creators & writers.', benefit: 'Turn deep research into something worth sharing.', context: 'Essays, newsletters and videos', source: 'Research & references', question: 'How do I explain attention clearly?', result: 'A clearer explanation', path: 'Research → understanding → your next story', note: 'Follow the idea back to its source.' },
  { name: 'AI / ML engineers', title: 'For AI / ML engineers.', benefit: 'Understand the paper. Connect it to the code.', context: 'Models, papers and repositories', source: 'Paper + implementation', question: 'How does this model work in practice?', result: 'Working understanding', path: 'Paper → explanation → code → understanding', note: 'Connect the concept to the implementation.' },
  { name: 'Educators', title: 'For the people who teach.', benefit: 'Make difficult ideas click, one example at a time.', context: 'Lessons, examples and discussion', source: 'A difficult concept', question: 'How can I teach this through an example?', result: 'An example that clicks', path: 'Concept → example → discussion → understanding', note: 'Give the idea a concrete example.' },
  { name: 'University students', title: 'For university students.', benefit: 'Connect the concepts. Build understanding that stays with you.', context: 'Lectures, papers and practice', source: 'Lecture notes & papers', question: 'Why does this result follow?', result: 'A stronger foundation', path: 'Notes → questions → connections → practice', note: 'Find the missing step in your understanding.' },
  { name: 'Enterprise onboarding', title: 'For the newest engineer.', benefit: 'Find your way through the code, and the thinking behind it.', context: 'New teams and unfamiliar codebases', source: 'The team’s repository', question: 'Where does this request go next?', result: 'Your map of the code', path: 'Repository → architecture → context → contribution', note: 'Trace a request through the unfamiliar.' },
  { name: 'Interview preparation', title: 'For your next interview.', benefit: 'Go deeper into ML and AI. Get clearer at explaining your decisions.', context: 'ML / AI concepts and technical reasoning', source: 'A technical question', question: 'Can I explain why I chose this model?', result: 'Reasoning you can explain', path: 'Question → reasoning → explanation → practice', note: 'Make your reasoning visible.' },
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
const scrollMode = matchMedia('(min-width: 901px) and (min-height: 760px)');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = value => Math.max(0, Math.min(1, value));
let selected = -1, queued = false, gesture = null;

stories.innerHTML = audiences.map((item, index) => `<article class="audience-slide" role="group" aria-roledescription="slide" aria-label="${index + 1} of 6: ${item.name}" aria-hidden="true" inert>
  <div class="audience-copy-mask"><div class="audience-copy"><h3>${item.title}</h3><p>${item.benefit}</p></div></div>
  <figure class="audience-workflow" aria-label="Illustrative canvas placeholder for ${item.name}">
    <div class="audience-canvas-toolbar"><span><span class="rh-mark" aria-hidden="true"></span>Rabbit Hole <i>/</i> <span class="audience-canvas-name">${item.context}</span></span><span class="audience-placeholder-label">Canvas placeholder</span></div>
    <div class="audience-canvas">
      <svg class="audience-connectors" viewBox="0 0 1000 360" preserveAspectRatio="none" aria-hidden="true"><path d="M235 150 C310 150 310 100 410 100 M600 100 C690 100 625 240 735 240"/></svg>
      <div class="audience-node audience-source" aria-hidden="true"><span class="audience-node-label">Your starting point</span><strong>${item.source}</strong><span class="audience-skeleton-line"></span><span class="audience-skeleton-line short"></span><span class="audience-node-footer">A source worth following ↗</span></div>
      <div class="audience-node audience-question"><span class="audience-node-label">Follow the question</span><strong>${item.question}</strong><span class="audience-question-rule" aria-hidden="true"></span><span class="audience-node-footer">One question opens the next.</span></div>
      <div class="audience-node audience-result" aria-hidden="true"><span class="audience-node-label">Make it yours</span><strong>${item.result}</strong><span class="audience-skeleton-line"></span><span class="audience-skeleton-line short"></span></div>
      <p class="audience-callout"><span aria-hidden="true">↳</span>${item.note}</p>
    </div>
    <figcaption><span>${item.path}</span><span class="audience-preview-note">Illustrative workflow</span></figcaption>
  </figure>
</article>`).join('');
picker.innerHTML = audiences.map((item, index) => `<option value="${index}">${item.name}</option>`).join('');
const slides = [...stories.children];

function show(index, source = 'scroll') {
  if (index === selected) return;
  root.classList.toggle('is-instant', source === 'keyboard' || source === 'selection');
  selected = index;
  root.dataset.audience = String(index + 1);
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
  if (source !== 'scroll') announcement.textContent = `${index + 1} of 6. ${audiences[index].name}. ${audiences[index].benefit}`;
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
  if (!scrollMode.matches && event.isPrimary && event.pointerType !== 'mouse') gesture = { x: event.clientX, y: event.clientY };
});
stories.addEventListener('pointerup', event => {
  if (!gesture) return;
  const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
  gesture = null;
  if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) choose(Math.max(0, Math.min(5, selected + (dx < 0 ? 1 : -1))), 'swipe');
});
stories.addEventListener('pointercancel', () => { gesture = null; });
addEventListener('scroll', schedule, { passive: true });
addEventListener('resize', schedule);
scrollMode.addEventListener('change', schedule);
reduced.addEventListener('change', schedule);
new ResizeObserver(schedule).observe(stage);
document.fonts.ready.then(schedule);
show(0);
update();
