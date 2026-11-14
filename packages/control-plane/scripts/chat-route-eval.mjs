// Measures the JEV chat classifier on the labelled set (test/chat-route-prompts.json; owner 2026-11-13). Without --live it only counts the cases.
// --live makes one JEV call per case with the real router request (src/chat-capability-route.js decideChat's own pieces) and prints accuracy per command and
// every miss. These are PAID calls (JEV is billed per call): run it only on the owner's go. Keys are read by name from small-deploy/.env and never printed.
//   node scripts/chat-route-eval.mjs [--live] [--only <command>] [--out results.json]
// --only explanation: that command's messages, every chat-answer message and the follow-ups that expect it or a chat answer (what it must be told apart from).
import { readFileSync, writeFileSync } from 'node:fs';
import '../../web/src/agent/slash-flags-test-on.mjs'; // every command on: this measures the classifier, not which commands ship
import { askJev, JEV_TRANSPORTS } from '../src/learn-grade-jev.js';
import { jevTransport } from '../src/learn-inline.js';
import { ROUTE_THRESHOLDS, ROUTE_TIMEOUT_MS, chatRouteRequest, chatRoutesWith, readChatRoute } from '../../web/src/inline-ai-route.js';

const set = JSON.parse(readFileSync(new URL('../test/chat-route-prompts.json', import.meta.url), 'utf8'));
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const cases = [
  ...Object.entries(set.capabilities).filter(([expect]) => !only || expect === only).flatMap(([expect, prompts]) => prompts.map(text => ({ text, expect }))),
  ...set.answer.map(text => ({ text, expect: 'answer' })),
  ...set.followups.filter(({ expect }) => !only || expect === only || expect === 'answer').map(({ text, expect, history }) => ({ text, expect, history })),
];
console.log(`${cases.length} labelled messages: ${Object.keys(set.capabilities).length} commands, ${set.answer.length} chat answers, ${set.followups.length} follow-ups with history`);
if (!process.argv.includes('--live')) { console.log('dry run: nothing was sent (add --live to call JEV; paid)'); process.exit(0); }

const dotenv = readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
const key = name => (dotenv.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1] ?? '').trim().replace(/^['"]|['"]$/g, '');
// SMALL_ENV 'test': no spend admission or ledger here (this script has no database); the cost of the run is the JEV calls themselves.
const env = { SMALL_ENV: 'test', VERCEL_TYPESAFE_API_KEY: key('VERCEL_TYPESAFE_API_KEY'), TYPESAFE_API_KEY: key('TYPESAFE_API_KEY') };
const transport = jevTransport(env);
if (!transport) { console.error('no JEV transport key found by name in the credentials file'); process.exit(1); }
const routes = chatRoutesWith(['explain']);
const tally = {}, misses = [];
for (const item of cases) {
  let predicted;
  try {
    const out = await askJev(env, chatRouteRequest({ text: item.text, history: item.history }, JEV_TRANSPORTS[transport].model, routes), { transport, timeoutMs: Math.max(ROUTE_TIMEOUT_MS, 10000) });
    const read = readChatRoute(out.body, routes);
    // The router's own rule: a command it is not sure of, "none" and "several" are not a command.
    predicted = ['answer', 'none', 'several'].includes(read.choice) || read.probability < ROUTE_THRESHOLDS.probability || read.confidence < ROUTE_THRESHOLDS.confidence ? 'answer' : read.choice;
  } catch (error) { predicted = `error: ${error?.code || error?.message}`; }
  const row = tally[item.expect] ??= { right: 0, total: 0 };
  row.total += 1;
  console.log(`${predicted === item.expect ? 'ok  ' : 'MISS'} [${item.expect} -> ${predicted}]${item.history ? ' (with history)' : ''} ${item.text}`);
  if (predicted === item.expect) row.right += 1; else misses.push({ text: item.text, expect: item.expect, got: predicted, history: item.history ? true : undefined });
}
for (const [name, { right, total }] of Object.entries(tally)) console.log(`${name.padEnd(16)} ${right}/${total}`);
const all = Object.values(tally).reduce((sum, row) => ({ right: sum.right + row.right, total: sum.total + row.total }), { right: 0, total: 0 });
console.log(`\nall: ${all.right}/${all.total}`);
for (const miss of misses) console.log(`  MISS expected ${miss.expect}, got ${miss.got}: ${miss.text}`);
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
if (out) writeFileSync(out, JSON.stringify({ tally, misses }, null, 2));
