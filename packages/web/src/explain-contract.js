import { z } from 'zod';

// The /explain shared contracts (plan v2.1 section 4), one validator each.
// Server-safe: zod only, no React or DOM, so the control plane imports this
// file the same way learn-scene-gates.js imports animation-scene.js.
// VisualSpec names its edges connections because board links are a different thing
// with a guarded reader list (inline-ai-annotation.test.mjs).
// Owner: Lane A. Field authority: A for VisualSpec, ComponentDefinition,
// LabelContent, CompiledVisual, ExplanationPresentation, Example*; C for
// ExplainModelPolicy, ExplainJob, ResultIdentity, VisualBrief and
// CapabilityDecision; D for EvidenceRecord, ReviewFinding and CaptureManifest.
// An incompatible field change bumps this version; old payloads are refused,
// never guessed at.
export const EXPLAIN_CONTRACT_VERSION = 1;

const version = z.literal(EXPLAIN_CONTRACT_VERSION, { error: () => `unknown contract version: expected ${EXPLAIN_CONTRACT_VERSION}` });
// Stable ids: a component instance, step, anchor or record name. Dots join
// namespaces (instance.anchor), so a bare id never contains one.
const ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const id = z.string().regex(ID, 'not a stable id: letters, digits, _ and -, starting with a letter, at most 64');
const anchorRef = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}\.[A-Za-z][A-Za-z0-9_-]{0,63}$/, 'not an anchor reference: write instance.anchor');
const text = (max = 600) => z.string().max(max);
const count = z.number().int().min(0);
const hash = z.string().regex(/^[A-Za-z0-9:_-]{8,128}$/, 'not a content hash');
const isoTime = z.iso.datetime({ offset: true });

// Authored data is JSON, never behaviour: no functions, no CSS, no script or
// import URLs. strict() objects refuse unknown keys such as style or css; this
// scan catches the same thing inside free-form parameter records. Other text
// stays text (it is rendered, never evaluated), so a label may quote code.
const EXECUTABLE = [/^\s*(javascript|vbscript|data)\s*:/i, /@import\b/i];
const FORBIDDEN_KEYS = new Set(['style', 'css', 'className', 'class', 'script', 'html', 'innerHTML', 'dangerouslySetInnerHTML', 'import', 'src', 'href', '__proto__', 'constructor', 'prototype']);

export function findExecutable(value, path = []) {
  if (typeof value === 'function') return { path, reason: 'a function' };
  if (typeof value === 'string') {
    return EXECUTABLE.some(pattern => pattern.test(value)) ? { path, reason: 'executable text' } : null;
  }
  if (!value || typeof value !== 'object') return null;
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key) || /^on[A-Z]/.test(key)) return { path: [...path, key], reason: `a forbidden field "${key}"` };
    const found = findExecutable(value[key], [...path, key]);
    if (found) return found;
  }
  return null;
}

// Free-form semantic parameters and layout hints: finite JSON, bounded depth.
const json = z.lazy(() => z.union([
  z.string().max(600), z.number().finite(), z.boolean(), z.null(),
  z.array(json).max(256), z.record(z.string().max(64), json),
]));

// Texts with typed math. A bare string is plain text. KaTeX already refuses
// these with trust off; refusing them here keeps them out of saved specs.
const UNSAFE_TEX = /\\(href|url|includegraphics|html\w*|def|gdef|edef|xdef|newcommand|renewcommand|providecommand|let|futurelet|input|include|write|immediate)\b/;
const run = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string().min(1).max(600) }).strict(),
  z.object({ kind: z.literal('math'), tex: z.string().min(1).max(400).refine(tex => !UNSAFE_TEX.test(tex), 'unsupported LaTeX command') }).strict(),
]);
export const labelContentSchema = z.union([
  z.string().max(600),
  z.object({ runs: z.array(run).min(1).max(24) }).strict(),
]);

const unique = (list, key, what) => {
  const seen = new Set();
  for (const item of list) {
    const value = key(item);
    if (seen.has(value)) return `duplicate ${what} "${value}"`;
    seen.add(value);
  }
  return null;
};
const uniqueBy = (key, what) => (list, ctx) => {
  const problem = unique(list, key, what);
  if (problem) ctx.addIssue({ code: 'custom', message: problem });
};

const domain = z.union([
  z.object({ values: z.array(z.union([z.number().finite(), z.string().max(60)])).min(2).max(64) }).strict(),
  z.object({ min: z.number().finite(), max: z.number().finite(), step: z.number().positive() }).strict()
    .refine(range => range.max > range.min && (range.max - range.min) / range.step <= 256, 'a range needs min < max and at most 256 steps'),
]);
const experiment = z.object({
  id, purpose: text(300).min(1), input: id, domain,
  affects: z.array(id).min(1).max(32),
  contrasts: z.array(text(200).min(1)).min(1).max(8),
  dependsOn: z.array(id).max(8).default([]),
}).strict();
export const explanationPresentationSchema = z.object({
  mode: z.enum(['static', 'steps', 'time']),
  steps: z.array(z.object({ id, title: text(120).min(1), caption: labelContentSchema.optional() }).strict()).max(12).default([])
    .superRefine(uniqueBy(step => step.id, 'step id')),
  duration: z.number().positive().max(120).optional(),
  experiments: z.array(experiment).max(4).default([]).superRefine(uniqueBy(item => item.id, 'experiment id')),
}).strict().superRefine((value, ctx) => {
  if (value.mode === 'steps' && value.steps.length < 2) ctx.addIssue({ code: 'custom', message: 'steps mode needs at least 2 named steps' });
  if (value.mode !== 'steps' && value.steps.length) ctx.addIssue({ code: 'custom', message: `${value.mode} mode takes no steps` });
  if (value.mode === 'time' && !value.duration) ctx.addIssue({ code: 'custom', message: 'time mode needs a duration' });
  if (value.mode !== 'time' && value.duration) ctx.addIssue({ code: 'custom', message: `${value.mode} mode takes no duration` });
});

const componentInstance = z.object({
  id,
  component: id,
  version: z.number().int().positive(),
  params: z.record(z.string().max(64), json).default({}),
  hints: z.record(z.string().max(64), json).default({}),
  label: labelContentSchema.optional(),
  evidence: z.array(id).max(32).default([]),
  part: z.number().int().min(0).max(3).optional(),
  // Hierarchy: the container instance this one sits inside, in spec order.
  parent: id.optional(),
}).strict();
export const visualSpecSchema = z.object({
  version,
  id,
  title: text(200).min(1),
  components: z.array(componentInstance).min(1).max(40).superRefine(uniqueBy(item => item.id, 'component id')),
  connections: z.array(z.object({ from: anchorRef, to: anchorRef, label: labelContentSchema.optional(), kind: z.enum(['flow', 'relation', 'reference']).default('flow') }).strict()).max(80).default([]),
  evidence: z.array(z.object({ claim: text(300).min(1), target: z.union([id, anchorRef]), evidence: z.array(id).min(1).max(16) }).strict()).max(64).default([]),
  presentation: explanationPresentationSchema,
  parts: z.array(z.object({ id, title: text(120).min(1) }).strict()).max(4).default([]).superRefine(uniqueBy(part => part.id, 'part id')),
}).strict().superRefine((spec, ctx) => {
  const ids = new Set(spec.components.map(item => item.id));
  const known = ref => ids.has(ref.split('.')[0]);
  for (const link of spec.connections) {
    for (const end of [link.from, link.to]) if (!known(end)) ctx.addIssue({ code: 'custom', message: `connection names unknown component "${end.split('.')[0]}"` });
  }
  for (const binding of spec.evidence) if (!known(binding.target)) ctx.addIssue({ code: 'custom', message: `evidence binding names unknown target "${binding.target}"` });
  for (const item of spec.components) {
    if (item.parent !== undefined && (!ids.has(item.parent) || item.parent === item.id)) ctx.addIssue({ code: 'custom', message: `component "${item.id}" names unknown parent "${item.parent}"` });
    if (item.part !== undefined && item.part >= spec.parts.length) ctx.addIssue({ code: 'custom', message: `component "${item.id}" names part ${item.part}, but the spec declares ${spec.parts.length} parts` });
  }
});

// The declarative half of a registry entry. compile is trusted repository
// code, the one place a function belongs; everything else is data.
const paramSpec = z.object({
  type: z.enum(['int', 'number', 'string', 'enum', 'boolean', 'label', 'list']),
  min: z.number().finite().optional(), max: z.number().finite().optional(),
  values: z.array(z.union([z.string().max(60), z.number()])).min(1).max(64).optional(),
  maxLength: z.number().int().positive().max(600).optional(),
  required: z.boolean().default(false),
  default: json.optional(),
}).strict();
const hintSpec = z.object({
  type: z.enum(['number', 'enum', 'boolean']),
  unit: z.enum(['px', 'ratio', 'deg', 'count']).optional(),
  min: z.number().finite().optional(), max: z.number().finite().optional(),
  values: z.array(z.string().max(60)).min(1).max(16).optional(),
  default: z.union([z.number().finite(), z.string().max(60), z.boolean()]),
}).strict().superRefine((hint, ctx) => {
  if (hint.type === 'number' && !(Number.isFinite(hint.min) && Number.isFinite(hint.max) && hint.min <= hint.default && hint.default <= hint.max)) ctx.addIssue({ code: 'custom', message: 'a number hint needs finite min <= default <= max' });
  if (hint.type === 'enum' && !hint.values?.includes(hint.default)) ctx.addIssue({ code: 'custom', message: 'an enum hint default must be one of its values' });
});
export const componentDefinitionSchema = z.object({
  name: id,
  version: z.number().int().positive(),
  description: text(400).min(1),
  params: z.record(id, paramSpec),
  hints: z.record(id, hintSpec),
  repairWritable: z.array(id).max(32),
  anchors: z.array(id).min(1).max(64).superRefine(uniqueBy(name => name, 'anchor')),
  fixtures: z.array(id).max(16).default([]),
  // A container lays out the instances that name it as parent.
  container: z.boolean().default(false),
  compile: z.custom(value => typeof value === 'function', 'compile must be a function'),
}).strict().superRefine((definition, ctx) => {
  for (const path of definition.repairWritable) if (!(path in definition.hints)) ctx.addIssue({ code: 'custom', message: `repairWritable "${path}" is not a declared hint` });
  for (const name of Object.keys(definition.hints)) if (name in definition.params) ctx.addIssue({ code: 'custom', message: `"${name}" is both a semantic parameter and a layout hint` });
});

export const compiledVisualSchema = z.object({
  version,
  specHash: hash,
  scene: z.record(z.string(), z.unknown()),
  counts: z.object({ authored: count, compiled: count, perPart: z.array(count).max(4), renderWork: count }).strict(),
  componentVersions: z.record(id, z.number().int().positive()),
  objectMap: z.record(z.string().max(64), z.object({ component: id, anchor: id.optional(), evidence: z.array(id).max(32).default([]) }).strict()),
  coverage: z.object({ states: count, timeCheckpoints: z.array(z.number().min(0).max(120)).max(64), complete: z.boolean() }).strict(),
  diagnostics: z.array(z.object({ code: id, message: text(300), component: id.optional() }).strict()).max(200).default([]),
}).strict();

// shortcut: fields per plan section 4; Lane D refines EvidenceRecord, ReviewFinding and CaptureManifest.
export const evidenceRecordSchema = z.object({
  version,
  id,
  kind: z.enum(['web', 'repository', 'paper', 'document', 'attachment', 'image']),
  location: text(2000).min(1),
  revision: text(128).optional(),
  contentHash: hash.optional(),
  excerpt: text(4000).optional(),
  page: z.number().int().positive().optional(),
  lines: z.object({ start: z.number().int().positive(), end: z.number().int().positive() }).strict().refine(range => range.end >= range.start, 'lines end before they start').optional(),
  retrievedAt: isoTime,
  access: z.enum(['public', 'owner', 'workspace']),
  limitations: z.array(text(300)).max(16).default([]),
}).strict().refine(record => record.revision || record.contentHash, 'evidence needs a revision or a content hash');

export const reviewFindingSchema = z.object({
  version,
  id,
  category: z.enum(['source', 'spec', 'component', 'renderer', 'budget']),
  severity: z.enum(['blocker', 'major', 'minor']),
  target: z.object({ component: id.optional(), object: z.string().max(64).optional(), state: id.optional() }).strict(),
  evidence: z.array(id).max(16).default([]),
  specRepairable: z.boolean(),
  message: text(600).min(1),
}).strict();

export const captureManifestSchema = z.object({
  version,
  compiledHash: hash,
  entries: z.array(z.object({
    id,
    part: z.number().int().min(0).max(3).optional(),
    time: z.number().min(0).max(120),
    inputs: z.record(z.string().max(40), z.union([z.number().finite(), z.string().max(60), z.boolean()])).default({}),
    theme: z.enum(['light', 'dark']),
  }).strict()).min(1).max(64).superRefine(uniqueBy(entry => entry.id, 'capture id')),
}).strict();

// shortcut: fields per plan section 4; Lane C refines the policy, job, identity and brief contracts.
const role = z.object({ provider: z.enum(['anthropic']), model: z.string().min(1).max(64), maxTokens: z.number().int().positive().max(64000), toolChoice: z.enum(['auto', 'none']) }).strict();
export const explainModelPolicySchema = z.object({
  version,
  id,
  roles: z.object({ brief: role, author: role, review: role, repair: role }).strict(),
  limits: z.object({
    calls: z.number().int().positive().max(32), inputTokens: z.number().int().positive(), outputTokens: z.number().int().positive(),
    images: count.max(64), toolCalls: count.max(64), deadlineMs: z.number().int().positive().max(30 * 60_000),
    renders: count.max(256), correctionRounds: z.number().int().min(0).max(3),
  }).strict(),
  // USD per million tokens [input, output, cache read]: server accounting only; learners see credits.
  prices: z.record(z.string().max(64), z.tuple([z.number().min(0), z.number().min(0), z.number().min(0)])),
}).strict().refine(policy => Object.values(policy.roles).every(item => item.model in policy.prices), 'every role model needs a price');

const STAGES = ['queued', 'research', 'brief', 'author', 'compile', 'render', 'review', 'repair', 'save', 'done'];
export const explainJobSchema = z.object({
  version,
  id,
  owner: z.string().min(1).max(128),
  workspace: z.string().max(128).optional(),
  origin: z.object({ canvasId: z.string().min(1).max(128), cardId: z.string().max(128).optional(), revision: count }).strict(),
  stage: z.enum(STAGES),
  operations: z.array(z.object({ id, stage: z.enum(STAGES), attempt: z.number().int().positive().max(4) }).strict()).max(64).superRefine(uniqueBy(item => item.id, 'operation id')),
  ledger: z.object({ reservedCredits: count, settledCredits: count, unknownCost: z.boolean() }).strict(),
  cancellation: z.object({ requested: z.boolean(), at: isoTime.optional() }).strict(),
  outputRevision: count,
  terminal: z.object({ state: z.enum(['succeeded', 'failed', 'stopped']), reason: text(300) }).strict().nullable(),
}).strict();

export const resultIdentitySchema = z.object({
  version,
  jobId: id,
  resultId: id,
  promptId: z.string().min(1).max(128),
  cardId: z.string().min(1).max(128),
  expectedRevision: count,
  specHash: hash,
  compiledHash: hash,
}).strict();

export const visualBriefSchema = z.object({
  version,
  proposal: z.object({ id: z.string().min(1).max(128), version: count }).strict(),
  meaning: text(1200).min(1),
  assumptions: z.array(text(300)).max(10).default([]),
  components: z.array(id).min(1).max(40),
  evidence: z.array(id).max(64).default([]),
}).strict();

export const capabilityDecisionSchema = z.object({
  version,
  capability: z.literal('explain'),
  intent: z.enum(['explicit', 'classified']),
  uncertainty: z.number().min(0).max(1),
  missingInput: z.array(text(200)).max(8).default([]),
  permittedActions: z.array(z.enum(['generate', 'brief', 'ask', 'answer', 'refuse'])).min(1).max(5),
}).strict();

export const exampleRecordSchema = z.object({
  version,
  id,
  family: id,
  run: id,
  split: z.enum(['development', 'heldout']),
  specHash: hash,
  componentVersions: z.record(id, z.number().int().positive()),
  reuse: z.enum(['eligible', 'private', 'quarantined']),
  spec: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const exampleSelectionSchema = z.object({
  version,
  bankSnapshot: hash,
  selected: z.array(z.object({ id, specHash: hash }).strict()).max(8).superRefine(uniqueBy(item => item.id, 'example id')),
  inputBudgetTokens: z.number().int().positive().max(64000),
}).strict();

const CONTRACTS = {
  VisualSpec: visualSpecSchema,
  ComponentDefinition: componentDefinitionSchema,
  LabelContent: labelContentSchema,
  CompiledVisual: compiledVisualSchema,
  ExplanationPresentation: explanationPresentationSchema,
  EvidenceRecord: evidenceRecordSchema,
  ReviewFinding: reviewFindingSchema,
  CaptureManifest: captureManifestSchema,
  ExplainModelPolicy: explainModelPolicySchema,
  ExplainJob: explainJobSchema,
  ResultIdentity: resultIdentitySchema,
  VisualBrief: visualBriefSchema,
  CapabilityDecision: capabilityDecisionSchema,
  ExampleRecord: exampleRecordSchema,
  ExampleSelection: exampleSelectionSchema,
};
export const CONTRACT_NAMES = Object.keys(CONTRACTS);

// One entry point, same error style as validateScene: returns the parsed value
// or throws one readable line. ComponentDefinition alone may carry a function.
export function validateContract(name, raw) {
  const schema = CONTRACTS[name];
  if (!schema) throw new Error(`Unknown explain contract "${name}"`);
  if (name !== 'ComponentDefinition') {
    const found = findExecutable(raw);
    if (found) throw new Error(`Invalid ${name} at ${found.path.join('.') || 'root'}: ${found.reason} is not allowed`);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`Invalid ${name} at ${issue.path.join('.') || 'root'}: ${issue.message}`);
  }
  return parsed.data;
}

export const validateVisualSpec = raw => validateContract('VisualSpec', raw);
export const validateComponentDefinition = raw => validateContract('ComponentDefinition', raw);
export const validateLabelContent = raw => validateContract('LabelContent', raw);
export const validateCompiledVisual = raw => validateContract('CompiledVisual', raw);
export const validateExplanationPresentation = raw => validateContract('ExplanationPresentation', raw);
export const validateEvidenceRecord = raw => validateContract('EvidenceRecord', raw);
export const validateReviewFinding = raw => validateContract('ReviewFinding', raw);
export const validateCaptureManifest = raw => validateContract('CaptureManifest', raw);
export const validateExplainModelPolicy = raw => validateContract('ExplainModelPolicy', raw);
export const validateExplainJob = raw => validateContract('ExplainJob', raw);
export const validateResultIdentity = raw => validateContract('ResultIdentity', raw);
export const validateVisualBrief = raw => validateContract('VisualBrief', raw);
export const validateCapabilityDecision = raw => validateContract('CapabilityDecision', raw);
export const validateExampleRecord = raw => validateContract('ExampleRecord', raw);
export const validateExampleSelection = raw => validateContract('ExampleSelection', raw);

// Canonical JSON: sorted keys, so the same spec always serializes (and
// hashes) the same way whatever order an author wrote its fields in.
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
