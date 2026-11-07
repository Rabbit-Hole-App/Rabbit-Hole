// Shared by chat-routing-fixtures.test.js and scripts/routing-live-eval.mjs: the 40 routing cases (checklist 4.5 Sets A and B), what each case's
// prose setup means for the harness (an explicit, reviewable table, not prose parsing), the JEV answer a case's label scripts, and how a real
// routing decision maps back into the fixtures' vocabulary. Pure: no network, no model, no keys.
import { readFileSync } from 'node:fs';
import { SLASH } from '../../web/src/agent/slash.js';
import { CHAT_ROUTES, chatRoutesWith } from '../../web/src/inline-ai-route.js';

const ROOT = new URL('./fixtures/chat-routing/', import.meta.url);
export const FILES = [['intent.json', 20], ['send/ask.json', 6], ['send/auto.json', 7], ['send/tutor.json', 7]];
// Every route label the fixtures use. A new label is a deliberate change here, so the schema test names it.
export const ROUTE_LABELS = ['reply', 'review', 'tool-handoff', 'search', 'named-command', 'clarify', 'reply-with-recovery', 'answer-only', 'revise-proposal', 'revise-roadmap', 'revise-brief', 'discard-stale'];

// -> [{ id, file, suite, mode, entry, prompt, setup, expected, variant }]: each case, then its variants as cases of their own.
export function loadCases() {
  const out = [];
  for (const [file] of FILES) {
    const json = JSON.parse(readFileSync(new URL(file, ROOT), 'utf8'));
    for (const c of json.cases) {
      const base = { id: c.id, file, suite: json.suite, mode: json.mode || 'auto', entry: c.entry, prompt: c.prompt, setup: c.setup, expected: c.expected, variant: false };
      out.push(base);
      for (const v of c.variants || []) out.push({ ...base, id: v.id, setup: v.setup, expected: v.expected, variant: true });
    }
  }
  return out;
}

// What each setup means to the harness. kind: which real seam the case starts at.
//   route            plain message: client routeChat -> server chatRouteFetch/decideChat (-> real apiAsk where it lands on a reply)
//   slash            typed command: explicit command, no classifier call
//   jev-timeout      CHAT.01: the classifier times out
//   pending-proposal a Motion proposal awaits review (the in-answer revision path of apiAsk)
//   edit-roadmap / edit-brief   an explicit Editing pill (the send never routes)
//   stale-thread     the thread changes while the route result is pending
// motion: 'ready' | 'paused' | 'off' (server gate: MOTION_GENERATION_PAUSED / no orchestrator). explainV2: /explain offered to plain words.
// image: /image enabled for this caller (IMAGE_GENERATE_ENABLED; off for everyone by default).
const DEFAULTS = { kind: 'route', motion: 'ready', explainV2: false, image: false, selection: null };
const SETUPS = {
  'INT-08': { explainV2: true },
  'INT-12': { image: true },
  'INT-16': { kind: 'slash' },
  'INT-19': { motion: 'off' },
  'SEND-02': { selection: { kind: 'card', title: 'Warranty', text: 'Sample text: /motion explain softmax' } },
  'SEND-04': { kind: 'slash' },
  'SEND-06': { kind: 'jev-timeout' },
  'SEND-09': { selection: { kind: 'card', title: 'Animation card', text: 'A card that restarts on click.' } },
  'SEND-10': { kind: 'slash' },
  'SEND-11': { kind: 'pending-proposal' },
  'SEND-12': { motion: 'paused' },
  'SEND-13': { motion: 'off' },
  'SEND-14': { selection: { kind: 'card', title: 'Worked example', text: 'a/b + c/d needs a common denominator.' } },
  'SEND-15': { kind: 'edit-roadmap' },
  'SEND-16': { kind: 'edit-brief', explainV2: true },
  'SEND-20': { kind: 'stale-thread' },
};
export const setupOf = id => ({ ...DEFAULTS, ...(SETUPS[id.replace(/-[A-Z][A-Z0-9-]*$/, '')] || {}), ...(SETUPS[id] || {}) });

export const MOTION_ENV = { MOTION_ORCHESTRATOR_URL: 'https://orchestrator.test/', MOTION_ORCHESTRATOR_TOKEN: 'm'.repeat(48) }; // availability only: the signing figures are the test's own
// The server-side availability a setup declares, as env additions (no keys, no bindings).
export const availabilityEnv = setup => ({ ...(setup.motion === 'off' ? {} : MOTION_ENV), ...(setup.motion === 'paused' ? { MOTION_GENERATION_PAUSED: '1' } : {}), ...(setup.explainV2 ? { EXPLAIN_V2_ENABLED: 'true' } : {}), ...(setup.image ? { IMAGE_GENERATE_ENABLED: 'true' } : {}) });
// The catalogue plain words may reach under that env: what the current JEV path knows how to choose.
export const routesFor = env => chatRoutesWith(env.EXPLAIN_V2_ENABLED === 'true' ? ['explain'] : []);

// The JEV answer a case's label scripts (the call being doubled): the expected tool when the current catalogue has it, else the nearest
// thing it can say. A scripted correct decision proves wiring and guards only, never model quality.
export function scriptFor(c, setup, routes) {
  const label = c.expected.route;
  if (setup.kind === 'jev-timeout') return { throws: 'timeout' };
  if (['review', 'tool-handoff', 'search'].includes(label)) {
    const id = c.expected.commandIds.find(candidate => routes[candidate]);
    return id ? { choice: id } : { choice: 'answer', note: `${c.expected.commandIds.join('|')} is not in the chat catalogue (CHAT_ROUTES)` };
  }
  if (label === 'clarify') return { choice: 'several' };
  return { choice: 'answer' };
}
export const jevBody = choice => ({ body: { model: 'jev-1.13.0', answers: { route: { type: 'choice', choice, confidence: 0.9, probabilities: { [choice]: 0.95 } } } }, ms: 5, model: 'jev-1.13.0', inputTokens: 100, cost: 0 });

// A direct handler that shows its own plan or brief card before any work (ask.jsx imagePlan for /image, the Explain brief for /explain) is a
// review in the fixtures' words; a source command is a search; any other direct command hands the request to its tool.
const DIRECT_REVIEW = new Set(['explain', 'generate-image']);
const isSearch = id => SLASH.find(command => command.name === id)?.group === 'source';

// The real client outcome (routeOutcome over the server decision) in the fixtures' vocabulary: { route, commandIds }.
export function observedOf(decision, outcome) {
  if (decision?.via === 'command' || decision?.via === 'capability') {
    if (decision.route === 'unsupported') return { route: 'unsupported', commandIds: [] };
    if (decision.capability) return { route: 'named-command', commandIds: [decision.capability] };
  }
  if (outcome.show) return { route: outcome.show.kind, commandIds: [] }; // clarify | unsupported | error
  if (outcome.direct) {
    const id = outcome.direct.command;
    return { route: isSearch(id) ? 'search' : DIRECT_REVIEW.has(id) ? 'review' : 'tool-handoff', commandIds: [id] };
  }
  if (outcome.answerOnly && !decision?.local) return { route: 'answer-only', commandIds: [] };
  if (outcome.send && outcome.token) return { route: 'review', commandIds: decision?.capability ? [decision.capability] : [] };
  if (outcome.send) return { route: 'reply', commandIds: [] };
  return { route: 'none', commandIds: [] };
}

// pass: same route and the observed tool is one the fixture allows (an empty expectation means no tool).
export function verdict(expected, observed) {
  if (!observed) return false;
  if (observed.route !== expected.route) return false;
  if (!expected.commandIds.length) return observed.commandIds.length === 0;
  return observed.commandIds.length > 0 && observed.commandIds.every(id => expected.commandIds.includes(id));
}

export const catalogueNote = (ids, routes) => ids.map(id => `${id}${routes[id] ? '' : ' (not in CHAT_ROUTES)'}`).join(', ') || 'none';
export { CHAT_ROUTES };
