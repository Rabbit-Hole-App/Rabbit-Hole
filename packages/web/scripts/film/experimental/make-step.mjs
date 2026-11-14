// EXPERIMENTAL SNAPSHOT (read-only copy of C:/s/spec/film-explain/make-step.mjs at 2026-11-14 03:14 PT): builds capture-step.mjs from the film's capture.mjs by text anchors, so a change in capture.mjs can break an anchor. Machine-specific paths kept as they were.
// Builds capture-step.mjs from capture.mjs: the take runs on a VIRTUAL clock so 4K frames can be screenshotted one by one (frame-stepped take), nothing real-time left in the beats.
// Page: Playwright's page.clock (fake timers/rAF/Date) advanced DT per step + the Web Animations API (CSS animations/transitions) set to the virtual time + the camera tween in JS.
// Node: every wait (pause, waitForTimeout, scripted route delays, typing delays, cursor glides) sleeps on the same virtual clock (vsleep).
import { readFileSync, writeFileSync } from 'node:fs';
let t = readFileSync('C:/s/spec/film-explain/capture.mjs', 'utf8');
const swap = (from, to, label) => { if (!t.includes(from)) throw new Error(`anchor missing: ${label}`); t = t.replace(from, () => to); };
swap('let t0 = Date.now();\nconst at = () => Number(((Date.now() - t0) / 1000).toFixed(2));',
  'let t0 = 0, vt = 0;\nconst waiters = [];\nconst vsleep = ms => new Promise(resolve => waiters.push([vt + ms, resolve]));\nconst at = () => Number((vt / 1000).toFixed(2));', 'clock');
swap('await new Promise(resolve => setTimeout(resolve, delay)); // the spinner is part of the footage', 'await vsleep(delay); // the spinner is part of the footage', 'route delay');
swap('await new Promise(resolve => setTimeout(resolve, 1300));', 'await vsleep(1300);', 'file store delay');
swap(';transition:transform var(--cam,0ms) cubic-bezier(.65,0,.35,1)', '', 'body transition');
swap(';transition:left .38s cubic-bezier(.3,.1,.2,1),top .38s cubic-bezier(.3,.1,.2,1)', '', 'cursor transition');
swap("    window.__key = () =>", `    // STEP mode: the camera and every CSS animation/transition run on the take's virtual clock (window.__tick is called by the take after each clock step).
    window.__vt = 0;
    let camFrom = { s: 1, tx: 0, ty: 0 }, camTo = camFrom, camStart = 0, camMs = 0;
    const ease = p => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    const camNow = () => { if (!camMs) return camTo; const e = ease(Math.min(1, (window.__vt - camStart) / camMs)); return { s: camFrom.s + (camTo.s - camFrom.s) * e, tx: camFrom.tx + (camTo.tx - camFrom.tx) * e, ty: camFrom.ty + (camTo.ty - camFrom.ty) * e }; };
    window.__camTo = (c, ms) => { camFrom = camNow(); camTo = c; camStart = window.__vt; camMs = ms; };
    window.__tick = v => {
      window.__vt = v; const c = camNow(); if (document.body) document.body.style.transform = \`translate(\${c.tx}px, \${c.ty}px) scale(\${c.s})\`;
      for (const a of document.getAnimations()) { if (a.__vt0 === undefined) { a.__vt0 = v - (Number(a.currentTime) || 0); a.pause(); } a.currentTime = v - a.__vt0; }
    };
    window.__key = () =>`, 'page tick');
const cam = /await page\.evaluate\(\(\[c, d\]\) => \{ document\.body\.style\.setProperty[^\n]*\[cam, ms\]\);/;
if (!cam.test(t)) throw new Error('anchor missing: camera evaluate');
t = t.replace(cam, () => 'await page.evaluate(([c, d]) => window.__camTo(c, d), [cam, ms]);');
const g0 = t.indexOf('const glide = async (x, y, steps = 14) => {'), g1 = t.indexOf('\n};', g0) + 3;
if (g0 < 0) throw new Error('anchor missing: glide');
t = t.slice(0, g0) + `const glide = async (x, y, steps = 14) => {
  const d = Math.hypot(x - lastX, y - lastY), wait = Math.round(Math.min(520, 140 + d * 0.3)), travel = Math.min(380, wait), n = Math.max(3, Math.round(travel / 33));
  for (let i = 1; i <= n; i++) { const e = 1 - Math.pow(1 - i / n, 3); await page.mouse.move(lastX + (x - lastX) * e, lastY + (y - lastY) * e); await vsleep(travel / n); }
  lastX = x; lastY = y;
  await vsleep(wait - travel);
};` + t.slice(g1);
swap('const OUT = process.argv[2] || `${F}take-1`;', 'const OUT = process.argv[2] || `${F}take-1`;\nconst TYPING = { prose_ms: 30, command_ms: 60, ...(JSON.parse(readFileSync(F + "film.config.json", "utf8")).typing || {}) };', 'typing config');
swap('const typed = async (text, delay) => { const a = at(); await page.keyboard.type(text, { delay }); marks.typing.push([a, at()]); };',
  "const typed = async (text, delayArg) => {\n  const delay = delayArg >= 20 ? TYPING.command_ms : TYPING.prose_ms, a = at(), k = Math.max(1, Math.floor(33.3 / Math.max(1, delay)));\n  const fieldText = () => page.evaluate(() => { const e = document.activeElement; return e ? (typeof e.value === 'string' ? e.value : (e.textContent || '')) : ''; });\n  for (let i = 0; i < text.length; i += k) {\n    const chunk = text.slice(i, i + k), before = (await fieldText()).length;\n    await page.keyboard.type(chunk);                                                  // real key events, per frame-chunk on the virtual clock\n    for (let tries = 0; tries < 3; tries++) { const have = (await fieldText()).length - before; if (have >= chunk.length) break; log.push('RETRY dropped key ' + JSON.stringify(chunk.slice(Math.max(0, have)))); await page.keyboard.type(chunk.slice(Math.max(0, have))); }\n    await vsleep(delay * chunk.length);\n  }\n  const typedNow = await fieldText(), ok = typedNow.endsWith(text);\n  log.push('TYPED ' + (ok ? 'ok' : 'MISMATCH') + ' ' + text.length + ' chars at ' + delay + ' ms/key: ' + JSON.stringify(text.slice(0, 40)));\n  if (!ok) throw new Error('typed text does not equal the sentence: ' + JSON.stringify(typedNow.slice(-80)));\n  marks.typing.push([a, at()]);\n};", 'typed');
swap('const page = await context.newPage();', `const page = await context.newPage();
await page.clock.install({ time: new Date('2026-11-14T00:00:00Z') });
await page.clock.pauseAt(new Date('2026-11-14T00:00:02Z'));
page.waitForTimeout = ms => vsleep(ms);`, 'page clock');
swap('\nt0 = Date.now();\n', `
t0 = 0; vt = 0;
// The stepper: advance the virtual clock DT per step (the page's timers and rAF via page.clock, its CSS animations via __tick), release the script's waits, screenshot at true device size inside the capture window.
const DT = Number(process.env.DT || 33.333), CAPFROM = Number(process.env.CAPFROM || 0), CAPTO = Number(process.env.CAPTO || 1e9), STOPAT = Number(process.env.STOPAT || 0), IDLE = Number(process.env.IDLE || 100);
const stepStats = { shots: 0, shotMs: [] };
globalThis.stepOn = true;
const finishStep = async () => {
  await Promise.all(frameWrites);
writeFileSync(join(OUT, 'frames.json'), JSON.stringify({ frames: frameLog }));
};
globalThis.stepper = (async () => {
  mkdirSync(frameDir, { recursive: true });
  while (globalThis.stepOn) {
    const inside = vt / 1000 >= CAPFROM && vt / 1000 <= CAPTO, dt = inside ? DT : IDLE;
    // release the script's waits in time order INSIDE the step (a 9 ms key delay must not cost a whole 33 ms step): each release lets the script act, then enqueue its next wait
    const target = vt + dt;
    for (;;) {
      const due = waiters.filter(x => x[0] <= target + 1e-6).sort((p, q) => p[0] - q[0])[0];
      if (!due) break;
      waiters.splice(waiters.indexOf(due), 1); vt = Math.max(vt, due[0]); due[1]();
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    vt = target;
    await page.clock.runFor(dt);
    await page.evaluate(v => window.__tick && window.__tick(v), vt).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 25)); // real time: lets the script's reaction (a click, a key) reach the page before the frame
    if (inside) {
      const s = Date.now();
      const buf = await page.screenshot({ type: 'jpeg', quality: 92, scale: 'device', timeout: 30000 }).catch(() => null);
      if (buf) { const n = frameLog.length; frameLog.push({ n, ts: vt / 1000, w: VW * DSF, h: VH * DSF }); stepStats.shots++; stepStats.shotMs.push(Date.now() - s); frameWrites.push(import('node:fs/promises').then(fs => fs.writeFile(join(frameDir, \`f\${String(n).padStart(6, '0')}.jpg\`), buf))); }
    }
    if (STOPAT && vt / 1000 >= STOPAT) {
      globalThis.stepOn = false;
      await finishStep();
      writeFileSync(join(OUT, 'requests.log'), log.join('\\n'));
      writeFileSync(join(OUT, 'marks.json'), JSON.stringify({ ...marks, t0Epoch: 0, viewport: { w: VW, h: VH, dsf: DSF }, stopAt: STOPAT }, null, 2));
      const ms = stepStats.shotMs.sort((a, b) => a - b);
      console.log(JSON.stringify({ stopAt: STOPAT, shots: stepStats.shots, medianShotMs: ms[Math.floor(ms.length / 2)], p95ShotMs: ms[Math.floor(ms.length * 0.95)] }));
      process.exit(0);
    }
  }
})();
`, 't0 reset');
swap('  if (cdp) {\n', "  if (process.env.STEP && !STOPAT) { globalThis.stepOn = false; await globalThis.stepper; await finishStep(); }\n  if (cdp) {\n", 'finally');
t = t.replace(/timeout: ([0-9]+)/g, (s, n) => 'timeout: ' + n * 10);   // Playwright timeouts are real time; a virtual step costs 0.2-0.6 s, so the stepped waits are x10
writeFileSync('C:/s/spec/film-explain/capture-step.mjs', t);
console.log('capture-step.mjs written', t.length);
