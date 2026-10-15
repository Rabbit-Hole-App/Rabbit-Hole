// Seconds-long rehearsal of the two gate refusals that otherwise cost a whole sharded run (2026-10-15: run 38790698635 refused
// every shard on a rewritten repo-browser-check; run 38792322071 lost rh-local to a seed that read PERSIST the gate never gave it).
// Run it on the candidate checkout before dispatch: node scripts/r36-gate/rehearse.mjs <app root>. Exit 1 lists each problem.
//  1. adapters: every fixture adapter prepare.mjs applies accepts the candidate's check (or finds its fix already in it).
//  2. gate env: a check that reads a gate-local variable (the stack's D1, the locked wrangler, the control plane's vars) is given
//     it by its own invocation in int35.sh. A check never gets these from a developer default inside the gate.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURE_ADAPTERS, SOURCE } from './prepare.mjs';

export const GATE_VARS = ['PERSIST', 'D1_CONFIG', 'WRANGLER_BIN', 'LOCAL_CP_VARS'];

// The variables each check invocation in int35.sh receives: inline NAME= prefixes, `env $X` (X defined as X="..."), and names
// exported earlier in the script. prepare.mjs adds WRANGLER_BIN to E. run() runs `run stack.sh <stage> <check>` with $E.
export function invocations(script) {
  const lines = script.replace(/\r\n/g, '\n').split('\n');
  const defs = {}, exported = new Set(), out = [];
  const names = text => [...text.matchAll(/(?:^|\s)([A-Z][A-Z0-9_]*)=/g)].map(m => m[1]);
  for (const line of lines) {
    const def = line.match(/^([A-Z][A-Z0-9_]*)="([^"]*)"/);
    if (def) defs[def[1]] = names(def[2]).concat(def[1] === 'E' ? ['WRANGLER_BIN'] : []);
    for (const m of line.matchAll(/\bexport ([A-Z][A-Z0-9_]*)=/g)) exported.add(m[1]);
    const given = () => {
      const env = [...line.matchAll(/\benv \$([A-Z][A-Z0-9_]*)/g)].flatMap(m => defs[m[1]] || []);
      return new Set([...names(line.split(/ node /)[0]), ...env, ...exported]);
    };
    const staged = line.match(/^run stack(?:-app)?\.sh \S+ (\S+\.mjs)$/);
    if (staged) out.push({ check: staged[1], given: new Set([...(defs.E || []), ...exported]) });
    for (const m of line.matchAll(/node e2e\/([\w.-]+\.mjs)/g)) out.push({ check: m[1], given: given() });
  }
  return out;
}

export function rehearse(app, script = readFileSync(join(SOURCE, 'templates/int35.sh'), 'utf8')) {
  const problems = [], e2e = join(app, 'packages/web/e2e');
  for (const [name, adapt] of Object.entries(FIXTURE_ADAPTERS)) {
    try { adapt(readFileSync(join(e2e, name), 'utf8')); } catch (e) { problems.push(`${name}: adapter refuses - ${e.message}`); }
  }
  const seen = new Set();
  for (const { check, given } of invocations(script)) {
    const file = join(e2e, check);
    if (!existsSync(file)) continue;
    const reads = new Set([...readFileSync(file, 'utf8').matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)].map(m => m[1]));
    for (const v of GATE_VARS) {
      const key = `${check} ${v}`;
      if (reads.has(v) && !given.has(v) && !seen.has(key)) { seen.add(key); problems.push(`${check}: reads process.env.${v}, which its int35.sh invocation does not pass`); }
    }
  }
  return problems;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const app = process.argv[2];
  if (!app) { console.error('usage: node scripts/r36-gate/rehearse.mjs <app root>'); process.exit(2); }
  const problems = rehearse(app);
  for (const p of problems) console.log(`REFUSE ${p}`);
  console.log(problems.length ? `rehearsal: ${problems.length} problem(s); the gate would fail on these` : 'rehearsal: adapters and gate env ok');
  process.exit(problems.length ? 1 : 0);
}
