// The file side of the written /explain benchmark (docs/features/explain.md "Benchmark result files"): corpus loader, checkpointing run store and the README run index.
// Node only (fs); the Worker never imports it. Every write goes through `redact`, so a secret that leaked into a provider error text cannot reach a file.
import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { BenchmarkError, hashCorpusFiles, loadCorpusFromFiles } from './explanation-benchmark.js';

async function walk(dir, base = dir) {
  const out = {};
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) Object.assign(out, await walk(full, base));
    else out[relative(base, full).split(sep).join('/')] = await readFile(full, 'utf8');
  }
  return out;
}
export const readCorpusFiles = dir => walk(dir);
export const loadCorpus = async dir => loadCorpusFromFiles(await readCorpusFiles(dir));
// Freezing is deliberate: it writes HASHES.json for the files as they are now. A later edit to any file makes loadCorpus refuse until a new corpus version is made.
export async function freezeCorpus(dir) {
  const files = await readCorpusFiles(dir);
  delete files['HASHES.json'];
  const hashes = await hashCorpusFiles(files);
  await writeFile(join(dir, 'HASHES.json'), `${JSON.stringify(hashes, null, 2)}\n`);
  return hashes;
}

const lines = text => text.split('\n').filter(Boolean).map(l => JSON.parse(l));
const INDEX_HEAD = '# Explain benchmark results\n\nRun index. Each run appends one row when it finishes; older rows are never replaced. A row says what class of evidence the run is. Dry and fixture rows are harness evidence and must never be read as live results.\n\n| Run ID | Date (UTC) | Class | Code SHA | Corpus / profiles | Status | Report | Limitations / decision |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n';

// dir: the run directory. root: the canonical benchmarks/explain/results directory (the index is only appended when dir is inside it).
export function createRunStore({ dir, root = null, type, redact = x => x }) {
  const at = (...p) => join(dir, ...p);
  const write = async (path, text) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, redact(text)); };
  const append = async (path, text) => { await mkdir(dirname(path), { recursive: true }); await appendFile(path, redact(text)); };
  const json = v => `${JSON.stringify(v, null, 2)}\n`;
  const store = {
    dir, type, redactions: () => redact.count?.() ?? 0,
    async writeManifest(manifest) {
      await write(at('manifest.json'), json(manifest));
      for (const f of ['results.jsonl', 'calls.jsonl']) if (!existsSync(at(f))) await write(at(f), '');
    },
    beginAttempt: (id, record) => write(at('attempts', id, 'attempt.json'), json(record)),
    writeAttemptFile: (id, name, value) => write(at('attempts', id, name), json(value)),
    appendCall: row => append(at('calls.jsonl'), `${JSON.stringify(row)}\n`),
    appendResult: row => append(at('results.jsonl'), `${JSON.stringify(row)}\n`),
    async writeDerived({ summaryCsv, reportMd }) { await write(at('summary.csv'), summaryCsv); await write(at('report.md'), reportMd); },
    async readCorrections() { return existsSync(at('corrections.jsonl')) ? lines(await readFile(at('corrections.jsonl'), 'utf8')) : []; },
    appendCorrection: c => append(at('corrections.jsonl'), `${JSON.stringify(c)}\n`),
    async load() {
      if (!existsSync(at('manifest.json'))) throw new BenchmarkError('nothing_to_resume', `No manifest.json in the run directory; there is nothing to resume.`);
      const attempts = new Map();
      if (existsSync(at('attempts'))) for (const e of await readdir(at('attempts'), { withFileTypes: true })) if (e.isDirectory() && existsSync(at('attempts', e.name, 'attempt.json'))) attempts.set(e.name, JSON.parse(await readFile(at('attempts', e.name, 'attempt.json'), 'utf8')));
      const read = async f => (existsSync(at(f)) ? lines(await readFile(at(f), 'utf8')) : []);
      // calls.jsonl is one line per state change; the last line per call id is that call's state.
      const last = new Map((await read('calls.jsonl')).map(c => [c.callId, c]));
      return { manifest: JSON.parse(await readFile(at('manifest.json'), 'utf8')), results: await read('results.jsonl'), calls: [...last.values()].filter(c => c.state), attempts };
    },
    // Append-only index; a run already listed is not listed twice. Outside the canonical root there is nothing durable to link, so nothing is appended.
    async appendIndex(m) {
      if (!root) return;
      const rel = relative(resolve(root), resolve(dir));
      if (rel.startsWith('..') || resolve(root) === resolve(dir)) return;
      const readme = join(root, 'README.md');
      const have = existsSync(readme) ? await readFile(readme, 'utf8') : '';
      if (have.includes(`| ${m.runId} |`)) return;
      const row = `| ${m.runId} | ${m.startedAt.slice(0, 10)} | ${m.type} | \`${m.codeSha}\` | ${m.corpus.id} v${m.corpus.version} \`${m.corpus.hash.slice(0, 8)}\` / ${m.profiles.map(p => `${p.id} \`${p.hash.slice(0, 6)}\``).join(', ')} | ${m.status} | [report](${m.runId}/report.md) | ${m.type === 'live' ? 'see report' : `${m.type} evidence only; no winner, no promotion`} |\n`;
      await mkdir(root, { recursive: true });
      if (!have) await writeFile(readme, INDEX_HEAD);
      await appendFile(readme, row);
    },
  };
  return store;
}
