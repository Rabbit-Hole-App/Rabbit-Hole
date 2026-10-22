import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTRACT_NAMES, EXPLAIN_CONTRACT_VERSION, canonicalJson, validateContract } from './explain-contract.js';

const v = EXPLAIN_CONTRACT_VERSION;
const H = 'sha256-0123456789abcdef';
const role = { provider: 'anthropic', model: 'claude-opus-5-5', maxTokens: 8000, toolChoice: 'auto' };

// One valid minimal object per contract. Each rejection below mutates one of these.
export const MINIMAL = {
  VisualSpec: {
    version: v, id: 'pendulum', title: 'Pendulum period',
    components: [{ id: 'law', component: 'callout', version: 1, params: { text: 'Period' } }, { id: 'parts', component: 'legend', version: 1 }],
    connections: [{ from: 'law.out', to: 'parts.in' }],
    presentation: { mode: 'static' },
  },
  ComponentDefinition: {
    name: 'callout', version: 1, description: 'A boxed takeaway.',
    params: { text: { type: 'label', required: true } },
    hints: { width: { type: 'number', unit: 'px', min: 120, max: 480, default: 240 } },
    repairWritable: ['width'], anchors: ['in', 'out'], compile: () => ({ objects: [] }),
  },
  LabelContent: { runs: [{ kind: 'text', text: 'Period ' }, { kind: 'math', tex: 'T = 2\\pi\\sqrt{L/g}' }] },
  CompiledVisual: {
    version: v, specHash: H, scene: { id: 'pendulum', duration: 1, objects: [], timeline: [] },
    counts: { authored: 2, compiled: 5, perPart: [5], renderWork: 5 },
    componentVersions: { callout: 1 }, objectMap: { 'law-box': { component: 'law', anchor: 'out' } },
    coverage: { states: 1, timeCheckpoints: [0], complete: true },
  },
  ExplanationPresentation: { mode: 'steps', steps: [{ id: 'one', title: 'Project' }, { id: 'two', title: 'Score' }] },
  EvidenceRecord: { version: v, id: 'ev1', kind: 'paper', location: 'https://arxiv.org/abs/1706.03762', revision: 'v7', page: 4, retrievedAt: '2026-10-22T08:00:00Z', access: 'public' },
  ReviewFinding: { version: v, id: 'f1', category: 'spec', severity: 'major', target: { component: 'law' }, specRepairable: true, message: 'Label overlaps the arrow.' },
  CaptureManifest: { version: v, compiledHash: H, entries: [{ id: 'c0', time: 0, theme: 'light' }] },
  ExplainModelPolicy: {
    version: v, id: 'explain-v1', roles: { brief: role, author: role, review: role, repair: role },
    limits: { calls: 6, inputTokens: 200000, outputTokens: 40000, images: 16, toolCalls: 8, deadlineMs: 300000, renders: 32, correctionRounds: 3 },
    prices: { 'claude-opus-5-5': [4, 20, 0.2] },
  },
  ExplainJob: {
    version: v, id: 'job1', owner: 'user-1', origin: { canvasId: 'c1', revision: 3 }, stage: 'queued', operations: [],
    ledger: { reservedCredits: 0, settledCredits: 0, unknownCost: false }, cancellation: { requested: false }, outputRevision: 0, terminal: null,
  },
  ResultIdentity: { version: v, jobId: 'job1', resultId: 'r1', promptId: 'p1', cardId: 'card-1', expectedRevision: 0, specHash: H, compiledHash: H },
  VisualBrief: { version: v, proposal: { id: 'msg-1', version: 2 }, meaning: 'How the period depends on length.', components: ['callout'] },
  CapabilityDecision: { version: v, capability: 'explain', intent: 'explicit', uncertainty: 0, permittedActions: ['generate'] },
  ExampleRecord: { version: v, id: 'ex1', family: 'attention', run: 'run1', split: 'development', specHash: H, componentVersions: { callout: 1 }, reuse: 'eligible' },
  ExampleSelection: { version: v, bankSnapshot: H, selected: [{ id: 'ex1', specHash: H }], inputBudgetTokens: 4000 },
};

// structuredClone cannot copy compile, so ComponentDefinition puts it back.
const clone = value => (value.compile ? { ...structuredClone({ ...value, compile: undefined }), compile: value.compile } : structuredClone(value));
const rejects = (name, mutate, pattern) => {
  const raw = clone(MINIMAL[name]);
  const next = mutate(raw) ?? raw;
  assert.throws(() => validateContract(name, next), pattern);
};

test('every contract has a valid minimal object and nothing else is listed', () => {
  assert.deepEqual([...CONTRACT_NAMES].sort(), Object.keys(MINIMAL).sort());
  for (const name of CONTRACT_NAMES) assert.ok(validateContract(name, MINIMAL[name]), name);
});

test('an unknown contract name is refused', () => {
  assert.throws(() => validateContract('Nope', {}), /Unknown explain contract/);
});

test('versioned contracts refuse an unknown version', () => {
  for (const name of CONTRACT_NAMES) {
    if (!('version' in MINIMAL[name]) || name === 'ComponentDefinition') continue;
    rejects(name, raw => { raw.version = v + 1; }, /unknown contract version/);
  }
});

test('unknown fields are refused, so CSS or style cannot ride along', () => {
  rejects('VisualSpec', raw => { raw.theme = 'dark'; }, /Unrecognized key/);
  rejects('VisualSpec', raw => { raw.components[0].style = { color: 'red' }; }, /forbidden field "style"/);
  rejects('VisualSpec', raw => { raw.components[0].css = 'a{}'; }, /forbidden field "css"/);
});

test('executable values are refused anywhere in authored data', () => {
  rejects('VisualSpec', raw => { raw.components[0].params.go = () => 1; }, /a function/);
  rejects('VisualSpec', raw => { raw.components[0].params.link = 'javascript:alert(1)'; }, /executable text/);
  rejects('VisualSpec', raw => { raw.components[0].params.link = '  JavaScript : alert(1)'; }, /executable text/);
  rejects('VisualSpec', raw => { raw.components[0].params.list = ['ok', 'data:text/html,<b>x</b>']; }, /params\.list\.1: executable text/);
  rejects('VisualSpec', raw => { raw.components[0].hints = { font: '@import "https://x"' }; }, /executable text/);
  rejects('VisualSpec', raw => { raw.components[0].params.onClick = 'x'; }, /forbidden field "onClick"/);
  rejects('VisualSpec', raw => { raw.components[0].params.src = '/a.png'; }, /forbidden field "src"/);
  rejects('LabelContent', () => ({ runs: [{ kind: 'text', text: 'data:text/html,hi' }] }), /executable text/);
  rejects('EvidenceRecord', raw => { raw.location = 'javascript:void(0)'; }, /executable text/);
});

test('ordinary prose, code and non-Latin labels are not mistaken for executable text', () => {
  for (const text of ['import numpy as np', 'the url (address) bar', 'Attention is all you need', '注意力机制', 'f(x) = x^2', 'import ( "fmt" )', '<script src="app.js"></script>', 'await import("./mod.js")']) {
    assert.ok(validateContract('LabelContent', { runs: [{ kind: 'text', text }] }), text);
  }
});

test('duplicate ids are refused', () => {
  rejects('VisualSpec', raw => { raw.components[1].id = 'law'; }, /duplicate component id "law"/);
  rejects('ExplanationPresentation', raw => { raw.steps[1].id = 'one'; }, /duplicate step id/);
  rejects('ComponentDefinition', raw => { raw.anchors = ['in', 'in']; }, /duplicate anchor/);
  rejects('CaptureManifest', raw => { raw.entries.push({ id: 'c0', time: 1, theme: 'dark' }); }, /duplicate capture id/);
  rejects('ExampleSelection', raw => { raw.selected.push(raw.selected[0]); }, /duplicate example id/);
  rejects('ExplainJob', raw => { raw.operations = [{ id: 'o1', stage: 'author', attempt: 1 }, { id: 'o1', stage: 'review', attempt: 1 }]; }, /duplicate operation id/);
});

test('VisualSpec connections and bindings name real instances through namespaced anchors', () => {
  rejects('VisualSpec', raw => { raw.connections[0].to = 'ghost.in'; }, /unknown component "ghost"/);
  rejects('VisualSpec', raw => { raw.connections[0].to = 'parts'; }, /anchor reference/);
  rejects('VisualSpec', raw => { raw.evidence = [{ claim: 'c', target: 'ghost', evidence: ['ev1'] }]; }, /unknown target/);
  rejects('VisualSpec', raw => { raw.components[0].id = 'law.box'; }, /stable id/);
  rejects('VisualSpec', raw => { raw.components[0].part = 0; }, /declares 0 parts/);
  rejects('VisualSpec', raw => { raw.components[0].parent = 'ghost'; }, /unknown parent "ghost"/);
  rejects('VisualSpec', raw => { raw.components[0].parent = 'law'; }, /unknown parent "law"/);
  rejects('VisualSpec', raw => { raw.components = []; }, /too_small|>=1|at least/i);
});

test('LabelContent: text, math or mixed runs; unsafe LaTeX refused', () => {
  assert.equal(validateContract('LabelContent', 'plain'), 'plain');
  assert.ok(validateContract('LabelContent', { runs: [{ kind: 'math', tex: '\\frac{a}{b}' }] }));
  // One backslash on purpose: in a JS literal it makes a form feed, the lost-backslash bug.
  rejects('LabelContent', () => ({ runs: [{ kind: 'math', tex: '\\href{https://x}{y}' }] }), /unsupported LaTeX/);
  rejects('LabelContent', () => ({ runs: [{ kind: 'math', tex: '\\def\\x{1}' }] }), /unsupported LaTeX/);
  rejects('LabelContent', () => ({ runs: [] }), /too_small|at least|>=1/i);
  rejects('LabelContent', () => ({ runs: [{ kind: 'math', tex: '\frac{a}{b}' }] }), /control character/);
  rejects('LabelContent', () => ({ runs: [{ kind: 'html', text: 'b' }] }), /Invalid/);
});

test('ExplanationPresentation: mode decides which fields are allowed', () => {
  rejects('ExplanationPresentation', () => ({ mode: 'steps', steps: [{ id: 'a', title: 'A' }] }), /at least 2 named steps/);
  rejects('ExplanationPresentation', () => ({ mode: 'static', steps: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }] }), /static mode takes no steps/);
  rejects('ExplanationPresentation', () => ({ mode: 'time' }), /needs a duration/);
  assert.ok(validateContract('ExplanationPresentation', { mode: 'time', duration: 8 }));
  const experiment = { id: 'len', purpose: 'Does length change the period?', input: 'length', domain: { min: 0.5, max: 2, step: 0.5 }, affects: ['period'], contrasts: ['short swings faster'] };
  assert.ok(validateContract('ExplanationPresentation', { mode: 'static', experiments: [experiment] }));
  rejects('ExplanationPresentation', () => ({ mode: 'static', experiments: [{ ...experiment, contrasts: [] }] }), /too_small|at least|>=1/i);
  rejects('ExplanationPresentation', () => ({ mode: 'static', experiments: [{ ...experiment, domain: { min: 0, max: 1000, step: 1 } }] }), /at most 256 steps/);
});

test('ComponentDefinition: finite hints, repairWritable only names hints, params and hints stay separate', () => {
  rejects('ComponentDefinition', raw => { raw.repairWritable = ['text']; }, /not a declared hint/);
  rejects('ComponentDefinition', raw => { raw.hints.width = { type: 'number', default: 10 }; }, /finite min <= default <= max/);
  rejects('ComponentDefinition', raw => { raw.hints.align = { type: 'enum', values: ['left'], default: 'right' }; }, /one of its values/);
  rejects('ComponentDefinition', raw => { raw.hints.text = { type: 'boolean', default: false }; }, /both a semantic parameter and a layout hint/);
  rejects('ComponentDefinition', raw => { raw.compile = 'return 1'; }, /compile must be a function/);
});

test('server records: evidence needs a revision or hash; policy prices every model; corrections capped at 3', () => {
  rejects('EvidenceRecord', raw => { delete raw.revision; }, /revision or a content hash/);
  rejects('EvidenceRecord', raw => { raw.lines = { start: 5, end: 2 }; }, /end before they start/);
  rejects('EvidenceRecord', raw => { raw.retrievedAt = 'yesterday'; }, /Invalid/);
  rejects('ExplainModelPolicy', raw => { raw.prices = {}; }, /needs a price/);
  rejects('ExplainModelPolicy', raw => { raw.limits.correctionRounds = 4; }, /too_big|<=3|at most/i);
  rejects('ExplainJob', raw => { raw.stage = 'teleport'; }, /Invalid/);
  rejects('ExplainJob', raw => { raw.terminal = { state: 'succeeded' }; }, /Invalid/);
  rejects('CapabilityDecision', raw => { raw.capability = 'motion'; }, /Invalid/);
  rejects('ExampleRecord', raw => { raw.reuse = 'public'; }, /Invalid/);
  rejects('ReviewFinding', raw => { raw.category = 'vibes'; }, /Invalid/);
});

test('canonicalJson is independent of key order and drops undefined', () => {
  assert.equal(canonicalJson({ b: 1, a: [{ d: 2, c: undefined }] }), canonicalJson({ a: [{ d: 2 }], b: 1 }));
  assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
});
