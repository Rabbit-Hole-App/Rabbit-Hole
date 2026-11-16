// Learn sections: run a made item's `slash` perform against /api/learn/artifact as the browser's intercept would (API-level; no canvas placement).
// NOT RUN IN CI. REAL model calls on the owner stack. usage: node scripts/learn-section-perform-api.mjs <make json under docs/features/learn-sections/make/>
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = new URL('../../../docs/features/learn-sections/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const jar = readFileSync(process.env.JAR || 'C:/s/spec/sections-evidence/jar.txt', 'utf8');
const session = jar.split('\n').map(line => line.split('\t')).find(cols => cols[5] === 'small_session')?.[6]?.trim();
const state = JSON.parse(readFileSync(`${OUT}/runs-state.json`, 'utf8'));
const COMMAND = { explain: 'explanation', code: 'code', diagram: 'diagram', graph: 'graph' }; // typed name -> registry name (agent/slash.js)
for (const file of process.argv.slice(2)) {
  const made = JSON.parse(readFileSync(`${OUT}/make/${file}`, 'utf8')), p = made.out.perform;
  if (p?.op !== 'slash') { console.log(`${file}: not a slash perform`); continue; }
  const [, typed, args] = p.line.match(/^\/(\w+)\s+([\s\S]*)$/);
  const body = { app: state[made.case].canvas, command: COMMAND[typed] || typed, args, selection: null, context: p.context ?? null, board: 'main', ...(p.depth ? { depth: p.depth } : {}), ...(p.madeBy ? { madeBy: p.madeBy } : {}) };
  const t0 = Date.now();
  const r = await fetch('http://127.0.0.1:8878/api/learn/artifact', { method: 'POST', headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  const ms = Date.now() - t0;
  writeFileSync(`${OUT}/make/${file.replace(/\.json$/, '')}-artifact.json`, JSON.stringify({ request: { ...body, context: body.context ? `${body.context.length} characters` : null }, status: r.status, ms, response: d }, null, 2));
  console.log(`${file}: HTTP ${r.status} in ${ms} ms ${d.error || (d.block?.type ?? Object.keys(d).join(','))}`);
}
