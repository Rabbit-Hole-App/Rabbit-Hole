import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sign, verify } from '../src/token.js';

// Execute the actual auth/resolution functions without importing the bundled HTML.
const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const functions = ['cliAuth', 'workspaceFor'].map((name) => source.match(new RegExp(`async function ${name}\\([^]*?\\n\\}`))[0]).join('\n');
const orgOf = (email) => email.split('@')[1].toLowerCase().replace(/\./g, '-');
const cliAuth = new Function('verify', 'orgOf', `${functions}; return cliAuth;`)(verify, orgOf);
const secret = 'cli-workspace-test-secret';
const email = 'builder@example.com';
const env = {
  MASTER_KEY: secret,
  DB: { prepare: () => ({ bind: (slug, user) => ({ first: async () => slug === 'w-team' && user === email ? { slug, name: 'Test team' } : null }) }) },
};

test('signed CLI login resolves its requested workspace through membership', async () => {
  const token = await sign({ t: 'cli', email, org: 'example-com' }, secret);
  const user = await cliAuth(new Request('https://small.example/api/workspaces', {
    headers: { Authorization: `Bearer ${token}`, 'X-Small-Workspace': 'w-team' },
  }), env);
  assert.equal(user.org, 'w-team');
  assert.equal(user.orgName, 'Test team');
  assert.equal(user.email, email);
});

test('no workspace keeps the email workspace; nonmembers cannot acquire a custom identity', async () => {
  const token = await sign({ t: 'cli', email, org: 'example-com' }, secret);
  for (const workspace of ['', 'w-not-a-member']) {
    const user = await cliAuth(new Request('https://small.example/api/apps', {
      headers: { Authorization: `Bearer ${token}`, 'X-Small-Workspace': workspace },
    }), env);
    assert.equal(user.org, 'example-com');
  }
});

test('invalid credentials cannot select a workspace', async () => {
  const user = await cliAuth(new Request('https://small.example/api/apps', {
    headers: { Authorization: 'Bearer forged-token', 'X-Small-Workspace': 'w-team' },
  }), env);
  assert.equal(user, null);
});
