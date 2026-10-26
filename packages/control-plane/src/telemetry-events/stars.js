// Stars (docs/features/stars.md "Telemetry events"; canvas-star-events.js owns the names and the delivery). Ids, enums and booleans
// only: canvas_ref is a one-way hash of the canvas, never its workspace, name or a link token; the account is the envelope's user_ref.
// surface is the fixed list of canvas-star-events.js SURFACES (a test keeps the two equal).
const SURFACE = { enum: ['shared_page', 'card_home', 'card_library', 'card_explore', 'card_profile', 'canvas_header', 'personal_stars', 'profile_stars'] };
export default {
  namespace: 'star',
  events: {
    'star.added': { canvas_ref: { type: 'hex', required: true }, owner_star: { type: 'bool', required: true }, surface: SURFACE },
    'star.removed': { canvas_ref: { type: 'hex', required: true }, owner_star: { type: 'bool', required: true }, surface: SURFACE, reason: { enum: ['voluntary', 'lifecycle'], required: true } },
    'star.opened': { canvas_ref: { type: 'hex', required: true }, owner_star: { type: 'bool', required: true }, surface: { enum: ['personal_stars', 'profile_stars'], required: true } },
  },
};
