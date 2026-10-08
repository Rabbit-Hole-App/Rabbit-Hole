// Voice Mode's UI (docs/features/voice-tutor-mvp.md, sections 6 and 6b). VoiceMode.jsx and ChatComposer.jsx
// are bundled with esbuild and rendered with react-dom/server, as practice-panel.test.mjs does; ask.jsx and
// AdaptiveCanvas.jsx are too large to mount here, so their voice wiring is pinned in source. The state
// machine itself is voice-session.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const mode = read('VoiceMode.jsx'), ask = read('ask.jsx'), canvas = read('AdaptiveCanvas.jsx'), css = read('index.css');

const here = fileURLToPath(new URL('.', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'voice-ui-'));
const outfile = join(dir, 'voice.cjs');
await esbuild.build({
  stdin: {
    contents: [
      "export { VoiceToggle, VoiceField, TutorCaption } from './VoiceMode.jsx';",
      "export { default as ChatComposer } from './ChatComposer.jsx';",
      "export { createElement } from 'react';",
      "export { renderToStaticMarkup } from 'react-dom/server';",
    ].join('\n'),
    resolveDir: here,
    loader: 'jsx',
  },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
});
const { VoiceToggle, VoiceField, TutorCaption, ChatComposer, createElement, renderToStaticMarkup } = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const noop = () => {};
const voiceIn = state => ({ state, caption: { current: '', previous: null, error: null }, enter: noop, exit: noop, interrupt: noop });
const render = (component, props) => renderToStaticMarkup(createElement(component, props));
const text = html => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'");
const buttons = html => [...html.matchAll(/<button[^>]*>/g)].map(match => match[0]);

test('VOICE-01: off, the mic is the neutral composer button; it waits while a typed answer is in flight', () => {
  const [off] = buttons(render(VoiceToggle, { voice: voiceIn('off') }));
  assert.match(off, /aria-label="Voice mode"/);
  assert.match(off, /aria-pressed="false"/);
  assert.doesNotMatch(off, /disabled/);
  assert.match(off, /rounded-lg border border-line/, 'COMPOSER_ADD, like the + button');
  assert.match(buttons(render(VoiceToggle, { voice: voiceIn('off'), disabled: true }))[0], /disabled=""/);
  // At the end of the dock's leading row, only while off, and disabled while busy (its Stop is in that slot).
  assert.match(ask, /\{dock && chatControl\}\n\s+\{dock && voice && voice\.state === 'off' && <VoiceToggle voice=\{voice\} disabled=\{busy\} \/>\}\n\s+<\/>\}/);
});

test('VOICE-03: in every on state the mic is the red breathing one, with the state in a live label', () => {
  for (const [state, label] of [['listening', 'Listening'], ['thinking', 'Thinking…'], ['speaking', 'Tutor speaking']]) {
    const html = render(VoiceField, { voice: voiceIn(state) });
    const [mic, ...rest] = buttons(html);
    assert.match(mic, /aria-label="Voice mode on - turn off"/, state);
    assert.match(mic, /aria-pressed="true"/);
    assert.match(mic, /voice-breathe /);
    assert.match(mic, /bg-\[#b42318\] text-white/);
    assert.match(html, /<span role="status" aria-live="polite"/);
    assert.equal(text(html.slice(html.indexOf('>', html.indexOf('role="status"')) + 1)).replace(/(Stop speaking|Stop)$/, '').replace(/\s+/g, ' ').trim(), `Voice on · ${label}`);
    // The learner can interrupt at any point of a turn: Stop while the Tutor thinks, Stop speaking while it speaks.
    // The name survives the icon-only phone layout.
    assert.equal(rest.length, state === 'listening' ? 0 : 1, state);
    if (state === 'speaking') assert.match(html, /aria-label="Stop speaking"[\s\S]*<span class="max-md:sr-only">Stop speaking<\/span>/);
    if (state === 'thinking') assert.match(html, /aria-label="Stop the Tutor"[\s\S]*<span class="max-md:sr-only">Stop<\/span>/);
  }
  // Below md the prefix is screen-reader only, so the visible state word is never clipped.
  assert.match(render(VoiceField, { voice: voiceIn('speaking') }), /<span class="max-md:sr-only">Voice on ·<\/span>/);
  // ask.jsx swaps the field for VoiceField and rests the side controls while voice is on.
  assert.match(ask, /const voiceOn = !!\(dock && voice && voice\.state !== 'off'\);/);
  assert.match(ask, /voice=\{voiceOn \? <VoiceField voice=\{voice\} \/> : null\}/);
  assert.match(ask, /aria-label="Add"\n\s+disabled=\{voiceOn\}/);
  assert.match(ask, /aria-label="Auto"[^\n]*disabled=\{voiceOn\}/);
  assert.match(ask, /data-context-button disabled=\{voiceOn\}/);
});

test('VOICE-04/06: no learner transcript has a rendering path', () => {
  const used = (source, pattern) => new Set([...source.matchAll(pattern)].map(match => match[1]));
  const voiceFields = new Set(['state', 'caption', 'enter', 'exit', 'interrupt', 'on', 'say']);
  for (const [name, source] of [['VoiceMode.jsx', mode], ['ask.jsx', ask]]) {
    for (const key of used(source, /\bvoice\??\.(\w+)/g)) assert.ok(voiceFields.has(key), `${name} reads voice.${key}`);
    for (const key of used(source, /\bcaption\??\.(\w+)/g)) assert.ok(['current', 'previous', 'error'].includes(key), `${name} reads caption.${key}`);
  }
  assert.doesNotMatch(mode, /transcript|partial|committed|\.raw\b|\.text\b/i);
  // ask.jsx's voice branches: the toggle, the field, the error notice - none touches learner words.
  const voiceLines = ask.split('\n').filter(line => /\bvoice(On)?\b/.test(line)).join('\n');
  assert.doesNotMatch(voiceLines, /transcript|partial|committed|\braw\b/i);
  // A learner string anywhere on the voice object never reaches the markup.
  const learner = 'why do the weights add up to one';
  const leaky = { ...voiceIn('listening'), raw: learner, transcript: learner, caption: { current: 'Softmax.', previous: null, error: null, raw: learner } };
  for (const html of [render(VoiceField, { voice: leaky }), render(TutorCaption, { caption: leaky.caption, state: 'listening', extras: null })]) assert.ok(!html.includes(learner));
});

test('VOICE-08: a small lower-left window shows only the reply being spoken now, never the history', () => {
  const extras = createElement('button', { 'data-extra': '' }, 'Go down');
  const html = render(TutorCaption, { caption: { current: 'The weights come from softmax.', previous: 'Earlier words.', error: null }, state: 'speaking', extras });
  assert.ok(html.startsWith('<aside aria-label="Tutor caption" data-tutor-caption="true" class="absolute bottom-3 left-3 '));
  assert.ok(html.includes(' flex max-h-[180px] w-[300px] '));
  assert.ok(html.includes('<p class="text-sm leading-5 text-ink">The weights come from softmax.</p>'));
  assert.ok(!html.includes('Earlier words.'), 'no message history');
  // The suggestion's buttons sit in a fixed footer outside the scrolling reply, so a long reply cannot push them out.
  assert.ok(html.includes('</div><div class="flex shrink-0 flex-col items-start gap-2 px-3 pb-3"><button data-extra="">Go down</button></div></aside>'));
  // A failed turn shows its error, not the last reply as if it answered.
  const failed = render(TutorCaption, { caption: { current: 'Old reply.', previous: null, error: 'The Tutor could not answer. Try again.' }, state: 'listening', extras: null });
  assert.ok(failed.includes('text-fail">The Tutor could not answer. Try again.</p>'));
  assert.ok(!failed.includes('Old reply.'));
  // Thinking replaces the last reply, the suggestion stays; nothing to say renders nothing.
  const thinking = render(TutorCaption, { caption: { current: 'Old reply.', previous: null, error: null }, state: 'thinking', extras: null });
  assert.ok(thinking.includes('<span class="shimmer">Thinking…</span>'));
  assert.ok(!thinking.includes('Old reply.'));
  assert.ok(render(TutorCaption, { caption: { current: '', previous: null, error: null }, state: 'thinking', extras }).includes('Go down'));
  assert.equal(render(TutorCaption, { caption: { current: '', previous: null, error: null }, state: 'listening', extras: null }), '');
  // It hides to one small button; the same toggle node serves both states, so focus survives.
  assert.ok(html.includes('aria-expanded="true" aria-label="Hide the Tutor caption"'));
  assert.ok(mode.includes('if (!open) return <aside aria-label="Tutor caption" data-tutor-caption className={`${place} rounded-lg border border-line bg-white shadow-pop`}>{toggle}</aside>;'));
  // The anchor is a zero-width slot right before the surface; the tools gutter docks order-first, left of it.
  assert.ok(canvas.includes('gutterTop = null, leftRail = null, onStartRabbitHole = null, onAddComment = null, commentPins = null, onCommentPin = null, onPinColor = null, onPinDelete = null, onPasteCode = null }) {'));
  // Professor Next Steps: the rail is one stack at that corner; the caption is held in its flow (relative, no corner offsets),
  // under the hook card, and on a phone the stack is the in-flow strip.
  assert.match(canvas, /\{leftRail && presenting === null && <div data-voice-rail className="relative z-20 w-0 shrink-0 @max-\[640px\]:w-full"\n\s+onDragOver=\{event => event\.preventDefault\(\)\} onDrop=\{event => event\.preventDefault\(\)\}>\n\s+<div data-left-stack className="absolute bottom-3 left-3 flex w-\[clamp\(208px,calc\(50cqw-500px\),300px\)\] flex-col items-start gap-2 \[&>\[data-tutor-caption\]\]:relative \[&>\[data-tutor-caption\]\]:inset-auto @max-\[640px\]:static @max-\[640px\]:w-full">\{leftRail\}<\/div>\n\s+<\/div>\}\n\s+<div ref=\{surface\} data-canvas-surface/);
  assert.match(canvas, /data-tool-gutter[\s\S]*?toolSide === 'left' \? `order-first /);
  // While voice is on, tutor.extras live in the caption, not the chat sheet.
  assert.ok(ask.includes('{tutor?.extras && !voiceOn && <div data-tutor-extras'));
  assert.ok(ask.includes("{dock && voice?.state === 'off' && voice.caption?.error && <div role=\"alert\" data-voice-error "));
});

test('VOICE-20: without voice the composer renders its field and Send exactly as text mode', () => {
  const props = { value: 'hi', onChange: noop, onSubmit: noop, dock: true, leading: createElement('span', { 'data-leading': '' }) };
  const typed = render(ChatComposer, props);
  assert.match(typed, /<textarea|<input/);
  assert.match(typed, /aria-label="Send"/);
  assert.match(render(ChatComposer, { ...props, busy: true, onStop: noop }), /aria-label="Stop"/);
  // With voice: the frame and leading stay; the field and Send/Stop give way to the voice node.
  const spoken = render(ChatComposer, { ...props, busy: true, onStop: noop, voice: createElement('div', { 'data-voice-field': '' }) });
  assert.match(spoken, /^<form data-chat-composer/);
  assert.match(spoken, /data-leading/);
  assert.match(spoken, /data-voice-field/);
  assert.doesNotMatch(spoken, /<textarea|<input|aria-label="Send"|aria-label="Stop"/);
});

test('the breathing ring stops under reduced motion and leaves a static ring', () => {
  assert.match(css, /@keyframes voice-breathe \{\n\s+from \{ transform: scale\(1\); opacity: 0\.55; \}\n\s+to \{ transform: scale\(1\.35\); opacity: 0; \}/);
  assert.match(css, /animation: voice-breathe 2s ease-in-out infinite;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n\s+\.voice-breathe::after, \.voice-breathe > svg \{ animation: none; \}\n\s+\.voice-breathe::after \{ transform: scale\(1\.2\); opacity: 0\.35; \}/);
});

test('a Rabbit Hole opening in Voice Mode is a voice turn, never a chat bubble (ask.jsx)', () => {
  // The opening goes to voice.say when Voice Mode is on (or turning on after the move); send() - the chat path that
  // draws the bubble and the typed reply - runs only when Voice Mode is off.
  const say = ask.indexOf('if (dock && voice?.on && voice.say(tutor.opening.question, { opening: true })) return;');
  const typed = ask.indexOf('send(tutor.opening.question, undefined, { opening: true });');
  assert.ok(say > 0 && typed > say && ask.slice(say, typed).split('\n').length === 2, 'voice.say first; send only when it does not take the turn');
});

test('the fake Voice harness (?voice=fake) runs only in the dev/review build; production always takes the real providers', () => {
  const voice = read('LearnVoice.jsx');
  assert.match(voice, /import \{ reviewTools \} from '\.\/flags\.js';/);
  assert.match(voice, /const fake = reviewTools && new URLSearchParams\(window\.location\.search\)\.get\('voice'\) === 'fake';/);
  // The flag is the only way in: nothing else creates the scripted adapters or exposes window.__voiceFake.
  assert.equal(voice.match(/createFakeStt\(|createFakeTts\(|window\.__voiceFake =/g).length, 3);
  assert.match(voice, /if \(fake\) \{\n\s+const ttsOptions = \{ onEvent: onTts \};\n\s+stt = createFakeStt/);
  assert.match(read('flags.js'), /export const reviewTools = learnPreview && import\.meta\.env\?\.VITE_COACHING_DEV === 'true';/);
});
