import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Blind evaluation is blind with respect to the evaluator's COMPLETE
// information surface, not merely its prompt - docs, filenames, directory
// names, comments, manifests, git metadata, repair notes. The last critic
// run was contaminated because the calibration design had been written into
// SCORING.md, a file the critic was told to read. This test is the
// mechanical guard against that happening again: it scans every file a
// critic is permitted to read and fails, naming the file, if any of them
// discloses that a calibration mechanism exists, names a defect category as
// "planted", retains a known-false finding as a trap, or says outright "this
// is a test".
//
// Scope: viz-benchmarks/** (this is the critic's readable tree), excluding
// .operator/ (already gitignored operator-private state - see
// .gitignore - and structurally outside viz-benchmarks/ anyway) and
// .local-benchmark-cache/ (gitignored capture cache, not committed). No doc
// outside viz-benchmarks/ is named in AGENT-INSTRUCTIONS.md as required
// critic reading, so none is added here; if one ever is, add its path below.

const here = fileURLToPath(new URL('.', import.meta.url));
const EXTRA_CRITIC_DOCS = []; // paths outside viz-benchmarks/, if a critic brief ever names one

const SKIP_DIRS = new Set(['.operator', '.local-benchmark-cache', 'node_modules', '.git']);
const TEXT_EXTENSIONS = new Set(['.md', '.json', '.mjs', '.js', '.txt']);

// This file's own header (above) necessarily names the banned words to
// describe what it guards against - it must not flag itself.
const SELF = fileURLToPath(import.meta.url);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

// Each pattern names one disclosure category from the isolation rule:
// calibration existence, a defect being "planted", a finding kept as a
// "trap", or the literal phrase "this is a test". A field name like
// excludedFromScoring is included too - it is itself a disclosure that a
// case is being deliberately hidden from normal scoring, the same class of
// leak as the prose forms.
const BANNED_PATTERNS = [
  { name: 'calibration existence', pattern: /calibrat/i },
  { name: 'planted defect', pattern: /\bplanted\b/i },
  // "trap" alone is an ordinary English word ("avoids the eleventh-role
  // trap") - the leak this guards against is specifically a finding kept
  // AROUND that word, so it is scoped to the neighbourhood the real
  // disclosures actually used rather than the bare word.
  { name: 'retained trap', pattern: /\b(retained|deliberately|specificity)\b[^.\n]{0,80}\btraps?\b|\btraps?\b[^.\n]{0,80}\b(critic|retained|deliberately)\b/i },
  { name: '"this is a test" disclosure', pattern: /this is a test/i },
  { name: 'known-false-finding-as-trap framing', pattern: /known[- ]false/i },
  { name: 'exclusion-flag disclosure', pattern: /excludedFrom(Scoring|Coverage|Phase1Acceptance)/ },
];

function scan(files) {
  const violations = [];
  for (const file of files) {
    if (file === SELF) continue;
    const ext = file.slice(file.lastIndexOf('.'));
    if (!TEXT_EXTENSIONS.has(ext)) continue;
    const content = readFileSync(file, 'utf8');
    for (const { name, pattern } of BANNED_PATTERNS) {
      if (pattern.test(content)) {
        violations.push({ file: relative(here, file), category: name });
      }
    }
  }
  return violations;
}

test('the critic-readable packet discloses no calibration mechanism, planted defects, or retained traps', () => {
  const files = walk(here.replace(/[\\/]$/, ''));
  for (const extra of EXTRA_CRITIC_DOCS) files.push(extra);
  const violations = scan(files);
  assert.deepEqual(
    violations,
    [],
    `critic-packet isolation breach:\n${violations.map(v => `  ${v.file} - ${v.category}`).join('\n')}`,
  );
});
