// Task 11 (C:/s/spec/tutor-workflow/draft.md "Table of Contents, tutoring, and progress", acceptance 50-55): TOC edits and
// the accepted plan never change evidence. The outline is the canvas headings, the plan is the learner's own journey path,
// and links, steps and badges are derived from those records (learn-outline-model.js outlinePlan, evidenceOf,
// applyOutlineAction). No network, no React except one bundled journeyController, no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { applyOutlineAction, evidenceOf, moveSection, outlineFrom, outlinePlan, outlineRevision, planRevisionOf, proposalProblem, READ_ONLY_OUTLINE, STALE_PLAN, STALE_PROPOSAL } from './learn-outline-model.js';
import { materializeSection } from './learn-journey-materialize.js';
import { fixtureFor } from '../../control-plane/src/learn-journey-fixtures.js';

// The keyless stack's logistic regression path: s1 completed with its recorded heading, s2 current and not drawn yet.
const drafted = fixtureFor('journey_path', { topic: 'logistic regression' });
const path = { ...drafted.path, version: 3, current_section_id: 's2', sections: drafted.path.sections.map(s => (s.id === 's1' ? { ...s, status: 'completed', heading_block_id: 'h-s1' } : s.id === 's2' ? { ...s, status: 'current' } : s)) };
const journey = { id: 'j1', state: 'active', active_section_id: 's2', path_version: 3 };
const claimOf = id => path.sections.find(s => s.id === id).expected_evidence[0].claim;
const criterion = (criterionId, label, skillKey) => ({ criterionId, version: 1, label, requirement: `${label}.`, requiresReasoning: true, rubricVersion: 'r1', skillKey });
const goal = { goalId: 'lg_j1', journeyId: 'j1', criteria: [criterion('c-threshold', 'Threshold reasoning', claimOf('s1')), criterion('c-probability', 'Score to probability', claimOf('s2'))] };
const knnGoal = { goalId: 'g-knn', criteria: [criterion('c-knn', 'KNN distance', 'knn/distance')] };
// The learner's own Progress read (GET /api/learn/progress): one assisted demonstration, one not checked.
const progress = { criteria: [{ criterionId: 'c-threshold', version: 1, label: 'Threshold reasoning', status: 'demonstrated_with_help' }, { criterionId: 'c-probability', version: 1, label: 'Score to probability', status: 'not_checked' }] };

const h = (id, text, extra = {}) => ({ id, type: 'heading', dx: 0, dy: 0, level: 1, text, done: false, ...extra });
const card = id => ({ id, type: 'explanation', dx: 0, dy: 0, title: id, body: `${id} body` });
const BLOCKS = [h('h-s1', 'Classification vs regression', { journey_section_id: 's1', journey_id: 'j1' }), card('k1'), card('k2'), h('notes', 'Debugging notes'), card('k3')];
const headingsOf = blocks => blocks.filter(block => block.type === 'heading');
const planOf = (blocks, over = {}) => outlinePlan({ headings: headingsOf(blocks), journey, path, goal, ...over });
const plan = planRevisionOf(journey, path);

test('the plan beside the outline: a recorded step links its heading by id, an accepted step without one is planned and current', () => {
  const view = planOf(BLOCKS);
  assert.deepEqual(Object.keys(view.links), ['h-s1'], 'only the heading a step holds is linked; unrelated notes have no link');
  assert.deepEqual(view.links['h-s1'].criteria.map(c => c.criterionId), ['c-threshold']);
  assert.deepEqual(view.steps.map(s => [s.sectionId, s.state]), path.sections.slice(1).map(s => [s.id, 'planned']), 'every later accepted step is planned, none drawn');
  assert.deepEqual(view.learningNow, { sectionId: 's2', title: path.sections[1].title, removed: false });
  assert.deepEqual(evidenceOf(view.links.notes, progress), [], 'a heading with no linked criterion has no learning badge');
  assert.deepEqual(outlinePlan({ headings: headingsOf(BLOCKS), journey: { ...journey, state: 'path_review' }, path, goal }), { links: {}, steps: [], learningNow: null }, 'a path under review is not an accepted plan');
  assert.deepEqual(outlinePlan({ headings: headingsOf(BLOCKS) }), { links: {}, steps: [], learningNow: null }, 'no journey, no plan: a blank or unplanned canvas stays as it is');
});

test('manual_done_creates_no_evidence', () => {
  const before = planOf(BLOCKS), badges = evidenceOf(before.links['h-s1'], progress);
  // The checkbox (AdaptiveCanvas toggleSectionDone) flips `done` and nothing else.
  const ticked = BLOCKS.map(block => (block.type === 'heading' ? { ...block, done: !block.done } : block));
  assert.deepEqual(planOf(ticked), before, 'marking every section done links, plans and starts nothing');
  assert.deepEqual(evidenceOf(planOf(ticked).links['h-s1'], progress), badges, 'the evidence badge is the Progress read, not the checkbox');
  assert.equal(outlineRevision(outlineFrom(ticked)), outlineRevision(outlineFrom(BLOCKS)), 'a tick never stales a proposal');
  // Copying a section, adding an unrelated topic and removing a heading add no criterion: the milestone denominator is the
  // goal's agreed criteria, which no outline edit reads or writes.
  const copied = [...BLOCKS, { ...BLOCKS[0], id: 'h-s1-copy' }, card('k1-copy'), h('extra', 'Unrelated topic')];
  const view = planOf(copied.filter(block => block.id !== 'notes'));
  assert.deepEqual(Object.keys(view.links), ['h-s1'], 'the copy and the new topic carry no link and no badge');
  assert.equal(goal.criteria.length, 2);
  // A saved assessment shows only as the linked criterion's badge; it never ticks the box.
  const assisted = evidenceOf(view.links['h-s1'], progress);
  assert.deepEqual(assisted.map(b => [b.label, b.status]), [['Threshold reasoning', 'demonstrated_with_help']]);
  assert.equal(copied.find(block => block.id === 'h-s1').done, false, 'the manual mark stays as the learner left it');
});

test('rename_cannot_relabel_mastery', () => {
  const renamed = applyOutlineAction(BLOCKS, { changes: [{ op: 'retitle', id: 'h-s1', text: 'KNN' }, { op: 'describe', id: 'h-s1', description: 'Nearest neighbours' }] }, { planRevision: plan });
  assert.equal(renamed.ok, true);
  assert.equal(renamed.blocks[0].text, 'KNN');
  const view = planOf(renamed.blocks);
  assert.deepEqual(view.links, planOf(BLOCKS).links, 'the heading keeps its id, so its step and criteria stay');
  const badges = evidenceOf(view.links['h-s1'], progress);
  assert.deepEqual(badges.map(b => `${b.label}: ${b.status}`), ['Threshold reasoning: demonstrated_with_help'], 'the badge names the assessed criterion, never the new title');
  assert.ok(!JSON.stringify(view).includes('KNN'), 'nothing in the plan view takes the heading title');
  // A KNN goal's criteria never attach to the renamed heading: only an explicit link could repurpose it.
  assert.deepEqual(outlinePlan({ headings: headingsOf(renamed.blocks), journey, path, goal: knnGoal }).links['h-s1'].criteria, []);
  // The stamp stays the journey's: a rename never touches it.
  assert.deepEqual([renamed.blocks[0].journey_section_id, renamed.blocks[0].journey_id], ['s1', 'j1']);
});

test('stale_proposal_has_no_partial_mutation', () => {
  const proposal = { ops: [{ op: 'add', level: 1, text: 'Distance scaling', after: 'h-s1' }, { op: 'retitle', id: 'h-s1', text: 'Logistic intro' }], base: outlineRevision(outlineFrom(BLOCKS)), planBase: plan, source: 'tutor' };
  const apply = (blocks, now = plan) => applyOutlineAction(blocks, { baseOutlineRevision: proposal.base, basePlanRevision: proposal.planBase, changes: proposal.ops }, { planRevision: now, source: proposal.source });
  // The learner renames the target after the proposal was made (their own edit: no base).
  const edited = applyOutlineAction(BLOCKS, { changes: [{ op: 'retitle', id: 'h-s1', text: 'My threshold notes' }] }, { planRevision: plan });
  assert.equal(edited.ok, true);
  const refused = apply(edited.blocks);
  assert.deepEqual([refused.ok, refused.reason, refused.message], [false, 'stale', STALE_PROPOSAL]);
  assert.equal(refused.blocks, undefined, 'nothing is returned to commit');
  assert.equal(proposalProblem(outlineFrom(edited.blocks), proposal, plan), STALE_PROPOSAL, 'the card says so before Apply');
  // A reorder is as much a newer edit as a rename.
  const moved = moveSection(BLOCKS, 'notes', 'h-s1');
  assert.equal(apply(moved).reason, 'stale');
  // A plan-only change (the learner accepted a revised path) also stales it, though the headings did not move.
  const revised = planRevisionOf(journey, { ...path, version: 4 });
  assert.deepEqual([apply(BLOCKS, revised).ok, apply(BLOCKS, revised).message], [false, STALE_PLAN]);
  assert.equal(proposalProblem(outlineFrom(BLOCKS), proposal, revised), STALE_PLAN);
  assert.equal(apply(BLOCKS, null).reason, 'stale', 'a plan the learner left (another goal) is a changed plan');
  // An invalid change anywhere in the list applies none of it.
  const broken = applyOutlineAction(BLOCKS, { baseOutlineRevision: proposal.base, basePlanRevision: plan, changes: [...proposal.ops, { op: 'retitle', id: 'gone', text: 'x' }] }, { planRevision: plan, source: 'tutor' });
  assert.deepEqual([broken.ok, broken.reason], [false, 'invalid']);
  // Unchanged bases: it applies whole, and says the revisions it produced.
  const fresh = apply(BLOCKS);
  assert.equal(fresh.ok, true);
  assert.deepEqual(headingsOf(fresh.blocks).map(b => b.text), ['Logistic intro', 'Distance scaling', 'Debugging notes']);
  assert.deepEqual([fresh.outlineRevision, fresh.planRevision], [outlineRevision(outlineFrom(fresh.blocks)), plan]);
  // Replayed (a double click, a second tab), the same proposal is stale against its own result: never applied twice.
  assert.equal(apply(fresh.blocks).reason, 'stale');
});

// The journey hook's controller, bundled as learn-journey-ui.test.mjs does, to show that a recorded step whose heading the
// learner removed is never drawn again.
const here = fileURLToPath(new URL('.', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'outline-progress-'));
const outfile = join(dir, 'journey.cjs');
await esbuild.build({ stdin: { contents: "export { journeyController } from './LearnJourney.jsx';", resolveDir: here, loader: 'jsx' }, bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent' });
const { journeyController } = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

test('removed_heading_does_not_delete_work', async () => {
  // The current step's material is drawn and recorded as h-s2; the learner removes that heading in the panel (removeBlock:
  // the heading block only).
  const drawn = [...BLOCKS, h('h-s2', path.sections[1].title, { journey_section_id: 's2', journey_id: 'j1' }), card('k4')];
  const recordedPath = { ...path, sections: path.sections.map(s => (s.id === 's2' ? { ...s, heading_block_id: 'h-s2' } : s)) };
  const removed = drawn.filter(block => block.id !== 'h-s2');
  assert.deepEqual(removed.filter(block => block.type !== 'heading').map(block => block.id), ['k1', 'k2', 'k3', 'k4'], 'every card stays');
  const view = outlinePlan({ headings: headingsOf(removed), journey, path: recordedPath, goal });
  assert.deepEqual(view.learningNow, { sectionId: 's2', title: path.sections[1].title, removed: true }, 'the current task keeps its place, marked Section removed');
  assert.deepEqual(view.steps.find(s => s.sectionId === 's2').state, 'removed', 'never offered as a step to prepare again');
  assert.equal(view.links['h-s2'], undefined);
  // The journey record (the activity and its evidence) is untouched by an outline edit, and the materializer does not
  // recreate the heading: a recorded section is not due.
  const canvas = { flow: removed, inserts: 0, blocks: () => removed, reserve: () => 'slot', release: () => {}, showSection: () => {}, persist: async () => ({ ok: true }), insertBlock: () => { canvas.inserts += 1; return 'new'; } };
  const plan2 = { section_id: 's2', path_version: 3, heading_block_id: 'h-s2', generation_state: 'generated', teaching_sequence: [{ step_id: 'a', role: 'explanation', make: { text: 'a' }, claims: [] }] };
  const requests = [];
  const ctl = journeyController({ where: { app: 'canvas-0a1b2c3d', board: 'main' }, canvas: () => canvas, fetchJson: async (url, body) => { requests.push(body?.action ?? 'GET'); return { status: 200, d: { journey: { ...journey, revision: 9, section_plan: plan2 }, path: recordedPath, tray: null } }; } });
  await ctl.refresh();
  await ctl.view().canvasReady();
  assert.equal(canvas.inserts, 0, 'no heading or card is drawn again');
  assert.deepEqual(requests, ['GET'], 'no journey action, so no evidence or step changes');
  // A recorded heading on its way back (Ctrl+Z restores the same id) is linked again.
  assert.deepEqual(outlinePlan({ headings: headingsOf(drawn), journey, path: recordedPath, goal }).learningNow, { headingId: 'h-s2' });
});

test('materialized_step_has_one_heading', async () => {
  const sectionPlan = fixtureFor('journey_section', { path, section: path.sections[1], registry: drafted.concepts_added });
  const flow = BLOCKS.map(block => ({ ...block }));
  let n = 0;
  const canvas = {
    blocks: () => flow, reserve: () => 'slot', release: () => {}, showSection: () => {}, persist: async () => ({ ok: true }),
    insertBlock: (block, options = {}) => { const id = `b${++n}`; const at = options.after ? flow.findIndex(b => b.id === options.after) + 1 : flow.length; flow.splice(at, 0, { ...block, id }); return id; },
  };
  const before = planOf(flow);
  assert.deepEqual(before.steps.find(s => s.sectionId === 's2'), { sectionId: 's2', n: 2, title: path.sections[1].title, purpose: path.sections[1].purpose, state: 'planned' });
  const recorded = [];
  const run = () => materializeSection({ canvas, journey: { ...journey, path, materialized: async (id, heading) => { recorded.push([id, heading]); } }, sectionPlan, post: async () => { throw new Error('no artifact call'); } });
  const first = await run();
  // Before the record lands, the stamped heading already holds the step: the planned entry is gone, not doubled.
  const during = planOf(flow);
  assert.deepEqual(during.learningNow, { headingId: first.heading_block_id });
  assert.equal(during.steps.some(s => s.sectionId === 's2'), false);
  assert.deepEqual(during.links[first.heading_block_id].criteria.map(c => c.criterionId), ['c-probability']);
  // Again (a reload mid-way, a second tab): the stamped heading is reused, never a second one.
  await run();
  assert.equal(headingsOf(flow).filter(block => block.journey_section_id === 's2').length, 1, 'one heading for the step');
  // Once recorded, the record names it; only the current step was drawn, the later ones stay planned with no generation.
  const recordedPath = { ...path, sections: path.sections.map(s => (s.id === 's2' ? { ...s, heading_block_id: recorded[0][1] } : s)) };
  const after = outlinePlan({ headings: headingsOf(flow), journey, path: recordedPath, goal });
  assert.deepEqual(Object.keys(after.links).sort(), ['h-s1', first.heading_block_id].sort());
  assert.deepEqual(after.steps.map(s => s.sectionId), path.sections.slice(2).map(s => s.id));
  assert.ok(flow.every(block => !block.journey || block.journey.section_id === 's2'), 'no card for any later step');
});

test('viewer_cannot_edit_shared_outline', () => {
  const tries = [
    { changes: [{ op: 'retitle', id: 'h-s1', text: 'Mine now' }] },
    { changes: [{ op: 'add', level: 1, text: 'Extra', after: null }] },
    { baseOutlineRevision: outlineRevision(outlineFrom(BLOCKS)), basePlanRevision: plan, changes: [{ op: 'describe', id: 'h-s1', description: 'x' }] },
  ];
  for (const action of tries) {
    const out = applyOutlineAction(BLOCKS, action, { canEdit: false, planRevision: plan });
    assert.deepEqual(out, { ok: false, reason: 'read_only', message: READ_ONLY_OUTLINE }, 'refused before any base or change is read');
  }
  // An Undo is an outline action too: the inverse of a change is refused the same way.
  assert.equal(applyOutlineAction(BLOCKS, { changes: [{ op: 'retitle', id: 'h-s1', text: 'Classification vs regression' }] }, { canEdit: false }).reason, 'read_only');
});

test('private_badge_is_not_shared', () => {
  const view = planOf(BLOCKS), badges = evidenceOf(view.links['h-s1'], progress);
  assert.equal(badges.length, 1);
  // Nothing the contents derive is written into a heading: every block field after an edit is the edit's own.
  const edited = applyOutlineAction(BLOCKS, { changes: [{ op: 'retitle', id: 'notes', text: 'Notes' }] }, { planRevision: plan });
  const fields = new Set(headingsOf(edited.blocks).flatMap(block => Object.keys(block)));
  assert.deepEqual([...fields].sort(), ['done', 'dx', 'dy', 'id', 'journey_id', 'journey_section_id', 'level', 'text', 'type']);
  assert.ok(!JSON.stringify(edited.blocks).match(/demonstrated|practising|criterion|c-threshold/), 'no status, criterion or evidence in the shared blocks');
  // Another learner on the same blocks (a collaborator, a fork) has their own journey or none: no link, step or badge.
  assert.deepEqual(outlinePlan({ headings: headingsOf(BLOCKS), journey: { ...journey, id: 'j-other' }, path: { ...path, sections: path.sections.map(({ heading_block_id, ...s }) => s) }, goal: null }).links, {});
  assert.deepEqual(outlinePlan({ headings: headingsOf(BLOCKS) }).links, {});
  assert.deepEqual(evidenceOf(view.links['h-s1'], null), [], 'no Progress read of one\'s own, no badge');
});
