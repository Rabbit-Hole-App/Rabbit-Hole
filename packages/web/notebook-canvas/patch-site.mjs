// After `jupyter-lite build` of the canvas notebook site: add the canvas
// bridge to its lab app, the only app the canvas opens.
// usage: node packages/web/notebook-canvas/patch-site.mjs <built site dir>
import { copyFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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

// Tool Performance v1: build/ chunks are content-hashed and its fonts are
// versioned with the package, so frames reuse them for a week without a
// revalidation round trip each (a cold notebook made ~94 requests). Pages,
// config and the bridge keep the default revalidation.
writeFileSync(join(site, '_headers'), ['/build/*', '  Cache-Control: public, max-age=604800', '/extensions/*', '  Cache-Control: public, max-age=604800', ''].join('\n'));
console.log(`✓ cache headers: ${join(site, '_headers')}`);

// A failed micropip download must say so (docs/features/notebook-kernel-startup.md): pyodide-kernel 0.8.6 awaits
// loadPackage(['micropip']), which logs a failed load and resolves, so the kernel died later on `import micropip` with an
// uncaught ModuleNotFoundError. The patched call checks the result and throws the load error itself, which the bridge
// shows on the card with a retry. A kernel build without that call fails here, not in a learner's browser.
const kernel = join(site, 'extensions', '@jupyterlite', 'pyodide-kernel-extension', 'static');
const call = 'await this._pyodide.loadPackage(["micropip"])';
const checked = 'await (async()=>{const e=[];await this._pyodide.loadPackage(["micropip"],{errorCallback:m=>{console.error(m);e.push(m)}});if(!this._pyodide.loadedPackages.micropip)throw Error("micropip could not load: "+(e.join(" ")||"unknown error"))})()';
let checkedFiles = 0;
for (const name of readdirSync(kernel).filter(file => file.endsWith('.js'))) {
  const file = join(kernel, name), js = readFileSync(file, 'utf8');
  if (js.includes(call)) writeFileSync(file, js.split(call).join(checked));
  if (js.includes(call) || js.includes(checked)) checkedFiles += 1;
}
if (!checkedFiles) throw new Error(`no micropip load to check in ${kernel}`);
console.log(`✓ micropip load checked: ${checkedFiles} kernel files`);
