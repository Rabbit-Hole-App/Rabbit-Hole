// Owner-authorised (2026-11-13): put the three scripted toss-and-drop cards (Overview, Standard, Deep) on ONE dev-clone canvas as saved cards, so the owner can look at the generated-card look
// with no model run and no spend. Each block is what an accepted /interactive card saves (program reference + compiled CardComposition), except that its program is the dev-only fixture
// (block.program = { fixtureId }, interact-toss-programs.js TOSS_FIXTURES), which only a dev build (VITE_COACHING_DEV) runs. Dev clone only; secrets are read by name, never printed.
//   node scripts/interact/seed-toss-canvas.mjs [email]      default owner-interact-morning@example.com
// Prints the canvas name; open it with C:\s\spec\interact-real\open-look.cmd (open-preview.mjs --canvas <name>).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { interactFixtures } from '../../packages/web/src/interact-plan-fixtures.js';
import { TOSS_FIXTURES, sealTossProgram } from '../../packages/web/src/interact-toss-programs.js';
import { compileCardComposition } from '../../packages/web/src/interact-composition.js';

const BASE = 'https://rabbit-hole-web-dev-interact.tryrabbithole.workers.dev', DEV_CP = 'https://rabbit-hole-cp-dev.tryrabbithole.workers.dev';
const EMAIL = process.argv[2] || 'owner-interact-morning@example.com', UA = { 'User-Agent': 'rabbit-hole-owner-launcher/1' };
const PROMPT = '/interactive At the highest point of a vertical throw, is acceleration zero because velocity is zero?';
const env = readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
const secret = (env.match(/^RABBIT_HOLE_DEV_TEST_BYPASS=(.*)$/m)?.[1] || '').trim().replace(/^['"]|['"]$/g, '');
const session = (await (await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, secret }) })).json()).session;
if (!session) { console.log('RESULT FAILED: no dev session'); process.exit(1); }
const api = async (method, path, body) => { const r = await fetch(`${BASE}${path}`, { method, headers: { ...UA, cookie: `small_session=${session}`, ...(body ? { 'Content-Type': 'application/json', origin: BASE } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json().catch(() => null) }; };

const { referencePlans } = await interactFixtures();
const blocks = [];
for (const [i, [name, planKey]] of [['toss-overview', 'tossOverview'], ['toss-standard', 'tossStandard'], ['toss-deep', 'tossDeep']].entries()) {
  const plan = referencePlans[planKey];
  const program = await sealTossProgram(planKey);
  const composition = await compileCardComposition(plan, { main: { kind: 'program', program }, supporting: [] });
  if (!TOSS_FIXTURES.some(f => f.id === name)) throw new Error(`no fixture ${name}`);
  blocks.push({ id: randomUUID(), type: 'animation', title: plan.title, scene: null, promptUsed: PROMPT, dx: 0, dy: 0, program: { fixtureId: name }, interact: { version: 1, planHash: composition.planHash, composition }, time: 0, selectedObject: null, marked: null });
  console.log(name, 'composed', composition.envelopeHash.slice(0, 12));
}
const made = await api('POST', '/api/canvases', { title: `Toss look: Overview, Standard, Deep ${Date.now().toString(36)}` });
const app = made.data?.name; if (!app) { console.log(`RESULT FAILED: canvas create ${made.status}`); process.exit(1); }
const saved = await api('PUT', `/api/learn/boards/${app}/main`, { state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks } });
if (!saved.data?.board_id) { console.log(`RESULT FAILED: board save ${saved.status}`); process.exit(1); }
mkdirSync('C:/s/spec/interact-real', { recursive: true });
writeFileSync('C:/s/spec/interact-real/look-canvas.json', JSON.stringify({ base: BASE, email: EMAIL, app, boardId: saved.data.board_id, createdAt: new Date().toISOString() }, null, 2));
console.log(`RESULT OK canvas ${app} board ${saved.data.board_id} (${EMAIL}): ${BASE}/apps/${app}`);
