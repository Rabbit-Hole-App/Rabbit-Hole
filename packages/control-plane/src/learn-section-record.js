// The recorded run of a repository version, as text for a Learn section Make turn (Reviewer 2026-11-16 11:00): the rehearsal records stored in R2
// (learn-rehearsal.js, one per route) and the short lines of their step logs (in each record's artifacts zip). Its numbers (vocabulary sizes, token
// counts, losses, step times) are the source's own measured facts: the explanation validator accepts a number found here, and graph.js traces plot values to it.
//
//   recordedRun(env, repo { id, commit }) -> 'RECORDED RUN' text, or '' when this version was never rehearsed (or its records cannot be read)
//   runLines(record, logs { path: text }) -> the text for one record (exported for the unit test)
import { zipEntry } from './learn-rehearsal.js';

const MAX_CHARS = 4000, LOG_LINES = 12, LINE_CHARS = 160;
const RECORD = /\/rehearsal-(?:[a-z0-9_]+-)?cpu\.json$/;
const cache = new Map(); // key -> text, per isolate: a record never changes once stored

// A log's short lines that carry a number, its stderr dropped: the head and the tail when there are more than LOG_LINES.
function logLines(text) {
  const lines = String(text || '').split('--- stderr ---')[0].split('\n').map(l => l.trim()).filter(l => l && l.length <= LINE_CHARS && /\d/.test(l) && !l.startsWith('#') && !/^\w+ *= /.test(l)); // an assignment is configuration the command line may override, not a measurement
  const unique = [...new Set(lines)];
  return unique.length <= LOG_LINES ? unique : [...unique.slice(0, LOG_LINES / 2), `(${unique.length - LOG_LINES} lines between)`, ...unique.slice(-LOG_LINES / 2)];
}

export function runLines(record, logs = {}) {
  const out = [];
  for (const step of record.steps || []) {
    out.push(`step ${step.id}: ${step.cmd} (exit ${step.rc}, ${step.sec} s)`);
    for (const [path, file] of Object.entries(step.files || {})) out.push(`  file ${path}: ${file.bytes} bytes`);
    for (const line of logLines(logs[step.log])) out.push(`  ${line}`);
  }
  return out.join('\n');
}

export async function recordedRun(env, repo) {
  const bucket = env.REPOSITORY_SNAPSHOTS;
  if (!bucket || !repo?.id || !repo?.commit) return '';
  const prefix = `learn-repositories-dev/${repo.id}/${repo.commit}/`;
  try {
    const keys = (await bucket.list({ prefix })).objects.map(o => o.key).filter(k => RECORD.test(k)).sort();
    const parts = [];
    for (const key of keys) {
      if (!cache.has(key)) {
        const record = await (await bucket.get(key))?.json();
        if (!record) continue;
        const zip = await bucket.get(key.replace(/\.json$/, '-artifacts.zip')), logs = {};
        if (zip) {
          const bytes = new Uint8Array(await zip.arrayBuffer());
          for (const step of record.steps || []) if (step.log) try { logs[step.log] = new TextDecoder().decode(await zipEntry(bytes, step.log)); } catch { /* a step without its log keeps its command and files */ }
        }
        cache.set(key, runLines(record, logs));
      }
      parts.push(cache.get(key));
    }
    return parts.join('\n').slice(0, MAX_CHARS);
  } catch { return ''; } // shortcut: a record that cannot be read gives no RECORDED RUN lines; numbers then come from the lines and the brief only
}
