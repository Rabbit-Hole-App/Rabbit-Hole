const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Invoked by the existing isolated Chrome harness with --world.
module.exports = async function checkTravel(send, assets, scratch, errors) {
  await send('Emulation.setDeviceMetricsOverride', { width: 1040, height: 660, deviceScaleFactor: 1, mobile: false });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  await evaluate('(async()=>{for(let i=0;i<200&&!window.travel?.ready;i++)await new Promise(r=>setTimeout(r,25));if(!window.travel?.ready)throw new Error("Travel images did not load");return true;})()');
  await sleep(1100);
  const live = await evaluate('({ticks:travel.ticks,history:travel.history,config:travel.config,scale:travel.scale})');
  const speed = live.config.speed_source_px_s;
  const samples = [];
  for (const [ratio, fps] of [[0.8,13], [1,13], [1.2,13], [1,11], [1,15]]) {
    const frames = [];
    for (let index = 0; index < 8; index++) {
      frames.push(await evaluate(`travel.seek(${(index + 0.5) / fps},${speed * ratio},true,${fps})`));
    }
    samples.push({ fps, speed_ratio: ratio, speed_source_px_s: speed * ratio, frames });
  }
  const guideSpeed = live.config.approved_guide_speed_source_px_s;
  const guideSamples = [];
  for (let index = 0; index < 8; index++) {
    guideSamples.push(await evaluate(`travel.seek(${(index + 0.5) / 13},${guideSpeed},true,13)`));
  }
  // Two full cycles, four real canvas captures per held drawing. World travel
  // continues during each hold: no per-frame root nudge or foot-locking offset.
  const captureDir = path.join(scratch, 'world-captures');
  fs.mkdirSync(captureDir, { recursive: true });
  const captureStates = [];
  for (let index = 0; index < 64; index++) {
    const seconds = index / 52;
    const state = await evaluate(`travel.seek(${seconds},${speed})`);
    captureStates.push(state);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(captureDir, `${String(index).padStart(3, '0')}.png`), Buffer.from(shot.data, 'base64'));
  }
  await evaluate(`travel.seek(${0.5 / 13},${speed},true)`);
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(assets, 'qa/world-travel-browser.png'), Buffer.from(screenshot.data, 'base64'));
  const differences = captureStates.slice(1).map((state, i) => state.root_x - captureStates[i].root_x);
  const expectedStep = speed * live.scale / 52;
  const linear = differences.every(value => Math.abs(value - expectedStep) < 1e-7);
  const liveFrames = [...new Set(live.history.map(item => item.frame))].sort();
  const withinHold = captureStates[1].frame === captureStates[0].frame && differences[0] > 0;
  const stationaryGround = captureStates.every(item => item.measurements[0].baseline === 300 && item.measurements[1].baseline === 600);
  const report = {
    tested_at: new Date().toISOString(), browser: (await send('Browser.getVersion')).product,
    environment: 'isolated Chrome, local artifact QA; no application runtime added',
    fps: 13, display_scale: live.scale, live_raf_ticks: live.ticks, live_pose_frames: liveFrames,
    linear_world_travel: linear, root_moves_during_held_sprite_frame: withinHold,
    fixed_ground_baselines: stationaryGround, camera_motion: false,
    root_correction_per_frame: false, test_speeds: samples,
    approved_guide_speed_test: { fps: 13, speed_source_px_s: guideSpeed, frames: guideSamples },
    captures: { count: 64, sampling_fps: 52, cycles: 2, directory: path.relative(process.cwd(), captureDir) },
    source_sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(assets, 'run-strip.png'))).digest('hex'),
    console_errors: errors,
    pass: linear && withinHold && stationaryGround && live.ticks > 10 && liveFrames.length === 8 && errors.length === 0,
    visual_quality_approved: false,
    limits: ['Passing validates the travel fixture; measured and visible foot sliding are assessed separately.'],
  };
  fs.writeFileSync(path.join(assets, 'qa/world-travel-verification.json'), JSON.stringify(report, null, 2) + '\n');
  return { pass: report.pass, browser: report.browser, live_pose_frames: liveFrames,
    linear_world_travel: linear, root_moves_during_held_sprite_frame: withinHold,
    tested_speeds: samples.map(item => item.speed_source_px_s), captures: 64, console_errors: errors };
};
