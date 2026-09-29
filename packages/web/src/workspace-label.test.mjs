import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audienceOf, workspaceLabel } from './api.js';

// Rabbit Hole never names a workspace after an email domain (user, 2026-09-28).
test('the email-domain workspace reads Personal on the preview, never Gmail', () => {
  assert.equal(workspaceLabel(null, 'gmail-com', true), 'Personal');
  assert.equal(workspaceLabel(null, 'outlook-com', true), 'Personal');
});

test('a named workspace keeps its real name', () => {
  assert.equal(workspaceLabel('Acme', 'w-acme-1a2b', true), 'Acme');
});

test('the live build keeps its old workspace name', () => {
  assert.equal(workspaceLabel(null, 'gmail-com', false), 'Gmail');
});

// Whatever the label, the email-domain workspace reaches everyone who signs in with that domain.
test('visibility copy says who can see it, not the workspace label', () => {
  assert.equal(audienceOf(null, 'a@gmail.com'), 'anyone who signs in with an @gmail.com email');
  assert.equal(audienceOf('Acme', 'a@acme.com'), 'everyone in Acme');
});
