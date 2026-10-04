// §8.2 static validation: the deterministic-render contract rejects network, wall-clock,
// unseeded randomness, timers, storage, CSS animation, imports off the allowlist, unbundled
// fonts and a stage that is not the brief's. node --test, no rendering.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SOURCE_MAX_BYTES, checkComposition } from './static-check.js';

const STAGE = 'export const stage = { width: 1920, height: 1080, fps: 30, durationInFrames: 300 };';
const mod = (body, imports = "import { AbsoluteFill, useCurrentFrame, random, interpolate } from 'remotion';") =>
  `${imports}\n${STAGE}\nexport default function M() {\n  const f = useCurrentFrame();\n${body}\n  return <AbsoluteFill style={{ fontFamily: 'Inter' }}>{f}</AbsoluteFill>;\n}\n`;
const check = src => checkComposition(src, { durationSeconds: 10 });
const rejects = (src, re) => { const e = check(src); assert.ok(e.some(x => re.test(x)), `expected ${re}, got:\n${e.join('\n') || '(nothing)'}`); };

test('the hand-written Demo A composition passes', () => {
  assert.deepEqual(checkComposition(readFileSync(new URL('./fixtures/demo-a/composition.jsx', import.meta.url), 'utf8'), { durationSeconds: 15 }), []);
});

test('a minimal deterministic composition passes', () => {
  assert.deepEqual(check(mod("  const x = random('dot-' + 3) * interpolate(f, [0, 30], [0, 1]);\n  const top = 4;\n  const g = { fill: 'url(#grad)' };")), []);
});

test('wall clock, timers, unseeded randomness', () => {
  rejects(mod('  const t = Date.now();'), /"Date" is not allowed/);
  rejects(mod('  const t = new Date();'), /"Date" is not allowed/);
  rejects(mod('  const t = performance.now();'), /"performance" is not allowed/);
  rejects(mod('  const r = Math.random();'), /Math.random is not allowed/);
  rejects(mod("  const r = Math['random']();"), /Math.random is not allowed/);
  rejects(mod('  const r = random(null);'), /random\(\) needs a seed/);
  rejects(mod('  const r = random();'), /random\(\) needs a seed/);
  rejects(mod('  requestAnimationFrame(() => {});'), /"requestAnimationFrame" is not allowed/);
  rejects(mod('  setTimeout(() => {}, 10);'), /"setTimeout" is not allowed/);
  rejects(mod('  setInterval(() => {}, 10);'), /"setInterval" is not allowed/);
  rejects(mod('  const s = (1234.5).toLocaleString();'), /depends on the host locale/);
  rejects(mod('  const n = new Intl.NumberFormat();'), /"Intl" is not allowed/);
});

test('network and storage', () => {
  rejects(mod("  fetch('https://example.com');"), /"fetch" is not allowed/);
  rejects(mod('  const x = new XMLHttpRequest();'), /"XMLHttpRequest" is not allowed/);
  rejects(mod("  const w = new WebSocket('ws://x');"), /"WebSocket" is not allowed/);
  rejects(mod("  const s = new EventSource('/s');"), /"EventSource" is not allowed/);
  rejects(mod("  navigator.sendBeacon('/b', 'x');"), /"navigator" is not allowed/);
  rejects(mod("  localStorage.setItem('a', 'b');"), /"localStorage" is not allowed/);
  rejects(mod("  sessionStorage.getItem('a');"), /"sessionStorage" is not allowed/);
  rejects(mod("  indexedDB.open('db');"), /"indexedDB" is not allowed/);
  rejects(mod('  const c = document.cookie;'), /"document" is not allowed/);
  rejects(mod("  const w = window['fet' + 'ch'];"), /"window" is not allowed/);
  rejects(mod('  const g = globalThis;'), /"globalThis" is not allowed/);
  rejects(mod('  const t = top.location;'), /"top" is not allowed/); // undeclared: it is window.top
  rejects(mod("  const u = 'https://cdn.example.com/x.png';"), /URLs are not allowed/);
  rejects(mod("  const bg = { backgroundImage: 'url(https://x/y.png)' };"), /URLs are not allowed/);
  rejects(`${STAGE}\nexport default function M() { return <img src="/x.png" />; }`, /<img> is not allowed/);
  rejects(`${STAGE}\nexport default function M() { return <svg><image href="https://x/y.png" /></svg>; }`, /<image> is not allowed/);
  rejects(`${STAGE}\nexport default function M() { return <svg><use href="/sprite.svg#a" /></svg>; }`, /href may only point inside the document/);
});

test('escape hatches: eval, Function, require, dynamic import', () => {
  rejects(mod("  eval('1');"), /"eval" is not allowed/);
  rejects(mod("  const fn = new Function('return 1');"), /"Function" is not allowed/);
  rejects(mod("  const ctor = (() => {}).constructor;"), /\.constructor is not allowed/);
  rejects(mod("  const fs = require('fs');"), /"require" is not allowed/);
  rejects(mod("  import('remotion');"), /dynamic import\(\) is not allowed/);
  rejects(mod('  const u = import.meta.url;'), /import.meta is not allowed/);
  rejects(`${STAGE}\nexport default function M() { return <div dangerouslySetInnerHTML={{ __html: '<b>x</b>' }} />; }`, /dangerouslySetInnerHTML/);
});

test('import allowlist', () => {
  rejects(mod('', "import rough from 'roughjs';"), /import "roughjs" is not on the allowlist/);
  rejects(mod('', "import fs from 'node:fs';"), /import "node:fs" is not on the allowlist/);
  rejects(mod('', "import { gsap } from 'gsap';"), /import "gsap" is not on the allowlist/);
  rejects(mod('', "import { Img } from 'remotion';"), /"Img" from "remotion" is not approved/);
  rejects(mod('', "import { staticFile, delayRender } from 'remotion';"), /"staticFile" from "remotion" is not approved/);
  rejects(mod('', "import * as R from 'remotion';"), /"\*" from "remotion" is not approved/);
  rejects(mod('', "import { useEffect, useState } from 'react';"), /"useEffect" from "react" is not approved/);
  rejects(mod('  const [s] = React.useState(0);', "import React from 'react';"), /React.useState is not approved/);
  rejects(`${STAGE}\nexport { x } from 'remotion';\nexport default function M() { return null; }`, /re-exports are not allowed/);
  assert.deepEqual(check(mod('  const m = React.useMemo(() => 1, []);', "import React from 'react';\nimport { AbsoluteFill, useCurrentFrame } from 'remotion';")), []);
});

test('CSS animation: everything moves from the frame', () => {
  rejects(mod("  const s = { transition: 'opacity 1s' };"), /CSS "transition" is not allowed/);
  rejects(mod("  const s = { animation: 'spin 1s infinite' };"), /CSS "animation" is not allowed/);
  rejects(mod("  const s = { animationName: 'spin' };"), /CSS "animationName" is not allowed/);
  rejects(mod("  const s = { WebkitTransition: 'all 1s' };"), /CSS "WebkitTransition" is not allowed/);
  rejects(mod("  const s = { 'transition-duration': '1s' };"), /CSS "transition-duration" is not allowed/);
  rejects(mod('  const css = `@keyframes spin { to { transform: rotate(1turn); } }`;'), /@keyframes/);
  rejects(mod("  const css = 'div { transition: all 1s }';"), /@keyframes \/ animation \/ transition/);
  rejects(`${STAGE}\nexport default function M() { return <style>{'p{color:red}'}</style>; }`, /<style> is not allowed/);
  rejects(`${STAGE}\nexport default function M() { return <svg><circle r="4"><animate attributeName="r" dur="1s" /></circle></svg>; }`, /<animate> is not allowed/);
});

test('fonts: only the bundled families', () => {
  rejects(mod("  const s = { fontFamily: 'Arial' };"), /font "Arial" is not bundled/);
  rejects(mod("  const s = { fontFamily: 'Inter, sans-serif' };"), /font "sans-serif" is not bundled/);
  rejects(mod('  const s = { fontFamily: pick() };'), /fontFamily must be a string literal/);
  rejects(mod("  const s = { font: '20px Inter' };"), /"font" shorthand/);
  rejects(`${STAGE}\nexport default function M() { return <svg><text fontFamily="Courier">x</text></svg>; }`, /font "Courier" is not bundled/);
  assert.deepEqual(check(`const F = 'Virgil';\n${STAGE}\nexport default function M() { return <div style={{ fontFamily: F }}>x</div>; }`), []);
});

test('the stage is the brief stage, as literals', () => {
  rejects(mod('').replace(STAGE, ''), /stage: missing/);
  rejects(mod('').replace('durationInFrames: 300', 'durationInFrames: 450'), /durationInFrames must be the literal 300 \(got 450\)/);
  rejects(mod('').replace('width: 1920', 'width: 1280'), /stage.width must be the literal 1920/);
  rejects(mod('').replace('fps: 30', 'fps: FPS'), /stage.fps must be the literal 30 \(got a non-literal\)/);
  rejects(mod('').replace('fps: 30', 'fps: 30, extra: 1'), /stage.extra is not part of the stage/);
  rejects(mod('').replace('export default function', 'function'), /export default/);
});

test('size cap and parse errors', () => {
  rejects(mod(`  const pad = '${'x'.repeat(SOURCE_MAX_BYTES)}';`), /exceeds the 65536-byte cap/);
  rejects('export default function (', /does not parse/);
  rejects('', /empty/);
});
