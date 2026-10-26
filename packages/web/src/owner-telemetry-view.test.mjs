// The owner's telemetry page as markup over fixture states (owner request 2026-10-25). OwnerTelemetry.jsx is bundled with esbuild and
// TelemetryView is rendered with react-dom/server, as answer-footer.test.mjs renders its footer; the Shell is a stub. The shapes are
// those of /api/owner/telemetry/* (control-plane/test/telemetry-acceptance.test.js proves the API produces them). This proves what the
// page prints for a given payload: four cost states as four labelled rows, amounts only on rows that have one, no total, the
// not-found and not-configured states. It does NOT prove the page in a browser, or that effects fetch the right routes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'owner-telemetry-view-')), outfile = join(dir, 'view.cjs');
const stubShell = { name: 'stub-shell', setup(build) {
  build.onResolve({ filter: /^\.\/Shell\.jsx$/ }, args => ({ path: args.path, namespace: 'stub-shell' }));
  build.onLoad({ filter: /.*/, namespace: 'stub-shell' }, () => ({ contents: 'export default function Shell() { return null; }' }));
} };
await esbuild.build({
  stdin: { contents: "export { TelemetryView } from './OwnerTelemetry.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'js' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', plugins: [stubShell], loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const render = state => B.renderToStaticMarkup(B.createElement(B.TelemetryView, { state, days: 7, setDays: () => {} }));
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const rows = html => [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(([, inner]) => [...inner.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(([, cell]) => text(cell).trim()));

const ACCESS = { owner: true, configured: true, environment: 'dev' };
const OVERVIEW = { configured: true, environment: 'dev', days: 7, projectedAt: 1_760_000_000_000,
  events: [{ event_name: 'model_call.finished', outcome: 'completed', n: 12 }, { event_name: 'client.error', outcome: null, n: 1 }],
  attempts: [
    { cost_state: 'settled', charge_class: 'would_charge', attempts: 2, cost_micros: 1234, reserved_micros: 100000 },
    { cost_state: 'estimated', charge_class: 'would_charge', attempts: 1, cost_micros: 700, reserved_micros: 50000 },
    { cost_state: 'unknown', charge_class: 'free', attempts: 1, cost_micros: null, reserved_micros: 20000 },
    { cost_state: 'reserved', charge_class: 'would_charge', attempts: 1, cost_micros: null, reserved_micros: 30000 },
  ] };
const HEALTH = { configured: true, environment: 'dev', lastIngestedAt: 1_760_000_000_000, isolate: { delivered: 3, rejected: 0, dropped: 0 },
  delivery: [{ source: 'explain_jobs', observed_at: 1_760_000_000_000, pending: 1, dead: 2, oldest_age_ms: 90000 }, { source: 'projection', observed_at: 1_760_000_000_000, pending: 0, dead: null, oldest_age_ms: null }], cursors: [] };
const state = { access: ACCESS, overview: OVERVIEW, health: HEALTH, clientErrors: { groups: [{ kind: 'save_failed', fingerprint: 'ab12cd34ef56ab78', route: '/apps/:id', release_sha: null, occurrences: 3, accounts: 2, last_seen: 1_760_000_000_000 }] }, learning: null };

test('four cost states are four labelled rows; an amount is shown only on a row that has one, and nothing is totalled', () => {
  const html = render(state);
  const costRows = rows(html).filter(r => ['Measured', 'Estimated', 'Unknown, reservation held', 'Outstanding reservation'].includes(r[0]));
  assert.deepEqual(costRows.map(r => r[0]), ['Measured', 'Estimated', 'Unknown, reservation held', 'Outstanding reservation']);
  assert.deepEqual(costRows.map(r => r[3]), ['$0.0012', '$0.0007', 'none', 'none'], 'amounts: measured and estimated only; unknown and reserved say none');
  assert.deepEqual(costRows.map(r => r[4]), ['$0.1000', '$0.0500', '$0.0200', '$0.0300'], 'reservations are shown in their own column');
  assert.equal(/\btotal\b/i.test(text(html)), false, 'no total on the page');
  assert.match(text(html), /they are not added together/);
  assert.equal(/\.\.\.|…/.test(text(html)), false, 'no ellipsis');
});

test('events, browser errors and telemetry health print as recorded, dead letters included', () => {
  const t = rows(render(state));
  assert.ok(t.some(r => r[0] === 'model_call.finished' && r[1] === 'completed' && r[2] === '12'));
  assert.ok(t.some(r => r[0] === 'client.error' && r[1] === 'none' && r[2] === '1'));
  assert.ok(t.some(r => r[0] === 'save_failed' && r[1] === '/apps/:id' && r[2] === 'unknown' && r[3] === '3' && r[4] === '2'));
  const dead = t.find(r => r[0] === 'explain_jobs');
  assert.deepEqual([dead[2], dead[3]], ['1', '2'], 'pending 1 and dead 2');
  assert.deepEqual(t.find(r => r[0] === 'projection').slice(2, 4), ['0', 'none'], 'an unrecorded count says none, not 0');
});

test('hidden, loading and not-configured states print their one line and no data', () => {
  assert.equal(text(render({ hidden: true })).trim(), 'Not found.');
  assert.equal(/\$|Paid attempts/.test(render({ hidden: true })), false, 'the hidden page carries no amount');
  assert.equal(text(render({ loading: true })).trim(), 'Loading telemetry');
  const unconfigured = text(render({ access: { owner: true, configured: false, environment: 'test' } }));
  assert.match(unconfigured, /Telemetry storage is not configured on this deployment\./);
  assert.equal(/Paid attempts by cost state|Browser errors/.test(unconfigured), false);
  assert.match(unconfigured, /Action explorer/);
});
