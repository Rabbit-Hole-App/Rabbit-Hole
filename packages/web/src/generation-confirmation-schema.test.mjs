// UI-15.1: the canonical generation-confirmation schema. Pure data and common field validation; fail-closed review policy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SLASH, MATERIAL_TOOLS } from './agent/slash.js';
import {
  ACTIONS, FIELD_TYPES, GENERATION_COMMANDS, PROPOSAL_EDITABLE, REVIEW_POLICIES, SCHEMA_VERSION, SECTIONS, STATUSES, allowedActions, changedKeys, commandDefinition, fieldProblem,
  firstReadOnly, isAvailable, isEditable, IMAGE_MODELS, fieldsFor, imageSize, referenceProblems, referenceRules, settingsProblems, proposalView, reviewFor, reviewPolicyOf, settingsOf, validateSettings, visibleSections,
} from './generation-confirmation-schema.js';

test('the schema file is dependency free: no React, no provider, no network, no import at all', () => {
  const source = readFileSync(new URL('./generation-confirmation-schema.js', import.meta.url), 'utf8');
  assert.deepEqual(source.match(/^\s*import\b.*$/gm) || [], [], 'no import statements');
  assert.doesNotMatch(source, /require\(|import\(|\bfetch\(|XMLHttpRequest|\bnew Request\b|crypto\.subtle|from ['"](react|@anthropic)/);
});

test('every generation command in the registry has a definition, and an unknown one fails closed', () => {
  const generators = [...SLASH, ...MATERIAL_TOOLS].filter(c => c.kind === 'generate').map(c => c.name);
  assert.ok(generators.includes('motion') && generators.includes('cad') && generators.includes('generate-image') && generators.includes('explain'));
  for (const name of generators) assert.ok(commandDefinition(name), `${name} has a confirmation definition`);
  assert.equal(commandDefinition('made-up'), null);
  assert.equal(commandDefinition('constructor'), null, 'inherited keys are not commands');
  assert.equal(reviewPolicyOf('made-up'), 'always');
  assert.deepEqual(reviewFor('made-up', { required: false, reasons: [] }), { required: true, reasons: ['policy'] }, 'a decision cannot switch off an unknown command');
  assert.deepEqual(reviewFor('motion', { required: false }), { required: true, reasons: ['policy'] }, 'nor an always policy');
  assert.deepEqual(reviewFor('flashcards'), { required: false, reasons: [] });
  assert.deepEqual(reviewFor('explain', { required: false, reasons: [] }), { required: false, reasons: [] }, 'conditional: the server decides');
  assert.deepEqual(reviewFor('explain', { required: true, reasons: ['assumptions'] }), { required: true, reasons: ['assumptions'] });
  assert.deepEqual(reviewFor('explain'), { required: true, reasons: ['undecided'] }, 'conditional with no decision is required');
  assert.deepEqual(reviewFor('cad', {}), { required: true, reasons: ['undecided'] });
  assert.equal(validateSettings('made-up', {}).error, 'These settings cannot be changed here.');
});

test('definitions are well formed: types, policies, sections, editable keys and option lists', () => {
  assert.equal(SCHEMA_VERSION, 1);
  for (const [name, def] of Object.entries(GENERATION_COMMANDS)) {
    assert.ok(REVIEW_POLICIES.includes(def.review_policy), name);
    assert.ok(def.sections.every(s => SECTIONS.includes(s)), `${name} sections`);
    const keys = def.settings.map(f => f.key);
    assert.equal(new Set(keys).size, keys.length, `${name} setting keys are unique`);
    for (const f of def.settings) {
      assert.ok(FIELD_TYPES.includes(f.type), `${name}.${f.key} type`);
      assert.equal(typeof f.required, 'boolean'); assert.equal(typeof f.editable, 'boolean');
      assert.ok(f.label && !/\.\.\.|…/.test(f.label), `${name}.${f.key} label`);
      if (f.type === 'select' && f.options) assert.ok(f.options.length > 0 && f.options.every(o => o.label && o.value !== undefined));
      if (f.available === false) assert.ok(f.unavailable_reason, `${name}.${f.key} says why it is disabled`);
    }
    // an editable setting is listed in editable_fields, a read-only one never is; proposal-level keys come from the fixed set
    for (const key of def.editable_fields) assert.ok(PROPOSAL_EDITABLE.includes(key) || keys.includes(key), `${name} edits ${key}`);
    for (const f of def.settings) assert.equal(def.editable_fields.includes(f.key) && f.available !== false, f.editable && f.available !== false && def.editable_fields.includes(f.key), `${name}.${f.key}`);
    for (const f of def.settings.filter(f => !f.editable)) assert.ok(!def.editable_fields.includes(f.key), `${name}.${f.key} is read-only`);
    assert.ok(STATUSES.length && ACTIONS.length);
  }
  assert.deepEqual(Object.values(GENERATION_COMMANDS).filter(d => d.review_policy === 'none').every(d => d.settings.length === 0 && d.editable_fields.length === 0), true, 'no-review commands declare no fields');
});

test('Motion: aspect ratio, a duration select of exactly 5 to 60 in fives, audio disabled', () => {
  const fields = settingsOf('motion');
  assert.deepEqual(fields.map(f => f.key), ['aspect_ratio', 'duration_seconds', 'audio']);
  const duration = fields.find(f => f.key === 'duration_seconds');
  assert.equal(duration.type, 'select'); assert.equal(duration.unit, 'seconds');
  assert.deepEqual(duration.options.map(o => o.value), [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
  assert.equal(duration.options[0].label, '5 seconds');
  const audio = fields.find(f => f.key === 'audio');
  assert.deepEqual([audio.available, audio.unavailable_reason], [false, 'Narration coming soon']);
  assert.equal(fields.find(f => f.key === 'aspect_ratio').available, false, 'disabled until the renderer reports what it supports');
  assert.equal(isAvailable(audio), false); assert.equal(isAvailable(duration), true);
  assert.deepEqual([isEditable('motion', 'duration_seconds'), isEditable('motion', 'audio'), isEditable('motion', 'title'), isEditable('motion', 'original_request')], [true, false, true, false]);
});

test('validateSettings: Motion values, defaults, unavailable fields and unknown keys', () => {
  assert.deepEqual(validateSettings('motion', { duration_seconds: 10, audio: false }).value, { duration_seconds: 10, audio: false });
  assert.deepEqual(validateSettings('motion', { duration_seconds: 60 }).value, { duration_seconds: 60, audio: false }, 'audio takes its default');
  for (const [values, why] of [
    [{ duration_seconds: 10, audio: true }, /narration audio is not available yet/], [{ duration_seconds: 4 }, /5 to 60/], [{ duration_seconds: 65 }, /5 to 60/], [{ duration_seconds: 12 }, /in steps of 5/],
    [{ duration_seconds: 12.5 }, /whole number/], [{ duration_seconds: '10' }, /whole number/], [{}, /duration_seconds is required/], [{ duration_seconds: 10, voice: 'x' }, /settings.voice is not a Motion setting/],
    [{ duration_seconds: 10, aspect_ratio: '9:16' }, /aspect_ratio is not available yet/], [[], /settings must be/], [undefined, /settings must be/],
  ]) assert.match(validateSettings('motion', values).error, why, JSON.stringify(values));
  assert.equal(validateSettings('motion', { duration_seconds: 4 }).path, 'settings.duration_seconds');
});

test('validateSettings: Explain has presentation only, and a command with no settings accepts none', () => {
  assert.deepEqual(settingsOf('explain').map(f => f.key), ['presentation']);
  assert.deepEqual(validateSettings('explain', undefined).value, {});
  assert.deepEqual(validateSettings('explain', {}).value, {});
  assert.deepEqual(validateSettings('explain', { presentation: 'steps' }).value, { presentation: 'steps' });
  assert.match(validateSettings('explain', { presentation: 'video' }).error, /settings.presentation must be static, steps, time or experiment/);
  assert.match(validateSettings('explain', { duration_seconds: 10 }).error, /not an explanation setting/);
  assert.match(validateSettings('explain', { audio: false }).error, /not an explanation setting/);
  assert.deepEqual(settingsOf('video'), []); assert.deepEqual(validateSettings('video', undefined).value, {});
  assert.match(validateSettings('video', { duration_seconds: 5 }).error, /is not a setting of this command/);
  assert.deepEqual(settingsOf('made-up'), []);
});

test('validateSettings: CAD units are fixed and parameters are judged by the CAD capability', () => {
  const cad = settingsOf('cad');
  assert.deepEqual(cad.map(f => [f.key, f.type, f.editable]), [['units', 'select', false], ['parameters', 'parameter_group', true]]);
  assert.ok(validateSettings('cad', { units: 'mm' }).value);
  assert.match(validateSettings('cad', { units: 'yards' }).error, /units must be mm, cm, m or in/);
  const calls = [];
  const ok = validateSettings('cad', { units: 'mm', parameters: { width: 40 } }, { groups: { 'cad-parameters': v => { calls.push(v); return null; } } });
  assert.deepEqual([ok.value.parameters, calls], [{ width: 40 }, [{ width: 40 }]]);
  assert.equal(validateSettings('cad', { parameters: {} }, { groups: { 'cad-parameters': () => 'settings.parameters.width must be at least 5 mm' } }).error, 'settings.parameters.width must be at least 5 mm');
});

test('fieldProblem covers each field type', () => {
  const f = (type, rest = {}) => ({ key: 'k', label: 'K', type, required: false, editable: true, ...rest });
  assert.equal(fieldProblem(f('boolean'), 'yes'), 'settings.k must be on or off');
  assert.equal(fieldProblem(f('number', { min: 1, max: 2, unit: 'mm' }), 2.5), 'settings.k must be at most 2 mm');
  assert.equal(fieldProblem(f('number', { min: 0, step: 0.5 }), 0.75), 'settings.k must be in steps of 0.5');
  assert.equal(fieldProblem(f('number'), Infinity), 'settings.k must be a number');
  assert.equal(fieldProblem(f('integer', { min: 1 }), 0), 'settings.k must be at least 1');
  assert.equal(fieldProblem(f('text', { max_length: 3 }), 'abcd'), 'settings.k must be text of at most 3 characters');
  assert.equal(fieldProblem(f('textarea'), 'long text'), null);
  assert.match(fieldProblem(f('string_list'), ['a', ' ']), /short list/);
  assert.equal(fieldProblem(f('string_list'), ['a', 'b']), null);
  assert.equal(fieldProblem(f('select', { options: [{ value: 'a', label: 'A' }] }), 'a'), null);
  assert.equal(fieldProblem(f('select', { options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }), 'c'), 'settings.k must be a or b');
  assert.equal(fieldProblem(f('text'), undefined), null);
  assert.equal(fieldProblem(f('text', { required: true }), null), 'settings.k is required');
  assert.equal(fieldProblem(f('mystery'), 'x'), 'settings.k has an unknown type');
});

test('a proposal view: logical fields, hidden empty sections, actions follow validity and missing information', () => {
  const p = { proposal_id: 'gp-0123456789abcdef', version: 3, command: 'motion', title: 'Water', description: 'plain', prompt: 'See {{ref:r1}}.', settings: { duration_seconds: 10, audio: false },
    input: { request: '/motion water' }, references: [{ id: 'r1', label: 'Card · A', kind: 'card', sourceId: 'card:a', revision: 'v1', range: null }], usage: { estimate_credits: 40 } };
  const view = proposalView(p);
  assert.deepEqual([view.schema_version, view.revision, view.original_request, view.description, view.status], [1, 3, '/motion water', 'See {{ref:r1}}.', 'awaiting_review']);
  assert.deepEqual([view.requirements, view.assumptions, view.missing_information, view.limitations, view.validation_errors], [[], [], [], [], []]);
  assert.deepEqual(view.review, { required: true, reasons: ['policy'] });
  assert.deepEqual(view.usage, { estimate_credits: 40 });
  assert.deepEqual(visibleSections(view), ['references', 'usage'], 'empty optional sections are hidden');
  assert.deepEqual(view.allowed_actions, ['edit', 'save', 'generate'], 'Motion has no Cancel');
  const noUsage = proposalView({ ...p, usage: { estimate_credits: null }, references: [] });
  assert.deepEqual(visibleSections(noUsage), []);
  const cad = commandDefinition('cad');
  assert.deepEqual(allowedActions(cad, { missing_information: ['Width?'] }), ['edit', 'save', 'cancel'], 'missing information disables Generate');
  assert.deepEqual(allowedActions(cad, { validation_errors: [{ path: 'settings.parameters', message: 'x' }] }), ['edit', 'save', 'cancel']);
  assert.deepEqual(allowedActions(cad, { status: 'needs_input' }), ['edit', 'save', 'cancel'], 'needs input: no Generate');
  for (const status of ['preparing', 'generating', 'completed', 'failed', 'cancelled', 'superseded', 'expired']) assert.deepEqual(allowedActions(cad, { status }), [], status);
  assert.deepEqual(allowedActions(null, {}), [], 'no definition, no action');
  assert.deepEqual(allowedActions(commandDefinition('flashcards'), {}), ['generate', 'cancel'], 'a command with nothing editable still generates');
  const cadView = proposalView({ ...p, command: 'cad', missing_information: ['Width?'], assumptions: ['Mild steel'], references: [] });
  assert.deepEqual(visibleSections(cadView), ['assumptions', 'missing_information', 'usage']);
});

test('unsaved edits stay apart from the accepted revision; read-only keys are named', () => {
  const saved = { title: 'T', description: 'D', settings: { duration_seconds: 10, audio: false }, references: [] };
  assert.deepEqual(changedKeys(saved, {}), []);
  assert.deepEqual(changedKeys(saved, { description: 'D', settings: { duration_seconds: 10 } }), []);
  assert.deepEqual(changedKeys(saved, { description: 'E', settings: { duration_seconds: 20 } }), ['description', 'duration_seconds']);
  assert.equal(firstReadOnly('motion', ['description', 'duration_seconds']), null);
  assert.equal(firstReadOnly('motion', ['description', 'audio']), 'audio');
  assert.equal(firstReadOnly('cad', ['units']), 'units', 'CAD units need a new brief');
  assert.equal(firstReadOnly('made-up', ['title']), 'title', 'an unknown command edits nothing');
});

test('generate-image: four models, and only the options the selected model supports (owner 2026-10-23)', () => {
  assert.deepEqual(Object.keys(IMAGE_MODELS), ['gpt-image-2.5-sunburst', 'gpt-image-2.5-flare', 'gemini-nano-banana-2.1', 'gemini-3-pro-image']);
  const model = settingsOf('generate-image').find(f => f.key === 'model');
  assert.deepEqual(model.options.map(o => [o.value, o.label]), [['gpt-image-2.5-sunburst', 'GPT Image 2.5 Sunburst'], ['gpt-image-2.5-flare', 'GPT Image 2.5 Flare'], ['gemini-nano-banana-2.1', 'Nano Banana 2.1'], ['gemini-3-pro-image', 'Nano Banana Pro']]);
  assert.equal(model.required, true); assert.equal(model.default, undefined, 'no model is chosen or substituted for the person');
  assert.equal(GENERATION_COMMANDS['generate-image'].flag, 'IMAGE_GENERATION');
  assert.deepEqual(fieldsFor('generate-image', {}).map(f => f.key), ['model'], 'nothing else is offered before a model is chosen');
  const keys = id => fieldsFor('generate-image', { model: id }).map(f => f.key);
  assert.deepEqual(keys('gpt-image-2.5-flare'), ['model', 'quality', 'aspect_ratio', 'resolution']);
  assert.deepEqual(keys('gemini-3-pro-image'), ['model', 'aspect_ratio', 'resolution'], 'Google models have no quality');
  const options = (id, key) => fieldsFor('generate-image', { model: id }).find(f => f.key === key).options.map(o => o.value);
  assert.deepEqual(options('gpt-image-2.5-sunburst', 'quality'), ['auto', 'low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(options('gemini-nano-banana-2.1', 'aspect_ratio').length, 14);
  assert.equal(options('gemini-3-pro-image', 'aspect_ratio').length, 10);
  assert.ok(options('gemini-nano-banana-2.1', 'aspect_ratio').includes('8:1') && !options('gemini-3-pro-image', 'aspect_ratio').includes('8:1'));
  assert.deepEqual(options('gemini-3-pro-image', 'resolution'), ['1K', '2K', '4K']);
  assert.deepEqual(options('gpt-image-2.5-flare', 'aspect_ratio'), ['1:1', '3:2', '2:3', '16:9', '9:16']);
  assert.equal(settingsOf('generate-image').find(f => f.key === 'resolution').by_model['gpt-image-2.5-flare'].find(o => o.value === '4K').label, '4K (experimental)');
  assert.equal(isAvailable(settingsOf('generate-image').find(f => f.key === 'quality'), {}, { model: 'gemini-3-pro-image' }), false);
  assert.equal(isAvailable(settingsOf('generate-image').find(f => f.key === 'quality'), {}, { model: 'gpt-image-2.5-flare' }), true);
});

test('generate-image: changing the model revalidates, names every conflict with a path and discards nothing', () => {
  const ok = validateSettings('generate-image', { model: 'gpt-image-2.5-flare', quality: 'high', aspect_ratio: '16:9', resolution: '2K' });
  assert.deepEqual(ok.value, { model: 'gpt-image-2.5-flare', quality: 'high', aspect_ratio: '16:9', resolution: '2K' });
  assert.equal(imageSize(ok.value), '2048x1152');
  assert.equal(imageSize({ model: 'gpt-image-2.5-flare', aspect_ratio: '3:2' }), '1536x1024', 'aspect only: the smallest listed resolution');
  assert.equal(imageSize({ model: 'gemini-3-pro-image', aspect_ratio: '16:9' }), null);
  // the same settings moved to a Google model: quality is named, not dropped
  const moved = settingsProblems('generate-image', { ...ok.value, model: 'gemini-3-pro-image' });
  assert.deepEqual(moved, [{ path: 'settings.quality', message: 'settings.quality is not supported by Nano Banana Pro' }]);
  assert.equal(validateSettings('generate-image', { ...ok.value, model: 'gemini-3-pro-image' }).error, moved[0].message, 'validation refuses instead of changing the value');
  // a ratio the new model lacks
  assert.deepEqual(settingsProblems('generate-image', { model: 'gemini-3-pro-image', aspect_ratio: '8:1' }).map(p => p.path), ['settings.aspect_ratio']);
  assert.match(settingsProblems('generate-image', { model: 'gemini-3-pro-image', aspect_ratio: '8:1' })[0].message, /must be 1:1, 2:3/);
  // an OpenAI pair the sizes table does not list
  assert.deepEqual(settingsProblems('generate-image', { model: 'gpt-image-2.5-sunburst', aspect_ratio: '3:2', resolution: '4K' }), [{ path: 'settings.resolution', message: 'GPT Image 2.5 Sunburst makes 3:2 at 1K, not 4K.' }]);
  // no silent substitution of a missing or unknown model
  assert.match(validateSettings('generate-image', {}).error, /settings.model is required/);
  assert.match(validateSettings('generate-image', { model: 'gpt-image-1' }).error, /settings.model must be gpt-image-2.5-sunburst, gpt-image-2.5-flare, gemini-nano-banana-2.1 or gemini-3-pro-image/);
  assert.match(validateSettings('generate-image', { model: 'gemini-3-pro-image', size: '1024x1024' }).error, /settings.size is not an image setting/);
});

test('generate-image: references are limited and typed per model, never truncated; an unpriced option blocks Generate', () => {
  const ref = (i, kind = 'image') => ({ id: `r${i}`, label: `Image · ${i}`, kind, sourceId: `image:${i}`, revision: 'v1', range: null });
  const many = n => Array.from({ length: n }, (_, i) => ref(i + 1));
  assert.deepEqual(referenceRules('generate-image', { model: 'gemini-3-pro-image' }), { max: 14, kinds: ['image', 'file'], verified: true, model: 'Nano Banana Pro' });
  assert.deepEqual(referenceRules('generate-image', { model: 'gpt-image-2.5-flare' }).max, 4);
  assert.equal(referenceRules('generate-image', { model: 'gpt-image-2.5-flare' }).verified, false, 'the OpenAI maximum is unconfirmed and reported as such');
  assert.equal(referenceRules('motion', {}), null);
  assert.deepEqual(referenceProblems('generate-image', { model: 'gemini-3-pro-image' }, many(14)), []);
  assert.deepEqual(referenceProblems('generate-image', { model: 'gemini-3-pro-image' }, many(15)), [{ path: 'references', message: 'Nano Banana Pro takes at most 14 reference images; remove 1.' }]);
  assert.equal(referenceProblems('generate-image', { model: 'gpt-image-2.5-sunburst' }, many(5)).length, 1);
  assert.deepEqual(referenceProblems('generate-image', { model: 'gemini-3-pro-image' }, [ref(1), ref(2, 'doc')]).map(p => p.path), ['references[1]']);
  assert.match(referenceProblems('generate-image', {}, many(1))[0].message, /Choose a model/);
  assert.deepEqual(referenceProblems('motion', {}, many(30)), [], 'a command without rules has none');
  // switching to a model that takes fewer references names the excess
  assert.equal(settingsProblems('generate-image', { model: 'gpt-image-2.5-flare' }, { references: many(6) })[0].path, 'references');
  // the server quote: none, unknown, never zero
  const base = { proposal_id: 'gp-0123456789abcdef', version: 2, schema_version: 1, command: 'generate-image', title: 'T', prompt: 'Draw it.', settings: { model: 'gemini-3-pro-image', aspect_ratio: '16:9' }, references: [], original_request: 'draw' };
  const unpriced = proposalView(base);
  assert.deepEqual(unpriced.usage, { estimate_credits: null, unknown: true });
  assert.ok(unpriced.validation_errors.some(e => e.path === 'usage'));
  assert.ok(!unpriced.allowed_actions.includes('generate'), 'no quote, no Generate');
  assert.ok(unpriced.allowed_actions.includes('save') && unpriced.allowed_actions.includes('cancel'));
  const priced = proposalView({ ...base, usage: { estimate_credits: 14 } }, { quote_id: 'q1', quote_expires_at: '2026-10-23T22:00:00Z' });
  assert.deepEqual(priced.usage, { estimate_credits: 14, quote_id: 'q1', expires_at: '2026-10-23T22:00:00Z' });
  assert.deepEqual(priced.allowed_actions, ['edit', 'save', 'generate', 'cancel']);
  assert.ok(!proposalView({ ...base, usage: { estimate_credits: 14 }, settings: { model: 'gemini-3-pro-image', quality: 'high' } }).allowed_actions.includes('generate'), 'a conflict blocks Generate');
  assert.equal(proposalView({ ...base, usage: { estimate_credits: 0 } }).allowed_actions.includes('generate'), true, 'a quoted zero is a quote; only a missing one blocks');
});
