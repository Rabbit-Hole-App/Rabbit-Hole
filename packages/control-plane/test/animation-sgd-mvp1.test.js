// aj_086fd46 (2026-11-02, dev preview at 51b6560cf): an SGD experiment failed after one repair with 10 serious findings. The causes,
// proven offline in C:/s/spec/animation/sgd-mvp1-evidence/ROOT-CAUSE.md, as general checks on the saved job (fixture) and a non-SGD case:
// the plan's readouts against the author's readout cap, the shared size rules, and what review 1 forwarded to the repair. These checks
// prove the requests and rules only: whether a new paid build passes its review is not established here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ANIMATION_AUTHOR_SYSTEM, ANIMATION_REPAIR_SYSTEM } from '../src/agents/animation-author.js';
import { REPAIR_FORWARD, repairContent } from '../src/animation-repair.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/animation-aj_086fd46.json', import.meta.url), 'utf8'));
const jobOf = draft => ({ prompt: fixture.prompt, plan: fixture.plan, planHash: fixture.planHash, resultId: fixture.resultId, draft, evidence: [] });
const sentOf = (findings, draft = fixture.authorDraft) => JSON.parse(repairContent(jobOf(draft), { findings }, draft)[0].text);
const reaches = (sent, findings) => findings.filter(f => !sent.findings.some(s => s.message.includes(f.message)));

test('review 1 reaches the repair whole: findings on one object are one entry, within the same count and text budget', () => {
  const findings = fixture.findings[0].findings, sent = sentOf(findings);
  assert.equal(findings.length, 12);
  assert.deepEqual(reaches(sent, findings).map(f => f.message.slice(0, 40)), [], 'every finding of review 1 reaches the repair');
  assert.equal(sent.omitted, undefined);
  assert.ok(sent.findings.some(s => /passes through the data/.test(s.message)), 'the disclosed missing readout, which review 2 raised six times as major');
  assert.ok(sent.findings.length <= REPAIR_FORWARD.findings);
  assert.ok(sent.findings.reduce((n, s) => n + s.message.length, 0) <= REPAIR_FORWARD.findings * REPAIR_FORWARD.text);
  assert.deepEqual(sent.findings.find(s => s.target.object === 'stepArrow').target.captures, ['v0-s0', 'v0-s1', 'v1-s1']);
});

test('a non-SGD review keeps every object too, and the budget still bounds a flood of findings', () => {
  const f = (object, capture, message, severity = 'major') => ({ category: 'spec', severity, target: { capture, object }, message });
  const pendulum = [
    ...['v0-s0', 'v0-s1', 'v0-s2'].map((c, i) => f('bob', c, `The bob is too small to see at state ${i}.`)),
    ...['v0-s0', 'v0-s1', 'v0-s2'].map((c, i) => f('string', c, `The string is a hairline at state ${i}.`)),
    ...['v0-s0', 'v0-s1', 'v0-s2'].map((c, i) => f('periodLabel', c, `The period label covers the pivot at state ${i}.`)),
    f('readouts', 'v0-s0', 'The plan promises an amplitude readout; the assumptions say it was left out.', 'minor'),
  ];
  const sent = sentOf(pendulum);
  assert.deepEqual(reaches(sent, pendulum), []);
  assert.deepEqual([sent.findings.length, sent.omitted], [4, undefined]);
  const flood = Array.from({ length: 20 }, (_, i) => f(i < 10 ? 'one' : `o${i}`, 'v0-s0', `${i} ${'x'.repeat(400)}`));
  const capped = sentOf(flood); // 11 objects: 8 entries, each at least its first REPAIR_FORWARD.text characters, the rest counted
  assert.deepEqual([capped.findings.length, capped.omitted], [REPAIR_FORWARD.findings, 3]);
  assert.ok(capped.findings.every(s => s.message.length >= REPAIR_FORWARD.text));
  assert.ok(capped.findings.reduce((n, s) => n + s.message.length, 0) <= REPAIR_FORWARD.findings * REPAIR_FORWARD.text);
});

test('the approved plan\'s readouts bind the author and the repair (the plan listed four; a three-readout rule made the draft drop one)', () => {
  assert.match(fixture.plan.assumptions[5], /^Readouts: step number \(out of 40\), passes through the data .*, full-data loss, and distance from the lowest point\.$/);
  assert.ok(fixture.authorDraft.assumptions.some(a => /left out to keep three readouts/.test(a)), 'the author dropped the fourth by rule and said so');
  assert.equal(fixture.repairedDraft.assumptions.some(a => /passes through the data/i.test(a)), false, 'the repair, never told, dropped the disclosure');
  for (const system of [ANIMATION_AUTHOR_SYSTEM, ANIMATION_REPAIR_SYSTEM]) {
    assert.match(system, /Readouts: every readout the approved plan lists/);
    assert.equal(system.includes('then at most two that support it;'), false);
  }
});

test('shared size rules: an arrow keeps its magnitudes, a curved surface is a tube wireframe, a drawn value matches its readout', () => {
  // The saved programs: arrows floored at 0.3 (author) and 0.5 (repair), positions clamped to |b| <= 2 while the distance readout is not.
  assert.match(fixture.authorDraft.program.source, /Math\.max\(m,0\.3\)/);
  assert.match(fixture.repairedDraft.program.source, /scale:\[3,Math\.max\(m,0\.5\),3\]/);
  assert.match(fixture.repairedDraft.program.source, /b=cl\(s\.b,2\)/);
  for (const system of [ANIMATION_AUTHOR_SYSTEM, ANIMATION_REPAIR_SYSTEM]) {
    assert.equal(system.includes('a magnitude arrow at least 8%'), false, 'no minimum length');
    assert.match(system, /one constant scale factor/);
    assert.match(system, /never a minimum or maximum length/);
    assert.equal(system.includes('stacked, translucent filled discs'), false);
    assert.match(system, /curves with a radius/);
    assert.match(system, /never clamp a drawn position or length/);
  }
  // General: the changed rules name no subject.
  const rules = ANIMATION_AUTHOR_SYSTEM.slice(ANIMATION_AUTHOR_SYSTEM.indexOf('Sizes:'), ANIMATION_AUTHOR_SYSTEM.indexOf('The finished artifact'));
  assert.doesNotMatch(rules, /gradient|learning rate|bowl|loss|SGD|batch/i);
});
