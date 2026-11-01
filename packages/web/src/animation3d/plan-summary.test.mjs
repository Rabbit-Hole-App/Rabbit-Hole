// The /animation review card's short summary (owner, 2026-10-31), drawn from three different plans - an experiment, a watch
// scene and a mini-game - through the shared confirmation card, as ChatMessages draws it. Bundled with esbuild and rendered with
// react-dom/server, as generation-confirmation-card.test.mjs does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'plan-summary-')), outfile = join(dir, 'summary.cjs');
const viteUrl = { name: 'vite-url', setup(build) {
  build.onResolve({ filter: /\?url$/ }, args => ({ path: args.path, namespace: 'vite-url' }));
  build.onLoad({ filter: /.*/, namespace: 'vite-url' }, () => ({ contents: 'export default ""' }));
} };
await esbuild.build({
  stdin: { contents: "export { default as Card } from '../GenerationProposalCard.jsx'; export { default as PlanSummary, planSummary, parameterRange, parameterStart } from './PlanSummary.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'js' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', plugins: [viteUrl], loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const proposal = (experience, scene, rest = {}) => ({ proposal_id: `gp-${experience}`, version: 1, command: 'animation', title: rest.title || 'A scene', description: rest.description || 'What it shows.',
  settings: { experience }, source_refs: [], references: [], assumptions: rest.assumptions || [], limitations: rest.limitations || [],
  requirements: [`Recommended: ${experience}. Because.`, 'Behavior: analytical', 'Controls: inspect', 'Interaction: internal line'],
  input: { org: 'w', app: 'canvas-1', job: 'aj_1', plan_hash: 'h', request: 'the request words', scene }, original_request: '/animation the request words', expires_at: 9e9, sig: `v3.${'a'.repeat(64)}`, usage: {} });
const draw = p => {
  const summary = B.planSummary(p);
  return B.renderToStaticMarkup(B.createElement(B.Card, { proposal: p, onGenerate: () => {}, onEdit: () => {}, eyebrow: 'Review your scene', editLabel: 'Edit plan', summary: B.createElement(B.PlanSummary, { summary }) }));
};
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim();

const EXPERIMENT = proposal('experiment', {
  parameters: [{ type: 'number', label: 'Spring stiffness', unit: 'N/m', min: 5, max: 50, default: 20 }, { type: 'number', label: 'Tilt', unit: '°', min: 0, max: 30, default: 10 },
    { type: 'select', label: 'Surface', options: [{ value: 'ice', label: 'Ice' }, { value: 'wood', label: 'Wood' }, { value: 'rubber', label: 'Rubber' }], default: 'wood' },
    { type: 'toggle', label: 'Show forces', default: false }],
  interactions: ['Drag the stiffness slider and watch the block bounce.'], notices: ['You asked for real physics simulation, which is not available yet; this plan uses motion computed from formulas instead.'] },
{ title: 'Spring and block', description: 'Change the spring and watch the block bounce faster or slower.', assumptions: ['Uses an ideal spring with no friction loss.', 'The block is a point mass.'],
  limitations: ['You asked for real physics simulation, which is not available yet; this plan uses motion computed from formulas instead.', 'Large tilts are drawn, not simulated.'] });
const WATCH = proposal('watch', { parameters: [], interactions: ['Pause and play the loop.'], notices: [] },
  { title: 'Tide cycle', description: 'The water rises and falls twice a day as the Moon passes over.', assumptions: [], limitations: ['Heights are not to scale.'] });
const GAME = proposal('game', { parameters: [], interactions: ['Press the arrows to move the rover.', 'Reach the flag without touching a crater.', 'Hint shows a safe square.'], notices: [] },
  { title: 'Rover run', description: 'Steer the rover across the crater field to the flag.', assumptions: ['One move per press.'] });

test('an experiment shows what can change, with ranges, units and where it starts, plus the server notice and one caveat', () => {
  const s = B.planSummary(EXPERIMENT);
  assert.deepEqual(s.changes, ['Spring stiffness: 5–50 N/m', 'Tilt: 0–30°', 'Surface: Ice, Wood or Rubber', 'Show forces: on or off']);
  assert.equal(s.starts, '20 N/m · 10° · Wood · Show forces off');
  assert.equal(s.actions, null, 'its parameters say what changes; the interaction lines are not repeated');
  assert.equal(s.caveat, 'Uses an ideal spring with no friction loss.');
  assert.deepEqual(s.assumptions, ['The block is a point mass.']);
  assert.deepEqual(s.limitations, ['Large tilts are drawn, not simulated.'], 'the notice is shown in view, not again in Limitations');
  const html = draw(EXPERIMENT), t = text(html);
  for (const line of s.changes) assert.ok(t.includes(line), line);
  assert.match(t, /Starts at 20 N\/m · 10° · Wood · Show forces off ?\./);
  assert.match(html, /data-plan-notices[^>]*><li>You asked for real physics simulation/);
  assert.match(html, /<details data-plan-disclosure="assumptions"[^>]*><summary[^>]*>Model assumptions<\/summary>/);
  assert.match(html, /<details data-plan-disclosure="limitations"[^>]*><summary[^>]*>Limitations<\/summary>/);
  assert.doesNotMatch(html, /<details[^>]* open/, 'details start collapsed');
});

test('no plan shows internal fields, the request echo or the plan lines; Experience is chosen in plain words; Edit reads Edit plan', () => {
  for (const p of [EXPERIMENT, WATCH, GAME]) {
    const html = draw(p), t = text(html);
    assert.doesNotMatch(t, /Behavior:|Controls:|Interaction:|Parameter:|Recommended:|analytical|internal line|the request words/);
    assert.doesNotMatch(html, /data-proposal-section="(requirements|assumptions|limitations)"|data-proposal-request-block/);
    assert.match(html, /data-proposal-select="experience"/);
    assert.match(html, /data-proposal-hint="experience"/);
    assert.match(html, /data-proposal-edit[^>]*>Edit plan</);
    assert.ok(html.indexOf('data-proposal-description') < html.indexOf('data-proposal-settings'), 'the description comes before the experience');
    assert.match(t, new RegExp(`^Review your scene ${p.title} ${p.description}`));
  }
  assert.match(draw(EXPERIMENT), /data-proposal-hint="experience"[^>]*>Change values and see what happens\.</);
});

test('a watch scene with no parameters says what you can do and omits the empty sections', () => {
  const s = B.planSummary(WATCH), html = draw(WATCH);
  assert.deepEqual(s.changes, []);
  assert.equal(s.starts, null);
  assert.deepEqual(s.actions, { title: 'What you can do', items: ['Pause and play the loop.'] });
  assert.equal(s.caveat, null);
  assert.doesNotMatch(html, /data-plan-changes|data-plan-starts|data-plan-caveat|data-plan-notices|data-plan-disclosure="assumptions"/);
  assert.match(html, /data-plan-disclosure="limitations"/);
  assert.match(html, /data-proposal-hint="experience"[^>]*>Watch a motion that loops\.</);
});

test('a mini-game says how to play from its plan', () => {
  const s = B.planSummary(GAME), t = text(draw(GAME));
  assert.deepEqual(s.actions, { title: 'How to play', items: GAME.input.scene.interactions });
  assert.match(t, /How to play Press the arrows to move the rover\. Reach the flag without touching a crater\. Hint shows a safe square\./);
  assert.equal(s.caveat, 'One move per press.');
  assert.doesNotMatch(draw(GAME), /data-plan-disclosure/, 'no assumptions or limitations left to disclose');
});

test('choosing another experience re-reads the summary: an experiment changed to a game shows how to play', () => {
  const asGame = { ...EXPERIMENT, settings: { experience: 'game' } };
  assert.deepEqual(B.planSummary(asGame).actions, { title: 'How to play', items: ['Drag the stiffness slider and watch the block bounce.'] });
});

test('a plan made before the server sent its scene keeps the full card', () => {
  const old = { ...WATCH, input: { ...WATCH.input, scene: undefined } };
  assert.equal(B.planSummary(old), null);
});
