// The browser validates against the server's contract module itself (control-plane/src/telemetry-contract.js), not a copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEvent, routeTemplate, validateBatch } from '../../control-plane/src/telemetry-contract.js';

test('a browser error event built from a real path validates; one carrying the message text or the URL is refused', () => {
  const event = makeEvent('client.error', { feature: 'canvas', payload: { kind: 'save_failed', fingerprint: '9f86d081', route: routeTemplate('/b/AbCdEfGhIjKlMnOpQrStUv?ref=x'), browser: 'chrome', device: 'desktop', status_code: 503 } },
    { environment: 'production', service: 'web' });
  const leaked = { ...event, event_id: 'ev-leaked', payload: { ...event.payload, route: '/b/AbCdEfGhIjKlMnOpQrStUv?ref=x' } };
  const withText = { ...event, event_id: 'ev-text', payload: { ...event.payload, message: 'Cannot read properties of undefined' } };
  const result = validateBatch([event, leaked, withText]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.events.map(e => e.event_id), [event.event_id]);
  assert.equal(result.events[0].payload.route, '/b/:token');
  assert.equal(result.rejected, 2);
});
