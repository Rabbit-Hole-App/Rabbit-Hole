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
    assert.equal(text(html.slice(html.indexOf('>', html.indexOf('role="status"')) + 1)).replace(/Stop speaking$/, '').replace(/\s+/g, ' ').trim(), `Voice on · ${label}`);
    // Stop speaking only while the Tutor speaks; its name survives the icon-only phone layout.
    assert.equal(rest.length, state === 'speaking' ? 1 : 0, state);
    if (state === 'speaking') assert.match(html, /<span class="max-md:sr-only">Stop speaking<\/span>/);
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
  const voiceFields = new Set(['state', 'caption', 'enter', 'exit', 'interrupt']);
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

test('VOICE-08: the caption shows the Tutor\'s words in an in-flow left rail between the tools and the surface', () => {
  const html = render(TutorCaption, { caption: { current: 'The weights come from softmax.', previous: 'Earlier words.', error: 'The Tutor could not answer. Try again.' }, state: 'listening', extras: createElement('button', { 'data-extra': '' }, 'Go down') });
  assert.match(html, /^<aside aria-label="Tutor caption" data-tutor-caption="true" class="flex h-full w-\[280px\] /);
  assert.match(html, /<p class="text-\[15px\] leading-6 text-ink">The weights come from softmax\.<\/p>/);
  assert.match(html, /<p class="mb-3 text-\[13px\] leading-5 text-ink-2">Earlier words\.<\/p>/, 'smaller and dimmer, still AA');
  assert.ok(html.indexOf('Earlier words.') < html.indexOf('The weights come from'), 'the previous line sits above');
  assert.match(html, /text-fail">The Tutor could not answer\. Try again\.<\/p>/);
  assert.match(html, /<button data-extra="">Go down<\/button>/, 'tutor.extras under the text');
  assert.doesNotMatch(html, /\b(absolute|fixed)\b/);
  assert.match(render(TutorCaption, { caption: { current: '', previous: null, error: null }, state: 'thinking', extras: null }), /<span class="shimmer">Thinking…<\/span>/);
  assert.match(mode, /className="flex h-full w-10 /, 'collapses to a 40px strip');
  // The rail sits right before the surface; the tools gutter docks order-first, so it lands left of the rail.
  assert.match(canvas, /gutterTop = null, leftRail = null \}\) \{/);
  assert.match(canvas, /\{leftRail && presenting === null && <div data-voice-rail className="flex shrink-0">\{leftRail\}<\/div>\}\n\s+<div ref=\{surface\} data-canvas-surface/);
  // Narrower at mid widths so the canvas stays dominant.
  assert.match(mode, /w-\[280px\] shrink-0 flex-col border-r border-line bg-white @max-\[1100px\]:w-\[220px\]/);
  assert.match(canvas, /data-tool-gutter[\s\S]*?toolSide === 'left' \? `order-first /);
  // While voice is on, tutor.extras live in the caption, not the chat sheet.
  assert.match(ask, /\{tutor\?\.extras && !voiceOn && <div data-tutor-extras/);
  assert.match(ask, /\{dock && voice\?\.state === 'off' && voice\.caption\?\.error && <div role="alert" data-voice-error /);
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
