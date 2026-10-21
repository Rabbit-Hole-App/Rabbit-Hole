// Rabbit Hole Settings' panes and old tab names (owner brief L11, 2026-10-20). The browser run is e2e/settings-check.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_PANE, paneTitle, resolveSettingsTab, SETTINGS_PANES } from './settings-model.js';

test('the panes, in order, are the learning product\'s; the nav label is Profile, never the person\'s name', () => {
  assert.deepEqual(SETTINGS_PANES.map((p) => p.title), ['Profile', 'Appearance & input', 'Learning & voice', 'AI usage', 'Privacy & security']);
  assert.equal(DEFAULT_PANE, 'profile');
  assert.equal(paneTitle('usage'), 'AI usage');
  assert.equal(paneTitle('developer'), null);
});

test('old tab names land on the pane that has their content now', () => {
  assert.deepEqual(resolveSettingsTab('preferences'), { pane: 'appearance', removed: false });
  assert.deepEqual(resolveSettingsTab('theme'), { pane: 'appearance', removed: false });
  assert.deepEqual(resolveSettingsTab('identity'), { pane: 'profile', removed: false });
  assert.deepEqual(resolveSettingsTab('security'), { pane: 'privacy', removed: false });
  for (const pane of SETTINGS_PANES) assert.deepEqual(resolveSettingsTab(pane.id), { pane: pane.id, removed: false });
  for (const none of [undefined, null, '']) assert.deepEqual(resolveSettingsTab(none), { pane: 'profile', removed: false });
});

test('a removed or unknown section opens Profile and says so, never an empty pane', () => {
  for (const gone of ['developer', 'connections', 'general', 'notifications', 'mail', 'ai', 'mcp', 'teamspaces', 'people', 'import', 'pages', 'emoji', 'nonsense']) {
    assert.deepEqual(resolveSettingsTab(gone), { pane: 'profile', removed: true }, gone);
  }
});

// Source pins for what the owner removed and where controls stay (no browser needed for absence).
test('Rabbit Hole Settings carries no small-deploy content, AWS, Watch, Tutor switch or second Share control', () => {
  const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const source = read('RabbitHoleSettings.jsx');
  for (const gone of ['small deploy', 'npm i -g', 'Base URL', 'AwsConnection', 'Watch', 'nightly', 'Weekly email', 'Slug', 'Start from a repository', 'Tutor On', 'Magic link']) {
    assert.equal(source.includes(gone), false, gone);
  }
  assert.equal(/\bapi\(|method: 'POST'/.test(source), false, 'opening Settings reads only through the profile, session and usage helpers');
  const sidebar = read('Sidebar.jsx');
  assert.match(sidebar, /learnPreview\n\s+\? <RabbitHoleSettings /, 'the Rabbit Hole build renders its own Settings');
});
