import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validatePrompts } from '../schemas.mjs';
import { runPipeline } from '../run.mjs';
import { loadState } from '../state.mjs';
import { makeSet } from '../sets.mjs';
import { evaluateCoverage, selectAtDepth } from '../coverage.mjs';
import { run as coverageStage } from '../stages/02-coverage.mjs';

export const promptFixture = () => ({
  topic: 'logistic-regression',
  toyData: { rows: [[0, 0], [1, 1]], features: ['x'], label: 'y', usedBy: [1] },
  prompts: Array.from({ length: 12 }, (_, i) => ({ id: i + 1,
    prompt: `how does example ${i + 1} work?`, kind: i < 6 ? 'coordinate-plot' : i < 9 ? 'matrix' : 'tree',
    content: 'show the teaching point', keywords: ['training loss', 'loss curve'], data: 'toy-exact', why: 'one teaching point', origin: 'lesson', lesson: '03' })),
});

test('prompt schema enforces count, unique ids and wording, kind mix and keywords', () => {
  const valid = promptFixture();
  assert.doesNotThrow(() => validatePrompts(valid));
  for (const mutate of [p => p.prompts.pop(), p => p.prompts[1].id = 1,
    p => p.prompts[1].prompt = p.prompts[0].prompt, p => p.prompts[0].prompt = 'Why?',
    p => p.prompts[0].kind = 'invented', p => p.prompts[0].keywords = ['four words in keyword'],
    p => p.prompts[0].kind = 'tree', p => delete p.prompts[0].origin,
    p => delete p.prompts[0].lesson, p => p.topic = '03']) {
    const bad = structuredClone(valid); mutate(bad);
    assert.throws(() => validatePrompts(bad));
  }
});

test('resume skips completed stages and an explicit rerun archives later artefacts', async () => {
  const topicDir = await mkdtemp(join(tmpdir(), 'topic-resume-'));
  const calls = [];
  const stages = Object.fromEntries(['01', '02', '03'].map(id => [id, async ctx => {
    calls.push(id); const path = join(ctx.topicDir, `${id}.json`);
    await writeFile(path, JSON.stringify({ id })); return { status: 'ok', artefacts: [path], notes: '' };
  }]));
  await runPipeline({ topic: 'logistic-regression', topicDir, stages, to: '02' });
  await runPipeline({ topic: 'logistic-regression', topicDir, stages, to: '03' });
  assert.deepEqual(calls, ['01', '02', '03']);
  await runPipeline({ topic: 'logistic-regression', topicDir, stages, from: '02', to: '02' });
  assert.equal((await loadState(topicDir, 'logistic-regression')).stages['03'], undefined);
  const histories = await readdir(join(topicDir, 'history'));
  assert.equal(histories.length, 1);
  assert.equal(JSON.parse(await readFile(join(topicDir, 'history', histories[0], '03.json'))).id, '03');
});

test('STOP-1 through STOP-4 halt and only READY plus --go enters release', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('webhook unavailable'); });
  for (const [stage, stop, from] of [['01', 'STOP-1', '01'], ['04', 'STOP-2', '04'], ['06', 'STOP-3', '06'], ['07', 'STOP-3', '07'], ['08', 'STOP-4', '08']]) {
    const topicDir = await mkdtemp(join(tmpdir(), 'topic-stop-'));
    let released = false;
    const stages = { [stage]: async () => ({ status: stage === '01' ? 'ok' : 'stop', stop, artefacts: [], notes: 'review' }),
      '09': async () => { released = true; return { status: 'ok', artefacts: [], notes: '' }; } };
    const result = await runPipeline({ topic: 'logistic-regression', topicDir, stages, from, approvePrompts: true,
      ...(stage === '08' ? { config: { notify: { webhookUrl: 'https://configured.invalid' } } } : {}) });
    assert.equal(result.stop, stop); assert.equal(released, false);
    if (stage === '08') {
      assert.equal((await loadState(topicDir, 'logistic-regression')).stages['08'].stop, 'STOP-4');
      await runPipeline({ topic: 'logistic-regression', topicDir, stages, go: true }); assert.equal(released, true);
    } else await assert.rejects(runPipeline({ topic: 'logistic-regression', topicDir, stages, go: true }), /STOP-4|READY/);
  }
});

test('set generation uses intended reference, diagram kind and standard depth', () => {
  const set = makeSet({ topic: 'logistic-regression', estUsdPerCard: 0.012, prompts: [{ id: 1, prompt: 'why?', kind: 'tree', referenceId: 'ml-dry-trees-a' }] });
  assert.equal(set.prompts[0].prompt, 'why?');
  assert.equal(set.prompts[0].referenceId, 'ml-dry-trees-a');
  assert.equal(set.prompts[0].referenceKind, 'tree');
  assert.deepEqual(set.prompts[0].askDepths, ['standard']);
  assert.deepEqual(set.defaultDepths, ['standard']);
  assert.throws(() => makeSet({ topic: 'logistic-regression', estUsdPerCard: 0.012, prompts: [{ id: 1, prompt: 'why?', kind: 'tree' }] }), /reference/);
});

test('coverage reuses only one identical worked kind at all three depths and affirmative judge', async () => {
  const prompts = [{ id: 1, prompt: 'how does it work?', kind: 'tree', content: 'point' }];
  const hit = id => ({ references: [{ id, spec: { diagram: { kind: 'tree', title: 'test' } }, useWhen: 'point' }] });
  let plans = 0;
  const options = { planner: async () => { plans++; return { kind: 'tree' }; },
    select: async () => hit('worked'), judge: async () => true };
  assert.equal((await evaluateCoverage(prompts, options))[0].decision, 'REUSE');
  assert.equal(plans, 3);
  assert.equal((await evaluateCoverage(prompts, { ...options, judge: async () => false }))[0].decision, 'NEW');
  assert.equal((await evaluateCoverage(prompts, { ...options, select: async ({ depth }) => hit(depth) }))[0].decision, 'NEW');
  assert.equal((await evaluateCoverage(prompts, { ...options, select: async () => hit('shape-tree') }))[0].decision, 'NEW');
});

test('coverage passes planner kinds and masks shipped Lesson04 before scoring', async t => {
  const planner = async () => ({ planner: 'jev', kind: 'coordinate-plot', visuals: [{ type: 'diagram', kind: 'coordinate-plot' }] });
  const visible = await selectAtDepth({ prompt: 'how does a decision tree search for the best threshold on one feature?', depth: 'standard', planner });
  assert.deepEqual(visible.plannedKinds, ['coordinate-plot']);
  assert.ok(visible.references.some(ref => ref.id.startsWith('ml-trees-')));
  const masked = await selectAtDepth({ prompt: 'how does a decision tree search for the best threshold on one feature?', depth: 'standard', planner, fixture: true });
  assert.ok(masked.references.every(ref => !ref.id.startsWith('ml-trees-')));
  const topicDir = await mkdtemp(join(tmpdir(), 'coverage-fixture-'));
  t.after(() => rm(topicDir, { recursive: true, force: true }));
  const fixtureDir = join(topicDir, 'fixture');
  await mkdir(fixtureDir);
  await writeFile(join(topicDir, 'prompts.json'), JSON.stringify({ prompts: [{ id: 1, prompt: 'how does a decision tree search for the best threshold on one feature?', kind: 'coordinate-plot' }] }));
  await writeFile(join(fixtureDir, 'coverage-judge.json'), JSON.stringify({ topic: 'fixture', answers: { '01': false } }));
  const result = await coverageStage({ topic: 'fixture', topicDir, fixtureDir, fixture: true, config: {}, planner });
  assert.equal(result.status, 'ok');
  assert.equal(JSON.parse(await readFile(join(topicDir, 'coverage.json'))).prompts[0].decision, 'NEW');
});

test('a repeated author file path keeps its last entry and is reported', async () => {
  const { dedupeAuthorFiles } = await import('../schemas.mjs');
  const value = { files: [{ path: 'a.md', content: 'old' }, { path: 'b.md', content: 'b' }, { path: 'a.md', content: 'new' }] };
  assert.deepEqual(dedupeAuthorFiles(value), ['a.md']);
  assert.deepEqual(value.files, [{ path: 'b.md', content: 'b' }, { path: 'a.md', content: 'new' }]);
  assert.deepEqual(dedupeAuthorFiles(value), []);
});

test('a configured Windows command that starts with a quoted path runs through cmd unchanged', { skip: process.platform !== 'win32' }, async () => {
  const { configuredCommand } = await import('../stages/operator.mjs');
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'cmd-'));
  try {
    const ctx = { topicDir: dir, config: { repo: { root: dir } } };
    const quoted = await configuredCommand(ctx, '99', 'quoted-start', `"${process.execPath}" -e "console.log('started')"`, dir);
    assert.equal(quoted.code, 0);
    assert.equal(quoted.stdout.trim(), 'started');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('--from 03 keeps the author folder (resume) unless --author-fresh archives it', async () => {
  for (const fresh of [false, true]) {
    const topicDir = await mkdtemp(join(tmpdir(), 'topic-resume-'));
    await mkdir(join(topicDir, 'author', 'round-1'), { recursive: true });
    await writeFile(join(topicDir, 'author', 'manifest.json'), JSON.stringify({ roundsUsed: 1, lastFailure: 'flags' }));
    await writeFile(join(topicDir, 'author.json'), '{}');
    await writeFile(join(topicDir, 'state.json'), JSON.stringify({ version: 1, topic: 'resume-topic', stages: { '03': { status: 'fail', attempts: 1, artefacts: [join(topicDir, 'author'), join(topicDir, 'author.json')] } }, calls: [], spendUsd: 0, status: 'fail' }));
    let seen;
    await runPipeline({ topic: 'resume-topic', topicDir, config: { run: { authorFresh: fresh } }, stages: { '03': async () => { seen = JSON.parse(await readFile(join(topicDir, 'author', 'manifest.json'), 'utf8').catch(() => 'null')); return { status: 'ok', artefacts: [] }; } }, from: '03', to: '03' });
    assert.equal(seen?.roundsUsed ?? null, fresh ? null : 1, fresh ? 'author-fresh: the folder was archived' : 'resume: the last round is still there');
    await rm(topicDir, { recursive: true, force: true });
  }
});

test('a resumed author attempt takes its feedback from the newest round that failed on the answer, not on the transport', async () => {
  const { lastContentFailure } = await import('../stages/03-author.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'topic-lastfail-'));
  for (const [round, text] of [[1, '[{"id":"ml-a","rule":5}]'], [2, 'Provider transport failed; reconcile unknown usage before retrying'], [3, '']]) {
    await mkdir(join(dir, `round-${round}`), { recursive: true });
    if (text) await writeFile(join(dir, `round-${round}`, 'feedback.txt'), `${text}\n`);
  }
  assert.equal(await lastContentFailure(dir), '[{"id":"ml-a","rule":5}]');
  assert.equal(await lastContentFailure(join(dir, 'missing')), null);
  await rm(dir, { recursive: true, force: true });
});

test('a rename that fails with EPERM while a reader holds the file is retried, any other error is not', async () => {
  const { renameRetrying } = await import('../state.mjs');
  let calls = 0;
  await renameRetrying('a', 'b', async () => { if (++calls < 3) throw Object.assign(new Error('locked'), { code: 'EPERM' }); });
  assert.equal(calls, 3);
  let other = 0;
  await assert.rejects(renameRetrying('a', 'b', async () => { other++; throw Object.assign(new Error('missing'), { code: 'ENOENT' }); }), /missing/u);
  assert.equal(other, 1);
  let always = 0;
  await assert.rejects(renameRetrying('a', 'b', async () => { always++; throw Object.assign(new Error('locked'), { code: 'EPERM' }); }, 3), /locked/u);
  assert.equal(always, 3);
});
