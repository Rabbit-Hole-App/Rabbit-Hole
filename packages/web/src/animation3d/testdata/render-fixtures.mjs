// The four artifacts the review page is rendered with in CI (e2e/animation-render-check.mjs) and the same four in the unit test (render-fixtures.test.mjs): the golden SGD
// artifact (testdata/sgd-golden.json, an offline fixture) and three saved, VALID author drafts of the Gate 1 regression plans (the grid game, the pendulum, the projectile
// game), committed inline in render-fixtures/*.json from branch evidence/animation-ladder (c4-7ffa197ba, run r01); the host seals them here as the pipeline does, with a fixed
// id, plan hash and time so every run draws the same artifact. Test data, not generation evidence. No machine-local path, no model, no network.
// expected: the readout strip the review page must show for the first three captures of the DEFAULT view (the side view shows the same states, so the same words), written by
// hand from each artifact's own rule (the golden's numbers are the ones sgd-golden.test.mjs checks against the closed form; the pendulum's period is 2 pi sqrt(L / 9.81):
// 2.01 s at 1.0 m, 2.69 s at 1.8 m, 3.47 s at 3.0 m), never read back from the page. The strip is the card's own lines (card.js readoutLines) joined by "  ·  ", then a game's goal.
import { readFileSync } from 'node:fs';
import { sealArtifact } from '../../../../control-plane/src/animation-author.js';

const read = name => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const SEAL = { revision: 1, planHash: '0'.repeat(64), model: null, createdAt: '2026-11-04T00:00:00.000Z' };

export const EXPECTED_STRIPS = Object.freeze({
  golden: ['Status: paused  ·  Loss (true value): 1.415  ·  Steps taken: 0', 'Status: running  ·  Loss (true value): 0.132  ·  Steps taken: 14', 'Status: diverged  ·  Loss (true value): 3.309  ·  Steps taken: 1'],
  'grid-game': ['Moves made: 0  ·  Steps to goal: 4  ·  Playing: Reach the green goal square.', 'Moves made: 1  ·  Steps to goal: 3  ·  Playing: Keep going.', 'Moves made: 3  ·  Steps to goal: 3  ·  Playing: Keep going.'],
  pendulum: ['Period: 2.01 s  ·  Length: 1.0 m', 'Period: 2.69 s  ·  Length: 1.8 m', 'Period: 3.47 s  ·  Length: 3.0 m'],
  projectile: ['Launches used (of 10): 0  ·  Targets hit (of 3): 0  ·  Playing: Target at 30 m. Set angle and speed, then Launch.', 'Launches used (of 10): 1  ·  Targets hit (of 3): 0  ·  Playing: Ball in flight...',
    'Landing distance: 23.0 m  ·  Missed by: 7.0 m  ·  Result: short  ·  Flight time: 2.16 s  ·  Highest point: 5.7 m  ·  Launches used (of 10): 1  ·  Targets hit (of 3): 0  ·  Playing: Missed (short). Target at 30 m. 9 launches left.'],
});

// -> [{ name, artifact (sealed, valid), strips: [3 strings] }]
export async function renderFixtures() {
  const out = [{ name: 'golden', artifact: read('sgd-golden.json').artifact }];
  for (const name of ['grid-game', 'pendulum', 'projectile']) out.push({ name, artifact: await sealArtifact(read(`render-fixtures/${name}.json`).draft, { ...SEAL, artifactId: `ar_render_${name.replace('-', '_')}` }) });
  return out.map(fixture => ({ ...fixture, strips: EXPECTED_STRIPS[fixture.name] }));
}
