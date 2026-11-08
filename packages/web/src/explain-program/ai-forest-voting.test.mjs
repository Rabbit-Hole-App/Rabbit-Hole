import test from 'node:test';
import assert from 'node:assert/strict';
import { forestVotingFixture } from './ai-forest-voting-fixture.js';
import { parseGuestResult, resolveInputs, sealProgram } from './contract.js';
import { normalizeFrame } from './frame.js';
import { textOverlaps } from './frame-overlap.js';
import { LIMITS } from './limits.js';
import { loadEngine, runProgram } from './runtime.js';

test('each threshold changes one highlighted tree vote, and the forest changes its prediction only at 5', async () => {
  const { manifest: fixtureManifest, source: fixtureSource, stamps } = forestVotingFixture;
  const sealed = await sealProgram({ manifest: fixtureManifest, source: fixtureSource }, stamps);
  assert.equal(sealed.ok, true, sealed.issue);
  const artifact = sealed.value;
  const { manifest, sdkVersion, source } = artifact;
  assert.equal(sdkVersion, 'sdk-2');
  assert.deepEqual(resolveInputs(manifest), { x: 2 });
  assert.equal(manifest.inputs.length, 1);
  const engine = await loadEngine();
  const cases = [
    ['AAA', 3, 0, 'A'], ['AAA', 3, 0, 'A'], ['AAA', 3, 0, 'A'],
    ['BAA', 2, 1, 'A'], ['BAA', 2, 1, 'A'],
    ['BBA', 1, 2, 'B'], ['BBA', 1, 2, 'B'],
    ['BBB', 0, 3, 'B'], ['BBB', 0, 3, 'B'], ['BBB', 0, 3, 'B'], ['BBB', 0, 3, 'B'],
  ];

  for (const [x, [votes, a, b, majority]] of cases.entries()) {
    const inputs = resolveInputs(manifest, { x });
    assert.deepEqual(inputs, { x });
    const request = { requestId: `forest-${x}`, inputs, time: 0, seed: 1, state: null };
    // Match the other fixture tests: check rendered behavior, independent of CPU contention in the unit suite.
    const reply = runProgram(engine, { source, sdkVersion, request }, { ...LIMITS, interruptMs: 5000 });
    assert.equal(reply.ok, true, reply.detail);
    const parsed = parseGuestResult(reply.value, manifest);
    assert.equal(parsed.ok, true, parsed.issue);
    const { frame } = parsed.value;
    const normalized = normalizeFrame(frame, manifest);
    assert.equal(normalized.ok, true, normalized.issue);
    assert.deepEqual(textOverlaps(frame), [], `x=${x} should keep branch labels readable`);

    const highlighted = kind => frame.objects.filter(object => object.kind === kind && object.role === 'learner');
    assert.deepEqual(highlighted('arrow').map(arrow => arrow.id), Array.from(votes, (vote, i) => `tree-${i + 1}.e.split:${vote.toLowerCase()}.a`), `x=${x} paths`);
    const leaves = highlighted('box').filter(box => /^tree-\d+\.node\.[ab]$/.test(box.id));
    assert.deepEqual(leaves.map(leaf => leaf.text), Array.from(votes, vote => `Vote ${vote}`), `x=${x} votes`);
    assert.equal(frame.objects.find(object => object.id === 'tally')?.text, `Votes · A: ${a} · B: ${b}`);
    assert.equal(frame.objects.find(object => object.id === 'majority')?.text, `Majority: ${majority}`);
  }
});
