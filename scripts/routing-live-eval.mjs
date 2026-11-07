// OWNER-AUTHORIZED ONLY. Runs the shared Chat routing cases (checklist 4.5, Sets A and B) against the REAL candidate router: each plain-message
// case makes one paid JEV classifier call through chat-capability-route.js decideChat, then stops at the validated decision (no plan, search,
// adapter dispatch, card, job, render or credit hold). It prints expected vs observed; it writes nothing.
//
//   ROUTING_LIVE_EVAL=yes-spend-approved VERCEL_TYPESAFE_API_KEY=... node scripts/routing-live-eval.mjs     (or TYPESAFE_API_KEY for the direct transport)
//
// Keys come from the environment you set for this one command. This script never reads a .env file. It refuses to run without the approval
// word, and prints the number of paid calls first. Cases that start at an explicit command, an Editing pill, a waiting proposal or a thread
// switch make no classifier call and are not run here (the Node test covers those seams).
import { loadCases, setupOf, availabilityEnv, observedOf, verdict } from '../packages/control-plane/test/chat-routing-support.js';
import { decideChat } from '../packages/control-plane/src/chat-capability-route.js';
import { routeOutcome } from '../packages/web/src/generation-proposal-chat.js';
import { askMode } from '../packages/web/src/chat-route.js';

const runnable = loadCases().filter(c => c.entry === 'message' && setupOf(c.id).kind === 'route');
console.log(`routing live eval: ${runnable.length} plain-message cases = ${runnable.length} PAID JEV classifier calls (this spends money).`);
if (process.env.ROUTING_LIVE_EVAL !== 'yes-spend-approved') {
  console.log('Refusing to run: set ROUTING_LIVE_EVAL=yes-spend-approved only when the owner has authorized this spend.');
  process.exit(2);
}
if (!process.env.VERCEL_TYPESAFE_API_KEY && !process.env.TYPESAFE_API_KEY) { console.log('Refusing to run: no JEV key in the environment (VERCEL_TYPESAFE_API_KEY or TYPESAFE_API_KEY).'); process.exit(2); }

let pass = 0;
const misses = [];
for (const c of runnable) {
  const setup = setupOf(c.id), env = { ...process.env, ...availabilityEnv(setup) };
  const decision = await decideChat(env, { email: 'owner@example.test', app: 'canvas-0a1b2c3d', requestId: `req-live-${c.id.toLowerCase().replace(/[^a-z0-9]/g, '')}`, fields: { app: 'canvas-0a1b2c3d', text: c.prompt, mode: askMode(c.mode, false), selection: setup.selection, source_refs: null, motion: null } });
  const observed = observedOf(decision, routeOutcome(decision, { plain: true }));
  const ok = verdict(c.expected, observed);
  if (ok) pass += 1; else misses.push(c.id);
  console.log(`${ok ? 'pass' : 'MISS'}  ${c.id}  expected ${c.expected.route} [${c.expected.commandIds.join(', ')}]  observed ${observed.route} [${observed.commandIds.join(', ')}]  via ${decision.via}  p=${decision.probability ?? '-'}`);
}
console.log(`\n${pass}/${runnable.length} match the fixture labels. Misses: ${misses.join(', ') || 'none'}. Record these with the candidate SHA; tune descriptions or selection logic, then rerun.`);
