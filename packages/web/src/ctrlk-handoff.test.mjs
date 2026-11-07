// Ctrl+K's explicit command handed to Chat (owner spec 2026-10-29 4.2; slash follow-up bugs 3 and 4, 2026-10-29). Bug 3: Ctrl+K closed
// as soon as LearnSlash took the line, before Chat took its prompt; a Chat that was streaming then refused it and the command was lost.
// Bug 4: the handed-off turn cleared and used the Chat's own attachment, code range, image and armed card, so a material command
// refused the Chat's unrelated attachment. The pure helper runs for real; ask.jsx and LearnSlash.jsx cannot run under node, so their
// wiring is pinned by source text, as ask-toc-view.test.mjs does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { promptTaken } from './learn-slash.js';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('promptTaken: a prompt the Chat refuses at once is not taken; one it is running, or ran, is', async () => {
  const refuse = async () => false; // ask.jsx send: `if (!message || busy) return false` before its first await
  const stream = async () => { await new Promise(() => {}); }; // a taken turn still streaming
  assert.equal(await promptTaken(refuse()), false);
  assert.equal(await promptTaken(false), false);
  assert.equal(await promptTaken(stream()), true, 'taken: Ctrl+K need not wait for the answer');
  assert.equal(await promptTaken((async () => undefined)()), true, 'a turn that ended');
  assert.equal(await promptTaken(undefined), true);
});

test('Ctrl+K closes only when Chat took the command; a refused one stays in Ctrl+K, and the Chat composer is left as it was', () => {
  const picker = read('LearnSlash.jsx'), editor = read('InlineAiEditor.jsx'), page = read('LearnPage.jsx'), ask = read('ask.jsx');
  assert.match(picker, /handoff: \(raw, handoff\) => \(busy \? false : exec\(raw, handoff\)\),/, 'the handoff answers what exec decided');
  assert.match(picker, /return promptTaken\(sent\);/, 'a prompt is taken only when the Chat takes it');
  assert.match(picker, /if \(out === false && !handoff\) \{ setInput\(raw\);/, 'a refused handed-off line is not put in the Chat composer');
  assert.match(ask, /return slashRef\.current\.handoff\(line, /);
  assert.match(page, /return \(await live\.ask\(\{ line, about \}\)\) === true;/);
  assert.match(editor, /if \(await config\.handoff\(out\.handoff\.line, \{ selection, concept: title \}\)\) \{ onClose\(\); return; \}\n\s+setHandoffError\(HANDOFF_REFUSED\);/, 'refused: Ctrl+K stays open with the busy message');
});

test('a handed-off turn (keepDraft) neither uses nor clears the Chat draft, @-chips, attachment, code range, image, armed card or Edit target', () => {
  const ask = read('ask.jsx'), send = ask.slice(ask.indexOf('  const send = async (raw, scopeOverride'), ask.indexOf('  // Regenerate (contract B5'));
  assert.match(send, /const edit = !regenerate && !keepDraft \? editTarget : null;/);
  assert.match(send, /const chips = keepDraft \? \[\] : mentions;/);
  assert.match(send, /const message = \[\.\.\.chips\.map\(\(m\) => `@\$\{m\}`\), raw\.trim\(\)\]/);
  assert.match(send, /if \(!regenerate && !keepDraft\) \{ setInput\(''\); setMentions\(\[\]\); \}/);
  assert.match(send, /const sourceRange = keepDraft \? null : codeSelection;\n\s+if \(!keepDraft\) setCodeSelection\(null\);/);
  assert.match(send, /const attached = regenerate \|\| keepDraft \? null : file;\n\s+if \(!regenerate && !keepDraft\) setFile\(null\);/);
  assert.match(send, /const board = keepDraft \? null : boardContext;/);
  for (const key of ['paper', 'wiki', 'video', 'image']) assert.match(send, new RegExp(`const question${key[0].toUpperCase()}${key.slice(1)} = board\\?\\.${key};`), key);
  assert.match(send, /if \(!isDemo && !keepDraft\) boardContext\?\.removeImage\(\);/);
  assert.match(send, /const target = keepDraft \? null : canvasTarget;/);
  assert.match(send, /\.\.\.\(chips\.length \? \{ mentions: \[\.\.\.chips\] \} : \{\}\),/);
  // The material brief is about Ctrl+K's own selection, never the Chat's armed card.
  assert.match(send, /const chosen = about\?\.selection \?\? \(target \? /);
  // LearnSlash's run: a handed-off /explain never takes the Chat's attached image.
  assert.match(read('LearnPage.jsx'), /attachedImage: !handoff && imageAttached && imageContext\?\.id \? imageContext\.id : null,/);
});
