// Rabbit Hole is on in the production build (VITE_RABBIT_HOLE) and in the dev/review build (VITE_COACHING_DEV,
// which alone also turns on the dev-only tools); private BYOC never gets it (T02 D2).
// `?.` keeps this importable by node tests, as private-auth.js:3 already does.
export const learnPreview = (import.meta.env?.VITE_RABBIT_HOLE === 'true' || import.meta.env?.VITE_COACHING_DEV === 'true') && import.meta.env?.VITE_PRIVATE_BYOC !== 'true';
// Review tooling (?fixtures=1 cards, ?board= review boards) is dev/review only: never in the production build,
// which turns learnPreview on with VITE_RABBIT_HOLE alone.
export const reviewTools = learnPreview && import.meta.env?.VITE_COACHING_DEV === 'true';
// The supplied NanoGPT course's editor (Edit course, Edit in chat, curriculum approval) is review tooling too:
// ownership alone never opens it in production. Generated courses keep their owner editor.
export const canEditCourse = (canAuthor, supplied) => !!canAuthor && (reviewTools || !supplied);

// First-party product name: document title and first-party copy. Workspace names never change (T02 §2).
export const PRODUCT = learnPreview ? 'Rabbit Hole' : 'small';

// T02 §9: false until the Learn handoff (feature/parallel-work cc0cbf8) reaches main. The PR
// that merges it flips this; it is never detected at runtime, because a missing hook and a
// slow hook look the same.
export const learnHandoff = false;

// Gate C G1 (2026-09-24), decided OFF: the dev clone binds the live D1 'small'
// (wrangler.dev.jsonc d1_databases DB), and /api/ask writes live chat history, so the preview's
// workspace and app asks stay unavailable. Project and canvas asks keep their threads and moment
// log in LEARN_DB and stay on; that is enforced by the dev worker's handlers (C1 in
// docs/features/learn-cleanup.md), not by this flag or the browser's api() check.
export const askLiveOnPreview = false;

// G5 (Gate C, 2026-09-24): /api/apps/find and /api/runs/find each run a model on the live control
// plane (control-plane/src/index.js:595-638). Read-only is not isolated, so the preview never calls
// them until the user approves live model-backed reads. The live build is unchanged.
export const aiReadsOnPreview = false;
export const aiFindAllowed = (preview = learnPreview) => !preview || aiReadsOnPreview;
