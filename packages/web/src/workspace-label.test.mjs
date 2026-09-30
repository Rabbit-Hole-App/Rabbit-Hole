import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workspaceLabel } from './api.js';

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
