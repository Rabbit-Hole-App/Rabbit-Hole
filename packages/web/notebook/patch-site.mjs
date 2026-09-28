// After `jupyter-lite build`: add the canvas bridge to the notebooks app only.
// The Lesson view's lab app is left untouched.
// usage: node packages/web/notebook/patch-site.mjs <built site dir>
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const site = process.argv[2];
if (!site) throw new Error('usage: patch-site.mjs <built site dir>');
copyFileSync(new URL('./canvas-bridge.js', import.meta.url), join(site, 'notebooks', 'canvas-bridge.js'));
const page = join(site, 'notebooks', 'index.html');
const html = readFileSync(page, 'utf8');
const tag = '<script src="./canvas-bridge.js"></script>';
if (!html.includes(tag)) writeFileSync(page, html.replace('</head>', `${tag}</head>`));
console.log(`✓ canvas bridge: ${page}`);
