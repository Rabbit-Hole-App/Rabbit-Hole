import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AVAILABILITY, CONNECTIONS, connectionsFor, findConnection, openedNotice, previewConnections } from './connections.js';

test('the catalog lists the six T02 §11 providers in order', () => {
  assert.deepEqual(CONNECTIONS.map((c) => c.id), ['github', 'slack', 'aws', 'google-slides', 'google-drive', 'notion']);
});

test('AWS appears only in builds that enable it', () => {
  assert.equal(connectionsFor({ aws: false }).some((c) => c.id === 'aws'), false);
  assert.equal(connectionsFor({ aws: true }).some((c) => c.id === 'aws'), true);
  assert.equal(connectionsFor().length, 5);
});

test('future providers are Planned and claim no account status', () => {
  for (const id of ['google-slides', 'google-drive', 'notion']) {
    assert.equal(findConnection(id).availability, 'planned');
    assert.equal(findConnection(id).account, undefined);
  }
  assert.equal(AVAILABILITY.planned, 'Planned');
});

test('availability is separate from account status, shown only where code can read it', () => {
  assert.equal(findConnection('github').availability, 'available');
  assert.match(findConnection('github').account, /No account needed for public repositories/);
  assert.equal(findConnection('slack').account, undefined); // no status read exists (Sidebar.jsx:137-142)
});

test('provider names typed in the bar resolve to rows', () => {
  assert.equal(findConnection('Google Slides').id, 'google-slides');
  assert.equal(findConnection('google-slides').id, 'google-slides');
  assert.equal(findConnection('Google Drive').id, 'google-drive');
  assert.equal(findConnection('google docs').id, 'google-drive');
  assert.equal(findConnection('Notion').id, 'notion');
  assert.equal(findConnection('  GitHub ').id, 'github');
  assert.equal(findConnection('dropbox'), null);
  assert.equal(findConnection(''), null);
});

test('the notice says where Settings opened, and that a planned provider was not connected', () => {
  assert.equal(openedNotice('connections', 'google-slides'), 'Opened Settings → Connections. Google Slides is planned; nothing was connected.');
  assert.equal(openedNotice('connections', 'slack'), 'Opened Settings → Connections.');
  assert.equal(openedNotice('connections'), 'Opened Settings → Connections.');
  assert.equal(openedNotice('preferences'), 'Opened Settings → Preferences.');
  assert.equal(openedNotice(), 'Opened Settings.');
});

test('Rabbit Hole Settings lists only working providers: no planned rows, no live-only Slack', () => {
  assert.deepEqual(previewConnections({ aws: false }).map((c) => c.id), ['github']);
  assert.deepEqual(previewConnections({ aws: true }).map((c) => c.id), ['github', 'aws']);
  assert.equal(CONNECTIONS.some((c) => /Planned/.test(c.account || '')), false);
});
