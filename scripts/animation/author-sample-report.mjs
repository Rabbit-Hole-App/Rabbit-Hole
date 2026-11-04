// AN-20: the owner's list for one author-sample batch (scripts/animation/author-sample.mjs output folder): for each run its validator result, its draft and the captures the
// dev preview's review page produced for it, with an empty verdict column to fill. Read-only except report.md; it never drives a browser and never calls a model.
//   node scripts/animation/author-sample-report.mjs <batch folder> [--captures DIR]
// Captures are found in <batch folder>/<run id>/captures/*.png, or in DIR/<run id>/*.png when --captures is given (the folder the review page's capture step writes).
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const IMAGE = /\.(png|jpe?g|webp)$/i;
export function reportOf(folder, capturesDir = null) {
  const dir = resolve(folder), summary = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
  const runs = summary.runs.map(run => {
    const where = capturesDir ? join(resolve(capturesDir), run.id) : join(dir, run.id, 'captures');
    const captures = existsSync(where) ? readdirSync(where).filter(f => IMAGE.test(f)).sort().map(f => join(where, f)) : [];
    const draft = join(dir, run.id, 'draft.json');
    return { ...run, draft: existsSync(draft) ? draft : null, captures };
  });
  const lines = [
    `# Author samples: ${dir}`, '',
    `candidate ${summary.ids.candidate}   prompt-files ${summary.ids.prompts}   golden ${summary.ids.golden}`,
    `transport ${summary.transport}   settled ${summary.settled.toFixed(2)} credits${summary.stopped ? `   STOPPED: ${summary.stopped}` : ''}`, '',
    '| run | status | validator | assertions | captures | owner verdict (accept / reject, one line why) |', '|---|---|---|---|---|---|',
    ...runs.map(r => `| ${r.id} | ${r.status} | ${r.validator == null ? '-' : r.validator ? 'PASS' : 'FAIL'} | ${r.assertions == null ? 'n/a' : r.assertions ? 'PASS' : 'FAIL'} | ${r.captures.length} | |`), '',
  ];
  for (const r of runs) {
    lines.push(`## ${r.id}`, `plan ${r.plan}, session ${r.session ?? '-'}, ${r.status}${r.error ? ` (${r.error})` : ''}`, r.draft ? `draft: ${r.draft}` : 'draft: none');
    if (r.problems?.length) lines.push('problems:', ...r.problems.map(p => `- ${p}`));
    lines.push(r.captures.length ? 'captures:' : (r.status === 'valid' ? 'captures: MISSING (render this draft on the dev preview review page first)' : 'captures: none (not renderable)'), ...r.captures.map(c => `- ${c}`), '');
  }
  const missing = runs.filter(r => r.status === 'valid' && !r.captures.length).map(r => r.id);
  return { text: lines.join('\n'), runs, missing };
}
export function main(argv, { out = console.log, err = console.error } = {}) {
  const i = argv.indexOf('--captures'), capturesDir = i >= 0 ? argv[i + 1] : null, folder = argv.find((a, k) => !a.startsWith('--') && k !== i + 1);
  if (!folder || !existsSync(join(folder, 'summary.json'))) { err('usage: author-sample-report.mjs <batch folder with summary.json> [--captures DIR]'); return 1; }
  const { text, missing } = reportOf(folder, capturesDir);
  writeFileSync(join(folder, 'report.md'), `${text}\n`); out(text);
  if (missing.length) out(`\nWARN ${missing.length} valid run(s) have no captures yet: ${missing.join(', ')}`);
  return 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
