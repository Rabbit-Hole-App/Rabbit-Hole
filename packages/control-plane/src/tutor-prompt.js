// The Tutor's prompt loader (docs tutor-prompts-and-routing.md sections 1c, 2): every Tutor model call's system prompt is
//   BASE + TASK + USE-CASE OVERLAY (or nothing), in that fixed order, from the files in src/prompts/tutor/ (bundled as
//   tutor-prompts.generated.js by scripts/build-tutor-prompts.mjs: a Worker cannot read files at runtime).
// The overlay may add emphasis, examples and next-step flavour; the loader refuses one that is long or tries to override.
import { TUTOR_PROMPT_FILES } from './tutor-prompts.generated.js';
import { CODEBASE_USES } from '../../web/src/learn-codebase-goals.js';

export const OVERLAY_MAX_LINES = 25;
const OVERRIDES = /ignore|override|instead of the above/i;
const SEPARATOR = '\n\n';
const body = entry => entry.text.replace(/\s+$/, '');

// { task, use, text, layers: { base, task, use } }: the layers are the sha256 of each file's text (null for no overlay).
// Throws on a missing base or task file, an unknown use id, or an overlay that is over OVERLAY_MAX_LINES lines or contains
// "ignore", "override" or "instead of the above". use: a CODEBASE_USES id, or null for no goal (base + task only).
export function composeTutorPrompt({ task, use = null } = {}, files = TUTOR_PROMPT_FILES) { // files: a test seam
  const file = path => (Object.hasOwn(files, path) ? files[path] : null);
  const baseFile = file('base.md');
  if (!baseFile) throw new Error('Tutor prompt: base.md is missing');
  const taskFile = typeof task === 'string' ? file(`tasks/${task}.md`) : null;
  if (!taskFile) throw new Error(`Tutor prompt: no task file for "${task}"`);
  let overlay = null;
  if (use != null) {
    overlay = typeof use === 'string' ? file(`uses/${use}.md`) : null;
    if (!overlay) throw new Error(`Tutor prompt: no use-case overlay for "${use}"`);
    const lines = body(overlay).split('\n').length;
    if (lines > OVERLAY_MAX_LINES) throw new Error(`Tutor prompt: the overlay "${use}" has ${lines} lines (at most ${OVERLAY_MAX_LINES})`);
    if (OVERRIDES.test(overlay.text)) throw new Error(`Tutor prompt: the overlay "${use}" must not contain "ignore", "override" or "instead of the above"`);
  }
  return {
    task, use: overlay ? use : null,
    text: [baseFile, taskFile, overlay].filter(Boolean).map(body).join(SEPARATOR),
    layers: { base: baseFile.sha256, task: taskFile.sha256, use: overlay ? overlay.sha256 : null },
  };
}

// Section 1c: what rides in every model call's record, so a wrong pick or a changed prompt is visible in evidence.
// route: { use, confidence } when the use came from a routed typed line, else null.
export const tutorRecord = (composed, { route = null, model = null } = {}) => ({ task: composed.task, use: composed.use, layers: composed.layers, route, model });

// One log line per Tutor model call, the section 1c record (names and hashes only, never a message).
export function logTutorCall(record) {
  try { console.log(JSON.stringify({ event: 'tutor_call', ...record })); } catch { /* never worth a failed turn */ }
}

// The use case a request names, or null: only one of the 14 CODEBASE_USES ids is ever a use (anything else, from a browser, is no goal).
export const codebaseUseId = value => (typeof value === 'string' && CODEBASE_USES.some(use => use.id === value) ? value : null);

// The chat system prompt for a repository canvas, with the canvas's goal overlay when it has one.
export const repositoryChatPrompt = (use = null) => composeTutorPrompt({ task: 'chat', use: codebaseUseId(use) });
