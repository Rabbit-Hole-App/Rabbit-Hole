// ONE COMMAND for a 480p draft: take (device scale 1, screencast) -> beat checklist (assert.mjs) -> render 480p -> dead-scene check of the OUTPUT -> contact sheet. A draft that fails the checklist
// or the dead-scene check is never written (the mp4 is deleted and the failure printed), so it never reaches the owner.
// Usage (from packages/web, with `vite preview --outDir dist-dev --port 5480` running and FILM_FFMPEG / FILM_SHARP_FROM set, see tools.mjs):
//   node scripts/film/draft.mjs <film.config.json> [--out <dir>]        FILM_DATA = the folder of the per-video data (bank, markdown); default: the config's folder
//   node scripts/film/draft.mjs <film.config.json> --dry                validates the config only (no browser, no ffmpeg)
// Prints: the mp4, its render record, the 1 fps contact sheet, the take's requests.log. No CI, no gate, no tests: a film is footage, not a release.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkConfig } from './verbs.mjs';
import { evaluate } from './assert.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), flag = name => args.includes(name), after = name => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const CONFIG = args.find(a => !a.startsWith('--') && a !== after('--out'));
if (!CONFIG) { console.error('usage: node draft.mjs <film.config.json> [--out <dir>] [--dry]'); process.exit(2); }
const cfg = JSON.parse(readFileSync(CONFIG, 'utf8'));
const DATA = process.env.FILM_DATA || dirname(resolve(CONFIG));
const { errors, warnings } = checkConfig(cfg, DATA);
for (const w of warnings) console.error(`WARN ${w}`);
if (errors.length) { for (const e of errors) console.error(`CONFIG ${e}`); process.exit(2); }
if (flag('--dry')) { console.log(`config ok (${cfg.beats.length} beats): the draft would write to ${after('--out') || join(DATA, 'drafts')}`); process.exit(0); }

const OUT = resolve(after('--out') || join(DATA, 'drafts'));
mkdirSync(OUT, { recursive: true });
const n = readdirSync(OUT).filter(f => new RegExp(`^${cfg.name}-DRAFT\\d+-480p\\.mp4$`).test(f)).length + 1;
const take = join(OUT, `${cfg.name}-take-d${n}`), prefix = join(OUT, `${cfg.name}-DRAFT${n}-480p`), mp4 = `${prefix}.mp4`;
const run = (script, scriptArgs, env = {}) => spawnSync(process.execPath, [join(HERE, script), ...scriptArgs], { stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8', env: { ...process.env, FILM_DATA: DATA, ...env } });
const show = r => { if (r.stdout) process.stdout.write(r.stdout); };

// 1. the take, at device scale 1 (the draft is 480p; the 1080p/4K come from the approved take later)
let r = run('capture.mjs', [resolve(CONFIG), take], { DSF: '1', SCREENCAST: '1' }); show(r);
if (r.status !== 0) { console.error(`DRAFT REFUSED: the take failed (exit ${r.status}); see ${join(take, 'requests.log')}`); process.exit(3); }
// 2. the beat checklist, from the take itself
const rows = evaluate(take);
for (const row of rows) console.log(`${row.ok ? 'PASS' : 'FAIL'}  ${row.name}: ${row.why}`);
if (rows.some(row => !row.ok)) { console.error(`DRAFT REFUSED: the beat checklist failed: ${rows.filter(row => !row.ok).map(row => row.name).join(', ')}`); process.exit(4); }
// 3. render 480p (veryfast: the approval loop wants speed)
const ramp = cfg.ramp || {};
r = run('render.mjs', [take, prefix], { FAST: String(ramp.fast ?? 1.4), TRIM: String(ramp.trim ?? 0), REV: String(ramp.rev ?? 2.2), DEAD: String(ramp.dead ?? 3), PRESET: 'veryfast', CRF: '24', SIZE: '854:480' }); show(r);
if (r.status !== 0 || !existsSync(mp4)) { console.error(`DRAFT REFUSED: the render failed (exit ${r.status})`); process.exit(5); }
// 4. the OUTPUT must have no still stretch longer than stillMax (the intended read holds are <= 2.5 s)
r = run('deadcheck.mjs', [mp4, '0.8']); show(r);
const longest = /longest still stretch: ([\d.]+) s/.exec(r.stdout || '');
const stillMax = cfg.checklist?.stillMax ?? 2.6;
if (longest && Number(longest[1]) > stillMax) { rmSync(mp4, { force: true }); console.error(`DRAFT REFUSED: the output has a still stretch of ${longest[1]} s (> ${stillMax} s): a dead scene`); process.exit(6); }
// 5. the contact sheet, one frame per second
const sheet = `${prefix}-sheet.png`;
r = run('sheet.mjs', [mp4, sheet, '8']); show(r);
console.log(`DRAFT READY\n  video: ${mp4}\n  render record: ${prefix}.render.json\n  contact sheet: ${sheet}\n  take: ${take} (requests.log, marks.json, checks.json)`);
