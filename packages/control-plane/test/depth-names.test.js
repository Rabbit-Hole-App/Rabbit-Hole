// Depth names (owner 2026-11-08): Overview, Standard, Deep became Brief, Balanced, Detailed everywhere, internal values included. Stored data and old clients still say the old
// names, so every read goes through the alias map (chat-depth.js depthOf) and every write uses the new names. This pins: the alias map at the read sites (stored canvas setting, stored
// job and card Depth, API input, roadmap), the one-vocabulary prompt text, learn-migrations/0044 (widens the two CHECKs, copies every row, no value rewritten) and the
// owner-run rewrite (learn-repairs/depth-names-rewrite.sql.txt). Offline, node:sqlite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEPTHS, DEFAULT_DEPTH, DEPTH_ALIASES, depthOf, validDepth, depthInstruction, explanationTarget, EXPLANATION_CAPS, EXPLANATION_DEPTH_LINES } from '../src/chat-depth.js';
import { readDepth, readSettings, setDepth } from '../src/learn-user-settings.js';
import { chatFields } from '../src/chat-modes.js';
import { ceilingFor } from '../src/roadmap/roadmap-policy.js';
import { learnDb } from './learn-grade-fixture.js';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const SCHEMA = read('repository-schema.sql'), MIGRATION = read('learn-migrations/0044-depth-names.sql');
const REWRITE = read('learn-repairs/depth-names-rewrite.sql.txt'), CHECK = read('learn-repairs/depth-names-rewrite-check.sql.txt');
const MARK = '-- learn-migrations/0044-depth-names.sql';
const BEFORE_0044 = SCHEMA.slice(0, SCHEMA.indexOf(MARK));
const OLD = { overview: 'brief', standard: 'balanced', deep: 'detailed' };
const A = { org: 'ws', userId: 'u-ana', app: 'canvas-0000aaaa', board: 'main' };
const env = db => ({ LEARN_DB: db.LEARN_DB });

test('one vocabulary: the values are brief, balanced, detailed; the default is balanced; the old names are only aliases', () => {
  assert.deepEqual([...DEPTHS], ['brief', 'balanced', 'detailed']);
  assert.equal(DEFAULT_DEPTH, 'balanced');
  assert.deepEqual({ ...DEPTH_ALIASES }, OLD);
  for (const d of DEPTHS) assert.equal(validDepth(d), d);
  for (const [old, now] of Object.entries(OLD)) assert.equal(validDepth(old), now, old);
  for (const bad of ['constructor', '__proto__', 'Brief', 'shallow', '', null, undefined, 7]) assert.equal(validDepth(bad), null, String(bad));
  for (const d of DEPTHS) assert.ok(EXPLANATION_DEPTH_LINES[d].startsWith(`**${d[0].toUpperCase()}${d.slice(1)}** —`), `${d} paragraph heading`);
  assert.deepEqual(Object.keys(EXPLANATION_CAPS), ['brief', 'balanced', 'detailed']);
  assert.ok(explanationTarget('balanced').startsWith('All three depths have the same length budget. Depth changes who the card is written for, not how much it says.'));
});

test('the alias map reads all three old values at every read site: API input, stored job or card Depth, stored canvas setting, roadmap', async t => {
  // API input (a client or bench request that still says overview, standard or deep)
  for (const [old, now] of Object.entries(OLD)) assert.equal(chatFields({ depth: old }).depth, now, `chat request ${old}`);
  assert.throws(() => chatFields({ depth: 'shallow' }), /depth must be brief, balanced or detailed/);
  // a Depth stored on a job or a card
  for (const [old, now] of Object.entries(OLD)) {
    assert.equal(explanationTarget(old), explanationTarget(now), `target ${old}`);
    assert.equal(depthInstruction(old, 'card'), depthInstruction(now, 'card'), `card sentence ${old}`);
    assert.equal(depthInstruction(old, 'answer'), depthInstruction(now, 'answer'), `answer sentence ${old}`);
    assert.equal(ceilingFor(old), ceilingFor(now), `roadmap ceiling ${old}`);
  }
  assert.ok(depthInstruction('overview', 'card').startsWith('Depth: Brief.'));
  // a canvas setting stored before the rename (the widened CHECK still accepts the old names)
  const db = learnDb(t);
  for (const [i, [old, now]] of Object.entries(OLD).entries()) {
    const actor = { ...A, board: `b${i}` };
    db.sqlite.prepare("INSERT INTO learn_canvas_depth (org, owner_user_id, app, board, depth, updated_at) VALUES (?, ?, ?, ?, ?, 'now')").run(actor.org, actor.userId, actor.app, actor.board, old);
    assert.equal(await readDepth(env(db), actor), now, `stored ${old}`);
    assert.equal((await readSettings(env(db), actor)).depth, now, `settings ${old}`);
  }
});

test('writes use only the new names: an old-name write from an old client is stored as the new name', async t => {
  const db = learnDb(t);
  assert.equal(await setDepth(env(db), A, { depth: validDepth('deep'), expectedRevision: 0, actionId: 'act-000001' }), 'applied');
  assert.equal(db.sqlite.prepare('SELECT depth FROM learn_canvas_depth').get().depth, 'detailed');
  assert.equal(await readDepth(env(db), A), 'detailed');
});

test('0044 widens both CHECKs to accept both vocabularies, copies every row unchanged, recreates the indexes, is re-runnable and is exactly what repository-schema.sql applies', t => {
  assert.ok(SCHEMA.replace(/\r/g, '').includes(MIGRATION.replace(/\r/g, '').trim()), 'repository-schema.sql holds 0044 verbatim');
  assert.ok(SCHEMA.trimEnd().endsWith(MIGRATION.trim()) || SCHEMA.replace(/\r/g, '').trimEnd().endsWith(MIGRATION.replace(/\r/g, '').trim()), '0044 is the last section of the schema mirror');
  assert.doesNotMatch(MIGRATION.replace(/--.*$/gm, ''), /\bUPDATE\b/i, 'no stored value is rewritten by the migration');
  assert.doesNotMatch(MIGRATION.replace(/--.*$/gm, ''), /CREATE TABLE IF NOT EXISTS/i, 'the _new tables are not counted as tables the migrations create (scripts/dev-deploy.mjs learnTables)');
  const { sqlite } = learnDb(t, BEFORE_0044);
  const roadmap = (id, depth) => sqlite.prepare("INSERT INTO learn_roadmaps (id, org, owner_user_id, owner_email, board_id, app, state, depth, source_key, source_rev, scope_json, scope_fingerprint, ceiling, policy_version, created_at, updated_at) VALUES (?, 'ws', 'u-ana', 'a@b.c', ?, 'canvas-0000aaaa', 'ended', ?, 'k', 'r', '{}', 'f', 10, 'p1', 1, 2)").run(id, id, depth);
  for (const [i, old] of Object.keys(OLD).entries()) {
    sqlite.prepare("INSERT INTO learn_canvas_depth (org, owner_user_id, app, board, depth, revision, last_action_id, updated_at) VALUES ('ws', 'u-ana', 'canvas-0000aaaa', ?, ?, ?, ?, 'now')").run(`b${i}`, old, i + 1, `act-${i}`);
    roadmap(`rm-${i}`, old);
  }
  assert.throws(() => sqlite.prepare("INSERT INTO learn_canvas_depth (org, owner_user_id, app, board, depth, updated_at) VALUES ('ws', 'u', 'a', 'x', 'brief', 'now')").run(), /CHECK/, 'before 0044 the new names are refused');
  const shape = () => ['learn_canvas_depth', 'learn_roadmaps'].map(name => sqlite.prepare(`PRAGMA table_info(${name})`).all().map(r => [r.name, r.type, r.notnull, r.dflt_value, r.pk].join('|')));
  const rows = () => [sqlite.prepare('SELECT * FROM learn_canvas_depth ORDER BY board').all().map(r => ({ ...r })), sqlite.prepare('SELECT * FROM learn_roadmaps ORDER BY id').all().map(r => ({ ...r }))];
  const [shapeBefore, rowsBefore] = [shape(), rows()];
  sqlite.exec(MIGRATION); sqlite.exec(MIGRATION);
  assert.deepEqual(shape(), shapeBefore, 'same columns, types, defaults and keys');
  assert.deepEqual(rows(), rowsBefore, 'every row copied unchanged, the old names included');
  assert.deepEqual(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'learn_roadmaps' AND name LIKE 'learn_roadmaps_%' ORDER BY name").all().map(r => r.name), ['learn_roadmaps_board', 'learn_roadmaps_one_unfinished']);
  assert.deepEqual(sqlite.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%_new'").all(), [], 'no temporary table is left');
  for (const d of ['brief', 'balanced', 'detailed']) {
    sqlite.prepare("INSERT INTO learn_canvas_depth (org, owner_user_id, app, board, depth, updated_at) VALUES ('ws', 'u-ben', 'a', ?, ?, 'now')").run(`n-${d}`, d);
    roadmap(`new-${d}`, d);
  }
  assert.throws(() => sqlite.prepare("INSERT INTO learn_canvas_depth (org, owner_user_id, app, board, depth, updated_at) VALUES ('ws', 'u', 'a', 'x', 'shallow', 'now')").run(), /CHECK/);
  assert.throws(() => roadmap('rm-bad', 'shallow'), /CHECK/);
});

test('the owner-run rewrite changes only the old names in the two columns, is re-runnable, and its listing counts exactly those rows', t => {
  const { sqlite } = learnDb(t);
  for (const [i, d] of ['overview', 'standard', 'deep', 'brief', 'overview'].entries()) {
    sqlite.prepare("INSERT INTO learn_canvas_depth (org, owner_user_id, app, board, depth, revision, updated_at) VALUES ('ws', 'u-ana', 'a', ?, ?, 7, 'now')").run(`b${i}`, d);
    sqlite.prepare("INSERT INTO learn_roadmaps (id, org, owner_user_id, owner_email, board_id, app, state, depth, source_key, source_rev, scope_json, scope_fingerprint, ceiling, policy_version, created_at, updated_at) VALUES (?, 'ws', 'u-ana', 'a@b.c', ?, 'a', 'ended', ?, 'k', 'r', '{}', 'f', 10, 'p1', 1, 2)").run(`r${i}`, `r${i}`, d);
  }
  const listing = () => sqlite.prepare(CHECK.replace(/--.*$/gm, '').trim().replace(/;\s*$/, '')).all().map(r => `${r.tbl}:${r.depth}->${r.becomes}=${r.n}`).sort();
  assert.deepEqual(listing(), ['learn_canvas_depth:deep->detailed=1', 'learn_canvas_depth:overview->brief=2', 'learn_canvas_depth:standard->balanced=1', 'learn_roadmaps:deep->detailed=1', 'learn_roadmaps:overview->brief=2', 'learn_roadmaps:standard->balanced=1']);
  sqlite.exec(REWRITE); sqlite.exec(REWRITE);
  assert.deepEqual(sqlite.prepare('SELECT board, depth, revision FROM learn_canvas_depth ORDER BY board').all().map(r => `${r.board}:${r.depth}:${r.revision}`), ['b0:brief:7', 'b1:balanced:7', 'b2:detailed:7', 'b3:brief:7', 'b4:brief:7']);
  assert.deepEqual(sqlite.prepare('SELECT id, depth FROM learn_roadmaps ORDER BY id').all().map(r => `${r.id}:${r.depth}`), ['r0:brief', 'r1:balanced', 'r2:detailed', 'r3:brief', 'r4:brief']);
  assert.deepEqual(listing(), [], 'nothing left to rewrite');
});
