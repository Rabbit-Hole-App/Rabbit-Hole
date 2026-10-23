import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// SHARE-04: an embed is a third-party frame, so a browser that refuses third-party storage throws on the first read of
// localStorage or sessionStorage. Every module that reads storage when it loads, or that the embed page reads early, must
// survive that: the canvas and Open in Rabbit Hole always render (CI run 39904228452: blank iframe in Chromium and Firefox).
const denied = () => { throw new DOMException('Access is denied for this document.', 'SecurityError'); };
const withDeniedStorage = async run => {
  const had = ['localStorage', 'sessionStorage'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  for (const [name] of had) Object.defineProperty(globalThis, name, { configurable: true, get: denied });
  try { return await run(); } finally { for (const [name, descriptor] of had) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } }
};

test('learn-audio loads, reads and writes with storage denied (it read localStorage at module load)', async () => {
  await withDeniedStorage(async () => {
    const audio = await import(`./learn-audio.js?denied=${Math.random()}`);
    assert.equal(audio.isMuted(), false);
    assert.equal(audio.getSpeed(), 1);
    audio.setMuted(true);
    audio.setSpeed(1.5);
    assert.equal(audio.isMuted(), true, 'kept for the page in memory');
    assert.equal(audio.getSpeed(), 1.5);
  });
});

test('the theme and workspace readers fall back to their defaults with storage denied', async () => {
  await withDeniedStorage(async () => {
    const api = await import(`./api.js?denied=${Math.random()}`);
    assert.equal(api.getTheme(), 'system');
    assert.equal(api.getWs(), '');
    assert.deepEqual(api.wsHeaders(), {});
  });
});

test('the shared-page storage users (guest draft, Chat history, sidebar, UI prefs) read as empty with storage denied', async () => {
  await withDeniedStorage(async () => {
    const { loadGuestDraft, saveGuestDraft } = await import(`./guest-draft.js?denied=${Math.random()}`);
    const { loadChat, saveChat, takeDraft, signInForAsk } = await import(`./shared-ask.js?denied=${Math.random()}`);
    const { readSidebar } = await import(`./sidebar-nav.js?denied=${Math.random()}`);
    const storage = () => sessionStorage;
    assert.equal(loadGuestDraft(storage, 't'), null);
    assert.equal(saveGuestDraft(storage, 't', 1, {}), false);
    assert.deepEqual(loadChat('t', 'guest'), []);
    assert.doesNotThrow(() => saveChat('t', 'guest', [{ role: 'user', content: 'x' }]));
    assert.equal(takeDraft('t'), '');
    assert.match(signInForAsk('t', 'draft'), /^\/login\?next=/, 'sign-in still works without a kept draft');
    assert.deepEqual(readSidebar(), { collapsed: false, width: 260 });
  });
});

test('no module the embed page loads reads storage at module level unguarded', () => {
  // A top-level `const x = localStorage.getItem(...)` runs when the chunk loads and takes the page down. Reads inside a function
  // run later and are each in a try; this finds the load-time shape in the whole source tree.
  const files = [];
  const walk = dir => { for (const entry of readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })) { if (entry.isDirectory()) walk(`${dir}${entry.name}/`); else if (/\.(js|jsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) files.push(`${dir}${entry.name}`); } };
  walk('./');
  const offenders = files.filter(file => readFileSync(new URL(file, import.meta.url), 'utf8').split('\n').some(line => /^(export )?(const|let|var)\s[^=]*=.*\b(localStorage|sessionStorage)\.(getItem|setItem)\(/.test(line) && !/=>/.test(line) && !/\btry\b/.test(line)));
  assert.deepEqual(offenders, []);
});
