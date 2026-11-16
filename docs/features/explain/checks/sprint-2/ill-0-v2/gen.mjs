// ILL-0 v2 evidence: the six style-r1 subjects through the SHIPPED code path: figurePrompt (explanation-figures.js) and the real recraftImageAdapter (image-providers.js).
// The only addition is a transport wrapper that puts a fixed random_seed into the request body (Recraft's documented `random_seed`); the shipped code sends none.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const SRC = 'C:/s/sprint2-ill/packages/control-plane/src/';
const { FIGURE_MODEL, FIGURE_STYLE, FIGURE_STYLE_ID, figurePrompt } = await import(pathToFileURL(SRC + 'explanation-figures.js'));
const { imageAdapter, RECRAFT_CONTROLS } = await import(pathToFileURL(SRC + 'image-providers.js'));
const DRY = process.argv.includes('--dry');
const OUT = 'C:/s/sprint2-evidence/ill-0-v2';
mkdirSync(OUT, { recursive: true });
// the key by name from the credentials file: read into memory, never printed, never written
const env = readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
const key = env.match(/^RECRAFT_API_KEY=(.*)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '');
if (!key) throw new Error('RECRAFT_API_KEY missing');
const SUBJECTS = {
  a: 'A normal distribution curve with the mean marked and the ±1 standard deviation band shaded, labelled "Mean" and "Standard deviation".',
  b: 'Attention: three horizontal token strips labelled Query, Key, Value; Query and Key meet at a multiplication circle, the result is a small bar chart labelled weights, which meets Value at a sum circle.',
  c: 'A sentence split into tokens, each token becoming a short numeric vector.',
  d: 'A decision tree with a root split, two internal nodes and four leaves, one path highlighted.',
  e: 'A scatter plot of two classes separated by a curved boundary, with two misclassified points circled.',
  f: 'A loss curve going down with a flat plateau, with a marker at the minimum.',
};
const SEEDS = { a: 1001, b: 1002, c: 1003, d: 1004, e: 1005, f: 1006 };
const SETTINGS = { model: FIGURE_MODEL, aspect_ratio: '1:1', resolution: '1K' }; // the same as explanation-figures.js SETTINGS
const log = [];
let current = null;
const transport = (url, init) => {
  if (init.method === 'POST' && String(url).endsWith('/images/generations')) {
    const body = { ...JSON.parse(init.body), random_seed: SEEDS[current] };
    current_request = { method: 'POST', url, headers: { Authorization: 'Bearer <redacted>', 'Content-Type': 'application/json' }, body };
    if (DRY) return Promise.reject(new Error('dry run: nothing sent'));
    return fetch(url, { ...init, body: JSON.stringify(body) });
  }
  return fetch(url, init);
};
let current_request = null;
const adapter = imageAdapter({ RECRAFT_API_KEY: key }, FIGURE_MODEL, transport);
for (const id of Object.keys(SUBJECTS)) {
  current = id;
  const started = Date.now();
  try {
    const r = await adapter.generate({ model: FIGURE_MODEL, prompt: figurePrompt(SUBJECTS[id]), settings: SETTINGS, references: [] });
    writeFileSync(`${OUT}/${id}-ill0-v2.png`, r.bytes);
    log.push({ id, seed: SEEDS[id], ms: Date.now() - started, mimeType: r.mimeType, bytes: r.bytes.length, credits: r.usage?.credits ?? null });
    console.log(id, 'ok', r.mimeType, r.bytes.length, 'credits', r.usage?.credits);
  } catch (e) { log.push({ id, seed: SEEDS[id], error: e.code || String(e.message).slice(0, 200), status: e.status ?? null, providerCode: e.providerCode ?? null }); console.log(id, 'ERR', e.code, e.status, e.providerCode, String(e.message).slice(0, 120)); if (!DRY) break; }
  if (id === 'a') writeFileSync(`${OUT}/request-example.json`, JSON.stringify(current_request, null, 2));
}
if (!DRY) { writeFileSync(`${OUT}/usage.json`, JSON.stringify({ style: FIGURE_STYLE_ID, model: FIGURE_MODEL, totalCredits: log.reduce((s, x) => s + (x.credits ?? 0), 0), images: log }, null, 2)); }
writeFileSync(`${OUT}/preamble.txt`, FIGURE_STYLE + '\n');
console.log(DRY ? 'dry done' : 'done');
