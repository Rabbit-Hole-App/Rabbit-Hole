// Explain Back sketch grading, for real (docs/features/explain-back-sketch.md): each fixture in
// explain-back-sketch/fixtures.json is drawn to a PNG the way a sketch is sent (white, 350 x 240, 2x) and graded
// through the same instruction, content and grading task as POST /api/learn/assess. The fixtures check that a
// meaningful sketch alone earns credit, that an irrelevant or wrong one does not, and that text plus sketch is one
// response (and the same text alone is not enough).
// Hand-run, never in CI. Without --run it only draws the PNGs and prints the instructions: no model call.
//   node tests/evals/explain-back-sketch.mjs [--run] [--only id,id] [--out results.json]
// --run needs ANTHROPIC_API_KEY in the root .env (small-deploy), never printed, and an owner GO: one grading call per
// fixture, at most five.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { anthropic } from '../../packages/control-plane/src/ask.js';
import { loggedModel } from '../../packages/control-plane/src/learn-models.js';
import { assessContent, assessText, validateAssessBody } from '../../packages/control-plane/src/learn-grade-routes.js';
import { challengePrompt, parseVerdict } from '../../packages/control-plane/src/agents/learn-grade.js';
import { sketchText } from '../../packages/web/src/explain-sketch.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = name => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : null; };
const only = flag('--only')?.split(',') ?? null;
const run = args.includes('--run');
const out = flag('--out') || join(here, 'results', `explain-back-sketch-${new Date().toISOString().slice(0, 10)}.json`);
const { prompt, expects, fixtures } = JSON.parse(readFileSync(join(here, 'explain-back-sketch', 'fixtures.json'), 'utf8'));
const chosen = fixtures.filter(entry => !only || only.includes(entry.id));
if (chosen.length > 5) throw Error('at most five fixtures per run');

// A plain SVG of a sketch: enough of the canvas's look (ink, boxes, arrows with heads, centred text, labels) for
// the grader to read it as the learner drew it.
const esc = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function svgOf({ strokes = [], shapes = [], items = [] }) {
  const ink = '#37352f', parts = [];
  // A line label sits on a white patch, as on the canvas, so the line never runs through its words.
  const words = (x, y, w, text, patch = false) => `<foreignObject x="${x}" y="${y}" width="${w}" height="60"><div xmlns="http://www.w3.org/1999/xhtml" style="font:12px Inter,Arial,sans-serif;color:${ink};text-align:center;line-height:1.2"><span style="${patch ? 'background:#fff;padding:0 3px' : ''}">${esc(text)}</span></div></foreignObject>`;
  for (const stroke of strokes) parts.push(`<path d="${stroke.points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')}" fill="none" stroke="${ink}" stroke-width="${stroke.width || 2}" stroke-linecap="round"/>`);
  for (const s of shapes) {
    const x = Math.min(s.x1, s.x2), y = Math.min(s.y1, s.y2), w = Math.abs(s.x2 - s.x1), h = Math.abs(s.y2 - s.y1);
    if (s.kind === 'rect') parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="none" stroke="${ink}" stroke-width="2"/>`);
    if (s.kind === 'ellipse') parts.push(`<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="none" stroke="${ink}" stroke-width="2"/>`);
    if (s.kind === 'triangle') parts.push(`<polygon points="${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}" fill="none" stroke="${ink}" stroke-width="2"/>`);
    if (s.kind === 'arrow' || s.kind === 'line') {
      parts.push(`<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${ink}" stroke-width="2"/>`);
      if (s.kind === 'arrow') {
        const a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1), k = 10;
        parts.push(`<path d="M${s.x2 - k * Math.cos(a - 0.45)} ${s.y2 - k * Math.sin(a - 0.45)} L${s.x2} ${s.y2} L${s.x2 - k * Math.cos(a + 0.45)} ${s.y2 - k * Math.sin(a + 0.45)}" fill="none" stroke="${ink}" stroke-width="2"/>`);
      }
      if (s.label) parts.push(words((s.x1 + s.x2) / 2 - 60, (s.y1 + s.y2) / 2 - 8, 120, s.label, true));
    }
    if (s.text) parts.push(words(x + 4, y + Math.max(2, h / 2 - 8), w - 8, s.text));
  }
  for (const item of items) parts.push(`<text x="${item.x}" y="${item.y + 14}" font-family="Inter,Arial,sans-serif" font-size="14" fill="${ink}">${esc(item.text)}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="350" height="240" style="background:#fff">${parts.join('')}</svg>`;
}

// The drawn PNGs are working files, never committed.
const shots = join(tmpdir(), 'explain-back-sketch-png');
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
const images = {};
for (const fixture of chosen) {
  if (!fixture.sketch) continue;
  await page.setContent(`<body style="margin:0">${svgOf(fixture.sketch)}</body>`);
  const png = await page.locator('svg').screenshot({ path: join(shots, `${fixture.id}.png`) });
  images[fixture.id] = `data:image/png;base64,${png.toString('base64')}`;
}
await browser.close();

let env = null;
if (run) {
  const envFile = readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
  const keyOf = name => envFile.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1]?.trim() || null;
  env = { ANTHROPIC_API_KEY: keyOf('ANTHROPIC_API_KEY'), ANTHROPIC_WORKSPACE_ID: keyOf('ANTHROPIC_WORKSPACE_ID') ?? undefined };
  if (!env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY required in the root .env'); process.exit(1); }
}

const results = [];
for (const fixture of chosen) {
  // The request the browser would send, through the route's own validation.
  const body = { mode: 'explain_back', prompt, expects, answer: fixture.answer,
    ...(fixture.sketch ? { attempt_id: `eval-${fixture.id}`, sketch: { image: images[fixture.id], text: sketchText(fixture.sketch) } } : {}) };
  const input = validateAssessBody(body);
  if (input.error) throw Error(`${fixture.id}: ${input.error}`);
  const sketch = input.value.sketch || null;
  const instruction = challengePrompt({ mode: 'explain_back', prompt, expects }, input.value.answer, sketch);
  if (!run) { console.log(`--- ${fixture.id} (expect ${fixture.expect})\n${instruction}\n`); continue; }
  const started = Date.now();
  const text = await assessText(env, assessContent(instruction, sketch), loggedModel('grading', anthropic));
  const verdict = parseVerdict(text);
  results.push({ id: fixture.id, expect: fixture.expect, verdict, pass: verdict === fixture.expect, ms: Date.now() - started, reply: text });
  console.log(`${verdict === fixture.expect ? 'PASS' : 'FAIL'} ${fixture.id}: expect ${fixture.expect}, got ${verdict}`);
}
if (run) {
  writeFileSync(out, JSON.stringify({ ran: new Date().toISOString(), prompt, expects, results }, null, 2));
  console.log(`${results.filter(r => r.pass).length}/${results.length} as expected -> ${out}`);
} else console.log(`dry run: ${Object.keys(images).length} PNGs in ${shots}; add --run (owner GO) to grade`);
