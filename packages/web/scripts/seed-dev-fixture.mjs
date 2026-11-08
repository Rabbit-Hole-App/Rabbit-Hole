// Seeds one dev canvas with ONE saved fixture card (block.program.fixtureId) on a dev clone, so the card can be opened, driven and inspected without a model call.
//   RABBIT_HOLE_DEV_TEST_BYPASS=<dev test bypass> node scripts/seed-dev-fixture.mjs <fixture-id> <clone-base-url>
//   e.g. node scripts/seed-dev-fixture.mjs fixture-generated-ai-convolution https://rabbit-hole-web-dev-<worktree>.tryrabbithole.workers.dev
// Prints the canvas URL. Open it signed in with a dev test session (e2e/dev-cp.mjs mints them); a dev clone refuses ordinary sign-in. The dev build admits fixture cards (VITE_COACHING_DEV).
// The key is read from the environment by name and never printed. Exports seedFixture for a Playwright harness.
import { DEV_CP } from '../e2e/dev-cp.mjs';

const UA = { 'User-Agent': 'rabbit-hole-owner-launcher/1' };

export async function seedFixture(base, fixtureId, secret = process.env.RABBIT_HOLE_DEV_TEST_BYPASS) {
  if (!secret) throw new Error('RABBIT_HOLE_DEV_TEST_BYPASS is not set');
  const minted = await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `fixture-${Date.now().toString(36)}@example.com`, secret }) });
  const { session } = await minted.json();
  if (!session) throw new Error(`no dev session (HTTP ${minted.status})`);
  const call = async (method, path, body) => (await fetch(base + path, { method, headers: { ...UA, cookie: `small_session=${session}`, 'content-type': 'application/json', origin: base }, body: body ? JSON.stringify(body) : undefined })).json();
  const app = (await call('POST', '/api/canvases', { title: fixtureId })).name;
  if (!app) throw new Error('could not create a canvas');
  const block = { id: 'p1', type: 'animation', dx: 0, dy: 0, title: fixtureId, program: { fixtureId }, time: 0, selectedObject: null, marked: null };
  await call('PUT', `/api/learn/boards/${app}/main`, { state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [block] } });
  return { url: `${base}/apps/${app}`, session, app };
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const [fixtureId, base] = process.argv.slice(2);
  if (!fixtureId || !base) { console.error('usage: node scripts/seed-dev-fixture.mjs <fixture-id> <clone-base-url>'); process.exit(2); }
  const { url } = await seedFixture(base.replace(/\/+$/, ''), fixtureId);
  console.log(url);
}
