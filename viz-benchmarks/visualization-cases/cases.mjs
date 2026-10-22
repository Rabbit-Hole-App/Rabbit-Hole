// EXP-T00/T01: real-image corpus intake, immutable run history, human verdicts and a static index.
// Node stdlib only. Originals stay in the corpus (copied, never moved); case reference copies,
// comparisons and the index are git-ignored, so only metadata and hashes are committed.
//
//   node cases.mjs intake [--corpus <dir>] [--dry-run]
//   node cases.mjs rollback <intake-run-id>
//   node cases.mjs index
//
// Layout (tasks_explain.md section 6): intake-manifest.json; cases/<id>/case.json;
// cases/<id>/reference/<descriptive-name>.<ext>; cases/<id>/generated/history/<run>/...;
// cases/<id>/generated/latest/run.json; cases/<id>/review.json; index.html.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CORPUS = 'C:/Users/cyudhist/Desktop/workspace/small-deploy/test_visualizations';
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback);
const writeJson = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); };
const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'image';

// Width/height/format from the file header (PNG, JPEG, WebP, GIF); null when unreadable.
export function imageInfo(b) {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { format: 'png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.length > 10 && b.toString('ascii', 0, 6).startsWith('GIF8')) return { format: 'gif', width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  if (b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8 ') return { format: 'webp', width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') { const v = b.readUInt32LE(21); return { format: 'webp', width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 }; }
    if (chunk === 'VP8X') return { format: 'webp', width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
    return null;
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker === 0xff) { i++; continue; }
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { format: 'jpeg', width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

function listImages(dir, root = dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listImages(path, root);
    return [{ path, rel: relative(root, path).replaceAll('\\', '/'), image: IMAGE_EXT.has(extname(entry.name).toLowerCase()) }];
  }).sort((a, b) => a.rel.localeCompare(b.rel));
}

const UNASSIGNED = { family: 'unassigned', lineage: null, split: 'unassigned', figureKind: 'unknown', prompt: null, nonGoals: [] };

function caseRecord(entry, label) {
  const l = label || UNASSIGNED;
  return {
    schema: 1,
    id: entry.caseId,
    title: l.title || entry.originalName,
    prompt: l.prompt,
    figureKind: l.figureKind,
    nonGoals: l.nonGoals || [],
    family: l.family,
    lineage: l.lineage || entry.caseId,
    split: l.split,
    // Exposure is tracked apart from split; a used held-out failure loses unseen status (section 6).
    exposure: 'unseen',
    reuseEligible: false,
    // Generation refuses a case until family/split are assigned (T00: assign before any generation).
    generationReady: Boolean(label && l.family && ['example', 'heldout'].includes(l.split)),
    reference: { file: `reference/${entry.referenceName}`, sha256: entry.sha256, bytes: entry.bytes, format: entry.format, width: entry.width, height: entry.height, originalName: entry.originalName, multiPanel: Boolean(l.multiPanel) },
    acceptance: l.acceptance || [],
    runs: 'generated/history',
  };
}

// opts: { corpus, casesRoot, labels, dryRun, now, runId, copy } - copy is injectable so tests can interrupt.
export function intake(opts = {}) {
  const corpus = opts.corpus || DEFAULT_CORPUS;
  const casesRoot = opts.casesRoot || HERE;
  const labels = opts.labels || readJson(join(casesRoot, 'labels.json'), {});
  const copy = opts.copy || copyFileSync;
  const now = opts.now || new Date().toISOString();
  const runId = opts.runId || `intake-${now.replace(/[-:.TZ]/g, '').slice(0, 14)}`;
  const manifestPath = join(casesRoot, 'intake-manifest.json');
  const manifest = readJson(manifestPath, { schema: 1, corpus: basename(corpus), entries: [], runs: [] });
  const files = listImages(corpus);
  const images = files.filter(f => f.image);
  const skipped = files.filter(f => !f.image).map(f => ({ rel: f.rel, reason: 'not an image extension' }));
  if (!images.length) return { state: 'blocked', reason: `no image files in ${corpus}`, skipped };

  const byHash = new Map(manifest.entries.map(e => [e.sha256, e]));
  const plan = [];
  for (const file of images) {
    const bytes = readFileSync(file.path);
    const hash = sha256(bytes);
    const info = imageInfo(bytes);
    const known = byHash.get(hash);
    if (known) {
      // Same bytes again: either the recorded source (unchanged) or a duplicate/renamed copy, accounted once.
      if (known.source !== file.rel && !known.aliases.includes(file.rel)) plan.push({ action: 'alias', entry: known, rel: file.rel });
      else if (known.state !== 'imported') plan.push({ action: 'resume', entry: known, path: file.path });
      else plan.push({ action: 'unchanged', entry: known });
      continue;
    }
    if (!info) { skipped.push({ rel: file.rel, reason: 'unreadable image header' }); continue; }
    const label = labels[hash];
    const ext = extname(file.rel).toLowerCase();
    const slug = label?.slug || slugify(basename(file.rel, extname(file.rel)));
    const caseId = `${slug}-${hash.slice(0, 8)}`;
    const collisions = [...manifest.entries, ...plan.filter(q => q.action === 'import').map(q => q.entry)].filter(e => basename(e.source) === basename(file.rel)).map(e => e.caseId);
    const entry = { caseId, sha256: hash, bytes: bytes.length, ...info, originalName: basename(file.rel), source: file.rel, aliases: [], referenceName: `${slug}${ext}`, collisions, labelled: Boolean(label), state: 'planned', runId };
    byHash.set(hash, entry);
    plan.push({ action: 'import', entry, path: file.path });
  }
  const summary = { imported: 0, resumed: 0, aliased: 0, unchanged: 0 };
  for (const p of plan) summary[{ import: 'imported', resume: 'resumed', alias: 'aliased', unchanged: 'unchanged' }[p.action]]++;
  if (opts.dryRun) return { state: 'dry-run', runId, plan: plan.map(p => ({ action: p.action, caseId: p.entry.caseId, rel: p.rel || p.entry.source })), summary, skipped };

  const changed = plan.some(p => p.action !== 'unchanged');
  if (!changed) return { state: 'unchanged', runId: null, summary, skipped };
  for (const p of plan.filter(p => p.action === 'import')) manifest.entries.push(p.entry);
  manifest.runs.push({ runId, at: now, action: 'intake', state: 'running' });
  writeJson(manifestPath, manifest); // journal first: an interruption leaves planned/staged entries to resume or roll back

  for (const p of plan) {
    if (p.action === 'alias') { p.entry.aliases.push(p.rel); continue; }
    if (p.action === 'unchanged') continue;
    const caseDir = join(casesRoot, 'cases', p.entry.caseId);
    const staged = join(caseDir, '.staging', p.entry.referenceName);
    const final = join(caseDir, 'reference', p.entry.referenceName);
    mkdirSync(dirname(staged), { recursive: true });
    copy(p.path, staged);
    if (sha256(readFileSync(staged)) !== p.entry.sha256) throw new Error(`hash mismatch after staging ${p.entry.source}`);
    p.entry.state = 'staged';
    writeJson(manifestPath, manifest);
    mkdirSync(dirname(final), { recursive: true });
    renameSync(staged, final);
    rmSync(join(caseDir, '.staging'), { recursive: true, force: true });
    const casePath = join(caseDir, 'case.json');
    if (!existsSync(casePath)) { writeJson(casePath, caseRecord(p.entry, labels[p.entry.sha256])); p.entry.createdCaseJson = p.entry.runId; }
    p.entry.state = 'imported';
    p.entry.importedAt = now;
    writeJson(manifestPath, manifest);
  }
  manifest.runs.at(-1).state = 'done';
  manifest.runs.at(-1).summary = summary;
  writeJson(manifestPath, manifest);
  return { state: 'done', runId, summary, skipped };
}

// Undo one intake run: remove its copied references and case.json, never the corpus, never run history.
export function rollback(runId, opts = {}) {
  const casesRoot = opts.casesRoot || HERE;
  const manifestPath = join(casesRoot, 'intake-manifest.json');
  const manifest = readJson(manifestPath, null);
  if (!manifest) throw new Error('no intake-manifest.json');
  const mine = manifest.entries.filter(e => e.runId === runId);
  if (!mine.length) throw new Error(`no entries from ${runId}`);
  for (const e of mine) {
    const caseDir = join(casesRoot, 'cases', e.caseId);
    if (existsSync(join(caseDir, 'generated', 'history')) && readdirSync(join(caseDir, 'generated', 'history')).length) {
      throw new Error(`${e.caseId} has run history; rollback refused (history is never deleted)`);
    }
  }
  for (const e of mine) rmSync(join(casesRoot, 'cases', e.caseId), { recursive: true, force: true });
  manifest.entries = manifest.entries.filter(e => e.runId !== runId);
  manifest.runs.push({ runId: `rollback-${runId}`, at: opts.now || new Date().toISOString(), action: 'rollback', of: runId, removed: mine.map(e => e.caseId) });
  writeJson(manifestPath, manifest);
  return { removed: mine.map(e => e.caseId) };
}

export const loadCases = (casesRoot = HERE) => {
  const dir = join(casesRoot, 'cases');
  return existsSync(dir) ? readdirSync(dir).filter(id => existsSync(join(dir, id, 'case.json'))).map(id => readJson(join(dir, id, 'case.json'))) : [];
};

// Cases a run for `target` may use as authoring examples: example split, explicitly reuse-eligible,
// another lineage, and never the target's own family when the target is held out (section 6 isolation).
export function examplePool(cases, target) {
  return cases.filter(c => c.id !== target.id && c.split === 'example' && c.reuseEligible && c.lineage !== target.lineage
    && !(target.split === 'heldout' && c.family === target.family));
}

export const RUN_MODES = ['render-existing', 'generate'];
export const INPUT_MODES = ['prompt-only', 'reference-guided'];

// Record one attempt. History is immutable: an existing run id is refused. prompt is saved exactly as given
// (what actually ran). A failed attempt keeps a missing-result state and never gets a fabricated image.
// opts: { casesRoot, runId, mode, inputMode, prompt, outcome: 'ok'|'failed', error, generatedPng (path),
//         sceneSpec, compiledScene, critic, receipt, examples: [caseId] }
export function recordRun(caseId, opts) {
  const casesRoot = opts.casesRoot || HERE;
  const caseDir = join(casesRoot, 'cases', caseId);
  const record = readJson(join(caseDir, 'case.json'), null);
  if (!record) throw new Error(`unknown case ${caseId}`);
  if (!record.generationReady) throw new Error(`${caseId}: family/split not assigned; generation refused`);
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(opts.runId || '')) throw new Error('runId must be a short slug');
  if (!RUN_MODES.includes(opts.mode) || !INPUT_MODES.includes(opts.inputMode)) throw new Error('unknown mode or input mode');
  if (!opts.prompt || typeof opts.prompt !== 'object') throw new Error('prompt record required (what actually ran)');
  const pool = new Set(examplePool(loadCases(casesRoot), record).map(c => c.id));
  const leaked = (opts.examples || []).filter(id => !pool.has(id));
  if (leaked.length) throw new Error(`examples not allowed for ${caseId}: ${leaked.join(', ')}`);
  const runDir = join(caseDir, 'generated', 'history', opts.runId);
  if (existsSync(runDir)) throw new Error(`run ${opts.runId} already exists; history is immutable`);
  const ok = opts.outcome === 'ok';
  if (ok && !opts.generatedPng) throw new Error('an ok run needs its generated.png');
  mkdirSync(runDir, { recursive: true });
  writeJson(join(runDir, 'prompt.json'), opts.prompt);
  if (opts.sceneSpec) writeJson(join(runDir, 'scene-spec.json'), opts.sceneSpec);
  if (opts.compiledScene) writeJson(join(runDir, 'compiled-scene.json'), opts.compiledScene);
  if (opts.critic) writeJson(join(runDir, 'critic-report.json'), opts.critic);
  let outputSha256 = null;
  if (ok) { copyFileSync(opts.generatedPng, join(runDir, 'generated.png')); outputSha256 = sha256(readFileSync(join(runDir, 'generated.png'))); }
  const receipt = { ...(opts.receipt || {}), caseId, runId: opts.runId, mode: opts.mode, inputMode: opts.inputMode, split: record.split, family: record.family, examples: opts.examples || [],
    outcome: ok ? 'ok' : 'failed', result: ok ? 'generated' : 'missing-result', error: ok ? null : String(opts.error || 'unknown failure'), outputSha256, promptSha256: sha256(readFileSync(join(runDir, 'prompt.json'))), recordedAt: opts.now || new Date().toISOString() };
  writeJson(join(runDir, 'receipt.json'), receipt);
  writeJson(join(caseDir, 'generated', 'latest', 'run.json'), { runId: opts.runId, outcome: receipt.outcome });
  return { runDir, receipt };
}

// Human verdicts append to review.json against run id + output hash; latest is never "approved" by itself.
export function recordVerdict(caseId, { runId, verdict, reviewer, note = '', casesRoot = HERE, now }) {
  if (!['approved', 'rejected', 'needs-work'].includes(verdict)) throw new Error('verdict must be approved, rejected or needs-work');
  if (!reviewer) throw new Error('reviewer required');
  const caseDir = join(casesRoot, 'cases', caseId);
  const receipt = readJson(join(caseDir, 'generated', 'history', runId, 'receipt.json'), null);
  if (!receipt) throw new Error(`no run ${runId}`);
  if (verdict === 'approved' && receipt.outcome !== 'ok') throw new Error('a failed run has no result to approve');
  const path = join(caseDir, 'review.json');
  const review = readJson(path, { caseId, verdicts: [] });
  review.verdicts.push({ runId, outputSha256: receipt.outputSha256, verdict, reviewer, note, at: now || new Date().toISOString() });
  writeJson(path, review);
  return review;
}

export function runsOf(caseDir) {
  const dir = join(caseDir, 'generated', 'history');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(r => statSync(join(dir, r)).isDirectory()).map(r => readJson(join(dir, r, 'receipt.json'), { runId: r, outcome: 'incomplete' }));
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Static index: plain links, no scripts, no network.
export function buildIndex(casesRoot = HERE) {
  const rows = loadCases(casesRoot).map(c => {
    const caseDir = join(casesRoot, 'cases', c.id);
    const review = readJson(join(caseDir, 'review.json'), { verdicts: [] });
    const latest = readJson(join(caseDir, 'generated', 'latest', 'run.json'), null);
    const runs = runsOf(caseDir).map(r => {
      const base = `cases/${c.id}/generated/history/${r.runId}`;
      const verdicts = review.verdicts.filter(v => v.runId === r.runId).map(v => `${esc(v.verdict)} by ${esc(v.reviewer)}`).join('; ') || 'no human verdict';
      const result = r.outcome === 'ok'
        ? `<a href="${base}/comparison.png">comparison</a> · <a href="${base}/generated.png">result</a>`
        : `<span class="missing">missing result: ${esc(r.error)}</span>`;
      return `<li><b>${esc(r.runId)}</b>${latest?.runId === r.runId ? ' (latest)' : ''} · ${esc(r.mode)} / ${esc(r.inputMode)} · <a href="${base}/prompt.json">prompt</a> · ${result} · ${verdicts}</li>`;
    }).join('') || '<li>no runs</li>';
    return `<section><h2>${esc(c.title)}</h2><p>${esc(c.id)} · family ${esc(c.family)} · split ${esc(c.split)} · exposure ${esc(c.exposure)}${c.generationReady ? '' : ' · <span class="missing">needs family/split</span>'}</p>`
      + `<p>Prompt: ${esc(c.prompt || 'none')}</p><p><a href="cases/${esc(c.id)}/${esc(c.reference.file)}">reference</a> ${c.reference.width}x${c.reference.height} ${esc(c.reference.format)}</p><ul>${runs}</ul></section>`;
  }).join('\n');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Visualization cases</title><style>body{font:14px system-ui;margin:24px;max-width:960px}section{border-top:1px solid #ccc;padding:8px 0}.missing{color:#a33}</style></head><body><h1>Visualization cases</h1>\n${rows}\n</body></html>\n`;
  writeFileSync(join(casesRoot, 'index.html'), html);
  return join(casesRoot, 'index.html');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, ...rest] = process.argv.slice(2);
  const flag = name => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
  if (cmd === 'intake') {
    const result = intake({ corpus: flag('--corpus'), dryRun: rest.includes('--dry-run') });
    console.log(JSON.stringify(result, null, 2));
    if (result.state === 'blocked') process.exit(2);
  } else if (cmd === 'rollback') console.log(JSON.stringify(rollback(rest[0]), null, 2));
  else if (cmd === 'index') console.log(`wrote ${buildIndex()}`);
  else { console.error('usage: node cases.mjs intake [--corpus <dir>] [--dry-run] | rollback <run-id> | index'); process.exit(1); }
}
