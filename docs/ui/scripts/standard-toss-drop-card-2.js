
(() => {
  const baseline = 3;
  const plotEnd = 10 / GRAVITY;
  const plotX = (t) => 118 + 466 * t / plotEnd;
  const plotY = (h) => 180 - h * (156 / 1.4);
  const height = (speed, t) => Math.max(0, speed * t - GRAVITY * t * t / 2);
  const at = (id) => document.getElementById("deep-" + id);
  const speedInput = at("speed");
  const timeline = at("time");
  const play = at("playback");
  let speed = Number(speedInput.value);
  let time = 0;
  let playing = false;
  let frame = null;
  let last = null;
  const end = () => 2 * speed / GRAVITY;

  function button() {
    showNativePlayback("deep-", playing ? "Pause" : time >= end() ? "Replay" : "Play");
  }

  function render(value) {
    time = Math.max(0, Math.min(end(), value));
    const h = height(speed, time);
    const x = plotX(time);
    const y = plotY(h);
    timeline.value = String(time);
    timeline.setAttribute("aria-valuetext", time.toFixed(3) + " seconds since launch");
    at("time-value").textContent = time.toFixed(3) + " s";
    at("live-height").textContent = "Trial height " + h.toFixed(2) + " m";
    at("ball").setAttribute("transform", "translate(54 " + y + ")");
    at("trial-dot").setAttribute("cx", x);
    at("trial-dot").setAttribute("cy", y);
    at("cursor").setAttribute("x1", x);
    at("cursor").setAttribute("x2", x);
    at("cursor").setAttribute("y1", y);
    button();
  }

  function stop() {
    playing = false;
    last = null;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    button();
  }

  function resetTrial() {
    stop();
    speed = Number(speedInput.value);
    const top = speed / GRAVITY;
    const peak = height(speed, top);
    const points = [];
    for (let i = 0; i <= 40; i++) {
      const t = end() * i / 40;
      points.push((i ? "L" : "M") + plotX(t).toFixed(2) + " " + plotY(height(speed, t)).toFixed(2));
    }
    at("trial-path").setAttribute("d", points.join(""));
    at("trial-peak").setAttribute("cx", plotX(top));
    at("trial-peak").setAttribute("cy", plotY(peak));
    at("coincidence").hidden = speed !== baseline;
    at("speed-value").textContent = speed.toFixed(1) + " m/s";
    at("trial-summary").textContent = "Trial " + speed.toFixed(1) + " m/s · peak " + peak.toFixed(2) + " m at " + top.toFixed(2) + " s";
    speedInput.setAttribute("aria-valuetext", speed.toFixed(1) + " metres per second");
    timeline.max = String(end());
    render(0);
  }

  function animate(now) {
    if (!playing) return;
    if (last === null) last = now;
    const delta = (now - last) / (1000 * PLAYBACK_SLOWDOWN);
    last = now;
    render(time + delta);
    if (time >= end()) stop();
    else frame = requestAnimationFrame(animate);
  }

  play.addEventListener("click", () => {
    if (playing) {
      stop();
      return;
    }
    if (time >= end()) render(0);
    playing = true;
    button();
    frame = requestAnimationFrame(animate);
  });
  speedInput.addEventListener("input", resetTrial);
  timeline.addEventListener("input", () => {
    stop();
    const next = Number(timeline.value);
    const top = speed / GRAVITY;
    render(Math.abs(next - top) < 0.006 ? top : next);
  });
  resetTrial();
})();
