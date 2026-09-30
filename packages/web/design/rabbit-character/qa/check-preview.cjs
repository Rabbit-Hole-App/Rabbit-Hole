const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const workspace = process.cwd();
const worldMode = process.argv.includes('--world');
const controlledMode = process.argv.includes('--controlled');
const articulatedMode = process.argv.includes('--articulated');
const hybridMode = process.argv.includes('--hybrid');
const livingMode = process.argv.includes('--living');
const assets = path.join(workspace, 'packages/web/design/rabbit-character');
const scratch = path.join(workspace, 'tmp/rabbit-mascot');
fs.mkdirSync(scratch, { recursive: true });
const profile = fs.mkdtempSync(path.join(scratch, 'chrome-qa-'));
const shots = path.join(scratch, 'browser-shots');
fs.mkdirSync(shots, { recursive: true });
fs.mkdirSync(path.join(assets, 'qa'), { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const files = {
  '/seed.png': ['character-seed-on-paper.png', 'image/png'],
  '/run.gif': ['run-preview.gif', 'image/gif'],
  '/run.webp': ['run-preview.webp', 'image/webp'],
  '/compare.gif': ['run-comparison.gif', 'image/gif'],
  '/seam.gif': ['run-seam-preview.gif', 'image/gif'],
  '/previous.png': ['history/pass-03/run-strip.png', 'image/png'],
  '/current.png': ['run-strip.png', 'image/png'],
  '/contacts.json': ['qa/foot-contacts.json', 'application/json'],
  '/world.js': ['qa/world-travel.js', 'text/javascript'],
  '/controlled.js': ['qa/controlled-world.js', 'text/javascript'],
  '/controlled.json': ['controlled-05/qa/foot-slip.json', 'application/json'],
  '/pass04.png': ['run-strip.png', 'image/png'],
  '/keys.png': ['controlled-05/run-right-8.png', 'image/png'],
  '/sixteen.png': ['controlled-05/run-right-16.png', 'image/png'],
  '/controlled.gif': ['controlled-05/run-16-slow.gif', 'image/gif'],
  '/controlled.webp': ['controlled-05/run-16-slow.webp', 'image/webp'],
};
const html = '<!doctype html><meta charset="utf-8"><title>Rabbit artifact QA</title>' +
  '<style>body{margin:16px;background:white;color:#555;font:16px Arial}main{display:flex;gap:8px}' +
  'figure{margin:0}img{display:block;image-rendering:pixelated}figcaption{padding:12px}</style>' +
  '<main><figure><img id="seed" src="/seed.png"><figcaption>Original mascot seed</figcaption></figure>' +
  '<figure><img id="gif" src="/run.gif"><figcaption>Native GIF playback</figcaption></figure>' +
  '<figure><img id="webp" src="/run.webp"><figcaption>Native WebP playback</figcaption></figure></main>' +
  '<main><figure><img id="compare" src="/compare.gif"><figcaption>Previous / refinement</figcaption></figure>' +
  '<figure><img id="seam" src="/seam.gif"><figcaption>Slow loop including 08 to 01</figcaption></figure></main>';
const errors = [];
const worldHtml = '<!doctype html><meta charset="utf-8"><title>Rabbit travel verification</title>' +
  '<style>body{margin:0;background:white}canvas{display:block}</style>' +
  '<canvas width="1040" height="660"></canvas><script src="/world.js"></script>';
const controlledHtml = '<!doctype html><meta charset="utf-8"><title>Controlled run asset QA</title>' +
  '<style>body{margin:0;background:white}canvas{display:block}img{image-rendering:pixelated}</style>' +
  '<canvas width="1040" height="910"></canvas><script src="/controlled.js"></script>';
const articulatedHtml = '<!doctype html><meta charset="utf-8"><title>Continuous rabbit rig QA</title>' +
  '<style>body{margin:0;background:white}canvas{display:block}</style>' +
  '<canvas width="1536" height="560"></canvas><script type="module" src="/articulated-06/qa/preview.mjs"></script>';
const hybridHtml = articulatedHtml.replace('1536','1024').replace('/articulated-06/qa/preview.mjs','/hybrid-07/qa/preview.mjs');
const livingHtml = articulatedHtml.replace('1536','1000').replace('560','640').replace('/articulated-06/qa/preview.mjs','/living-08/qa/preview.mjs');
const server = http.createServer((req, res) => {
  if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(livingMode ? livingHtml : hybridMode ? hybridHtml : articulatedMode ? articulatedHtml : controlledMode ? controlledHtml : worldMode ? worldHtml : html); return; }
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if(livingMode){
    let file;
    if(/^\/src\/mascot\/[a-z-]+\.js$/.test(req.url))file=path.join(workspace,'packages/web',req.url);
    else if(/^\/mascot\/(?:rig\.json|[a-z_0-9-]+\.png)$/.test(req.url))file=path.join(workspace,'packages/web/public',req.url);
    else if(/^\/design\/rabbit-character\/articulated-06\/[a-z-]+\.mjs$/.test(req.url))file=path.join(workspace,'packages/web',req.url);
    else if(req.url==='/living-08/qa/preview.mjs')file=path.join(assets,'living-08/qa/preview.mjs');
    if(file){res.writeHead(200,{'Content-Type':file.endsWith('.png')?'image/png':file.endsWith('.json')?'application/json':'text/javascript'});res.end(fs.readFileSync(file));return;}
  }
  if ((articulatedMode||hybridMode) && /^\/(?:articulated-06|hybrid-07)\/(?:[a-z-]+\.mjs|rig\.json|qa\/preview\.mjs|textures\/[a-z_]+\.png)$/.test(req.url)) {
    const extension=path.extname(req.url),filePath=path.join(assets,req.url.slice(1));
    res.writeHead(200,{'Content-Type':extension==='.mjs'?'text/javascript':extension==='.json'?'application/json':'image/png','Cache-Control':'no-store'});
    res.end(fs.readFileSync(filePath));return;
  }
  const file = files[req.url];
  if (!file) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(path.join(assets, file[0])));
});

function client(socket) {
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const result = pending.get(message.id);
      if (!result) return;
      pending.delete(message.id);
      if (message.error) result.reject(new Error(JSON.stringify(message.error)));
      else result.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry.text);
  });
  return (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id;
    pending.set(next, { resolve, reject });
    socket.send(JSON.stringify({ id: next, method, params }));
  });
}

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', ...((articulatedMode||hybridMode||livingMode) ? ['--enable-unsafe-swiftshader'] : ['--disable-gpu']), '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1600,1260', url,
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  chrome.stderr.resume();
  let launchError;
  chrome.on('error', error => { launchError = error; });
  let socket;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    let port;
    for (let i = 0; i < 200 && !port; i++) {
      if (launchError) throw launchError;
      try {
        const lines = fs.readFileSync(portFile, 'utf8').trim().split('\n');
        if (/^\d+$/.test(lines[0]) && lines.length > 1) port = lines[0];
      } catch (error) {
        if (!['ENOENT', 'EBUSY'].includes(error.code)) throw error;
      }
      if (!port) await sleep(100);
    }
    if (!port) throw new Error('Chrome did not publish its isolated DevTools endpoint.');
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const target = targets.find(item => item.type === 'page' && item.url.startsWith(url));
    if (!target) throw new Error('Isolated artifact preview target was not found.');
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve); socket.addEventListener('error', reject); });
    const send = client(socket);
    await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
    if(livingMode){
      const report=await require('./check-living.cjs')(send,assets,scratch,errors);console.log(JSON.stringify(report,null,2));
      await Promise.race([send('Browser.close').catch(()=>{}),sleep(1000)]);if(!report.pass)process.exitCode=1;return;
    }
    if (hybridMode) {
      const report = await require('./check-hybrid.cjs')(send, assets, scratch, errors);
      console.log(JSON.stringify(report, null, 2));
      await Promise.race([send('Browser.close').catch(() => {}), sleep(1000)]);
      if (!report.pass) process.exitCode = 1;
      return;
    }
    if (articulatedMode) {
      const report = await require('./check-articulated.cjs')(send, assets, scratch, errors);
      console.log(JSON.stringify(report, null, 2));
      await Promise.race([send('Browser.close').catch(() => {}), sleep(1000)]);
      if (!report.pass) process.exitCode = 1;
      return;
    }
    if (controlledMode) {
      const report = await require('./check-controlled-travel.cjs')(send, assets, scratch, errors);
      console.log(JSON.stringify(report, null, 2));
      await Promise.race([send('Browser.close').catch(() => {}), sleep(1000)]);
      if (!report.pass) process.exitCode = 1;
      return;
    }
    if (worldMode) {
      const report = await require('./check-world-travel.cjs')(send, assets, scratch, errors);
      console.log(JSON.stringify(report, null, 2));
      await Promise.race([send('Browser.close').catch(() => {}), sleep(1000)]);
      if (!report.pass) process.exitCode = 1;
      return;
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1260, deviceScaleFactor: 1, mobile: false });
    const decode = { expression:
      '(async () => {for(let i=0;i<100 && document.images.length!==5;i++) await new Promise(resolve=>setTimeout(resolve,50)); const images=[...document.images]; if(images.length !== 5) throw new Error("Expected five preview images."); return Promise.all(images.map(async image => {await image.decode(); return {id:image.id,width:image.naturalWidth,height:image.naturalHeight};}));})()',
      awaitPromise: true, returnByValue: true };
    let loaded;
    for (let attempt = 0; attempt < 20 && !loaded; attempt++) {
      try { loaded = await send('Runtime.evaluate', decode); }
      catch (error) {
        // Initial navigation can replace the empty document after CDP attaches.
        // Retry only that lifecycle race; real decode/runtime errors still fail.
        if (!error.message.includes('Execution context was destroyed')) throw error;
        await sleep(100);
      }
    }
    if (!loaded) throw new Error('Preview navigation did not settle.');
    if (loaded.exceptionDetails) throw new Error('Browser image decoding failed: ' +
      (loaded.exceptionDetails.exception?.description || loaded.exceptionDetails.text));
    const version = await send('Browser.getVersion');
    const full = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(assets, 'qa/browser-preview.png'), Buffer.from(full.data, 'base64'));
    const counts = {};
    for (const id of ['gif', 'webp', 'compare', 'seam']) {
      const bounds = await send('Runtime.evaluate', { expression:
        `(() => {const r=document.getElementById('${id}').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1};})()`,
        returnByValue: true });
      const unique = new Set();
      for (let n = 0; n < (id === 'seam' ? 64 : 24); n++) {
        await sleep(37);
        const shot = await send('Page.captureScreenshot', { format: 'png', clip: bounds.result.value });
        const buffer = Buffer.from(shot.data, 'base64');
        const hash = crypto.createHash('sha256').update(buffer).digest('hex');
        if (!unique.has(hash)) fs.writeFileSync(path.join(shots, `${id}-${String(unique.size + 1).padStart(2, '0')}.png`), buffer);
        unique.add(hash);
      }
      counts[id] = unique.size;
    }
    const report = { environment: 'isolated headless Chrome; local artifact files over localhost',
      browser: version.product, tested_at: new Date().toISOString(), images: loaded.result.value,
      source_sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(assets, 'run-strip.png'))).digest('hex'),
      distinct_visible_frames: counts, console_errors: errors,
      pass: loaded.result.value.length === 5 && loaded.result.value.every(image =>
        image.width === (image.id === 'compare' ? 1024 : 512) && image.height === (['compare', 'seam'].includes(image.id) ? 560 : 512)) &&
        ['gif', 'webp', 'compare', 'seam'].every(id => counts[id] === 8) && errors.length === 0 };
    fs.writeFileSync(path.join(assets, 'qa/browser-verification.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
    await Promise.race([send('Browser.close').catch(() => {}), sleep(1000)]);
    if (!report.pass) process.exitCode = 1;
  } finally {
    socket?.close();
    if (chrome.exitCode === null) chrome.kill();
    server.closeAllConnections();
    server.close();
  }
}
main().catch(error => { console.error(error.message); server.close(); process.exitCode = 1; });
