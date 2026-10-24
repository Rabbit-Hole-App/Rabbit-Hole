// UI-15.1: the CAD design brief through the shared confirmation card. cad-review-view.js (pure) builds the card's view from the job and the
// job's brief edit from the card's; the brief's own data attributes stay on the shared elements, so cad-controls-check keeps its selectors.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { COST_NOTE, NO_INTERPRETATION, briefEdit, briefEditOf, cadAttrs, cadReviewView, formOf, inputsOf } from './cad-review-view.js';

const dir = mkdtempSync(join(tmpdir(), 'cad-review-')), outfile = join(dir, 'card.cjs');
await esbuild.build({
  stdin: { contents: "export { default as Card } from './GenerationProposalCard.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'js' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const WIDTH = { id: 'width', label: 'Width', role: 'input', type: 'length', unit: 'mm', value: 40, min: 5, max: 200, assumed: true };
const HOLES = { id: 'holes', label: 'Holes', role: 'input', type: 'count', value: 2, min: 0, max: 8 };
const FINISH = { id: 'finish', label: 'Finish', role: 'input', type: 'choice', value: 'matte', choices: [{ value: 'matte', label: 'Matte' }, { value: 'gloss', label: 'Gloss' }] };
const AREA = { id: 'area', label: 'Area', role: 'output', type: 'number', unit: 'mm2', value: 800 };
const job = (over = {}, brief = {}) => ({ id: 'job-1', request: 'make an L bracket', briefHash: 'h-1', state: 'awaiting_approval',
  brief: { title: 'L bracket', object: 'An L-shaped bracket.', units: 'mm', requirements: ['Wall 3 mm'], assumptions: ['Mild steel'], missing: [], unsupported: ['Threads'], contextUsed: ['Sketch card'], controls: { schema: 'cad-params/1', parameters: [WIDTH, HOLES, FINISH, AREA], constraints: [] }, ...brief }, ...over });
const card = (j, props = {}) => { const v = cadReviewView(j); return B.renderToStaticMarkup(B.createElement(B.Card, { view: v.view, groups: v.groups, groupProblem: v.groupProblem, extraSections: v.extraSections, settingsMode: 'form', eyebrow: 'Review design', requestLabel: 'Original request', note: COST_NOTE,
  attrs: cadAttrs(j), compact: true, isolate: true, onGenerate: () => {}, onSave: async () => {}, onCancel: () => {}, ...props })); };
const text = out => out.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('the brief is the card\'s view: hash as revision, units and parameter values as settings, lists under their schema names', () => {
  const { view, groups, extraSections } = cadReviewView(job());
  assert.deepEqual([view.command, view.revision, view.proposal_id, view.title, view.description, view.original_request], ['cad', 'h-1', 'job-1', 'L bracket', 'An L-shaped bracket.', 'make an L bracket']);
  assert.deepEqual(view.settings, { units: 'mm', parameters: { width: 40, holes: 2, finish: 'matte' } }, 'inputs only; an output is not editable');
  assert.deepEqual([view.requirements, view.assumptions, view.missing_information, view.limitations, view.references], [['Wall 3 mm'], ['Mild steel'], [], ['Threads'], []]);
  assert.deepEqual(view.review, { required: true, reasons: ['brief'] });
  assert.deepEqual(view.allowed_actions, ['edit', 'save', 'generate', 'cancel']);
  assert.deepEqual(groups.parameters.defs.map(d => [d.id, d.display, d.tag]), [['width', '40 mm', 'Assumed'], ['holes', '2', 'Requested'], ['finish', 'matte', 'Requested']]);
  assert.equal(groups.parameters.legend, 'Parameters (mm)');
  assert.deepEqual(extraSections, [{ key: 'contextUsed', title: 'Context used', items: ['Sketch card'] }]);
  assert.equal(cadReviewView(job({}, { object: '', units: undefined })).groups.parameters.legend, 'Parameters (units not set)');
  assert.equal(cadReviewView(job({}, { object: '' })).view.description, NO_INTERPRETATION);
  // missing information blocks Generate
  assert.deepEqual(cadReviewView(job({}, { missing: ['Hole diameter?'] })).view.allowed_actions, ['edit', 'save', 'cancel']);
  assert.deepEqual(inputsOf(job().brief).map(p => p.id), ['width', 'holes', 'finish']);
});

test('the review keeps every data attribute the existing check selects, on the shared elements', () => {
  const out = card(job({}, { missing: ['Units of the screw size were not given'] }));
  assert.match(out, /data-cad-review="job-1"/); assert.match(out, /data-brief-hash="h-1"/);
  assert.match(out, /aria-label="Review design"/); assert.match(out, /role="group"/);
  assert.match(out, /<span[^>]*data-cad-review-request[^>]*>make an L bracket<\/span>/, 'the original request, exactly');
  assert.match(text(out), /Original request/);
  assert.match(out, /<p[^>]*data-cad-review-object/);
  assert.match(out, /<ul[^>]*data-cad-review-list="assumptions"/); assert.match(out, /<ul[^>]*data-cad-review-list="requirements"/);
  assert.match(out, /<ul[^>]*data-cad-review-list="missing"/); assert.match(out, /<ul[^>]*data-cad-review-list="unsupported"/); assert.match(out, /<ul[^>]*data-cad-review-list="contextUsed"/);
  assert.match(text(out), /Not supported or not verified Threads/); assert.match(text(out), /Context used Sketch card/);
  assert.match(out, /data-cad-review-param="width"[\s\S]*?40 mm[\s\S]*?Assumed/);
  assert.match(out, /data-cad-review-param="holes"[\s\S]*?Requested/);
  assert.doesNotMatch(out, /data-cad-review-param="area"/, 'an output is not listed as an input');
  assert.match(out, /<button[^>]*data-cad-review-generate[^>]*disabled=""/, 'missing information blocks Generate');
  assert.match(out, /data-cad-review-blocked/); assert.match(out, /data-cad-review-cost/); assert.match(text(out), /Editing details makes no call/);
  assert.match(out, /data-cad-review-cancel/); assert.match(out, /data-cad-review-edit/);
  assert.doesNotMatch(out, /data-cad-review-save|data-cad-review-value/, 'read-only until Edit details');
  assert.doesNotMatch(card(job()), /<button[^>]*data-cad-review-generate[^>]*disabled=""/);
});

test('Edit details: the object, the lists and the parameter values are fields; units are not; Save waits for a change', () => {
  const out = card(job(), { defaultEditing: true });
  assert.match(out, /<textarea[^>]*data-cad-review-field="object"/);
  for (const key of ['requirements', 'assumptions', 'missing', 'unsupported']) assert.match(out, new RegExp(`<textarea[^>]*data-cad-review-field="${key}"`), key);
  assert.match(out, /data-cad-review-value="width"[^>]*value="40"/); assert.match(out, /data-cad-review-value="holes"[^>]*value="2"/); assert.match(out, /<select[^>]*data-cad-review-value="finish"/);
  assert.doesNotMatch(out, /data-proposal-select="units"/, 'a unit change needs a new brief');
  assert.match(out, /<button[^>]*data-cad-review-save[^>]*disabled=""/); assert.match(out, /data-cad-review-discard-edit/);
  assert.match(out, /<button[^>]*data-cad-review-generate[^>]*disabled=""/, 'not while the form is open');
  // an out-of-range value is said beside its field and blocks Save
  const bad = card(job(), { defaultEditing: true, groupProblem: (key, id, value) => (id === 'width' ? 'must be at least 5 mm' : '') });
  assert.match(bad, /<span role="alert"[^>]*>Width must be at least 5 mm\./);
});

test('the card\'s edit becomes the job\'s brief edit: changed fields only, a set value is no longer assumed, the structure is untouched', () => {
  const brief = job().brief;
  assert.deepEqual(briefEditOf(brief, {}), {});
  assert.deepEqual(briefEditOf(brief, { description: 'An L-shaped bracket.', requirements: ['Wall 3 mm'] }), {}, 'unchanged values make no edit');
  assert.deepEqual(briefEditOf(brief, { description: NO_INTERPRETATION }), {}, 'the fallback line is not an interpretation');
  assert.deepEqual(briefEditOf(brief, { description: 'A bent plate.', assumptions: ['Aluminium'], missing_information: ['Gauge?'], limitations: [] }), { object: 'A bent plate.', assumptions: ['Aluminium'], missing: ['Gauge?'], unsupported: [] });
  const edited = briefEditOf(brief, { settings: { parameters: { width: 41, holes: 2, finish: 'matte' } } });
  assert.deepEqual(Object.keys(edited), ['controls']);
  const width = edited.controls.parameters.find(p => p.id === 'width'), holes = edited.controls.parameters.find(p => p.id === 'holes');
  assert.deepEqual([width.value, width.assumed], [41, undefined], 'a value the person set is no longer the brief\'s assumption');
  assert.deepEqual([holes.value, edited.controls.parameters.map(p => p.id)], [2, ['width', 'holes', 'finish', 'area']], 'the parameter list and outputs are kept');
  assert.equal(edited.controls.schema, 'cad-params/1');
  assert.deepEqual(briefEdit(brief, { ...formOf(brief), object: 'X' }), { object: 'X' });
});

test('the attribute map names only the review\'s own slots', () => {
  const a = cadAttrs(job());
  assert.deepEqual(a('root'), { 'data-cad-review': 'job-1', 'data-brief-hash': 'h-1' });
  assert.deepEqual(a('list', 'missing_information'), { 'data-cad-review-list': 'missing' });
  assert.deepEqual(a('list', 'contextUsed'), { 'data-cad-review-list': 'contextUsed' });
  assert.deepEqual(a('field', 'description'), { 'data-cad-review-field': 'object' });
  assert.deepEqual(a('field', 'limitations'), { 'data-cad-review-field': 'unsupported' });
  assert.deepEqual(a('value', 'width'), { 'data-cad-review-value': 'width' });
  assert.deepEqual(a('nothing'), {});
});
