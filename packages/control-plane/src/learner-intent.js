// Learner Intent Resolver (docs/features/adaptive-tutor-v1.md, "Future shared input layer"): the one
// input layer every specialist builds on - the Tutor, the Motion Director, a practice planner.
// The learner's words are one input beside the location, the selection and the sources. The
// output is a structured LearnerTurn that keeps raw_user_message next to its interpretation and
// never carries a permanent learner label.
//
// This is the slice /motion needs (motion spec §4.2-§4.4): the command, an explicitly named or a
// deictic target, the selection binding, the requested duration and teaching mode. Grounding the
// target in a repository is ./source-grounding.js. Deterministic and pure: no model call, no I/O.
import { validateCanvasTarget } from './learn-ask-context.js';
import { DURATION_PATTERN as DURATION, parseDuration } from './request-duration.js';

// packages/web/src/agent/slash.js SELECTIONS
export const SELECTION_KINDS = ['project', 'map_node', 'card', 'equation', 'notebook_cell', 'notebook_file', 'canvas_object'];
export const TEACHING_MODES = ['intuition_first', 'mechanism_first', 'code_walkthrough', 'system_flow'];

// The learner's own words for a teaching treatment, mapped to the canonical values only.
const MODE_HINTS = [
  ['intuition_first', /\bintuit(?:ion|ive|ively)\b/i],
  ['mechanism_first', /\bmechanism\b/i],
  ['code_walkthrough', /\b(?:walk ?through|step through)\b/i],
  ['system_flow', /\b(?:system flow|request flow|moves? through|flows? through)\b/i],
];
export const requestedMode = text => MODE_HINTS.find(([, re]) => re.test(text))?.[0] ?? null;

// "this", "that", "here" (alone or as "this request"): the target is what the learner selected.
const DEICTIC = /\b(?:this|that|these|those|here)\b/gi;
const isDeictic = text => new RegExp(DEICTIC.source, 'i').test(text);
// Request words that are not the target: verbs of asking, fillers, question words, mode words, the duration.
const LEADING = /^(?:(?:please|can you|could you|now)\s+)*(?:explain|show|visuali[sz]e|animate|illustrate|teach|demonstrate|walk(?: me)? through|describe|make)\b\s*/i;
const FILLER = /\b(?:me|to me|us|please|the|a|an|what|how|why|where|which|is|are|does|do|visually|simply|step by step|quickly|works?|happens?|looks? like)\b/gi;
const SYMBOL_NOUN = /\b(?:func|function|fn|method|op|operation|call)\b/i;

// The words of a request that name its target ("softmax", "gradient descent"), or null. The
// kind hint marks a code symbol ("softmax func"). Pointing words are dropped here: whether the
// request points at the selection is the binding, decided by resolveLearnerTurn.
export function namedTarget(requestText) {
  let t = String(requestText || '').replace(DURATION, ' ');
  for (const [, re] of MODE_HINTS) t = t.replace(re, ' ');
  t = t.trim().replace(LEADING, '');
  const kind = SYMBOL_NOUN.test(t) ? 'code_symbol' : null;
  t = t.replace(SYMBOL_NOUN, ' ').replace(DEICTIC, ' ').replace(FILLER, ' ').replace(/[^\w\s.-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  return t ? { name: t, kind_hint: kind } : null;
}

const SHA = /^[0-9a-f]{40}$/;
function validRepositoryContext(rc) {
  if (!rc) return null;
  const r = rc.range;
  if (!SHA.test(rc.commit || '') || !r || typeof r.path !== 'string' || !r.path || r.path.includes('..') || !Number.isInteger(r.start) || !Number.isInteger(r.end) || r.start < 1 || r.end < r.start) {
    throw new Error('Invalid repository_context: needs {commit (40-hex), range: {path, start, end}}');
  }
  return { commit: rc.commit, ...(rc.nodeId ? { nodeId: String(rc.nodeId) } : {}), label: String(rc.label || r.path), range: { path: r.path, start: r.start, end: r.end } };
}
function validSelection(s) {
  if (!s) return null;
  if (!SELECTION_KINDS.includes(s.kind) || typeof s.id !== 'string' || !s.id) throw new Error(`Invalid selection: {kind: one of ${SELECTION_KINDS.join(' | ')}, id}`);
  return { kind: s.kind, id: s.id, ...(s.title ? { title: String(s.title) } : {}) };
}

// message: the learner's text ("/motion 15s explain me softmax func"). location: {concept, canvas_id,
// card_id, depth} as the canvas knows it. selection / canvas_target / repository_context: the
// existing Rabbit Hole identity shapes, validated here.
export function resolveLearnerTurn({ message, location = {}, selection = null, canvas_target = undefined, repository_context = null } = {}) {
  if (typeof message !== 'string' || !message.trim()) throw new Error('A learner message is required');
  const raw = message;
  const command = raw.trim().match(/^\/([a-z][\w-]*)\b/i)?.[1]?.toLowerCase() ?? null;
  const request = command ? raw.trim().slice(command.length + 1).trim() : raw.trim();
  const sel = validSelection(selection);
  const target = canvas_target === undefined ? null : validateCanvasTarget(canvas_target, 'learn');
  const repo = validRepositoryContext(repository_context);
  const named = namedTarget(request);
  const hasSelection = !!(sel || target || repo);
  // "this"/"here" binds to the selection (any named words stay as a hint); a pointing request
  // with nothing selected cannot be resolved by guessing. Otherwise an explicit name is the
  // target, and it beats the ambient canvas concept, which only disambiguates later.
  const binding = isDeictic(request) ? (hasSelection ? 'deictic' : 'deictic_unbound') : named ? 'named' : 'none';
  return {
    raw_user_message: raw,
    command,
    structured_interpretation: {
      request_text: request,
      target: { binding, name: named?.name ?? null, kind_hint: named?.kind_hint ?? (repo && binding === 'deictic' ? 'code_span' : null) },
      requested_duration: parseDuration(request),
      requested_mode: requestedMode(request),
    },
    current_location: {
      concept: location.concept ?? null,
      ...(location.canvas_id ? { canvas_id: String(location.canvas_id) } : {}),
      ...(location.card_id ? { card_id: String(location.card_id) } : {}),
      ...(location.depth ? { depth: String(location.depth) } : {}),
    },
    selection: sel,
    canvas_target: target,
    repository_context: repo,
  };
}
