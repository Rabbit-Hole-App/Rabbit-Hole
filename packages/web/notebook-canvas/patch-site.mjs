// After `jupyter-lite build` of the canvas notebook site: add the canvas
// bridge to its lab app, the only app the canvas opens.
// usage: node packages/web/notebook-canvas/patch-site.mjs <built site dir>
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const site = process.argv[2];
if (!site) throw new Error('usage: patch-site.mjs <built site dir>');
copyFileSync(new URL('./canvas-bridge.js', import.meta.url), join(site, 'lab', 'canvas-bridge.js'));
const page = join(site, 'lab', 'index.html');
const html = readFileSync(page, 'utf8');
const tag = '<script src="./canvas-bridge.js"></script>';
// Right after the page config and before JupyterLite's loader script: the
// parser runs the bridge first, so it is watching when the loader appends the
// app bundle and can give this card its own storage name. After the loader
// (e.g. at </head>) the bundle can win the race and open the shared default.
const config = /(<script id="jupyter-config-data"[\s\S]*?<\/script>)/;
if (!config.test(html)) throw new Error(`no jupyter-config-data script in ${page}`);
// The build can leave a patched page in place; move any earlier tag here.
writeFileSync(page, html.split(tag).join('').replace(config, `$1${tag}`));
console.log(`✓ canvas bridge: ${page}`);
