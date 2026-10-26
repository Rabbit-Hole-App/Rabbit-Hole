// The REAL-TOOL proof: every supported path through the real LibreOffice, poppler, FFmpeg and OpenCascade in the converter image, inside the real sandbox,
// on the DEV Fly app (rabbit-hole-convert-dev). Local runs use stub tools (fixtures.test.mjs); this is the only thing that shows what the tools produce.
// A SEPARATE PACKAGE: NOT part of any gate and NOT run by the lane that wrote it. It costs Fly minutes, so it needs a budget reservation made first:
//   node C:/s/spec/budget/budget.mjs reserve <runId> file-convert-real-tools 2        (the integrator's say-so; cap US$100)
//   node packages/file-convert/proof/real-tools.mjs --dry-run                          offline: the matrix, the commands, the cost
//   node packages/file-convert/proof/real-tools.mjs --reserved <runId>                 interactive: starts the dev machine, runs the matrix over `fly ssh`, stops it
//   node C:/s/spec/budget/budget.mjs settle <runId> <actualUsd>                         afterwards, from the Fly bill
// Precondition: the dev app runs an image built from the commit under test, so /app/proof/fixtures holds these fixtures (docs/features/canvas-file-converter.md 7.5).
// Each row runs proof/in-image-convert.sh (the real sandboxed child, no HTTP service) and checks the child's result.json against what the row expects.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const APP = 'rabbit-hole-convert-dev';
export const BUDGET = 'C:/s/spec/budget/budget.json';
export const PHRASE = 'RUN REAL TOOLS PROOF';
const codec = c => r => r.outputs.find(o => o.name === 'playback.m4a')?.meta?.codec === 'aac' && r.outputs.find(o => o.name === 'probe.json') ? null : 'no AAC playback.m4a with probe.json';
const audio = (fixture, why) => ({ converter: 'audio-playback', fixture, names: ['playback.m4a', 'probe.json'], check: codec(), why });
// converter, fixture (a name in proof/fixtures, baked into the image), the outputs a ready child must write, an extra check, and what the row proves.
export const MATRIX = [
  { converter: 'office-pdf', fixture: 'sample.docx', kind: 'docx', names: ['preview.pdf', 'text.json', 'poster.png'], why: 'DOCX -> PDF, page text, poster (LibreOffice + poppler)' },
  { converter: 'office-pdf', fixture: 'sample.doc', kind: 'doc', names: ['preview.pdf', 'text.json', 'poster.png'], why: 'legacy Word -> PDF (not user-reachable today; kept as an engine check)' },
  { converter: 'slides', fixture: 'sample.pptx', kind: 'pptx', names: ['preview.pdf', 'slide-001.png', 'slide-002.png', 'slide-003.png', 'text.json'], why: 'PPTX -> PDF, 3 slide images, notes and hidden slide' },
  { converter: 'slides', fixture: 'deck-40.pptx', kind: 'pptx', count: { prefix: 'slide-', n: 40 }, why: '40 slides: image count and time' },
  audio('tone.mp3', 'MP3 -> AAC'), audio('tone-vorbis.ogg', 'Ogg Vorbis -> AAC'), audio('tone-opus.ogg', 'Ogg Opus -> AAC'), audio('tone-aac.m4a', 'M4A AAC -> AAC'),
  audio('tone.flac', 'FLAC -> AAC'), audio('tone-alac.m4a', 'M4A ALAC -> AAC (a browser cannot play ALAC: the real trigger)'), audio('tone-adpcm.wav', 'IMA ADPCM WAV -> AAC (the other real trigger)'),
  { converter: 'step-glb', fixture: 'cube-in.step', names: ['model.glb', 'structure.json'], why: 'STEP part, inch (OpenCascade)' },
  { converter: 'step-glb', fixture: 'as1-oc-214.stp', names: ['model.glb', 'structure.json'], why: 'STEP assembly, 18 parts' },
  { converter: 'step-glb', fixture: 'cube-ap242.step', names: ['model.glb', 'structure.json'], why: 'AP242 schema id (relabelled AP214)' },
  { converter: 'slides', fixture: 'sample.docx', fail: 'unsupported_format', why: 'a document sent to the slides converter fails cleanly, not with a crash' },
];
export const COMMAND = row => ['ssh', 'console', '-a', APP, '-C', `sh /app/proof/in-image-convert.sh ${row.converter} ${row.fixture}`];

// in-image-convert.sh prints "--- result.json", the JSON, and (when written) "--- text.json" and its JSON.
export function parseChild(stdout) {
  const m = String(stdout).match(/--- result\.json\r?\n([\s\S]*?)(?:\r?\n--- |\s*$)/);
  try { return m ? JSON.parse(m[1]) : null; } catch { return null; }
}
export function judge(row, r) {
  if (!r) return 'no result.json came back (the child did not run)';
  if (row.fail) return r.status === 'failed' && r.error === row.fail ? null : `expected failed ${row.fail}, got ${r.status} ${r.error || ''}`;
  if (r.status !== 'ready') return `status ${r.status}: ${r.error} ${r.detail || ''}`.trim();
  if (r.sandbox?.network !== 'ENETUNREACH' || r.sandbox?.uid === 0) return `the sandbox was not intact (network ${r.sandbox?.network}, uid ${r.sandbox?.uid})`;
  if (row.kind && r.source_kind !== row.kind) return `sniffed as ${r.source_kind}, expected ${row.kind}`;
  const got = r.outputs.map(o => o.name);
  if (row.names && JSON.stringify([...got].sort()) !== JSON.stringify([...row.names].sort())) return `outputs ${got.join(', ')}; expected ${row.names.join(', ')}`;
  if (row.count && got.filter(n => n.startsWith(row.count.prefix)).length !== row.count.n) return `${got.filter(n => n.startsWith(row.count.prefix)).length} ${row.count.prefix}* outputs; expected ${row.count.n}`;
  return row.check ? row.check(r) : null;
}

export async function main(argv, deps) {
  const say = deps.out, dry = argv.includes('--dry-run'), i = argv.indexOf('--reserved'), runId = i >= 0 ? argv[i + 1] : null;
  if (!(dry ? argv.length === 1 : argv.length === 2 && runId)) { say('usage: node real-tools.mjs --dry-run | --reserved <runId>'); return 2; }
  say(`real-tool proof on ${APP}: ${MATRIX.length} rows through the real sandboxed child (LibreOffice, poppler, FFmpeg, OpenCascade)`);
  for (const r of MATRIX) say(`  ${r.converter} ${r.fixture}: ${r.why}`);
  say('cost (estimate): the dev machine (shared-cpu-2x, 4 GB, about US$0.035 an hour) runs about 20 minutes, plus the remote build of the dev image if it must be redeployed first; reserve US$2, settle from the Fly bill.');
  if (dry) { say('dry run: ran nothing, contacted nothing.'); return 0; }
  const entry = (JSON.parse(deps.readBudget()).entries || []).find(e => e.runId === runId);
  if (!entry || entry.status !== 'reserved') return (say(`stopped: ${runId} is not a reserved run in the shared budget (reserve it first).`), 1);
  if (!deps.interactive()) return (say('stopped: needs an interactive terminal.'), 1);
  if ((await deps.ask(`Type ${PHRASE} to start the dev converter and run ${MATRIX.length} rows: `)) !== PHRASE) return (say('stopped: confirmation not given.'), 1);
  const list = deps.fly(['machines', 'list', '-a', APP, '--json']);
  const machine = list.status === 0 ? JSON.parse(list.stdout || '[]')[0] : null;
  if (!machine) return (say('stopped: could not find the dev converter machine.'), 1);
  if (machine.state !== 'started') { const s = deps.fly(['machine', 'start', machine.id, '-a', APP]); if (s.status !== 0) return (say('stopped: could not start the machine.'), 1); await deps.sleep(8000); }
  const fixtures = deps.fly(['ssh', 'console', '-a', APP, '-C', 'ls /app/proof/fixtures']).stdout || '';
  const absent = MATRIX.map(r => r.fixture).filter(f => !fixtures.split(/\s+/).includes(f));
  let failed = 0;
  if (absent.length) say(`stopped: the dev image lacks ${[...new Set(absent)].join(', ')}: deploy the commit under test to ${APP} first (canvas-file-converter.md 7.5).`);
  else {
    for (const row of MATRIX) {
      const t0 = Date.now(), out = deps.fly(COMMAND(row)), why = judge(row, parseChild(out.stdout));
      say(`${why ? 'FAIL' : 'PASS'} ${row.converter} ${row.fixture} (${Math.round((Date.now() - t0) / 1000)} s)${why ? `: ${why}` : ''}`);
      failed += why ? 1 : 0;
    }
    say(`${MATRIX.length - failed} of ${MATRIX.length} rows passed on the real tools. Settle the budget run ${runId} from the Fly bill.`);
  }
  deps.fly(['machine', 'stop', machine.id, '-a', APP]);
  return absent.length || failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main(process.argv.slice(2), {
    out: l => console.log(l), readBudget: () => readFileSync(BUDGET, 'utf8'), interactive: () => !!(process.stdin.isTTY && process.stdout.isTTY),
    ask: async q => { const rl = createInterface({ input: process.stdin, output: process.stdout }); try { return (await rl.question(q)).trim(); } finally { rl.close(); } },
    sleep: ms => new Promise(r => setTimeout(r, ms)),
    fly: args => { const r = spawnSync('flyctl', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); return { status: r.status, stdout: r.stdout || '' }; },
  }));
}
