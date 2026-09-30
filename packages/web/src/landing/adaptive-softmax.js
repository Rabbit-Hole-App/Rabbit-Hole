const TOOL = '/motion';
const MESSAGE = 'explain me softmax function';
const GENERATE_AT = 3800;
const REVEAL_AT = GENERATE_AT + 1000;
const PLAY_AT = REVEAL_AT + 1600;
const SEQUENCE_END = PLAY_AT + 700;

// ponytail: illustrative generation and pointer gestures; no model/API request.
export function createGuidedPreview(scene, updateScores) {
  const canvas = scene.querySelector('.softmax-canvas');
  const camera = canvas.querySelector('.softmax-guided-camera');
  const prompt = canvas.querySelector('.softmax-prompt');
  const card = canvas.querySelector('[data-guided-card]');
  const quiz = scene.querySelector('[data-guided-quiz]');
  const cursor = canvas.querySelector('.softmax-slider-cursor');
  const sliders = [...canvas.querySelectorAll('[data-score-input]')];
  const status = scene.querySelector('[data-guided-status]');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const initial = [2, 1, 0, -1], targets = [3, 3, 1.5, 1];
  const DRAG_AT = REVEAL_AT + 1000, GESTURE = 2200, END = DRAG_AT + GESTURE * 4;
  let selected = false, visible = false, composerVisible = false, instant = false, manual = false;
  let elapsed = 0, last = null, frame = null;
  const active = () => selected && visible && (elapsed >= REVEAL_AT || composerVisible) && !document.hidden && !reduce.matches && !instant && !manual && elapsed < END;

  function pose() {
    const still = reduce.matches || instant || manual;
    const ready = still || elapsed >= REVEAL_AT;
    const phase = still || elapsed >= END ? 'ready'
      : elapsed >= DRAG_AT ? 'dragging'
      : ready ? 'card'
      : elapsed >= GENERATE_AT ? 'generating'
      : elapsed >= 3600 ? 'submitted'
      : elapsed >= 3000 ? 'send-cursor'
      : elapsed >= 450 ? 'typing' : 'rest';
    canvas.dataset.phase = phase;
    canvas.toggleAttribute('data-guided-revealed', ready);
    card.inert = !ready;
    quiz.inert = !ready;
    quiz.toggleAttribute('data-ready', ready);
    quiz.setAttribute('aria-hidden', String(!ready));
    card.setAttribute('aria-hidden', String(!ready));
    const pill = still || elapsed >= 1200;
    canvas.toggleAttribute('data-tool-selected', pill);
    prompt.textContent = still || elapsed >= 3000 ? MESSAGE
      : pill ? MESSAGE.slice(0, Math.max(0, Math.floor((elapsed - 1450) / 50)))
      : '/explain'.slice(0, Math.max(0, Math.floor((elapsed - 700) / 50)));
    status.textContent = phase === 'generating' ? 'Generating explanation'
      : ready ? 'Try the sliders yourself. Displayed values are rounded.' : 'Build on the explanation already on your canvas.';
    if (phase !== 'dragging') { cursor.style.opacity = '0'; return; }

    const index = Math.min(3, Math.floor((elapsed - DRAG_AT) / GESTURE));
    const time = (elapsed - DRAG_AT) % GESTURE;
    const progress = Math.max(0, Math.min(1, (time - 650) / 1150));
    let changed = false;
    for (const [i, slider] of sliders.entries()) {
      const value = i < index ? targets[i] : i === index
        ? Math.round((initial[i] + (targets[i] - initial[i]) * progress) * 4) / 4 : initial[i];
      if (Number(slider.value) !== value) { slider.value = String(value); changed = true; }
    }
    if (changed) updateScores();
    const bounds = camera.getBoundingClientRect();
    const position = slider => {
      const rect = slider.getBoundingClientRect();
      const ratio = (Number(slider.value) - Number(slider.min)) / (Number(slider.max) - Number(slider.min));
      return { x: rect.left - bounds.left + 8 + (rect.width - 16) * ratio, y: rect.top - bounds.top + rect.height / 2 };
    };
    const to = position(sliders[index]);
    const from = index > 0 ? position(sliders[index - 1]) : { x: to.x + 45, y: to.y + 45 };
    const approach = Math.min(1, time / 650);
    cursor.style.transform = `translate(${from.x + (to.x - from.x) * approach - 3}px, ${from.y + (to.y - from.y) * approach - 3}px) scale(${time >= 650 && progress < 1 ? .9 : 1})`;
    cursor.style.opacity = '1';
  }
  function tick(now) {
    frame = null;
    if (!active()) return;
    if (last !== null) elapsed = Math.min(END, elapsed + now - last);
    last = now;
    pose();
    if (elapsed < END) frame = requestAnimationFrame(tick);
    else { last = null; canvas.dataset.running = 'false'; }
  }
  function sync() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null; last = null;
    // Read current geometry: queued observer entries can describe a viewport
    // from before a resize or a rapid scroll/tab change.
    const inView = (element, ratio) => {
      const rect = element.getBoundingClientRect();
      const width = Math.max(0, Math.min(innerWidth, rect.right) - Math.max(0, rect.left));
      const height = Math.max(0, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top));
      return rect.width > 0 && rect.height > 0 && width * height >= rect.width * rect.height * ratio;
    };
    visible = inView(canvas, .2);
    composerVisible = inView(canvas.querySelector('.softmax-composer'), .5);
    canvas.toggleAttribute('data-still', reduce.matches || instant || manual);
    canvas.dataset.running = String(active());
    pose();
    if (active()) frame = requestAnimationFrame(tick);
  }
  function takeOver() { manual = true; sync(); }
  for (const event of ['pointerdown', 'focusin', 'input']) card.addEventListener(event, takeOver);
  quiz.addEventListener('pointerdown', takeOver);
  quiz.addEventListener('focusin', takeOver);
  document.addEventListener('visibilitychange', sync);
  reduce.addEventListener('change', sync);
  new IntersectionObserver(sync, {threshold:[0,.2]}).observe(canvas);
  new IntersectionObserver(sync, {threshold:[0,.5]}).observe(canvas.querySelector('.softmax-composer'));
  window.addEventListener('resize', sync);
  pose();
  return {
    select(next, immediate) {
      selected = next;
      if (next) {
        instant = immediate;
        if (!manual) {
          elapsed = 0;
          sliders.forEach((slider, i) => { slider.value = String(initial[i]); });
          updateScores();
        }
      }
      sync();
    },
  };
}

// ponytail: staged marketing interaction using the supplied clip; no generation request.
export function createSoftmaxPreview(canvas, status) {
  const video = canvas.querySelector('video');
  const prompt = canvas.querySelector('.softmax-prompt');
  const watch = canvas.querySelector('.softmax-watch');
  const timeline = canvas.querySelector('.softmax-timeline');
  const time = canvas.querySelector('.softmax-time');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let selected = true, visible = false, instant = false;
  let elapsed = 0, last = null, frame = null, failed = false, pendingPlay = false;
  let manualPlayback = false, userPaused = false, playRequest = 0;

  const active = () => selected && visible && !document.hidden && !userPaused && (manualPlayback || !reduce.matches && !instant);

  function loadVideo() {
    if (!video.hasAttribute('src')) {
      video.src = '/landing/softmax-overview-v1.mp4';
      video.load();
    }
  }

  function playback() {
    const duration = Number.isFinite(video.duration) ? video.duration : 25;
    const seconds = value => `0:${String(Math.floor(value)).padStart(2, '0')}`;
    watch.dataset.playing = String(!video.paused && !video.ended);
    watch.setAttribute('aria-label', failed ? 'Retry explanation' : video.ended ? 'Replay explanation' : video.paused ? 'Play explanation' : 'Pause explanation');
    timeline.disabled = watch.disabled || video.readyState < 1 || failed;
    timeline.max = String(duration);
    timeline.value = String(video.currentTime);
    timeline.setAttribute('aria-valuetext', `${Math.floor(video.currentTime)} of ${Math.floor(duration)} seconds`);
    time.textContent = `${seconds(video.currentTime)} / ${seconds(duration)}`;
  }

  function pose() {
    const still = reduce.matches || instant;
    const phase = still || elapsed >= SEQUENCE_END ? 'ready'
      : elapsed >= PLAY_AT ? 'clicked'
      : elapsed >= REVEAL_AT + 600 ? 'cursor'
      : elapsed >= REVEAL_AT ? 'card'
      : elapsed >= GENERATE_AT ? 'generating'
      : elapsed >= 3600 ? 'submitted'
      : elapsed >= 3000 ? 'send-cursor'
      : elapsed >= 450 ? 'typing' : 'rest';
    if (canvas.dataset.phase !== phase) canvas.dataset.phase = phase;
    watch.disabled = !(still || elapsed >= REVEAL_AT);
    playback();
    const pill = still || elapsed >= 1200;
    if (canvas.hasAttribute('data-tool-selected') !== pill) canvas.toggleAttribute('data-tool-selected', pill);
    const text = still || elapsed >= 3000 ? MESSAGE
      : pill ? MESSAGE.slice(0, Math.max(0, Math.floor((elapsed - 1450) / 50)))
      : TOOL.slice(0, Math.max(0, Math.floor((elapsed - 700) / 50)));
    if (prompt.textContent !== text) prompt.textContent = text;
    const message = failed ? 'Animation unavailable. Use Play to try again.' : still || elapsed >= PLAY_AT ? '' : elapsed >= REVEAL_AT ? 'An explanation, ready on your canvas' : phase === 'generating' ? 'Generating animation' : 'Ask the agent to explain it visually';
    if (status.textContent !== message) status.textContent = message;
  }

  function play() {
    if (!active() || failed || pendingPlay || video.ended || !video.paused) return;
    const request = ++playRequest;
    pendingPlay = true;
    video.play().then(() => {
      if (request !== playRequest) return;
      pendingPlay = false;
      if (!active()) video.pause();
    }).catch(error => {
      if (request !== playRequest) return;
      pendingPlay = false;
      // A tab/scroll interruption can abort play normally; keep the poster on real failure.
      if (error.name !== 'AbortError') {
        failed = true;
        canvas.removeAttribute('data-video-frame');
        pose();
      }
    });
  }

  function tick(now) {
    frame = null;
    if (!active()) return;
    if (last !== null) elapsed = Math.min(SEQUENCE_END, elapsed + now - last);
    last = now;
    pose();
    // Wait for visible animation frames; an initial mobile layout can briefly intersect.
    if (elapsed >= 450) loadVideo();
    if (elapsed >= PLAY_AT) play();
    if (elapsed < SEQUENCE_END) frame = requestAnimationFrame(tick);
    else last = null;
  }

  function sync() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    last = null;
    canvas.dataset.running = String(active());
    canvas.toggleAttribute('data-still', reduce.matches || instant);
    canvas.toggleAttribute('data-manual-playback', manualPlayback);
    pose();
    if (!active()) { playRequest++; pendingPlay = false; video.pause(); return; }
    if (elapsed < SEQUENCE_END) frame = requestAnimationFrame(tick);
    else play();
  }

  video.addEventListener('playing', () => {
    if (active()) canvas.setAttribute('data-video-frame', '');
    else video.pause();
  });
  for (const event of ['loadedmetadata', 'timeupdate', 'playing', 'pause']) video.addEventListener(event, playback);
  video.addEventListener('ended', pose);
  video.addEventListener('error', () => {
    failed = true;
    canvas.removeAttribute('data-video-frame');
    pose();
  });
  watch.addEventListener('click', () => {
    if (video.ended || failed || !manualPlayback && (reduce.matches || instant || elapsed < PLAY_AT)) {
      // A real visitor takes over the card; the illustrated cursor never clicks this button.
      playRequest++;
      pendingPlay = false;
      video.pause();
      manualPlayback = true;
      userPaused = false;
      failed = false;
      elapsed = SEQUENCE_END;
      loadVideo();
      if (video.error) video.load();
      if (video.readyState >= 1) video.currentTime = 0;
      canvas.removeAttribute('data-video-frame');
    } else {
      manualPlayback = true;
      userPaused = !userPaused;
    }
    sync();
  });
  timeline.addEventListener('input', () => {
    const position = Number(timeline.value);
    manualPlayback = true;
    userPaused = video.paused;
    elapsed = SEQUENCE_END;
    video.currentTime = position;
    sync();
  });
  document.addEventListener('visibilitychange', sync);
  reduce.addEventListener('change', sync);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting && entry.intersectionRatio >= .35;
    sync();
  }, { threshold: [0, .35] }).observe(canvas);
  pose();

  return {
    select(next, immediate) {
      selected = next;
      if (next) {
        instant = immediate;
        elapsed = 0;
        failed = false;
        manualPlayback = false;
        userPaused = false;
        playRequest++;
        pendingPlay = false;
        video.pause();
        if (video.readyState >= 1) video.currentTime = 0;
        canvas.removeAttribute('data-video-frame');
      }
      sync();
    },
  };
}
