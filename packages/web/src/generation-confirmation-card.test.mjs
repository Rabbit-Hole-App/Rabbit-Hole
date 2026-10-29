// UI-15.1: the shared confirmation card drawn from the canonical schema: commands with different fields and with none, reference pills,
// the details form, model-dependent image options, a CAD brief view, validation and price blocking. Bundled with esbuild and rendered
// with react-dom/server, as generation-proposal-card.test.mjs does; presses call the element handlers a probe reaches.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { proposalView } from './generation-confirmation-schema.js';

const dir = mkdtempSync(join(tmpdir(), 'confirmation-card-')), outfile = join(dir, 'card.cjs');
// ContextChips' graph reaches a Vite ?url import (the PDF worker): an empty module here, as answer-footer.test.mjs does.
const viteUrl = { name: 'vite-url', setup(build) {
  build.onResolve({ filter: /\?url$/ }, args => ({ path: args.path, namespace: 'vite-url' }));
  build.onLoad({ filter: /.*/, namespace: 'vite-url' }, () => ({ contents: 'export default ""' }));
} };
await esbuild.build({
  stdin: { contents: "export { default as Card, buildEdit } from './GenerationProposalCard.jsx'; export { EditTargetPill } from './ContextChips.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'js' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', plugins: [viteUrl], loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const CAD = { id: 'r1', label: 'CAD · Roller assembly', kind: 'card', sourceId: 'card:cad-1', revision: 'rev-1', range: null };
const CAD2 = { id: 'r2', label: 'CAD · Roller assembly', kind: 'card', sourceId: 'card:cad-2', revision: 'rev-4', range: null };
const v3 = (over = {}) => ({ proposal_id: 'gp-0123456789abcdef', version: 2, schema_version: 1, command: 'motion', title: 'Roller turning', description: 'Plain.', prompt: 'Show {{ref:r1}} turning and compare it with {{ref:r2}}.',
  settings: { duration_seconds: 10, audio: false }, input: { request: '/motion roller', org: 'w', app: 'a' }, original_request: '/motion roller', references: [CAD, CAD2], sig: `v3.${'0'.repeat(64)}`, usage: { estimate_credits: 50, max_credits: 350, reserve_credits: 896 }, ...over });
const html = props => B.renderToStaticMarkup(B.createElement(B.Card, { proposal: v3(), onGenerate: () => {}, onSave: async () => {}, ...props }));
const text = out => out.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const find = (node, pred) => {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) { for (const n of node) { const hit = find(n, pred); if (hit) return hit; } return null; }
  return pred(node) ? node : find(node.props?.children, pred);
};
const tree = props => { let out = null; const Probe = () => { out = B.Card({ proposal: v3(), onGenerate: () => {}, onSave: async () => {}, ...props }); return out; }; B.renderToStaticMarkup(B.createElement(Probe)); return out; };

test('reference pills: type icon and label inline in the description, two same-title cards stay distinct, a click opens the original and never generates or saves', () => {
  const out = html();
  assert.equal(out.match(/<button type="button" data-proposal-pill=/g).length, 2 + 2, 'two in the description and two in the references list');
  assert.match(out, /Show <button[^>]*data-proposal-pill="r1"[^>]*data-proposal-pill-source="card:cad-1"/);
  assert.match(out, /data-proposal-pill="r2"[^>]*data-proposal-pill-source="card:cad-2"/);
  assert.equal(text(out).match(/CAD · Roller assembly/g).length, 4, 'one label, two cards, each pill its own');
  assert.match(out, /aria-label="CAD · Roller assembly"/);
  assert.match(out, /<svg[^>]*aria-hidden/, 'a type icon');
  const opened = [], generated = [], saved = [];
  const root = tree({ onOpenReference: r => opened.push(r), onGenerate: p => generated.push(p), onSave: e => saved.push(e) });
  const pill = find(root, n => n.props?.reference?.id === 'r2' && typeof n.props?.onOpen === 'function');
  pill.props.onOpen(pill.props.reference);
  assert.deepEqual(opened, [CAD2], 'the whole reference, bound by source and revision');
  assert.deepEqual([generated.length, saved.length], [0, 0]);
});

test('a blocked reference is said beside its pill and blocks Generate; a plain legacy description is never parsed for pills', () => {
  const states = [{ id: 'r1', label: CAD.label, state: 'ok', message: null }, { id: 'r2', label: CAD2.label, state: 'unsupported', message: 'CAD · Roller assembly cannot be used by this generator yet. Remove it from the prompt.' }];
  const out = html({ states });
  assert.match(out, /data-proposal-pill="r2"[^>]*data-proposal-pill-state="unsupported"/);
  assert.match(out, /data-proposal-pill="r1"[^>]*data-proposal-pill-state="ok"/);
  assert.match(out, /data-proposal-reference-state="unsupported"/);
  assert.match(out, /<button[^>]*data-proposal-generate="true" disabled=""/);
  assert.doesNotMatch(out, /data-proposal-errors/, 'said once, beside the pill');
  const legacy = B.renderToStaticMarkup(B.createElement(B.Card, { proposal: { ...v3(), sig: `v2.${'0'.repeat(64)}`, description: 'Use {{ref:r1}} as typed. Done. Yes.', references: undefined, prompt: undefined }, onGenerate: () => {} }));
  assert.match(legacy, /Use \{\{ref:r1\}\} as typed\. Done\. Yes\./);
  assert.doesNotMatch(legacy, /data-proposal-pill/);
});

test('the details form: title, description editor, references with Remove, the lists; Save only when something changed; Generate waits', () => {
  const out = html({ defaultEditing: true, proposal: v3({ requirements: [], assumptions: [] }) });
  assert.match(out, /<input data-proposal-title="true" aria-label="Title"[^>]*value="Roller turning"/);
  assert.match(out, /<textarea data-proposal-editor="true" aria-label="Description"[^>]*>Show \{\{ref:r1\}\} turning and compare it with \{\{ref:r2\}\}\.<\/textarea>/);
  assert.equal(out.match(/data-proposal-remove-reference=/g).length, 2);
  assert.match(out, /<button[^>]*data-proposal-discard/); assert.match(out, /<button[^>]*data-proposal-save="true" disabled=""/);
  assert.match(out, /<button[^>]*data-proposal-generate="true" disabled=""/, 'not while the form is open');
  assert.doesNotMatch(out, /data-proposal-edit=/);
  // not editable on Motion: its lists. Editable: title, description, references, duration.
  assert.doesNotMatch(out, /data-proposal-list=/);
  const view = proposalView(v3());
  assert.deepEqual(B.buildEdit(view, { title: view.title, description: view.description }, true), {});
  assert.deepEqual(B.buildEdit(view, { description: 'Show {{ref:r1}} spinning.', references: [CAD] }, true), { description: 'Show {{ref:r1}} spinning.', references: [CAD] });
  // an older proposal's plain description is escaped into the prompt grammar before it is sent
  const old = proposalView({ proposal_id: 'gp-0123456789abcdef', version: 1, command: 'motion', title: 'T', description: 'Use {braces}.', settings: { duration_seconds: 10, audio: false }, input: { request: '/motion x' } });
  assert.deepEqual(B.buildEdit(old, { description: 'Use {braces} and \\ more.' }, false), { description: 'Use \\{braces} and \\\\ more.' });
  // the Edit details button on a card that is not editing
  assert.match(html(), /<button[^>]*data-proposal-edit/);
  assert.doesNotMatch(html({ active: false }), /data-proposal-edit/, 'a superseded card is not editable');
});

test('Edit (conversational): one Edit button that hands the exact revision to the Chat; no form, no save, no Generate; text read only; the target is highlighted', () => {
  const out = html({ onEdit: () => {} });
  assert.match(out, /<button[^>]*data-proposal-edit="true"[^>]*>Edit<\/button>/);
  assert.doesNotMatch(out, /Edit details|data-proposal-save|data-proposal-discard|data-proposal-editor|<input data-proposal-title|data-proposal-remove-reference/, 'no inline editor in this flow');
  assert.match(out, /<select data-proposal-duration="true"/, 'direct settings stay on the card');
  assert.match(out, /<button[^>]*data-proposal-generate="true"(?! disabled)/, 'Generate is unchanged until a revision is published');
  const edits = [], saved = [], generated = [];
  const root = tree({ onEdit: x => edits.push(x), onSave: e => saved.push(e), onGenerate: x => generated.push(x) });
  find(root, n => n.props?.['data-proposal-edit']).props.onClick();
  assert.deepEqual(edits, [v3()], 'the exact proposal revision clicked');
  assert.deepEqual([saved.length, generated.length], [0, 0], 'Edit saves nothing and starts nothing');
  assert.doesNotMatch(html({ onEdit: () => {}, active: false }), /data-proposal-edit/, 'a superseded card is not a target');
  // The targeted card: the selection styling and its marker; the id and revision a pill reveals it by.
  const targeted = html({ onEdit: () => {}, targeted: true });
  assert.match(targeted, /<section[^>]*data-proposal-id="gp-0123456789abcdef" data-proposal-version="2" data-proposal-targeted="true"[^>]*class="[^"]*border-accent ring-1 ring-accent/);
  assert.doesNotMatch(out, /data-proposal-targeted|ring-1 ring-accent/);
  // Without onEdit (a command with no chat revision: a CAD brief, an image) the card keeps Edit details.
  assert.match(html(), /data-proposal-edit="true"[^>]*>Edit details</);
});

test('the Editing pill: Editing: title, a truncating title, a reachable x labelled Cancel editing this proposal; a click reveals, x cancels', () => {
  const target = { proposalId: 'gp-a', version: 3, title: 'Gravity on Earth and Moon, with a much longer title that has to truncate on a phone' };
  const out = B.renderToStaticMarkup(B.createElement(B.EditTargetPill, { target, onReveal: () => {}, onCancel: () => {} }));
  assert.match(out, /<li data-proposal-edit-target="gp-a" data-proposal-edit-version="3"[^>]*class="[^"]*max-w-full min-w-0[^"]*border-line[^"]*pr-0.5"/);
  assert.match(out, /<span class="shrink-0 text-ink-3">Editing:<\/span><span class="min-w-0 truncate">Gravity on Earth and Moon, with a much longer title/);
  assert.match(out, /<button type="button" data-proposal-edit-cancel="true" aria-label="Cancel editing this proposal"[^>]*class="flex h-5 w-5 shrink-0[^"]*"><svg/, 'the x never shrinks away');
  const calls = [];
  const root = B.EditTargetPill({ target, onReveal: () => calls.push('reveal'), onCancel: () => calls.push('cancel') });
  find(root, n => n.props?.['data-proposal-edit-reveal']).props.onClick();
  find(root, n => n.props?.['data-proposal-edit-cancel']).props.onClick();
  assert.deepEqual(calls, ['reveal', 'cancel']);
});

test('Explain declares presentation only: no duration or audio, its assumptions shown, Cancel only where supported and wired', () => {
  const explain = { proposal_id: 'gp-aaaaaaaaaaaaaaaa', version: 1, schema_version: 1, command: 'explain', title: 'Pendulum', description: 'One. Two. Three.', prompt: 'One. Two. Three.', settings: { presentation: 'steps' },
    input: { request: 'Explain a pendulum.', org: 'w', app: 'a', job: 'ej_1' }, original_request: 'Explain a pendulum.', references: [], assumptions: ['No friction.'], sig: `v3.${'0'.repeat(64)}` };
  const out = html({ proposal: explain });
  assert.match(out, /data-proposal-select="presentation"/);
  assert.deepEqual([...out.matchAll(/<option value="([a-z]+)"( selected="")?>([^<]+)</g)].map(m => [m[1], m[3]]), [['static', 'Static'], ['steps', 'Steps'], ['time', 'Over time'], ['experiment', 'Experiment']]);
  assert.match(out, /<option value="steps" selected="">/);
  assert.doesNotMatch(out, /data-proposal-duration|data-proposal-audio|Duration|Audio/);
  assert.match(text(out), /Assumptions No friction\./);
  assert.doesNotMatch(out, /data-proposal-cancel/, 'no handler, no Cancel');
  assert.match(html({ proposal: explain, onCancel: () => {} }), /data-proposal-cancel/);
  assert.doesNotMatch(html({ onCancel: () => {} }), /data-proposal-cancel/, 'Motion has no Cancel: an unanswered proposal starts nothing');
  assert.match(html({ proposal: explain }), /data-proposal-request/);
  assert.match(text(html({ proposal: explain })), /Explain a pendulum\./);
});

// Owner decision 2026-10-29: every /explain request shows this card before anything is authored. Heading, unchanged request,
// title, description, Presentation, assumptions and limitations apart, the cost note, Edit details and Generate; editing has Save and
// Discard and Generate waits for the saved revision.
test('Explain review card: Review explanation heading, the request unchanged, assumptions and limitations apart, the cost note, and the Edit/Save/Discard/Generate states', () => {
  const explain = { proposal_id: 'gp-cccccccccccccccc', version: 1, schema_version: 1, command: 'explain', title: 'Falling on Earth and the Moon', description: 'Compare an object falling on Earth and on the Moon, side by side.', prompt: 'Compare an object falling on Earth and on the Moon, side by side.',
    settings: { presentation: 'experiment' }, input: { request: 'why things fall slower on the Moon', org: 'w', app: 'a', job: 'ej_1' }, original_request: 'why things fall slower on the Moon', references: [],
    assumptions: ['Air resistance is ignored.'], limitations: ['One object at a time on each world.'], sig: `v3.${'0'.repeat(64)}` };
  const props = { proposal: explain, eyebrow: 'Review explanation', note: 'Preparing this plan used one model call.', onCancel: () => {} };
  const out = html(props), words = text(out);
  assert.match(out, /aria-label="Review explanation"/);
  assert.match(words, /Review explanation Falling on Earth and the Moon/);
  assert.match(out, /data-proposal-request[^>]*>[^]*why things fall slower on the Moon/);
  assert.match(words, /Assumptions Air resistance is ignored\./);
  assert.match(words, /Limitations One object at a time on each world\./);
  assert.doesNotMatch(words, /Not supported or not verified/, 'Explain titles its limitations plainly');
  assert.match(out, /data-proposal-note[^>]*>Preparing this plan used one model call\./);
  assert.match(out, /<button[^>]*data-proposal-edit[^>]*>Edit details</);
  assert.match(out, /<button[^>]*data-proposal-cancel/);
  assert.doesNotMatch(out, /<button[^>]*data-proposal-generate="true" disabled/, 'a saved valid revision can be generated');
  // Editing: title and description fields, the assumptions as a list, the limitations still read only; Save and Discard, Generate waits.
  const editing = html({ ...props, defaultEditing: true });
  assert.match(editing, /<input data-proposal-title="true" aria-label="Title"[^>]*value="Falling on Earth and the Moon"/);
  assert.match(editing, /<textarea data-proposal-editor="true" aria-label="Description"/);
  assert.match(editing, /data-proposal-list="assumptions"/);
  assert.doesNotMatch(editing, /data-proposal-list="limitations"/);
  assert.match(text(editing), /Limitations One object at a time on each world\./);
  assert.match(editing, /<button[^>]*data-proposal-discard[^>]*>Discard</);
  assert.match(editing, /<button[^>]*data-proposal-save="true" disabled=""[^>]*>Save</, 'nothing changed yet');
  assert.match(editing, /<button[^>]*data-proposal-generate="true" disabled=""/);
  assert.doesNotMatch(editing, /data-proposal-cancel|data-proposal-edit=/);
  // What Save sends: only the changed fields, no model call (the client PUTs them).
  const view = proposalView(explain);
  assert.deepEqual(B.buildEdit(view, { ...view, title: 'Falling, side by side', assumptions: ['No air.'] }, true), { title: 'Falling, side by side', assumptions: ['No air.'] });
});

test('a command with no settings draws no Settings section, no placeholder control and still confirms', () => {
  for (const command of ['video', '3d', 'flashcards']) {
    const out = html({ proposal: { proposal_id: 'gp-bbbbbbbbbbbbbbbb', version: 1, command, title: 'Rain', description: 'Rain falls.', settings: {}, input: { request: `/${command} rain` } } });
    assert.doesNotMatch(out, /data-proposal-settings|data-proposal-field|<select|Settings/, command);
    assert.match(out, /data-proposal-generate/);
  }
  // a command with no definition at all fails closed: the card draws nothing it can generate
  const unknown = html({ proposal: { proposal_id: 'gp-cccccccccccccccc', version: 1, command: 'made-up', title: 'X', description: 'Y.', settings: {}, input: { request: 'x' } } });
  assert.match(unknown, /data-proposal-generate="true" disabled=""/);
});

test('Generate image: only the selected model\'s options, an unquoted price blocks Generate, conflicts are named with their path', () => {
  const image = (settings, over = {}) => ({ proposal_id: 'gp-dddddddddddddddd', version: 1, schema_version: 1, command: 'generate-image', title: 'Sketch', description: 'A sketch.', prompt: 'A sketch.', settings,
    input: { request: '/generate-image sketch', org: 'w', app: 'a' }, original_request: '/generate-image sketch', references: [], sig: `v3.${'0'.repeat(64)}`, ...over });
  const fields = settings => [...html({ proposal: image(settings) }).matchAll(/data-proposal-select="([a-z_]+)"/g)].map(m => m[1]);
  assert.deepEqual(fields({}), ['model'], 'nothing else before a model is chosen');
  assert.deepEqual(fields({ model: 'gemini-3-pro-image' }), ['model', 'aspect_ratio', 'resolution']);
  assert.deepEqual(fields({ model: 'gpt-image-2.5-flare' }), ['model', 'quality', 'aspect_ratio', 'resolution']);
  const out = html({ proposal: image({ model: 'gpt-image-2.5-sunburst', quality: 'high' }) });
  assert.match(out, /<option value="gemini-nano-banana-2\.1">Nano Banana 2\.1</);
  assert.match(out, /<option value="high" selected="">High</);
  assert.match(out, /<option value="4K">4K \(experimental\)</);
  // no quote: said, never zero, Generate blocked
  assert.match(out, /data-proposal-usage-unknown[^>]*>Price not available yet</);
  assert.match(out, /<button[^>]*data-proposal-generate="true" disabled=""/);
  assert.match(text(out), /The price for these settings is not known yet/);
  // a quote and valid settings: enabled
  // Three numbers, each in its own line (owner 2026-10-26, as Motion): the estimate, the most it can cost, the temporary hold. An estimate alone blocks Generate.
  const priced = html({ proposal: image({ model: 'gemini-3-pro-image', aspect_ratio: '16:9' }, { usage: { estimate_credits: 14, max_credits: 20, reserve_credits: 30 } }) });
  assert.match(priced, /Estimated cost: 14 AI credits/); // owner 2026-10-23 wording (GenerationProposalCard.jsx)
  assert.match(priced, /data-proposal-max[^>]*>Most it can cost: 20 AI credits\. You are never charged more\./);
  assert.match(priced, /data-proposal-hold[^>]*>30 AI credits are held while it runs; whatever is not used is released\./);
  assert.doesNotMatch(priced, /<button[^>]*data-proposal-generate="true" disabled=""/);
  assert.doesNotMatch(text(priced), /\$|dollar|USD|cents/i, 'credits only');
  const unmaxed = html({ proposal: image({ model: 'gemini-3-pro-image', aspect_ratio: '16:9' }, { usage: { estimate_credits: 14 } }) });
  assert.match(unmaxed, /data-proposal-usage-unknown[^>]*>Price not available yet</);
  assert.doesNotMatch(unmaxed, /Estimated cost/); assert.doesNotMatch(unmaxed, /data-proposal-max/);
  assert.match(unmaxed, /<button[^>]*data-proposal-generate="true" disabled=""/);
  // the model changed under a quality it does not support: named, with its path, nothing silently dropped
  const conflict = html({ proposal: image({ model: 'gemini-3-pro-image', quality: 'high' }, { usage: { estimate_credits: 14, max_credits: 20, reserve_credits: 30 } }) });
  assert.match(conflict, /data-proposal-error-path="settings\.quality"[\s\S]*?settings\.quality is not supported by Nano Banana Pro/);
  assert.match(conflict, /<button[^>]*data-proposal-generate="true" disabled=""/);
});

test('a CAD brief view: units fixed, parameter values editable by the capability\'s own rules, lists shown, missing information blocks Generate', () => {
  const groups = { parameters: { defs: [{ id: 'width', label: 'Width', type: 'number', unit: 'mm', min: 5, max: 200, value: 40 }, { id: 'holes', label: 'Holes', type: 'count', min: 0, max: 8 }, { id: 'finish', label: 'Finish', type: 'choice', choices: [{ value: 'matte', label: 'Matte' }, { value: 'gloss', label: 'Gloss' }] }] } };
  const view = proposalView({ proposal_id: 'cad-job-1', version: 3, schema_version: 1, command: 'cad', title: 'Bracket', description: 'An L bracket.', settings: { units: 'mm', parameters: { width: 40, holes: 2, finish: 'matte' } },
    original_request: 'make a bracket', requirements: ['Wall 3 mm'], assumptions: ['Mild steel'], missing_information: ['Hole diameter?'], limitations: ['No threads'], references: [] });
  const out = B.renderToStaticMarkup(B.createElement(B.Card, { view, groups, groupProblem: (key, id, value) => (id === 'width' && value > 100 ? 'must be at most 100 mm' : ''), onGenerate: () => {}, onSave: async () => {} }));
  assert.match(out, /<select disabled="" data-proposal-select="units"/, 'units need a new brief');
  assert.match(out, /data-proposal-param="width"/); assert.match(out, /data-proposal-param-value="width"[^>]*value="40"/);
  assert.match(out, /<option value="gloss">Gloss</);
  assert.match(text(out), /Requirements Wall 3 mm/); assert.match(text(out), /Assumptions Mild steel/);
  assert.match(text(out), /Missing information Hole diameter\?/); assert.match(text(out), /Not supported or not verified No threads/);
  assert.match(out, /data-proposal-blocked/);
  assert.match(out, /<button[^>]*data-proposal-generate="true" disabled=""/);
  assert.match(out, /data-proposal-request/, 'the original request, unchanged');
  const ok = B.renderToStaticMarkup(B.createElement(B.Card, { view: proposalView({ ...view, missing_information: [] }), groups, onGenerate: () => {} }));
  assert.doesNotMatch(ok, /<button[^>]*data-proposal-generate="true" disabled=""/);
  assert.doesNotMatch(ok, /data-proposal-blocked/);
  const bad = B.renderToStaticMarkup(B.createElement(B.Card, { view, groups, groupProblem: (key, id, value) => 'must be a number', onGenerate: () => {} }));
  assert.match(bad, /<span role="alert"[^>]*>Width must be a number\./);
});

test('one layout in both themes and on narrow screens: semantic tokens only, wrapping rows, native controls, no ellipsis', () => {
  const source = readFileSync(new URL('./GenerationProposalCard.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source.replace(/\/\/.*$/gm, ''), /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\(/, 'colours come from tokens, so both themes follow');
  const out = html({ states: [{ id: 'r1', state: 'changed', message: 'CAD · Roller assembly changed after you attached it. Review the prompt, then attach it again.' }] });
  assert.match(out, /max-w-xl min-w-0/); assert.match(out, /flex flex-wrap items-center gap-3/);
  assert.doesNotMatch(out, /onclick|role="button"|<div[^>]*tabindex/i, 'every control is a native button, select, input or textarea: keyboard and touch');
  assert.match(out, /text-fail/, 'the error colour has a dark-theme value');
  for (const markup of [out, html({ defaultEditing: true }), html({ proposal: v3({ usage: { estimate_credits: null } }) })]) assert.doesNotMatch(text(markup), /\.\.\.|…/);
});
