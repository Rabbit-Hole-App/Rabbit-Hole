// The canonical aspect ratios every generation form offers (Motion now, the image form later): one table, so a ratio has one
// label and one meaning everywhere. A consumer lists only the ratios its renderer can produce through ratiosFor(supported).
// Pure data and functions: no React, so the control plane and node tests import it too.
const entry = (id, meaning = '') => {
  const [w, h] = id.split(':').map(Number);
  return Object.freeze({ id, meaning, label: meaning ? `${id} ${meaning}` : id, ratio: w / h });
};
// Canonical order, as the owner listed them (2026-10-23).
export const ASPECT_RATIOS = Object.freeze([
  entry('9:16', 'portrait'), entry('1:1', 'square'), entry('16:9', 'landscape'), entry('3:4', 'portrait'),
  entry('4:3'), entry('2:3'), entry('3:2'), entry('4:5'), entry('5:4'),
]);
export const ASPECT_RATIO_IDS = Object.freeze(ASPECT_RATIOS.map(r => r.id));
// Ratios some image models make that Motion does not. Being in this table is NOT support: every consumer declares its own subset
// (Motion in generation-confirmation-schema.js, each image model in IMAGE_MODELS), and a ratio a consumer does not list is never offered.
const MORE_RATIOS = Object.freeze(['1:4', '1:8', '4:1', '8:1', '21:9'].map(id => entry(id)));
const KNOWN = Object.freeze([...ASPECT_RATIOS, ...MORE_RATIOS]);

// -> the canonical entries a consumer supports, in canonical order; every ratio when `supported` is omitted. An id not in the
// table is ignored here (a consumer's own declaration is checked against the table by its test).
export const ratiosFor = supported => (supported == null ? ASPECT_RATIOS : KNOWN.filter(r => supported.includes(r.id)));
export const aspectRatioLabel = id => KNOWN.find(r => r.id === id)?.label ?? String(id);
