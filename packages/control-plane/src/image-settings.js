// IMG-01 readiness: which image settings may be GENERATED now (owner 2026-10-23). The FIELDS (models, qualities, ratios, resolutions)
// are declared once, in web/src/generation-confirmation-schema.js; this file holds what only the server may decide, in the shape of
// Motion's motionReadiness (motion-settings.js on motion/int): an allowlist of combinations that a live provider run actually covered.
// Every option stays visible and selectable on the card; a combination not listed is shown as not ready BEFORE confirmation and
// refused by the route (code image_not_ready). Readiness is a conservative gate, not a promise: a ready combination can still fail.
// Pure data and one function: no I/O. Extending the list needs a new acceptance run, recorded in `evidence`.
import { IMAGE_MODELS } from '../../web/src/generation-confirmation-schema.js';

export const IMAGE_NOT_READY = 'image_not_ready';
export const IMAGE_POLICY_VERSION = 'acceptance-2026-10-23';

// operation: 'generate' (no references) or 'edit' (references; max_references is the most a run used). quality null: the model has none.
// evidence: acceptance runs A-E of 2026-10-23, C:/s/spec/img-01/acceptance-plan.md; receipts C:/s/img-01-accept/receipts/<run>.jsonl.
export const IMAGE_VALIDATED = Object.freeze([
  { model: 'gpt-image-2.5-flare', operation: 'generate', quality: 'low', aspect_ratio: '1:1', resolution: '1K', max_references: 0, evidence: 'run A, img-A-1, 1024x1024' },
  { model: 'gpt-image-2.5-sunburst', operation: 'edit', quality: 'low', aspect_ratio: '1:1', resolution: '1K', max_references: 2, evidence: 'run B, img-B-1, 1024x1024, 2 references' },
  { model: 'gemini-nano-banana-2.1', operation: 'generate', quality: null, aspect_ratio: '1:1', resolution: '1K', max_references: 0, evidence: 'run C, img-C-4' },
  { model: 'gemini-3-pro-image', operation: 'generate', quality: null, aspect_ratio: '1:1', resolution: '1K', max_references: 0, evidence: 'run D, img-D-1' },
  { model: 'gemini-nano-banana-2.1', operation: 'edit', quality: null, aspect_ratio: '1:1', resolution: '1K', max_references: 1, evidence: 'run E, img-E-1, 1 reference' },
].map(Object.freeze));

const tested = r => `${r.operation === 'edit' ? `editing with up to ${r.max_references} reference image${r.max_references === 1 ? '' : 's'}` : 'creating without references'} at ${r.aspect_ratio}, ${r.resolution}${r.quality ? `, ${r.quality} quality` : ''}`;

// settings: { model, quality, aspect_ratio, resolution } (quality null where the model has none). -> { ready: true, policy_version } or
// { ready: false, code, message, policy_version }. The message is the one line the card shows before confirmation.
export function imageReadiness(settings, referenceCount = 0) {
  const s = settings && typeof settings === 'object' ? settings : {}, m = IMAGE_MODELS[s.model];
  const no = message => ({ ready: false, code: IMAGE_NOT_READY, message, policy_version: IMAGE_POLICY_VERSION });
  if (!m) return no('Choose an image model.');
  const operation = referenceCount > 0 ? 'edit' : 'generate', quality = s.quality ?? null;
  const hit = IMAGE_VALIDATED.some(r => r.model === s.model && r.operation === operation && r.quality === quality && r.aspect_ratio === s.aspect_ratio && r.resolution === s.resolution && referenceCount <= r.max_references);
  if (hit) return { ready: true, policy_version: IMAGE_POLICY_VERSION };
  const rows = IMAGE_VALIDATED.filter(r => r.model === s.model);
  return no(rows.length ? `${m.label} has only been tested for ${rows.map(tested).join(' and ')}. Other settings cannot be generated yet.` : `${m.label} has not been tested yet, so it cannot generate images.`);
}
