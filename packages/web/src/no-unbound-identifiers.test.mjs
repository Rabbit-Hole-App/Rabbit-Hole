// Fails when LearnPage.jsx or ask.jsx reference a name with no declaration or import (a ReferenceError at render that
// the build and the unit tests never reach). Scope-scans with @babel/parser + @babel/traverse (vite's dependencies).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;

// Browser globals these two files may use that Node's globalThis lacks.
const BROWSER = new Set(['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'location', 'history', 'screen',
  'getComputedStyle', 'matchMedia', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback',
  'innerWidth', 'innerHeight', 'getSelection', 'alert', 'confirm', 'prompt', 'open', 'FileReader', 'File', 'Blob', 'FormData', 'Image',
  'Audio', 'MediaRecorder', 'speechSynthesis', 'SpeechSynthesisUtterance', 'ResizeObserver', 'IntersectionObserver', 'MutationObserver',
  'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'PointerEvent', 'DOMRect', 'DOMParser',
  'Range', 'Selection', 'DataTransfer', 'ClipboardItem', 'ImageData', 'createImageBitmap', 'WebSocket', 'EventSource', 'CSS',
  '__APP_VERSION__', '__BUILD__']);

export function unbound(file) {
  const ast = parse(readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
  const found = new Set();
  traverse(ast, {
    ReferencedIdentifier(path) {
      const name = path.node.name;
      if (path.scope.hasBinding(name) || name in globalThis || BROWSER.has(name)) return;
      if (path.isJSXIdentifier() && /^[a-z]/.test(name)) return; // <div>, not a reference
      found.add(`${name} (line ${path.node.loc.start.line})`);
    },
  });
  return [...found];
}

for (const name of ['LearnPage.jsx', 'ask.jsx']) {
  test(`${name} has no undeclared identifiers`, () => {
    assert.deepEqual(unbound(new URL(`./${name}`, import.meta.url)), []);
  });
}
