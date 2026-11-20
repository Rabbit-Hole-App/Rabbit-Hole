#!/usr/bin/env node
// scripts/interact/build-programs.mjs (Brief 46, Build MVP 2): the ten build-schemas of build-mvp1 become Programs through the Program writer (interact-blueprint-build.js programFromBuild); each Program is validated against the card contract, run headless in
// QuickJS at the sampled settings and times, and its frames are tested against the frame rules (interact-build-frames.js). No repair. Writes docs/features/interact/benchmarks/build-mvp2/: programs/<name>.js, checks/<name>.json, table.md.
//   node scripts/interact/build-programs.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkBuilt } from '../../packages/web/src/interact-build-frames.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MVP3 = join(REPO, 'docs/features/interact/benchmarks/blueprint-mvp3'), MVP1 = join(REPO, 'docs/features/interact/benchmarks/build-mvp1'), OUT = join(REPO, 'docs/features/interact/benchmarks/build-mvp2');
const NAMES = ['b41', 'b43'].flatMap(prefix => [1, 2, 3, 4, 5].map(n => `${prefix}-pendulum-${n}`));
const blueprintFile = name => join(MVP3, name.startsWith('b41') ? 'design-brief41' : 'design-brief43', `pendulum-${name.slice(-1)}.json`);
const write = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
const cell = text => String(text ?? '').replace(/\|/g, '\|').replace(/\n/g, ' ');

export async function run(names = NAMES) {
  const rows = [];
  for (const name of names) {
    const blueprint = JSON.parse(readFileSync(blueprintFile(name), 'utf8')), buildSchema = JSON.parse(readFileSync(join(MVP1, 'build-schemas', `${name}.json`), 'utf8'));
    const result = await checkBuilt({ blueprint, buildSchema });
    if (result.source) write(join(OUT, 'programs', `${name}.js`), `${result.source}\n`);
    const { source, ...saved } = result; write(join(OUT, 'checks', `${name}.json`), `${JSON.stringify({ name, ...saved }, null, 2)}\n`);
    const frames = result.frames.list, passed = frames.filter(entry => entry.ok).length;
    rows.push({ name, layout: buildSchema.layout, arrangement: buildSchema.texts.arrangement, written: result.written, bytes: result.bytes ?? null, validate: result.validate, frames: result.frames, framesPassed: passed, framesTotal: frames.length, dropped: result.dropped, error: result.error ?? null });
    console.log(`${name}: ${result.written ? `written ${result.bytes} B, validate ${result.validate.ok ? 'pass' : 'FAIL'}, frames ${passed}/${frames.length}, dropped ${result.dropped.labels} labels ${result.dropped.arrows} arrows` : `NOT WRITTEN: ${result.error}`}`);
  }
  return rows;
}
export function table(rows) {
  const lines = rows.map(row => `| ${row.name} | ${row.layout} / ${row.arrangement} | ${row.written ? (row.validate.ok ? 'pass' : `FAIL: ${cell(row.validate.problems[0])}`) : `not written: ${cell(row.error)}`} | ${row.written ? (row.frames.ok ? `pass (${row.framesPassed}/${row.framesTotal})` : `${row.framesPassed}/${row.framesTotal}; first: ${cell(row.frames.firstSentence)}`) : '-'} | ${row.written ? `${row.dropped.labels} labels, ${row.dropped.arrows} arrows` : '-'} | ${row.bytes ?? '-'} |`);
  write(join(OUT, 'table.md'), [
    '# Build MVP 2: the ten build-schemas as Programs (brief 46)', '',
    'Made by `scripts/interact/build-programs.mjs`. Each build-schema of `build-mvp1/build-schemas/` is turned into a Program by the Program writer (`programFromBuild` in `interact-blueprint-build.js`: every placement decision is the build-schema\'s; the writer keeps one rule, for motion decoration: a label that would land on a part in a frame, an arrow shorter than its dot\'s radius and an arrowhead that would land on a dot are left out of that frame). Validate: the Program against the card contract (size, object count, each frame parsed and normalised by the host\'s own parser). Frames: the Program run headless in QuickJS at 3 settings (the defaults and the two ends) x 3 times (0, half, end), 9 frames, tested against `frame-overlap.js` (the overlap and the layout rules); the first frame that fails gives its sentence. Dropped: the labels and arrows left out of a frame, summed over the 9 frames. No repair. The Programs are in `programs/`, the per-frame results in `checks/`.', '',
    '| Build-schema | Layout / arrangement | Validate | Frames: pass, or the first frame sentence | Dropped in frames | Program bytes |', '|---|---|---|---|---|---|', ...lines, '',
    `Validate passed: ${rows.filter(row => row.written && row.validate.ok).length} of ${rows.length}. All frames passed: ${rows.filter(row => row.frames.ok).length} of ${rows.length}.`, '',
  ].join('\n'));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { const rows = await run(); table(rows); }
