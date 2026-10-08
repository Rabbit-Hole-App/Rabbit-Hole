import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { askHistory, askPath, loadChat, saveChat, signInForAsk, takeDraft, HISTORY_TURNS } from './shared-ask.js';

// The composer on a shared canvas (docs/features/shared-canvas-ask.md).
const memory = () => { const map = new Map(); return { map, getItem: key => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) }; };
const page = readFileSync(new URL('./SharedBoardPage.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const composer = page.slice(page.indexOf('function SharedAsk('));

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

test('the shared page puts Learn\'s composer shell in the canvas composer slot, with read-only context pills', () => {
  // readOnly may be followed by onState (the selected card a Rabbit Hole starts from, shared-canvas-rabbit-hole.md) and
  // onStartRabbitHole (the card right-click menu starts it from the card it was opened on), then the read-only Rabbit
  // Holes Map (gutterTop, dive-v1.md "Shared map").
  assert.match(page, /<AdaptiveCanvas [^\n]*readOnly( onState=\{onCanvasState\})?( onStartRabbitHole=\{startFromCard\})?(\n\s+gutterTop=\{holes \? <DiveNavigator [^\n]*\/> : null\})?(\n\s+leftRail=\{<SharedNextSteps [^\n]*\/>\})?\n\s+onAskTarget=\{setTarget\} askTargetId=\{target\?\.id \?\? null\}\n\s+composer=\{<SharedAsk token=\{token\} viewer=\{shared\.viewer\} context=\{shared\.context\} draft=\{askDraft\} target=\{target\} onClearTarget=\{\(\) => \{ setTarget\(null\); canvasApi\.current\?\.deselect\(\); \}\} \/>\} \/>/);
  assert.match(page, /import ChatComposer from '\.\/ChatComposer\.jsx';/);
  assert.match(composer, /<ChatComposer dock value=\{input\} onChange=\{setInput\} onSubmit=\{send\}/);
  assert.match(composer, /data-context-pill="repository"[^\n]*\n[^\n]*\{repository\.repo\} · \{repository\.commit\.slice\(0, 7\)\}/);
  assert.match(composer, /data-context-pill=\{source\.kind\}/);
  const pills = composer.slice(composer.indexOf('data-shared-context'), composer.indexOf('data-canvas-target'));
  assert.doesNotMatch(pills, /<button[^>]*aria-label="Remove/, 'the context pills are read-only');
  // The one selected card's pill (owner, 2026-10-08) has its x: it clears the selection with the pill.
  assert.match(composer, /\{target && <div data-canvas-target data-selected-card=\{target\.id\}[^\n]*\n\s+<MaterialIcon type=\{target\.context\?\.material_type\} \/>[\s\S]{0,200}aria-label="Remove selected card context"[^\n]*onClick=\{onClearTarget\}/);
  // Answers render with Md and no onFile: no owner-only file viewer from a shared page.
  assert.match(composer, /\{\/\* ponytail: no onFile[^\n]*\*\/\}\n\s+<Md text=\{turn\.content\} \/>/);
  // The answer window is the viewer's, kept in this tab - never posted anywhere but the ask route.
  assert.match(composer, /streamAsk\(\{ path: askPath\(token\), body: \{ message, history, \.\.\.\(target \? \{ selected: target\.id \} : \{\}\) \}/);
  assert.doesNotMatch(composer, /\/api\/learn\/ask|\/api\/ask\b|\/api\/learn\/boards\/\$\{/);
});

test('back from sign-in: the draft is restored and focused, ?ask=1 leaves the address, and nothing is sent by itself', () => {
  assert.match(page, /get\('ask'\) !== '1'\) return null;\n\s+window\.history\.replaceState\(null, '', window\.location\.pathname\);\n\s+return takeDraft\(token\);/);
  assert.match(composer, /useState\(draft \|\| ''\)/);
  assert.match(composer, /useEffect\(\(\) => \{ if \(draft !== null\) inputRef\.current\?\.focus\(\); \}, \[\]\);/);
  // send runs only from the composer's own submit: no effect, timer or restore path calls it.
  assert.doesNotMatch(composer, /\bsend\(/);
  assert.match(composer, /if \(!viewer\) return toSignIn\(raw\);/);
});

// Shared canvas v1, the owner's locked decisions (docs/features/shared-canvas-ask.md).
test('A: the viewer\'s chat stays private - the heading says so, and Fork sends only the link, never the chat', () => {
  assert.match(composer, /<Lock size=\{11\} \/>Only you see this chat\. Fork to make your own editable copy\.<\/span>/);
  // count is the canvas's canonical fork count from the server, shown on the button (canvas-forking.md).
  assert.match(page, /<ForkButton source=\{\{ token \}\} title=\{shared\.title\} auto=\{forkRequested\} onForked=\{[^}]*\}[^}]*\}( count=\{shared\.fork_count\})? \/>/);
  assert.doesNotMatch(page, /<ForkButton[^>]*snapshot=/, 'no browser state rides with a shared fork');
  // The chat goes to this tab's sessionStorage (saveChat) and, as history, only with this viewer's own questions.
  assert.deepEqual(composer.match(/saveChat\([^)]*\)|askHistory\([^)]*\)/g), ['saveChat(token, viewer, turns)', 'askHistory(turns)']);
});

test('B: a notice that the pinned repository could not be read shows under that answer', () => {
  assert.match(composer, /else if \(type === 'done' && data\.notice\) last\(\{ notice: data\.notice \}\);/);
  assert.match(composer, /\{turn\.notice && <p data-shared-notice[^>]*>\{turn\.notice\}<\/p>\}/);
});

test('C: the Share panel offers repository code only for a private repository, through the owner-only route', () => {
  const panel = readFileSync(new URL('./SharePanel.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const learn = readFileSync(new URL('./LearnPage.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(panel, /\{current\.view && current\.repository\?\.private && \(\n\s+<label data-share-repository/);
  assert.match(panel, /<Switch on=\{current\.repository\.repo_access\} label="Allow questions to use private repository code" disabled=\{busy\} onChange=\{onRepository\} \/>/);
  // The owner's copy (2026-10-04): what it allows, for whom, at which pinned revision, and what Off means.
  assert.match(panel, /<span className="block">Allow questions to use private repository code<\/span>/);
  assert.match(panel, /Signed-in viewers' questions can use code from \{current\.repository\.repo\} at \{current\.repository\.commit\.slice\(0, 7\)\}, the revision pinned for this link\. Off: only this canvas's cards, notes and sources\./);
  assert.match(learn, /api\(`\$\{boardPath\}\/share\/repository`, \{ method: 'POST', body: JSON\.stringify\(\{ allow \}\) \}\)/);
  assert.match(learn, /onRepository=\{changeRepositoryAccess\}/);
  // The shared page shows a repository pill only when the server sends one.
  assert.match(composer, /\{repository && <span data-context-pill="repository"/);
});

test('D: over a limit, the message shows in the viewer\'s window and the question goes back into the composer', () => {
  assert.match(composer, /else if \(type === 'error'\) \{ limited = !!data\.limited; last\(\{ error: data\.error, limited \}\); \}/);
  assert.match(composer, /if \(limited\) setInput\(current => current \|\| raw\);/);
  assert.match(composer, /<div role="alert" data-shared-limited=\{turn\.limited \|\| undefined\}/);
});

test('F: the shared composer is a plain Q&A box - no +, attachments, model picker or / commands', () => {
  const call = composer.match(/<ChatComposer dock [^\n]*\n[^\n]*\/>/)[0];
  for (const prop of ['leading=', 'trailing=', 'onKeyDown=', 'ready=', 'voice=', 'multiline']) assert.ok(!call.includes(prop), prop);
  assert.doesNotMatch(composer, /SlashCommands|CommandsSheet|ModelPicker|Paperclip|\bPlus\b|type="file"|attachment/i);
  // The question, the history and the selected card's id: the server words the card from the board, never from the request.
  assert.match(composer, /body: \{ message, history, \.\.\.\(target \? \{ selected: target\.id \} : \{\}\) \}/);
});
