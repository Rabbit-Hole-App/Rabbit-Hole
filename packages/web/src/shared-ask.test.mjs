import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GUEST, adoptGuestChat, askHistory, askPath, loadChat, readGuestAllowance, saveChat, sendKey, signInForAsk, takeDraft, takeTarget, HISTORY_TURNS } from './shared-ask.js';

// The composer on a shared canvas (docs/features/shared-canvas-ask.md).
const memory = () => { const map = new Map(); return { map, getItem: key => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) }; };
const page = readFileSync(new URL('./SharedBoardPage.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
// The shared canvas's Chat (SharedChat.jsx; guest Chat SHARE-03, C:/s/spec/share/contract-guest-chat.md).
const composer = readFileSync(new URL('./SharedChat.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('signed out, Send keeps the draft for this link and goes through sign-in, back with ?ask=1', () => {
  const storage = memory();
  assert.equal(signInForAsk('tok_123', 'Why scale by sqrt(d)?', storage), `/login?next=${encodeURIComponent('/b/tok_123?ask=1')}`);
  assert.equal(takeDraft('other', storage), '', 'drafts are per link');
  assert.equal(takeDraft('tok_123', storage), 'Why scale by sqrt(d)?');
  assert.equal(takeDraft('tok_123', storage), '', 'restored once');
  assert.equal(askPath('a/b'), '/api/learn/boards/shared/a%2Fb/ask');
});

test('the conversation is kept per link and per viewer, and only answered pairs ride, capped', () => {
  const storage = memory();
  saveChat('tok', 'ben@test', [{ role: 'user', content: 'q' }], storage);
  assert.deepEqual(loadChat('tok', 'ben@test', storage), [{ role: 'user', content: 'q' }]);
  assert.deepEqual(loadChat('tok', 'cara@test', storage), [], 'another viewer sees nothing');
  assert.deepEqual(loadChat('other', 'ben@test', storage), []);
  const turns = [
    { role: 'user', content: 'failed' }, { role: 'assistant', content: '', error: 'boom' },
    ...Array.from({ length: 8 }, (_, i) => [{ role: 'user', content: `q${i}` }, { role: 'assistant', content: `a${i}` }]).flat(),
    { role: 'user', content: 'in flight' }, { role: 'assistant', content: 'part', pending: true },
  ];
  const history = askHistory(turns);
  assert.equal(history.length, HISTORY_TURNS);
  assert.deepEqual(history.slice(0, 2), [{ role: 'user', content: 'q3' }, { role: 'assistant', content: 'a3' }]);
  assert.ok(!JSON.stringify(history).includes('failed') && !JSON.stringify(history).includes('in flight'));
});

test('Chat sits in the shared page\'s right panel (not over the canvas), with read-only context pills and the selected card', () => {
  assert.doesNotMatch(page, /composer=\{<Shared/, 'no floating answer window over the canvas composer slot');
  assert.match(page, /onAskTarget=\{setTarget\} askTargetId=\{target\?\.id \?\? null\} \/>/);
  assert.match(page, /<SharedChat token=\{token\} viewer=\{shared\.viewer\} context=\{shared\.context\} draft=\{askBack\?\.draft \?\? null\} target=\{target\} onClearTarget=\{\(\) => \{ setTarget\(null\); canvasApi\.current\?\.deselect\(\); \}\} \/>/);
  // The normal Chat's transcript and composer components, not a second Chat design.
  assert.match(composer, /import ChatComposer from '\.\/ChatComposer\.jsx';\nimport \{ ChatMessages \} from '\.\/ChatMessages\.jsx';/);
  assert.match(composer, /<ChatMessages msgs=\{msgs\} busy=\{busy\} learnChat /);
  assert.match(composer, /data-context-pill="repository"[^\n]*\n[^\n]*\{repository\.repo\} · \{repository\.commit\.slice\(0, 7\)\}/);
  assert.match(composer, /data-context-pill=\{source\.kind\}/);
  const pills = composer.slice(composer.indexOf('data-shared-context'), composer.indexOf('data-canvas-target'));
  assert.doesNotMatch(pills, /<button[^>]*aria-label="Remove/, 'the context pills are read-only');
  assert.match(composer, /\{target && <div data-canvas-target data-selected-card=\{target\.id\}[^\n]*\n\s+<MaterialIcon type=\{target\.context\?\.material_type\} \/>[\s\S]{0,200}aria-label="Remove selected card context"[^\n]*onClick=\{onClearTarget\}/);
  // Only the ask route, with this Send's request identity (the server counts a retry once).
  assert.match(composer, /streamAsk\(\{ path: askPath\(token\), body: \{ message, history, \.\.\.\(target \? \{ selected: target\.id \} : \{\}\) \}, signal: controller\.signal, headers: \{ 'X-RH-Action-Key': key \}, onEvent \}\)/);
  // A new Send gets a new id; the same question re-sent right after it failed reuses the failed Send's id (a retry).
  assert.match(composer, /const failed = turns\.at\(-1\)\?\.error && turns\.at\(-2\)\?\.content === message \? turns\.at\(-2\)\.key : null;\n\s+const history = askHistory\(turns\), key = failed \|\| sendKey\(\);/);
  assert.match(composer, /\{ role: 'user', content: message, key \}/);
  assert.doesNotMatch(composer, /\/api\/learn\/ask|\/api\/ask\b|\/api\/learn\/boards\/\$\{/);
  // Ask in Chat / Explain in Chat open this Chat (the page) and fill the composer (SharedChat), never sending.
  assert.match(page, /window\.addEventListener\('small:ask-focus', open\);/);
  assert.match(composer, /const prefill = event => \{ const text = event\.detail\?\.text; if \(text\) setInput\(current => \(current\.trim\(\) \? current : text\)\); inputRef\.current\?\.focus\(\); \};/);
});

test('back from sign-in: the draft and its card are restored, ?ask=1 leaves the address, and nothing is sent by itself', () => {
  assert.match(page, /get\('ask'\) !== '1'\) return null;\n\s+window\.history\.replaceState\(null, '', window\.location\.pathname\);\n\s+return \{ draft: takeDraft\(token\), target: takeTarget\(token\) \};/);
  assert.match(page, /const \[target, setTarget\] = useState\(\(\) => askBack\?\.target \?\? null\);/);
  assert.match(composer, /useState\(draft \|\| ''\)/);
  // send runs only from the composer's own submit: no effect, timer or restore path calls it.
  assert.doesNotMatch(composer, /\bsend\(/);
  assert.match(composer, /onSubmit=\{send\}/);
});

test('guest Chat: the trial shows unobtrusively, and once used Send becomes Sign in to continue with the draft kept', () => {
  assert.match(composer, /\{allowance\.remaining\} of \{allowance\.limit\} free messages left/);
  assert.match(composer, /if \(spent\) return toSignIn\(raw\);/);
  assert.match(composer, /data-guest-sign-in onClick=\{\(\) => toSignIn\(input\)\}>Sign in to continue<\/Button>/);
  // Refused before any model call: the question goes back into the composer and the allowance updates.
  assert.match(composer, /type === 'error' && data\.code === 'guest_limit'\) refusedGuest = /);
  assert.match(composer, /if \(refusedGuest \|\| signIn\) \{ setTurns\(all => all\.slice\(0, -2\)\); setInput\(current => current \|\| raw\); \}/);
  // A transport failure before any event retries once with the same key; a stop never retries.
  assert.match(composer, /try \{ await ask\(\); \} catch \(error\) \{ if \(error\.name === 'AbortError' \|\| heard\) throw error; await ask\(\); \}/);
  // Never a claim that the cookie identifies a person.
  assert.doesNotMatch(composer, /identif(y|ies) you|your identity|who you are/i);
  assert.doesNotMatch(composer, /[A-Za-z]\.\.\.|…/, 'no ellipsis in copy');
});

test('sign-in keeps the card and the guest conversation: takeTarget once, adoptGuestChat moves the conversation to the viewer', () => {
  const storage = memory();
  signInForAsk('tok', 'draft', storage, '/b/tok', { id: 'b1', kind: 'Card', title: 'Softmax', context: { secret: 1 } });
  assert.deepEqual(takeTarget('tok', storage), { id: 'b1', kind: 'Card', title: 'Softmax' });
  assert.equal(takeTarget('tok', storage), null, 'once');
  saveChat('tok', GUEST, [{ role: 'user', content: 'q' }, { role: 'assistant', content: 'a' }], storage);
  adoptGuestChat('tok', 'ben@test', storage);
  assert.deepEqual(loadChat('tok', 'ben@test', storage), [{ role: 'user', content: 'q' }, { role: 'assistant', content: 'a' }]);
  assert.deepEqual(loadChat('tok', GUEST, storage), [], 'the guest copy is gone');
  saveChat('tok', GUEST, [{ role: 'user', content: 'newer' }], storage);
  adoptGuestChat('tok', 'ben@test', storage);
  assert.equal(loadChat('tok', 'ben@test', storage)[0].content, 'q', 'never overwrites the viewer\'s own conversation');
  assert.match(sendKey(), /^[A-Za-z0-9_-]{8,128}$/);
  assert.notEqual(sendKey(), sendKey());
});

test('the guest allowance is read from the ask route; signed in or unreadable it is null and the server decides', async () => {
  const seen = [];
  const reply = body => async url => { seen.push(url); return { ok: true, json: async () => body }; };
  assert.deepEqual(await readGuestAllowance('tok', reply({ guest: { limit: 10, used: 3, remaining: 7 } })), { limit: 10, used: 3, remaining: 7 });
  assert.equal(await readGuestAllowance('tok', reply({ guest: null })), null);
  assert.equal(await readGuestAllowance('tok', async () => { throw new TypeError('offline'); }), null);
  assert.deepEqual(seen, ['/api/learn/boards/shared/tok/ask', '/api/learn/boards/shared/tok/ask']);
});

// Shared canvas v1, the owner's locked decisions (docs/features/shared-canvas-ask.md).
test('A: the viewer\'s chat stays private - the heading says so, and Fork sends only the link, never the chat', () => {
  assert.match(composer, /<Lock size=\{11\} aria-hidden \/>Only you see this chat\.<\/p>/);
  // count is the canvas's canonical fork count from the server, shown on the button (canvas-forking.md).
  assert.match(page, /<ForkButton source=\{\{ token \}\} title=\{shared\.title\} auto=\{forkRequested\} onForked=\{[^}]*\}[^}]*\}( count=\{shared\.fork_count\})? \/>/);
  assert.doesNotMatch(page, /<ForkButton[^>]*snapshot=/, 'no browser state rides with a shared fork');
  // The chat goes to this tab's sessionStorage (saveChat) and, as history, only with this viewer's own questions.
  assert.deepEqual(composer.match(/saveChat\([^)]*\)|askHistory\([^)]*\)/g), ['saveChat(token, who, turns)', 'askHistory(turns)']);
});

test('B: a notice that the pinned repository could not be read shows under that answer', () => {
  assert.match(composer, /else if \(type === 'done'\) \{ if \(data\.notice\) last\(\{ notice: data\.notice \}\);/);
  assert.match(composer, /turn\.content && turn\.notice \? `\$\{turn\.content\}\\n\\n_\$\{turn\.notice\}_`/);
});

test('C: the Share panel offers no private repository switch; no link opens a private repository', () => {
  const panel = readFileSync(new URL('./SharePanel.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const learn = readFileSync(new URL('./LearnPage.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  // Owner decision A2 (2026-10-16): a share link never opens a private repository, so the Share panel has no switch for it
  // and nothing calls the old per-link route (the server answers it 410).
  const menu = readFileSync(new URL('./home/CardMenu.jsx', import.meta.url), 'utf8');
  for (const [name, source] of [['SharePanel', panel], ['LearnPage', learn], ['CardMenu', menu]]) {
    assert.doesNotMatch(source, /data-share-repository|Allow questions to use private repository code|share\/repository|onRepository/, name);
  }
  // The shared page shows a repository pill only when the server sends one.
  assert.match(composer, /\{repository && <span data-context-pill="repository"/);
});

test('D: over a limit, the message shows in the conversation and the question goes back into the composer', () => {
  assert.match(composer, /else if \(type === 'error'\) \{ limited = !!data\.limited; last\(\{ error: data\.error \}\); \}/);
  assert.match(composer, /if \(limited\) setInput\(current => current \|\| raw\);/);
  assert.match(composer, /turn\.error \? \{ role: 'assistant', content: `✗ \$\{turn\.error\}` \}/, 'ChatMessages draws it as its error row');
});

test('F: the shared composer is a plain Q&A box - no +, attachments, model picker or / commands', () => {
  const call = composer.match(/<ChatComposer [^\n]*\/>/)[0];
  for (const prop of ['leading=', 'trailing=', 'onKeyDown=', 'ready=', 'voice=', 'token=']) assert.ok(!call.includes(prop), prop);
  assert.doesNotMatch(composer.replace(/^\s*\/\/.*$/gm, ''),/SlashCommands|CommandsSheet|ModelPicker|Paperclip|COMPOSER_ADD|type="file"|attachment/i);
  // The question, the history and the selected card's id: the server words the card from the board, never from the request.
  assert.match(composer, /body: \{ message, history, \.\.\.\(target \? \{ selected: target\.id \} : \{\}\) \}/);
});
