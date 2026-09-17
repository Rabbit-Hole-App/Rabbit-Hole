// Real-browser check: nanoGPT lesson narration plays each clip once, in order,
// with no mid-clip seeks or restarts. Run from packages/web:
//   node <this file> [seconds]
import { chromium } from '@playwright/test';

const WATCH_S = Number(process.argv[2] || 32);
const app = {
  name: 'nanogpt', org: 'example-team', orgName: 'Example team', kind: 'repository',
  repo: 'karpathy/nanoGPT', description: '', owner_email: 'builder@example.test',
  deployed_at: '2026-09-08T09:16:00Z', created_at: '2026-09-07T16:20:00Z',
  visibility: 'domain', members: [], teams: [], observations: [], canEdit: true,
  email: 'builder@example.test', schedule: null, commit_sha: 'abc123',
};
const replies = {
  '/api/apps': { org: app.org, orgName: app.orgName, email: app.email, apps: [app], folders: [] },
  '/api/apps/nanogpt': app,
  '/api/apps/nanogpt/learn-course': { course: null, canAuthor: true },
  '/api/repositories/nanogpt': { ...app, status: 'ready' },
  '/api/repositories/nanogpt/snapshot': { commit: 'abc123', graph: { nodes: [], edges: [] }, files: [], skipped: [] },
  '/api/workspaces': { active: app.org, email: app.email, workspaces: [{ slug: app.org, name: app.orgName, role: 'owner', kind: 'custom' }] },
  '/api/ask/threads': { threads: [] }, '/api/watch': { observations: [], runs: [] },
  '/api/teams': { teams: [] }, '/api/members': { members: [] }, '/api/byoc/connection': { connection: null },
};

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.addInitScript(() => {
  window.__audioLog = [];
  const name = src => (src || '').split('/').pop();
  const origPlay = HTMLMediaElement.prototype.play;
  const origPause = HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.play = function () {
    window.__audioLog.push({ t: Math.round(performance.now()), e: 'play', src: name(this.src), at: +this.currentTime.toFixed(2) });
    return origPlay.call(this);
  };
  HTMLMediaElement.prototype.pause = function () {
    if (!this.paused) window.__audioLog.push({ t: Math.round(performance.now()), e: 'pause', src: name(this.src), at: +this.currentTime.toFixed(2) });
    return origPause.call(this);
  };
  const desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
    get: desc.get,
    set(value) {
      window.__audioLog.push({ t: Math.round(performance.now()), e: 'seek', src: name(this.src), to: +value.toFixed(2), paused: this.paused });
      return desc.set.call(this, value);
    },
  });
});
await page.route('**/api/**', route => {
  const url = new URL(route.request().url());
  return route.fulfill({ json: replies[url.pathname] || {} });
});
page.on('pageerror', error => console.log('pageerror:', error.message));
await page.goto('http://localhost:5186/apps/nanogpt?tab=learn');
await page.waitForTimeout(WATCH_S * 1000);
const log = await page.evaluate(() => window.__audioLog);
const heard = await page.evaluate(() => {
  const media = performance.getEntriesByType('resource').filter(r => r.name.includes('/audio/'));
  return media.map(r => r.name.split('/').pop());
});
await browser.close();

console.log(`events: ${log.length}; fetched clips: ${[...new Set(heard)].join(', ')}`);
for (const entry of log) console.log(JSON.stringify(entry));

const plays = log.filter(entry => entry.e === 'play');
const starts = [];
for (const entry of plays) if (entry.at < 0.25 && (!starts.length || starts[starts.length - 1].src !== entry.src)) starts.push(entry);
const order = starts.map(entry => entry.src);
const problems = [];
const expected = ['nanogpt-l1-p1-0.mp3', 'nanogpt-l1-p1-1.mp3', 'nanogpt-l1-p1-2.mp3'];
if (JSON.stringify(order.slice(0, 3)) !== JSON.stringify(expected)) problems.push(`clip order wrong: ${order.join(' -> ')}`);
const restarted = Object.entries(plays.reduce((count, entry) => { if (entry.at < 0.25) count[entry.src] = (count[entry.src] || 0) + 1; return count; }, {})).filter(([, count]) => count > 1);
if (restarted.length) problems.push(`restarted from zero: ${restarted.map(([src, count]) => `${src} x${count}`).join(', ')}`);
const midSeeks = log.filter(entry => entry.e === 'seek' && entry.to > 0.5);
if (midSeeks.length) problems.push(`mid-clip seeks: ${midSeeks.length}`);
const resets = log.filter(entry => entry.e === 'seek' && entry.to === 0 && !entry.paused);
if (resets.length) problems.push(`reset while playing: ${resets.length}`);
if (problems.length) { console.log('FAIL'); problems.forEach(problem => console.log(' -', problem)); process.exit(1); }
console.log(`PASS: ${order.length} clips started once each, in order: ${order.join(' -> ')}`);
