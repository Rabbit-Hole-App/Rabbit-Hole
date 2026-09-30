const TOOL = '/motion';
const MESSAGE = 'explain me softmax function';
const GENERATE_AT = 3800;
const REVEAL_AT = GENERATE_AT + 1000;
const PLAY_AT = REVEAL_AT + 1600;
const SEQUENCE_END = PLAY_AT + 700;

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
