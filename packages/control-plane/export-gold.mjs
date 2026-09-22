// Export accepted moments from the learn_moments log into the prototype's
// gold format: one {"question","video_id","start","end"} per line. Hand-run:
//   node export-gold.mjs [--local]
// Remote reads the dev D1 (database name `small`); --local reads wrangler's
// local copy. Output: ../../tests/evals/moment-gold.jsonl
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const where = process.argv.includes('--local') ? '--local' : '--remote';
const sql = 'SELECT question, video_id, start, end FROM learn_moments WHERE accepted = 1 ORDER BY id';
const raw = execFileSync('npx', ['wrangler', 'd1', 'execute', 'small', where, '--json', '--command', sql], { cwd: here, encoding: 'utf8', shell: process.platform === 'win32' });
const parsed = JSON.parse(raw);
const rows = parsed?.[0]?.results || [];
const lines = rows.map(row => JSON.stringify({ question: row.question, video_id: row.video_id, start: row.start, end: row.end }));
const out = join(here, '..', '..', 'tests', 'evals', 'moment-gold.jsonl');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, lines.join('\n') + (lines.length ? '\n' : ''));
console.log(`${lines.length} accepted moment${lines.length === 1 ? '' : 's'} -> ${out}`);
