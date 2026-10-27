// The real-tool proof package (proof/real-tools.mjs), without Fly: its matrix, its judging of a child's result.json, its budget and confirmation guards.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONVERTERS } from './contract.mjs';
import { MATRIX, PHRASE, judge, main, parseChild } from './proof/real-tools.mjs';

const FIX = join(fileURLToPath(new URL('.', import.meta.url)), 'proof', 'fixtures');
const good = row => ({ status: 'ready', source_kind: row.kind, sandbox: { network: 'ENETUNREACH', uid: 10030 },
  outputs: (row.names || Array.from({ length: row.count.n }, (_, i) => `slide-${String(i + 1).padStart(3, '0')}.png`).concat(['preview.pdf', 'text.json'])).map(name => ({ name, meta: { codec: 'aac' } })) });
const printed = r => `--- result.json\n${JSON.stringify(r)}\n`;

test('every row names a real converter and a fixture that is in the repository (so the image has it)', () => {
  for (const r of MATRIX) { assert.ok(r.converter in CONVERTERS, r.converter); assert.ok(existsSync(join(FIX, r.fixture)), r.fixture); assert.match(r.fixture, /^[A-Za-z0-9._-]+$/, 'in-image-convert.sh refuses other names'); }
});

test('the child output parses, and judging is strict about status, sandbox, sniffed kind and outputs', () => {
  assert.deepEqual(parseChild(`--- result.json\n{"status":"ready"}\n--- text.json\n{}\n`), { status: 'ready' });
  assert.equal(parseChild('garbage'), null);
  for (const row of MATRIX.filter(r => !r.fail)) assert.equal(judge(row, good(row)), null, row.fixture);
  const row = MATRIX[0];
  assert.match(judge(row, null), /did not run/);
  assert.match(judge(row, { ...good(row), status: 'failed', error: 'timeout' }), /status failed: timeout/);
  assert.match(judge(row, { ...good(row), sandbox: { network: 'reachable', uid: 10030 } }), /sandbox was not intact/);
  assert.match(judge(row, { ...good(row), sandbox: { network: 'ENETUNREACH', uid: 0 } }), /sandbox was not intact/);
  assert.match(judge(row, { ...good(row), source_kind: 'rtf' }), /sniffed as rtf/);
  assert.match(judge(row, { ...good(row), outputs: good(row).outputs.slice(1) }), /outputs .*expected/);
  const deck = MATRIX.find(r => r.count);
  assert.match(judge(deck, { ...good(deck), outputs: good(deck).outputs.slice(0, 20) }), /outputs; expected 40/);
  const wrong = MATRIX.find(r => r.fail);
  assert.equal(judge(wrong, { status: 'failed', error: 'unsupported_format' }), null);
  assert.match(judge(wrong, { status: 'ready' }), /expected failed/);
});

const world = (over = {}) => {
  const w = { lines: [], calls: [], answers: [PHRASE], machine: 'stopped', fixtures: [...new Set(MATRIX.map(r => r.fixture))].join('\n') };
  w.deps = { out: l => w.lines.push(l), interactive: () => true, ask: async () => w.answers.shift() ?? '', sleep: async () => {}, readBudget: () => JSON.stringify({ entries: [{ runId: 'r1', status: 'reserved' }] }),
    fly: args => {
      w.calls.push(args.join(' '));
      if (args[0] === 'machines') return { status: 0, stdout: JSON.stringify([{ id: 'm1', state: w.machine }]) };
      if (args[0] === 'ssh' && args[5] === 'ls /app/proof/fixtures') return { status: 0, stdout: w.fixtures };
      if (args[0] === 'ssh') { const [, conv, fixture] = args[5].match(/in-image-convert\.sh (\S+) (\S+)/); const row = MATRIX.find(r => r.converter === conv && r.fixture === fixture); return { status: 0, stdout: printed(row.fail ? { status: 'failed', error: row.fail } : good(row)) }; }
      return { status: 0, stdout: '' };
    }, ...over };
  w.text = () => w.lines.join('\n');
  return w;
};

test('a dry run lists the matrix and the cost and runs nothing', async () => {
  const w = world({ fly: () => { throw new Error('ran'); }, readBudget: () => { throw new Error('read'); } });
  assert.equal(await main(['--dry-run'], w.deps), 0);
  assert.match(w.text(), /reserve US\$2/);
  assert.equal(w.lines.filter(l => l.startsWith('  ')).length, MATRIX.length);
  for (const argv of [[], ['--reserved'], ['--dry-run', 'x'], ['--yes']]) assert.equal(await main(argv, world().deps), 2, argv.join(' '));
});

test('a run needs a reserved budget entry, a terminal and the typed phrase; it starts the machine, runs every row and stops it', async () => {
  let w = world({ readBudget: () => JSON.stringify({ entries: [] }) });
  assert.equal(await main(['--reserved', 'r1'], w.deps), 1); assert.equal(w.calls.length, 0);
  w = world({ readBudget: () => JSON.stringify({ entries: [{ runId: 'r1', status: 'settled' }] }) });
  assert.equal(await main(['--reserved', 'r1'], w.deps), 1); assert.equal(w.calls.length, 0);
  w = world({ interactive: () => false }); assert.equal(await main(['--reserved', 'r1'], w.deps), 1); assert.equal(w.calls.length, 0);
  w = world(); w.answers = ['yes']; assert.equal(await main(['--reserved', 'r1'], w.deps), 1); assert.equal(w.calls.length, 0);
  w = world();
  assert.equal(await main(['--reserved', 'r1'], w.deps), 0, w.text());
  assert.match(w.text(), new RegExp(`${MATRIX.length} of ${MATRIX.length} rows passed on the real tools`));
  assert.ok(w.calls.some(c => c.startsWith('machine start m1')));
  assert.equal(w.calls.at(-1), 'machine stop m1 -a rabbit-hole-convert-dev', 'the machine is stopped at the end');
  assert.equal(w.calls.filter(c => c.includes('in-image-convert.sh')).length, MATRIX.length);
});

test('a stale dev image (missing fixtures) stops before any row; a failing row fails the run and is named', async () => {
  let w = world(); w.fixtures = 'sample.docx'; assert.equal(await main(['--reserved', 'r1'], w.deps), 1);
  assert.match(w.text(), /the dev image lacks .*tone\.mp3.*deploy the commit under test/);
  assert.equal(w.calls.filter(c => c.includes('in-image-convert.sh')).length, 0);
  assert.equal(w.calls.at(-1), 'machine stop m1 -a rabbit-hole-convert-dev');
  w = world(); const real = w.deps.fly;
  w.deps.fly = a => (a[5]?.includes('audio-playback tone.flac') ? { status: 0, stdout: printed({ status: 'failed', error: 'invalid_source', detail: 'ffmpeg could not convert' }) } : real(a));
  assert.equal(await main(['--reserved', 'r1'], w.deps), 1);
  assert.match(w.text(), /FAIL audio-playback tone\.flac .*invalid_source/);
  assert.match(w.text(), new RegExp(`${MATRIX.length - 1} of ${MATRIX.length} rows passed`));
});
