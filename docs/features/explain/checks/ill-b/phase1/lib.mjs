// ILL-B shared helpers (experiment, outside the product repo). Product code is read-only from ILLB_PRODUCT (default C:/s/r162-int/packages/control-plane/src/).
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export const HERE = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
export const PRODUCT = process.env.ILLB_PRODUCT ?? 'C:/s/r162-int/packages/control-plane/src/';
export const OUT = process.env.ILLB_OUT ?? 'C:/s/ill-b/run';
export const CAP = 15;
const P = f => import(pathToFileURL(PRODUCT + f).href);
export const sharp = () => createRequire('C:/s/r162-int/package.json')('sharp');

// keys by NAME from the .env file named in ILLB_ENV_FILE (no default path), never printed
export function envKey(name) {
  const f = process.env.ILLB_ENV_FILE; if (!f) { console.error('STOP: set ILLB_ENV_FILE to the .env file that holds the keys'); process.exit(2); }
  const m = fs.readFileSync(f, 'utf8').match(new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*?)\\s*$`, 'm'));
  if (!m) { console.error(`STOP: ${name} not in the env file (name checked)`); process.exit(2); }
  return m[1].replace(/^(['"])(.*)\1$/, '$2');
}
export const readJsonl = f => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : []);
export const appendJsonl = (f, row) => fs.appendFileSync(f, JSON.stringify(row) + '\n');
export const hash31 = text => crypto.createHash('sha256').update(text).digest().readUInt32BE(0) & 0x7fffffff;
export const usd = units => units / 1000;

export const MODELS = [
  { arm: 'F', id: 'recraftv4_1_flash', units: 7 },
  { arm: 'S', id: 'recraftv4_1', units: 35 },
  { arm: 'V', id: 'recraftv4_1_vector', units: 80 },
  { arm: 'F2', id: 'recraftv4_1_flash_v2', units: 7 },
];
export const subjects = JSON.parse(fs.readFileSync(new URL('./subjects.json', import.meta.url), 'utf8')).subjects;

// Product pieces + the 55 prompt forms and the 220 calls, exactly as ill-b.mjs built them (spec section 2).
export async function buildPlan() {
  const { RECRAFT_CONTROLS } = await P('image-providers.js');
  const { figurePrompt, FIGURE_STYLE } = await P('explanation-figures.js');
  const { withNoTextSuffix, AUTHOR_PICTURE_LIMITS } = await P('learn-primitives.js');
  const { mtokRates, priceUsage } = await P('pricing-registry.js');
  const labelSentence = labels => ` Label the parts with exactly these words and no others: ${labels.map(l => `"${l}"`).join(', ')}.`;
  const forms = [];
  for (const s of subjects) {
    forms.push({ subject: s.id, group: s.group, form: 'N', prompt: figurePrompt(withNoTextSuffix(s.subject)) });
    if (s.group !== 'physical' || ['P01', 'P02', 'P03', 'P04', 'P05'].includes(s.id)) forms.push({ subject: s.id, group: s.group, form: 'L', prompt: `${FIGURE_STYLE}\n\nSubject: ${s.subject + labelSentence(s.labels)}` });
  }
  const problems = [];
  for (const f of forms) { const s = subjects.find(x => x.id === f.subject); if (f.form === 'N' && s.subject.length > AUTHOR_PICTURE_LIMITS.prompt) problems.push(`${f.subject} N too long`); if (f.form === 'L' && (s.subject.length + labelSentence(s.labels).length > 400 || s.labels.length > 4)) problems.push(`${f.subject} L too long`); }
  if (forms.length !== 55) problems.push(`expected 55 forms, built ${forms.length}`);
  const body = (prompt, model, seed, extra = {}) => ({ prompt, model, size: '1024x1024', n: 1, response_format: 'url', controls: RECRAFT_CONTROLS, random_seed: seed, ...extra });
  const calls = [];
  for (const m of MODELS) for (const f of forms) { const id = `${m.arm}-${f.subject}-${f.form}-d1`; const seed = hash31(id); calls.push({ id, arm: m.arm, model: m.id, subject: f.subject, group: f.group, form: f.form, draw: 1, units: m.units, seed, prompt: f.prompt, body: body(f.prompt, m.id, seed) }); }
  // speed extras (spec section 6): ten F calls with response_format url and ten with multipart (Recraft's own advice for Flash): subjects S01..S10, form N, extra draws
  const extras = [];
  for (const mode of ['url', 'multipart']) for (const s of subjects.filter(x => x.group === 'spatial')) { const f = forms.find(x => x.subject === s.id && x.form === 'N'); const id = `Fx-${mode === 'url' ? 'url' : 'mp'}-${s.id}-N`; const seed = hash31(id); extras.push({ id, arm: 'F', model: 'recraftv4_1_flash', subject: s.id, group: s.group, form: 'N', draw: 'extra', mode, units: 7, seed, prompt: f.prompt, body: body(f.prompt, 'recraftv4_1_flash', seed, { response_format: mode }) }); }
  return { calls, extras, forms, problems, RECRAFT_CONTROLS, mtokRates, priceUsage };
}

// spend ledger: every results/judge/seed-check row; a timeout or an error without credits is counted at its full price (a timeout may still be billed)
export function settled(rows, unitsOf) { return rows.reduce((s, r) => s + usd(Number.isFinite(r.credits) ? r.credits : (r.httpStatus && r.httpStatus !== 200 ? 0 : unitsOf(r))), 0); }

// seeded PRNG (mulberry32) from a salt kept LOCAL in salt.json (never pushed)
export function localSalt() {
  const f = new URL('./salt.json', import.meta.url);
  try { return JSON.parse(fs.readFileSync(f, 'utf8')).salt; } catch { const s = crypto.randomBytes(8).toString('hex'); fs.writeFileSync(f, JSON.stringify({ salt: s })); return s; }
}
export const rngFrom = str => { let a = crypto.createHash('sha256').update(str).digest().readUInt32BE(0); return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const shuffle = (arr, rnd) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// opaque code per image id: base32 of sha256(salt + id), 5 characters, collision-checked by the caller
export const codeOf = (salt, id) => { const h = crypto.createHash('sha256').update(salt + '|' + id).digest(); const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += A[h[i] % A.length]; return s; };
export const extOf = b => (b[0] === 0x3c ? 'svg' : b[0] === 0x89 ? 'png' : b[0] === 0xff ? 'jpg' : 'webp');
