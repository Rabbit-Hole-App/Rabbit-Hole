// Local asset-verification fixture. This is not an application feature/page.
// Sprite frame selection and world position consume time independently.
(async () => {
  const canvas = document.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const config = await (await fetch('/contacts.json')).json();
  const strips = await Promise.all(['/previous.png', '/current.png'].map(async src => {
    const image = new Image(); image.src = src; await image.decode(); return image;
  }));
  const scale = 0.375;
  const ground = [300, 600];
  const startX = 170;
  let playback = true;
  let start;
  let ticks = 0;
  const history = [];
  function render(seconds, speed = config.speed_source_px_s, diagnostics = false, fps = config.fps) {
    const frame = Math.floor(seconds * fps + 1e-7) % 8;
    const rootX = startX + seconds * speed * scale;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = '18px Arial'; ctx.fillStyle = '#222';
    ctx.fillText(`${fps} FPS / ${speed.toFixed(1)} source px/s / ${(speed * scale).toFixed(1)} display px/s`, 24, 28);
    ctx.font = '14px Arial'; ctx.fillStyle = '#555';
    ctx.fillText(`Fixed ground + continuous world travel / frame ${frame + 1} / ${(seconds * 1000).toFixed(0)} ms`, 24, 52);
    const measurements = [];
    for (let row = 0; row < 2; row++) {
      const baseline = ground[row];
      ctx.strokeStyle = '#bfc3c6'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(24, baseline); ctx.lineTo(canvas.width - 24, baseline); ctx.stroke();
      for (let x = 50; x < canvas.width; x += 50) {
        ctx.beginPath(); ctx.moveTo(x, baseline); ctx.lineTo(x, baseline + 9); ctx.stroke();
      }
      ctx.fillStyle = '#555'; ctx.font = '15px Arial';
      ctx.fillText(row === 0 ? 'Previous / pass 03' : 'Guide-based candidate / pass 04', 24, baseline + 34);
      ctx.imageSmoothingEnabled = false;
      const x = rootX - 256 * scale;
      const y = baseline - 480 * scale;
      ctx.drawImage(strips[row], frame * 512, 0, 512, 512, x, y, 512 * scale, 512 * scale);
      const point = config[row === 0 ? 'previous' : 'current'].find(item => item.frame === frame + 1);
      const footX = point ? x + point.x * scale : null;
      const footY = point ? y + point.y * scale : null;
      if (diagnostics && point) {
        ctx.strokeStyle = '#b6533b'; ctx.beginPath();
        ctx.arc(footX, footY, 5, 0, Math.PI * 2); ctx.stroke();
      }
      measurements.push({ row, frame: frame + 1, root_x: rootX, foot_x: footX, foot_y: footY, baseline });
    }
    window.travel.last = { seconds, speed, fps, frame: frame + 1, root_x: rootX, measurements };
    return window.travel.last;
  }
  window.travel = {
    ready: true, config, scale, ticks: 0, history,
    seek(seconds, speed, diagnostics = false, fps = config.fps) { playback = false; return render(seconds, speed, diagnostics, fps); },
  };
  function tick(timestamp) {
    if (start === undefined) start = timestamp;
    if (playback) {
      const seconds = ((timestamp - start) / 1000) % (16 / config.fps);
      const state = render(seconds);
      ticks++;
      window.travel.ticks = ticks;
      if (history.length < 180) history.push({ timestamp, ...state });
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
