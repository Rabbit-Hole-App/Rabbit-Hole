// UI-15.1: THE canonical schema for every generation confirmation (docs/features/generation-review-contract.md). One file owns the
// common proposal structure, each command's declared settings and sections, its review policy and the common field validation;
// the shared renderer (GenerationProposalCard.jsx) draws from it and the control plane validates with it. Adding a generation
// command's confirmation fields is ONE declaration here plus its execution adapter: no custom form, no second set of field rules.
//
// Dependency free on purpose: no React, no provider, no network, no job execution (a unit test reads this file's imports).
// Capability-specific validation (a CAD parameter's constraints, Motion's renderer limits, a provider's accepted sizes) stays in the
// existing handler; here lives only what is true of the field itself. The server resolves conditional review, availability,
// estimates and allowed actions; nothing here, and nothing a model returns, can switch a required confirmation off.

// The FORMAT of a proposal; separate from its revision, which counts the edits of ONE proposal.
export const SCHEMA_VERSION = 1;
export const FIELD_TYPES = Object.freeze(['text', 'textarea', 'number', 'integer', 'select', 'boolean', 'string_list', 'parameter_group']);
export const REVIEW_POLICIES = Object.freeze(['always', 'conditional', 'none']);
export const STATUSES = Object.freeze(['awaiting_review', 'needs_input', 'preparing', 'generating', 'completed', 'failed', 'cancelled', 'superseded', 'expired']);
export const ACTIONS = Object.freeze(['edit', 'save', 'generate', 'cancel']);
// The optional sections a card may show below its title and description, in the card's fixed order. An empty one is hidden.
export const SECTIONS = Object.freeze(['references', 'requirements', 'assumptions', 'missing_information', 'limitations', 'usage']);
// Proposal-level fields a command may let the person edit (never original_request, command, ids, ownership or binding).
export const PROPOSAL_EDITABLE = Object.freeze(['title', 'description', 'references', 'requirements', 'assumptions', 'missing_information', 'limitations']);

const field = (key, label, type, rest = {}) => Object.freeze({ key, label, type, required: false, editable: true, ...rest });
const seconds = Array.from({ length: 12 }, (_, i) => ({ value: (i + 1) * 5, label: `${(i + 1) * 5} seconds` }));
const PRESENTATIONS = [{ value: 'static', label: 'Static' }, { value: 'steps', label: 'Steps' }, { value: 'time', label: 'Over time' }, { value: 'experiment', label: 'Experiment' }];

// review_policy: 'always' (a person approves every request), 'conditional' (the SERVER decides per request and says why in
// proposal.review.reasons), 'none' (no confirmation by policy: a free, immediate card). editable_fields: proposal-level fields and
// setting keys the person may change before Generate. settings: [] declares no settings (no Settings section is drawn).
const define = d => Object.freeze({ cancel: true, noun: 'result', flag: null, ...d, settings: Object.freeze(d.settings || []), sections: Object.freeze(d.sections || []), editable_fields: Object.freeze(d.editable_fields || []) });

// ---- image models (audit C:/s/spec/img-01/audit.md section H1, official docs read 2026-10-23) ----
// Supported options per model; nothing is declared that the provider page did not state. Pricing is the server's quote: no model
// has a verified price in this table, and an option the server cannot quote blocks Generate (see requires_quote).
// Unresolved provider limits, reported rather than guessed: OpenAI's maximum reference count (the docs show four; 4 is enforced as
// a conservative cap) and output tokens per quality and size; Gemini input-image size and format limits, `n > 1`, whether thinking
// tokens are inside the published per-image figure, and the 2.1 character-reference limit (the pages say 4 or 5: 4 is used).
const opt = (...values) => values.map(value => ({ value, label: value }));
const OPENAI_RATIOS = opt('1:1', '3:2', '2:3', '16:9', '9:16');
const OPENAI_QUALITY = [{ value: 'auto', label: 'Auto' }, { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'xhigh', label: 'Extra high' }, { value: 'max', label: 'Maximum' }];
const OPENAI_RESOLUTIONS = [{ value: '1K', label: '1K' }, { value: '2K', label: '2K' }, { value: '4K', label: '4K (experimental)' }];
// The sizes the OpenAI page lists as common, by ratio and resolution; a pair not here is not offered.
export const OPENAI_SIZES = Object.freeze({ '1:1': { '1K': '1024x1024', '2K': '2048x2048' }, '3:2': { '1K': '1536x1024' }, '2:3': { '1K': '1024x1536' }, '16:9': { '2K': '2048x1152', '4K': '3840x2160' }, '9:16': { '4K': '2160x3840' } });
const GOOGLE_RESOLUTIONS = opt('1K', '2K', '4K');
const openai = label => ({ label, provider: 'openai', qualities: OPENAI_QUALITY, ratios: OPENAI_RATIOS, resolutions: OPENAI_RESOLUTIONS, max_references: 4, references_verified: false, pricing_verified: false });
export const IMAGE_MODELS = Object.freeze({
  'gpt-image-2.5-sunburst': Object.freeze(openai('GPT Image 2.5 Sunburst')),
  'gpt-image-2.5-flare': Object.freeze(openai('GPT Image 2.5 Flare')),
  'gemini-nano-banana-2.1': Object.freeze({ label: 'Nano Banana 2.1', provider: 'google', qualities: null, ratios: opt('1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5', '5:4', '8:1', '9:16', '16:9', '21:9'), resolutions: GOOGLE_RESOLUTIONS, max_references: 14, character_references: 4, references_verified: true, pricing_verified: false }),
  'gemini-3-pro-image': Object.freeze({ label: 'Nano Banana Pro', provider: 'google', qualities: null, ratios: opt('1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'), resolutions: GOOGLE_RESOLUTIONS, max_references: 14, references_verified: true, pricing_verified: false }),
});
const byModel = key => Object.fromEntries(Object.entries(IMAGE_MODELS).filter(([, m]) => m[key]).map(([id, m]) => [id, m[key]]));
const modelName = model => IMAGE_MODELS[model]?.label ?? model;
// Cross-field rules: a pair the model cannot make is named, never dropped or changed. -> [{ path, message }]
function imageProblems(settings) {
  const m = IMAGE_MODELS[settings.model];
  if (!m) return [];
  if (m.provider === 'openai' && settings.resolution && settings.aspect_ratio && !OPENAI_SIZES[settings.aspect_ratio]?.[settings.resolution]) {
    const have = Object.keys(OPENAI_SIZES[settings.aspect_ratio] || {});
    return [{ path: 'settings.resolution', message: have.length ? `${modelName(settings.model)} makes ${settings.aspect_ratio} at ${have.join(' or ')}, not ${settings.resolution}.` : `${modelName(settings.model)} does not make ${settings.aspect_ratio} at that resolution.` }];
  }
  return [];
}
// The reference images a model accepts: image cards and image files, up to its limit.
function imageReferenceRules(settings) {
  const m = IMAGE_MODELS[settings.model];
  return m ? { max: m.max_references, kinds: ['image', 'file'], verified: m.references_verified, model: m.label } : { max: 0, kinds: [], verified: false, model: null };
}
// The size string a provider call sends for a model's ratio and resolution (OpenAI); null where there is none. Aspect only takes
// the smallest listed resolution for that ratio.
export function imageSize(settings) {
  const m = IMAGE_MODELS[settings.model];
  if (m?.provider !== 'openai' || !settings.aspect_ratio) return null;
  const sizes = OPENAI_SIZES[settings.aspect_ratio] || {};
  return sizes[settings.resolution ?? Object.keys(sizes)[0]] ?? null;
}

export const GENERATION_COMMANDS = Object.freeze({
  // Motion: a signed proposal; every request is reviewed. Duration is the renderer's exact 5-second steps to a minute. Audio
  // stays disabled until narration works. Aspect ratio is declared and disabled until feat/motion-settings reports the ratios the
  // renderer really supports: it then replaces `available: false` with `options` taken from aspect-ratios.js (one edit here).
  motion: define({
    label: 'Motion video', noun: 'video', review_policy: 'always', settings_noun: 'a Motion setting', cancel: false,
    settings: [
      field('aspect_ratio', 'Aspect ratio', 'select', { available: false, unavailable_reason: 'Coming soon' }),
      field('duration_seconds', 'Duration', 'select', { required: true, unit: 'seconds', options: seconds, default: 10 }),
      field('audio', 'Audio', 'boolean', { default: false, available: false, unavailable_reason: 'Narration coming soon', unavailable_error: 'narration audio is not available yet; propose the video without it' }),
    ],
    sections: ['references', 'usage'], editable_fields: ['title', 'description', 'references', 'duration_seconds'],
  }),
  // Explain: the server's conditional-review policy (explain-brief.js briefDecision) decides whether a brief is reviewed; the
  // same card is used when it is, the direct path otherwise. Presentation is its only setting.
  explain: define({
    label: 'Explanation', noun: 'explanation', review_policy: 'conditional', settings_noun: 'an explanation setting', cancel: true,
    settings: [field('presentation', 'Presentation', 'select', { options: PRESENTATIONS })],
    sections: ['references', 'assumptions', 'usage'], editable_fields: ['title', 'description', 'references', 'presentation'],
  }),
  // CAD: the job's own brief (cad-jobs.js), approved by its exact hash. Units are fixed by the brief; the parameter VALUES change
  // without a new brief, the parameter list does not (structuralChange in the job); requirements, assumptions, missing information
  // and unsupported items are the person's lists. Review is the server's CAD_BRIEF_FIRST decision, so it is conditional here and
  // fails closed to review when the server says nothing.
  cad: define({
    label: 'CAD model', noun: 'model', review_policy: 'conditional', settings_noun: 'a CAD setting', cancel: true, paid_brief_consent: true,
    settings: [
      field('units', 'Units', 'select', { editable: false, options: ['mm', 'cm', 'm', 'in'].map(value => ({ value, label: value })) }),
      field('parameters', 'Parameters', 'parameter_group', { group: 'cad-parameters' }),
    ],
    sections: ['references', 'requirements', 'assumptions', 'missing_information', 'limitations', 'usage'],
    editable_fields: ['description', 'requirements', 'assumptions', 'missing_information', 'limitations', 'parameters'],
  }),
  // Generate image (IMG-01): behind IMAGE_GENERATION, off. Four models (IMAGE_MODELS); quality, aspect ratio and resolution are shown
  // ONLY where the selected model supports them (by_model: a pure function of the model, shared by web and server). A price comes
  // from the server's quote; a request with no quote is blocked (requires_quote), never priced at zero. Reference images are
  // `references`, limited per model (referenceRules).
  'generate-image': define({
    label: 'Image', noun: 'image', review_policy: 'always', flag: 'IMAGE_GENERATION', settings_noun: 'an image setting', cancel: true, requires_quote: true,
    settings: [
      field('model', 'Model', 'select', { required: true, options: Object.entries(IMAGE_MODELS).map(([value, m]) => ({ value, label: m.label })) }),
      field('quality', 'Quality', 'select', { by_model: byModel('qualities') }),
      field('aspect_ratio', 'Aspect ratio', 'select', { by_model: byModel('ratios') }),
      field('resolution', 'Resolution', 'select', { by_model: byModel('resolutions') }),
    ],
    sections: ['references', 'usage'], editable_fields: ['title', 'description', 'references', 'model', 'quality', 'aspect_ratio', 'resolution'],
    cross: imageProblems, reference_rules: imageReferenceRules,
  }),
  // The other paid generators: a confirmation with no settings today. They keep their handler; they gain the shared card when
  // their path migrates (matrix in the contract doc).
  video: define({ label: 'Video', noun: 'video', review_policy: 'always', sections: ['references', 'usage'], editable_fields: ['description'] }),
  '3d': define({ label: '3D scene', noun: 'scene', review_policy: 'always', sections: ['references', 'usage'], editable_fields: ['description'] }),
  animate: define({ label: 'Animation', noun: 'animation', review_policy: 'always', sections: ['usage'], editable_fields: ['description'] }),
  // Free, immediate cards: no confirmation by policy. An empty settings list says so; a missing definition is NOT this.
  flashcards: define({ label: 'Flashcards', review_policy: 'none' }),
  code: define({ label: 'Code', review_policy: 'none' }),
  graph: define({ label: 'Graph', review_policy: 'none' }),
  diagram: define({ label: 'Diagram', review_policy: 'none' }),
  image: define({ label: 'Image search', review_policy: 'none' }),
  compare: define({ label: 'Comparison', review_policy: 'none' }),
  walkthrough: define({ label: 'Walkthrough', review_policy: 'none' }),
});

export const commandDefinition = command => (Object.hasOwn(GENERATION_COMMANDS, command) ? GENERATION_COMMANDS[command] : null);
// Fail closed: a command with no definition is reviewed. The model, a stale client or a new command can never skip approval.
export const reviewPolicyOf = command => commandDefinition(command)?.review_policy ?? 'always';
// decision: the server's conditional answer { required, reasons }. Conditional with no answer is required.
export function reviewFor(command, decision = null) {
  const policy = reviewPolicyOf(command);
  if (policy === 'always') return { required: true, reasons: decision?.reasons?.length ? [...decision.reasons] : ['policy'] };
  if (policy === 'none') return { required: false, reasons: [] };
  return decision && typeof decision.required === 'boolean' ? { required: decision.required, reasons: [...(decision.reasons || [])] } : { required: true, reasons: ['undecided'] };
}
// Settings fields for the renderer, in declaration order; [] for a command without any (no Settings section).
export const settingsOf = command => commandDefinition(command)?.settings ?? [];
export const isEditable = (command, key) => !!commandDefinition(command)?.editable_fields.includes(key);
// One field's choices: its declared options; for a model-dependent field the selected model's (none: it does not apply); else the
// ones the server resolved for it ({ key: [...] }).
export const optionsOf = (f, resolved = {}, settings = {}) => (f.by_model ? f.by_model[settings.model] ?? [] : f.options ?? resolved[f.key] ?? []);
// Whether a field applies to these settings: a model-dependent one only when the selected model supports it.
export const appliesTo = (f, settings = {}) => !f.by_model || !!f.by_model[settings.model];
export const isAvailable = (f, resolved = {}, settings = {}) => f.available !== false && appliesTo(f, settings) && !(f.options_from === 'server' && !optionsOf(f, resolved, settings).length);
// The fields to draw for these settings, each with its options resolved: only what the selected model supports.
export const fieldsFor = (command, settings = {}, resolved = {}) => settingsOf(command).filter(f => appliesTo(f, settings)).map(f => (f.type === 'select' ? { ...f, options: optionsOf(f, resolved, settings) } : f));
// The reference rules for a command and its settings: null where it declares none.
export const referenceRules = (command, settings = {}) => commandDefinition(command)?.reference_rules?.(settings) ?? null;
// Reference problems, never a silent drop: too many for the model, or a kind it cannot take. -> [{ path, message }]
export function referenceProblems(command, settings, references = []) {
  const rules = referenceRules(command, settings);
  if (!rules) return [];
  const out = [];
  if (references.length > rules.max) out.push({ path: 'references', message: rules.max ? `${rules.model} takes at most ${rules.max} reference images; remove ${references.length - rules.max}.` : 'Choose a model before attaching reference images.' });
  references.forEach((r, i) => { if (!rules.kinds.includes(r.kind)) out.push({ path: `references[${i}]`, message: `${r.label} is not an image, so ${rules.model || 'this model'} cannot use it.` }); });
  return out;
}

// ---- common field validation ----
const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);
const whole = options => options.length > 1 && options.every(o => Number.isInteger(o.value)) && options.every((o, i) => i === 0 || o.value - options[i - 1].value === options[1].value - options[0].value);
function optionsMessage(path, options) {
  if (whole(options)) { const step = options[1].value - options[0].value; return `${path} must be a whole number from ${options[0].value} to ${options.at(-1).value} in steps of ${step}`; }
  const names = options.map(o => o.value);
  return `${path} must be ${names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names.at(-1)}` : names.join('')}`;
}
// -> null, or the problem as words, for one value against one FieldDefinition. resolved: server-resolved options.
export function fieldProblem(f, value, path = `settings.${f.key}`, resolved = {}, settings = {}) {
  if (f.type === 'parameter_group') return null; // judged by the owning capability (f.group), see validateSettings groups
  const missing = value === undefined || value === null;
  if (f.available === false) return missing || value === f.default ? null : (f.unavailable_error || `${path} is not available yet`);
  if (missing) return f.required ? `${path} is required` : null;
  switch (f.type) {
    case 'boolean': return typeof value === 'boolean' ? null : `${path} must be on or off`;
    case 'integer': case 'number': {
      const bad = f.type === 'integer' ? !Number.isInteger(value) : typeof value !== 'number' || !Number.isFinite(value);
      if (bad) return `${path} must be ${f.type === 'integer' ? 'a whole number' : 'a number'}`;
      if (f.min !== undefined && value < f.min) return `${path} must be at least ${f.min}${f.unit ? ` ${f.unit}` : ''}`;
      if (f.max !== undefined && value > f.max) return `${path} must be at most ${f.max}${f.unit ? ` ${f.unit}` : ''}`;
      if (f.step !== undefined && Math.abs(((value - (f.min ?? 0)) / f.step) % 1) > 1e-9) return `${path} must be in steps of ${f.step}`;
      return null;
    }
    case 'select': {
      const options = optionsOf(f, resolved, settings);
      return options.some(o => o.value === value) ? null : optionsMessage(path, options);
    }
    case 'text': case 'textarea': return typeof value === 'string' && value.length <= (f.max_length ?? 2000) ? null : `${path} must be text of at most ${f.max_length ?? 2000} characters`;
    case 'string_list': return Array.isArray(value) && value.length <= (f.max_items ?? 20) && value.every(s => typeof s === 'string' && s.trim() && s.length <= (f.max_length ?? 300)) ? null : `${path} must be a short list of text lines`;
    default: return `${path} has an unknown type`;
  }
}
// Every problem of a command's settings with its path (the proposal's validation_errors): a field the selected model does not support
// is named when a value is present, an unavailable one likewise, and cross-field and reference rules follow. [] when valid.
export function settingsProblems(command, values, { resolved = {}, groups = {}, references = [] } = {}) {
  const def = commandDefinition(command);
  if (!def) return [{ path: 'settings', message: 'These settings cannot be changed here.' }];
  const fields = def.settings, shape = `settings must be {${fields.map(f => f.key).join(', ')}}`;
  if (values === undefined && fields.some(f => f.required)) return [{ path: 'settings', message: shape }];
  const given = values === undefined || values === null ? {} : values;
  if (!plain(given)) return [{ path: 'settings', message: shape }];
  const extra = Object.keys(given).find(k => !fields.some(f => f.key === k));
  if (extra) return [{ path: `settings.${extra}`, message: `settings.${extra} is not ${def.settings_noun || 'a setting of this command'}` }];
  const out = [];
  for (const f of fields) {
    const path = `settings.${f.key}`;
    if (!appliesTo(f, given)) { if (given[f.key] !== undefined && given[f.key] !== null) out.push({ path, message: `${path} is not supported by ${modelName(given.model)}` }); continue; }
    const problem = fieldProblem(f, given[f.key], path, resolved, given) ?? (f.type === 'parameter_group' && given[f.key] !== undefined && groups[f.group] ? groups[f.group](given[f.key]) : null);
    if (problem) out.push({ path, message: problem });
  }
  if (!out.length && def.cross) out.push(...def.cross(given));
  out.push(...referenceProblems(command, given, references));
  return out;
}
// -> { value } | { error, path } for the first problem; the value holds defaults for the fields that apply.
export function validateSettings(command, values, options = {}) {
  const [first] = settingsProblems(command, values, options);
  if (first) return { error: first.message, path: first.path };
  const given = values ?? {}, out = {};
  for (const f of fieldsFor(command, given)) {
    const value = given[f.key] ?? f.default;
    if (value !== undefined && value !== null) out[f.key] = value;
  }
  return { value: out };
}

// ---- the logical proposal a card draws ----
// The server-resolved parts, kept apart from what is signed: status, validation errors, review, allowed actions. proposal: the
// envelope (generation-proposal.js); `description` here is the editable text, which the envelope carries as `prompt` with its pills.
export function proposalView(p, resolved = {}) {
  const def = commandDefinition(p.command);
  const status = resolved.status ?? 'awaiting_review';
  const missing_information = p.missing_information ?? [];
  // A v3 proposal is judged against the schema on every draw (a model change shows its conflicts with their paths, nothing is
  // dropped). A proposal saved before the schema existed keeps the values it was made with. A command that needs a server quote
  // (requires_quote) is blocked, with the reason, while the server has none: the price is never taken as zero.
  const priced = p.usage?.estimate_credits != null;
  const validation_errors = [...(p.schema_version ? settingsProblems(p.command, p.settings, { references: p.references ?? [] }) : []), ...(def?.requires_quote && !priced ? [{ path: 'usage', message: 'The price for these settings is not known yet, so it cannot be generated.' }] : []), ...(resolved.validation_errors ?? [])];
  return {
    schema_version: p.schema_version ?? SCHEMA_VERSION, proposal_id: p.proposal_id, revision: p.version, command: p.command, original_request: p.original_request ?? p.input?.request ?? '',
    title: p.title, description: typeof p.prompt === 'string' ? p.prompt : p.description, settings: p.settings ?? {}, references: p.references ?? [],
    requirements: p.requirements ?? [], assumptions: p.assumptions ?? [], missing_information, limitations: p.limitations ?? [],
    review: resolved.review ?? reviewFor(p.command), ...(def?.requires_quote && !priced ? { usage: { estimate_credits: null, unknown: true } } : priced ? { usage: { estimate_credits: p.usage.estimate_credits, ...(resolved.quote_id ? { quote_id: resolved.quote_id } : {}), ...(resolved.quote_expires_at ? { expires_at: resolved.quote_expires_at } : {}) } } : {}),
    status, validation_errors, allowed_actions: allowedActions(def, { status, validation_errors, missing_information, review: resolved.review }),
  };
}
// Generate runs only a saved, current, valid revision with nothing missing; Save exists where something is editable.
export function allowedActions(def, { status = 'awaiting_review', validation_errors = [], missing_information = [] } = {}) {
  const open = status === 'awaiting_review' || status === 'needs_input';
  if (!open || !def) return [];
  const actions = [];
  if (def.editable_fields.length) actions.push('edit', 'save');
  if (status === 'awaiting_review' && !validation_errors.length && !missing_information.length) actions.push('generate');
  if (def.cancel) actions.push('cancel');
  return actions;
}
// The sections a card draws for a proposal view: declared by the command and non-empty, in the card's fixed order.
export function visibleSections(view) {
  const def = commandDefinition(view.command);
  return SECTIONS.filter(s => def?.sections.includes(s) && (s === 'usage' ? !!view.usage : view[s]?.length > 0));
}
// Unsaved form edits stay apart from the accepted revision: what changed, as the keys to send to Save.
export function changedKeys(saved, draft) {
  const keys = [];
  for (const k of ['title', 'description', 'references', 'requirements', 'assumptions', 'missing_information', 'limitations']) if (draft[k] !== undefined && JSON.stringify(draft[k]) !== JSON.stringify(saved[k])) keys.push(k);
  for (const k of Object.keys(draft.settings || {})) if (JSON.stringify(draft.settings[k]) !== JSON.stringify(saved.settings?.[k])) keys.push(k);
  return keys;
}
// Whether every changed key may be edited on this command. -> the first key that may not, or null.
export const firstReadOnly = (command, keys) => keys.find(k => !isEditable(command, k)) ?? null;
