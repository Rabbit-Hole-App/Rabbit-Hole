// usage: node shot.mjs <tree root> <out.png>  — renders real card prose through the real Md (explain mode) at the card text width, in headless Chrome.
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [tree, out] = process.argv.slice(2);
const req = createRequire(tree + '/packages/web/package.json');
const esbuild = req('esbuild'), puppeteer = (await import(pathToFileURL('C:/s/kinds-fit/node_modules/puppeteer/lib/puppeteer/puppeteer.js').href)).default;
const dir = mkdtempSync(join(tmpdir(), 'frac-')), outfile = join(dir, 'md.cjs');
const viteUrl = { name: 'vite-url', setup(b) { b.onResolve({ filter: /\?url$/ }, a => ({ path: a.path, namespace: 'vite-url' })); b.onLoad({ filter: /.*/, namespace: 'vite-url' }, () => ({ contents: 'export default ""' })); } };
await esbuild.build({ stdin: { contents: "export * from './Md.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: tree + '/packages/web/src', loader: 'jsx' }, bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', plugins: [viteUrl], loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' } });
const B = createRequire(import.meta.url)(outfile);
const S = String.raw;
const cards = [
  ['softmax (owner example, bench idx 23)', S`For an input vector $\mathbf{z}$, the formula for class $i$ is defined as $\sigma(\mathbf{z})_i = \frac{e^{z_i}}{\sum_{j} e^{z_j}}$, so every output is positive and the outputs add up to one.`],
  ['softmax normalising (idx 43)', S`Softmax converts each score $s_i$ into a probability $p_i$ by exponentiating and normalising: $p_i=\frac{e^{s_i}}{\sum_j e^{s_j}}$.`],
  ['silhouette (idx 7)', S`The silhouette coefficient for a single customer is calculated as $\frac{b - a}{\max(a, b)}$, where $a$ is the mean intra-cluster distance and $b$ is the mean nearest-cluster distance.`],
  ['top-k (idx 124)', S`The reported probability for the chosen token becomes $\frac{42}{70}=0.6$ after the other tokens are dropped.`],
  ['two fractions + display + sqrt (must not change)', S`Both $\frac{1}{2}$ and $\frac{3}{4}$ are shares, and $\sqrt{\frac{a}{b}}$ keeps its stack. Display stays stacked:` + '\n\n' + S`$$p_i=\frac{e^{s_i}}{\sum_j e^{s_j}}$$`],
];
const css = readFileSync(req.resolve('katex/dist/katex.min.css'), 'utf8').replace(/url\(fonts\//g, `url(${pathToFileURL(req.resolve('katex/dist/katex.min.css')).href.replace(/katex\.min\.css$/, '')}fonts/`);
const html = `<html><head><style>${css}body{margin:0;padding:12px;background:#fff;font-family:Arial,sans-serif;color:#37352f;width:1000px}.c{display:inline-block;vertical-align:top;margin:0 12px 14px 0;border:1px solid #e9e9e7;padding:16px;width:408px;box-sizing:content-box;font-size:14px;line-height:1.55}.h{font:11px monospace;color:#888;margin-bottom:6px}</style></head><body>${cards.map(([h, t]) => `<div class="c"><div class="h">${h}</div>${B.renderToStaticMarkup(B.createElement(B.Md, { text: t, explain: true, fences: true }))}</div>`).join('')}</body></html>`;
writeFileSync(join(dir, 'p.html'), html);
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', '--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 600, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(join(dir, 'p.html')).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('wrote', out);
