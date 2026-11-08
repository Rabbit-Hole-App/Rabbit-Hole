// INT-03 web side (docs/features/interact.md; INT-03-C03 to C06, C10, C11): a validated ScenePlan in Chat. The adapter's view model, the
// public stage words, Steps removed from the new-flow selector only, and the existing GenerationProposalCard drawing Review scene plan with
// the plan detail, Generate only on a current final plan, and no direct Save past the reviewed plan. Fixture plans only: no model call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { interactFixtures } from './interact-plan-fixtures.js';
import { planHash } from './interact-plan.js';
import { MODE_LABELS, planDetail, reviewModel } from './interact-plan-review.js';
import { INTERACT_REVIEW_HEADING, INTERACT_STAGES, interactDiagnostics, interactIdentity, interactStageText, isInteractJob } from './interact-stage.js';
import { EXPLAIN_REVIEW_HEADING, jobReviewCopy } from './generation-proposal-chat.js';
import { explainStage } from './explain-client.js';
import { NEW_FLOW_PRESENTATIONS, fieldsFor, settingsProblems } from './generation-confirmation-schema.js';
import { escapeText } from './generation-review.js';

const dir = mkdtempSync(join(tmpdir(), 'interact-review-')), outfile = join(dir, 'card.cjs');
await esbuild.build({
  stdin: { contents: "export { default as Card } from './GenerationProposalCard.jsx'; export { default as Detail } from './InteractPlanDetail.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const { plans } = await interactFixtures();
const profileHash = 'b'.repeat(64);
// The signed proposal of the new flow (control-plane generation-proposal.js shape): identity rides in input.
const proposalOf = async (plan, over = {}) => ({
  proposal_id: 'gp-0123456789abcdef', version: 1, command: 'explain', title: plan.title, description: plan.cardDescription, settings: { presentation: plan.mode.kind },
  usage: {}, input: { job: 'job-1', scene_plan_version: 1, scene_plan_hash: await planHash(plan), profile_hash: profileHash, scene_plan: plan }, ...over,
});
const strings = (value, out = []) => { if (typeof value === 'string') out.push(value); else if (value && typeof value === 'object') Object.values(value).forEach(v => strings(v, out)); return out; };
const find = (node, pred) => {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) { for (const n of node) { const hit = find(n, pred); if (hit) return hit; } return null; }
  return pred(node) ? node : find(node.props?.children, pred);
};

test('a valid plan becomes the exact Title, the card description and a plan detail with the full Story', async () => {
  for (const name of ['overview', 'standard', 'deep']) {
    const plan = plans[name], model = reviewModel(await proposalOf(plan));
    assert.equal(model.ready, true, name);
    assert.equal(model.title, plan.title);
    assert.equal(model.cardDescription, plan.cardDescription);
    assert.equal(model.detail.story, plan.story, 'the full Story, never shortened');
    assert.equal(model.detail.mode.label, MODE_LABELS[plan.mode.kind]);
  }
  assert.deepEqual(Object.values(MODE_LABELS), ['Static', 'Over time', 'Experiment']);
});

test('Controls carry their exact labels, units and defaults; Deep shows Launch speed 5.0 m/s from 3.0 to 5.0 in 0.1 steps', async () => {
  const deep = planDetail(plans.deep);
  const speed = deep.controls.find(c => c.label === 'Launch speed');
  assert.equal(speed.detail, 'starts at 5.0 m/s, from 3.0 m/s to 5.0 m/s, in steps of 0.1 m/s');
  assert.deepEqual(deep.controls.map(c => c.label), ['Play', 'Time since launch', 'Launch speed', 'Reset experiment']);
  const standard = planDetail(plans.standard);
  assert.equal(standard.controls[0].detail, 'Play, Pause and Replay');
  assert.match(standard.controls[1].detail, /in steps of 0\.01 s/);
  assert.deepEqual(planDetail(plans.overview).controls, [], 'a Static plan with no controls says none, it does not invent one');
  const moment = planDetail(plans.staticAdjustable).controls[0];
  assert.equal(moment.detail, 'Before the top, At the top, After the top; starts at At the top');
});

test('the timeline shows its displayed range from the plan\'s own arithmetic', () => {
  assert.deepEqual(planDetail(plans.standard).mode.timeline, { label: 'Time from the apex', range: '−0.306 to +0.306 s', marks: ['-0.10 s', 'Top', '+0.10 s'] });
  assert.equal(planDetail(plans.deep).mode.timeline.range, '0 to 1.02 s', 'Deep reads Time since launch from zero at the default speed');
  assert.equal(planDetail(plans.overview).mode.timeline, null);
});

test('the detail has no raw JSON, hashes, provider settings or internal task names', async () => {
  const model = reviewModel(await proposalOf(plans.deep));
  const text = strings(model.detail).join('\n');
  for (const banned of [/^\s*[{[]/m, /scene_plan/, /profile_hash/, /[0-9a-f]{64}/, /provider/i, /interact_design/, /explain_author/, /explain_review/, /claude-/, /maxOutputTokens/, /catalogueHash/, /nativeControlId/]) assert.doesNotMatch(text, banned, String(banned));
});

test('Generate is off, with the reason, unless the identity is complete, the plan is whole and the card text is the plan\'s', async () => {
  const plan = plans.standard, good = await proposalOf(plan);
  assert.equal(reviewModel(good).ready, true);
  const refused = (proposal, plan2) => { const m = reviewModel(proposal, plan2); assert.equal(m.ready, false); assert.ok(m.reason); assert.equal(m.detail, null); return m.reason; };
  refused({ ...good, input: { ...good.input, scene_plan: undefined } });
  refused({ ...good, input: { ...good.input, scene_plan_hash: 'nope' } });
  refused({ ...good, input: { ...good.input, profile_hash: undefined } });
  refused(good, { ...plan, story: '' });
  refused(good, { ...plan, extra: 1 });
  refused({ ...good, input: { ...good.input, scene_plan_version: 2 } });
  assert.match(refused({ ...good, title: 'Another title' }), /does not match/);
  assert.match(refused({ ...good, description: 'Edited after review.' }), /does not match/);
  assert.equal(reviewModel({ ...good, command: 'motion' }), null, 'only an explain proposal of the new flow');
  assert.equal(reviewModel({ ...good, input: { job: 'job-1' } }), null, 'an older explain proposal is not the new flow');
});

test('a reviewed proposal that keeps its description as an escaped prompt still matches its plan', async () => {
  const plan = { ...plans.standard, cardDescription: 'Speed {v} and a \\ slash stay as written.' };
  const proposal = { ...(await proposalOf(plan)), sig: 'v3.x', prompt: escapeText(plan.cardDescription), references: [], description: undefined };
  assert.equal(reviewModel(proposal).ready, true);
});

test('public stage words, the real stage kept for diagnostics, the older flow unchanged', () => {
  assert.deepEqual(INTERACT_STAGES, { designing: 'Designing scene', design_review: 'Reviewing scene design', design_revise: 'Updating scene plan', design_check: 'Checking scene plan', awaiting_approval: 'Ready to review' });
  for (const [stage, words] of Object.entries(INTERACT_STAGES).filter(([stage]) => stage !== 'awaiting_approval')) {
    assert.equal(explainStage({ stage }), words);
    assert.deepEqual(interactDiagnostics({ stage }), { stage, shown: words }, 'the server state stays visible');
  }
  assert.equal(explainStage({ stage: 'awaiting_approval', flow: 'interact' }), 'Ready to review');
  assert.equal(explainStage({ stage: 'awaiting_approval' }), 'Review the explanation plan in Chat', 'the older flow keeps its words');
  assert.equal(explainStage({ stage: 'authoring', flow: 'interact' }), 'Writing the explanation', 'build stages keep the existing words');
  assert.equal(explainStage({ stage: 'failed', flow: 'interact', failure: { message: 'It stopped.' } }), 'It stopped.');
  assert.equal(interactStageText({ stage: 'queued' }), null);
  assert.equal(isInteractJob({ stage: 'queued' }), false);
  assert.equal(interactDiagnostics({ stage: 'queued' }), null);
  for (const words of Object.values(INTERACT_STAGES)) assert.doesNotMatch(words, /\.\.\.|…/, 'no ellipsis in UI words');
});

test('the review heading is Review scene plan for the new flow only', async () => {
  assert.equal(jobReviewCopy(await proposalOf(plans.standard)).eyebrow, INTERACT_REVIEW_HEADING);
  assert.equal(INTERACT_REVIEW_HEADING, 'Review scene plan');
  assert.equal(jobReviewCopy({ command: 'explain', input: { job: 'j' } }).eyebrow, EXPLAIN_REVIEW_HEADING);
  assert.equal(interactIdentity({ command: 'explain', input: {} }), null);
});

test('Steps leaves the new-flow selector and validation only; the runtime enum and legacy cards keep it', () => {
  const values = fields => fields.find(f => f.key === 'presentation').options.map(o => o.value);
  assert.deepEqual(values(fieldsFor('explain', {})), ['static', 'steps', 'time', 'experiment']);
  assert.deepEqual(values(fieldsFor('explain', {}, {}, { newFlow: true })), ['static', 'time', 'experiment']);
  assert.deepEqual(NEW_FLOW_PRESENTATIONS.map(o => o.label), ['Static', 'Over time', 'Experiment']);
  assert.deepEqual(settingsProblems('explain', { presentation: 'steps' }), []);
  assert.equal(settingsProblems('explain', { presentation: 'steps' }, { newFlow: true }).length, 1);
  assert.deepEqual(settingsProblems('explain', { presentation: 'experiment' }, { newFlow: true }), []);
});

// The element tree the card draws (a probe is the card's own render, so its hooks are the probe's).
const drawn = props => { let tree = null; const Probe = () => { tree = B.Card(props); return tree; }; B.renderToStaticMarkup(B.createElement(Probe)); return tree; };
const render = async (plan, props = {}, proposalOver = {}) => {
  const proposal = await proposalOf(plan, proposalOver), model = reviewModel(proposal);
  const tree = { proposal, plan: model, ...(model.detail ? { summary: B.createElement(B.Detail, { detail: model.detail }) } : {}), ...jobReviewCopy(proposal), ...props };
  return { proposal, model, html: B.renderToStaticMarkup(B.createElement(B.Card, tree)), tree };
};

test('the existing review card draws Review scene plan, the exact Title and description, the Story and the controls, with Edit and Generate', async () => {
  const { html } = await render(plans.deep, { onGenerate: () => {}, onEdit: () => {} });
  assert.match(html, /Review scene plan/);
  assert.match(html, /Does a faster throw change the motion around its peak\?/);
  assert.ok(html.includes('data-proposal-description'));
  assert.ok(html.includes('data-plan-story'));
  assert.ok(html.includes('Maya wanted to know how much time her eyes had actually seen at the top.'), 'the full Story is in the plan detail');
  assert.match(html, /Launch speed<\/span>: starts at 5\.0 m\/s/);
  assert.match(html, /Compare the two peaks/);
  assert.ok(html.includes('data-proposal-generate') && html.includes('data-proposal-edit'));
  assert.doesNotMatch(html, /Edit details|data-proposal-save/, 'no direct Save past the reviewed plan');
  assert.doesNotMatch(html, /\.\.\.|…/);
});

test('Generate is drawn disabled, with the reason, on a plan that is not current and final', async () => {
  const generate = tree => find(drawn(tree), n => n.props?.['data-proposal-generate'])?.props.disabled;
  const ok = await render(plans.standard, { onGenerate: () => {}, onEdit: () => {} });
  assert.equal(generate(ok.tree), false);
  const missing = await render(plans.standard, { onGenerate: () => {} }, { input: { job: 'job-1', scene_plan_version: 1, scene_plan_hash: 'c'.repeat(64), profile_hash: profileHash } });
  assert.equal(missing.model.ready, false);
  assert.match(missing.html, /The scene plan is not available yet\./);
  assert.equal(generate(missing.tree), true);
});

test('Edit goes through the Chat edit path and never opens the old details form; the selector is read only without Steps', async () => {
  const seen = [];
  const { html, tree } = await render(plans.standard, { onGenerate: () => {}, onEdit: p => seen.push(p) });
  const edit = find(drawn(tree), n => n.props?.['data-proposal-edit']);
  edit.props.onClick();
  assert.equal(seen.length, 1);
  assert.doesNotMatch(html, /data-proposal-title|data-proposal-editor|data-proposal-save|data-proposal-discard/);
  const select = html.match(/<select[^>]*data-proposal-select="presentation"[^>]*>[\s\S]*?<\/select>/)[0];
  assert.match(select, /disabled/);
  assert.doesNotMatch(select, /Steps/);
  for (const label of ['Static', 'Over time', 'Experiment']) assert.ok(select.includes(label), label);
  // with no Chat edit path wired the Edit button keeps its name, greyed; it does not fall back to the details form
  const none = await render(plans.standard, { onGenerate: () => {} });
  assert.match(none.html, /data-proposal-edit="true"[^>]*disabled/);
  assert.doesNotMatch(none.html, /Edit details/);
});

test('other commands keep their behavior: no plan, no Steps change, Edit details form still offered', () => {
  const html = B.renderToStaticMarkup(B.createElement(B.Card, { proposal: { proposal_id: 'gp-1', version: 1, command: 'explain', title: 'T', description: 'D', settings: { presentation: 'steps' }, usage: {}, input: { job: 'j' } }, onGenerate: () => {} }));
  assert.match(html, /Edit details/);
  assert.match(html, />Steps</, 'a legacy proposal keeps Steps');
  assert.doesNotMatch(html, /Review scene plan/);
});
