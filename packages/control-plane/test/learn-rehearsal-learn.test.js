import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Intake v2 (owner 2026-11-15): a stored catalogue document without `learn` is sent back to the controller under its own key and replaced by what comes back.
// These pin the wiring in learn-rehearsal.js (the Durable Object and R2 are not constructible in a unit test here); the runtime side is tested in packages/rehearsal-runtime/test_catalogue_learn.py.
const source = readFileSync(new URL('../src/learn-rehearsal.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const schema = JSON.parse(readFileSync(new URL('../../rehearsal-runtime/schemas/learn-rehearsal-get.json', import.meta.url), 'utf8'));

test('the additive learn job has its own key, carries the stored document, and the result replaces the stored one', () => {
  assert.match(source, /const LEARN_SLOT = 'catalogue-learn';/);
  assert.match(source, /rehearsalKey\(repo\.id, repo\.commit, LEARN_SLOT\)/, 'a new key: the controller answers a key it already holds as done');
  assert.match(source, /kind: CATALOGUE, learn: true, key,/);
  assert.match(source, /\.\.\.\(request\.learn \? \{ learn: true \} : \{\}\)/);
  assert.match(source, /catalogue && job\.learn \? await storedCatalogue\(this\.env, \{ id: job\.appId, commit: job\.commit \}\) : null/);
  assert.match(source, /\.\.\.\(stored \? \{ catalogue: stored \} : \{\}\)/);
  // the one existing branch validates the returned document and overwrites the catalogue key
  assert.match(source, /REPOSITORY_SNAPSHOTS\.put\(catalogueKey\(job\.appId, job\.commit\), text/);
  assert.doesNotMatch(source, /CATALOGUE_VERSION = 'catalogue-[2-9]'/, 'no version bump: stored routes are kept');
});

test('a stored document with `learn` starts nothing; one without it starts the job once and answers its state; the GET carries it only until it lands', () => {
  assert.match(source, /learn: doc\.learn \? \{ status: 'ready' \} : await learnState\(env, repo, \{ start, retry \}\)/);
  assert.match(source, /\.\.\.\(learn && learn\.status !== 'ready' \? \{ learn \} : \{\}\)/);
  assert.deepEqual(schema.properties.learn.properties.status.enum, ['queued', 'failed']);
  assert.equal(schema.properties.learn.additionalProperties, false);
});

// A live bug the first real run found (2026-11-15): learn_plan took its model seam only from the caller's deps, so the real route threw "callModel is not a function" while the unit tests (which inject one) passed.
test('learn_plan falls back to the real model seam exactly as learn_intro and learn_fit do', () => {
  const route = readFileSync(new URL('../src/learn-codebase-source-map.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(route, /learnPlan\(env, snapshot, \{[^\n]*\}, \{ \.\.\.deps, callModel: deps\.callModel \|\| loggedModel\('home_ask', anthropic\) \}\)/);
  assert.match(route, /async function learnIntro\(env, snapshot, value, \{ callModel = loggedModel\('home_ask', anthropic\) \}/);
});
