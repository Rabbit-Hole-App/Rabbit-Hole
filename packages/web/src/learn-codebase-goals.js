// packages/web/src/learn-codebase-goals.js
// The Tutor's five codebase goals (C:/s/spec/tutor-workflow/draft.md "Starting from a codebase", Task 12) and the pure rules
// the browser menu and the Worker share: each goal's first activity and completion criterion, a file's role, what a
// learning source map leaves out, whether a request is about the repository at all, and the labels that keep inspection,
// learner-supplied output and execution apart. Pure: no storage, no network, no model. Nothing here names a fixture's files:
// roles and relevance come from general path conventions and the repository's own index (paths and symbol labels).

export const CODEBASE_PROMPT = 'What would you like to do with this codebase?';
export const SOMETHING_ELSE = 'Learn something else';

// question: what the first activity asks about, always named in its wording - the current code, the current code and the
// intended behaviour asked separately, a proposed change, or a concept shown in this code.
// roles: the file roles its source map starts from. criteria: the goal's completion criterion, as agreed criteria. Each carries
// the codebase rubric (owner finding 5B), so an answer is judged by the rubric route against these criteria and the cited
// source at its commit (control-plane learn-rubric-assessment.js), behind TUTOR_RUBRIC_ASSESSMENT_ENABLED like every rubric.
export const CODEBASE_RUBRIC = 'rubric-codebase-1';
export const CODEBASE_GOALS = [
  {
    id: 'understand_feature', label: 'Understand a feature', clarify: 'Which feature or behaviour should we trace first?',
    first: 'trace_and_predict', roles: ['source', 'test'], question: 'current_code',
    completion: 'Explain the relevant data flow and what the current code actually computes, tied to the source. A code change is optional.',
    criteria: [
      { criterionId: 'trace_path', label: 'Trace the path from entry point to output', requirement: 'Name the calls and data changes the current code makes, citing the source', requiresReasoning: true, rubricVersion: CODEBASE_RUBRIC },
      { criterionId: 'explain_current', label: 'Explain what the current code computes', requirement: 'Predict the current output for an input and explain the order of operations', requiresReasoning: true, rubricVersion: CODEBASE_RUBRIC },
    ],
  },
  {
    id: 'debug_behavior', label: 'Debug behavior', clarify: 'What happens now, what did you expect, and which input shows it?',
    first: 'reproduce_and_isolate', roles: ['test', 'source'], question: 'current_vs_intended',
    completion: 'A cause supported by the source, a focused correction if you want one, and a suitable check. Without a confirmed reproduction the diagnosis stays tentative.',
    criteria: [
      { criterionId: 'supported_hypothesis', label: 'Form a hypothesis supported by the source', requirement: 'Separate actual from expected behaviour and tie the cause to cited lines', requiresReasoning: true, rubricVersion: CODEBASE_RUBRIC },
      { criterionId: 'verify_cause', label: 'Choose a check that confirms the cause', requirement: 'Name an input or test that tells the hypothesis from its alternatives', requiresReasoning: true, rubricVersion: CODEBASE_RUBRIC },
    ],
  },
  {
    id: 'make_change', label: 'Make a change', clarify: 'What should the code do after your change? Give an input and the output you want.',
    first: 'plan_bounded_edit', roles: ['source', 'test', 'config'], question: 'proposed_change',
    completion: 'The requested behaviour, compatibility with the edge cases you agree, and an explanation of the change. It does not need a bug first.',
    criteria: [
      { criterionId: 'focused_change', label: 'Make a focused change without unrelated edits', requirement: 'State the desired outputs and the smallest area to edit', requiresReasoning: true, rubricVersion: CODEBASE_RUBRIC },
      { criterionId: 'verify_change', label: 'Choose and interpret verification', requirement: 'Name the tests or cases that show the change works and stays compatible', requiresReasoning: true, rubricVersion: CODEBASE_RUBRIC },
    ],
  },
  {
    id: 'prepare_contribute', label: 'Prepare to contribute', clarify: null,
    first: 'locate_and_verify', roles: ['docs', 'config', 'test'], question: 'current_code',
    completion: 'Locate where a small change belongs, explain the test workflow, and prepare a reviewable contribution. Publishing or merging is separate.',
    criteria: [
      { criterionId: 'navigate_conventions', label: 'Find where a small change belongs', requirement: 'Locate the files and conventions a small contribution follows', requiresReasoning: true, rubricVersion: CODEBASE_RUBRIC },
      { criterionId: 'verification_path', label: 'Explain the verification path', requirement: 'Name the command or checks that verify a change, and what they cover', requiresReasoning: true, rubricVersion: CODEBASE_RUBRIC },
    ],
  },
  {
    id: 'learn_concept', label: 'Learn a concept through this codebase', clarify: 'Which concept would you like to learn through this code?',
    first: 'explain_then_apply', roles: ['source'], question: 'concept',
    completion: 'Explain the concept in this code, then apply it to a different example. Knowing the filename alone is not enough.',
    criteria: [
      { criterionId: 'explain_here', label: 'Explain the concept in this code', requirement: 'Explain how the cited code shows the concept, beyond naming the file', requiresReasoning: true, rubricVersion: CODEBASE_RUBRIC },
      { criterionId: 'apply_elsewhere', label: 'Apply the concept to a different example', requirement: 'Use the same idea on an example outside this code', requiresReasoning: true, requiresTransfer: true, rubricVersion: CODEBASE_RUBRIC },
    ],
  },
];
export const goalOf = id => CODEBASE_GOALS.find(goal => goal.id === id) || null;

// What each activity's question is about, as the learner reads it.
export const QUESTION_LABEL = {
  current_code: 'About the current code',
  current_vs_intended: 'Current code and intended behaviour, asked separately',
  proposed_change: 'About a proposed change, not the current code',
  concept: 'A concept shown in the current code',
};
// Three kinds of evidence, never merged: reading the source, output the learner pasted, and running code. Nothing runs here:
// cloud execution stays disabled, so execution is always "Not run here".
export const EVIDENCE_LABEL = {
  inspection: 'Inspected source',
  learner_output: 'Output you supplied',
  execution: 'Not run here',
};
export const NOT_RUN_NOTE = 'Not run here: code is never executed in Rabbit Hole. Output you paste is recorded as output you supplied.';

// A file's role from general conventions only (test directories and suffixes, manifests, documentation).
const CONFIG_NAMES = /^(package\.json|pyproject\.toml|setup\.(py|cfg)|makefile|dockerfile|tox\.ini|cargo\.toml|go\.mod|gemfile|requirements[\w.-]*\.txt|tsconfig[\w.-]*\.json|[\w.-]+\.config\.(js|cjs|mjs|ts))$/i;
export function fileRole(path) {
  const name = String(path).split('/').pop();
  if (/(^|\/)(tests?|__tests__|specs?)\//i.test(path) || /\.(test|spec)\.[a-z0-9]+$/i.test(name) || /^test_[\w-]+\.py$/i.test(name) || /_test\.(py|go|rb)$/i.test(name)) return 'test';
  if (CONFIG_NAMES.test(name) || /\.(toml|ya?ml|ini|cfg)$/i.test(name)) return 'config';
  if (/\.(md|rst|txt)$/i.test(name) || /^(readme|contributing|license|changelog)(\.|$)/i.test(name)) return 'docs';
  return 'source';
}

// Why a file stays out of a learning source map, or null. A secret is never shown, read or cited; generated, vendored,
// minified and lock files are left out unless the learner selected one directly (the caller decides that).
const SECRET_NAME = /(^|\/)(\.env(\.[\w-]+)?|[\w.-]+\.(pem|key|p12|pfx|jks|keystore)|id_(rsa|dsa|ecdsa|ed25519)|credentials(\.[a-z]+)?|secrets?(\.[a-z]+)?|[\w-]+\.secrets?\.[a-z]+)$/i;
const SECRET_TEXT = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bxox[abpr]-[A-Za-z0-9-]{10,}|\bsk-[A-Za-z0-9_-]{20,}/;
const VENDORED = /(^|\/)(node_modules|vendor|vendored|third_party|third-party|bower_components|site-packages)\//i;
const GENERATED = /(^|\/)(dist|build|out|coverage|__generated__|generated|\.next|target)\/|(_pb2(_grpc)?\.py|\.pb\.go|\.generated\.\w+|\.g\.dart)$/i;
const LOCKFILE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|cargo\.lock|composer\.lock|gemfile\.lock)$/i;
export const OMISSION_TEXT = {
  secret: 'possible secret: never shown or read',
  vendored: 'vendored dependency',
  generated: 'generated output',
  minified: 'minified or source-map file',
  lockfile: 'dependency lock file',
};
export function excludedReason(path, content = '') {
  if (SECRET_NAME.test(path) || SECRET_TEXT.test(content)) return 'secret';
  if (VENDORED.test(path)) return 'vendored';
  if (GENERATED.test(path)) return 'generated';
  if (/\.min\.(js|css)$|\.map$/i.test(path) || String(content).split('\n', 50).some(line => line.length > 2000)) return 'minified';
  if (LOCKFILE.test(path)) return 'lockfile';
  return null;
}

// Whether a request is about this repository, from its index alone (file paths and symbol labels): no source text is read
// and no model is asked. A word of the request that names something in the index, or a word that names code itself, makes
// it relevant; "Explain the water cycle" against a task-list app is not. index: { paths: string[], labels: string[] }.
const STOP = new Set(('the and for are but not you your yours with this that these those from what when where which while who whom why how does did doing '
  + 'done can could would should will shall have has had into onto about after before again also any all just like more most much only other over same '
  + 'some such than then there their them they very was were been being its it\'s our out own per please show tell explain teach learn help understand '
  + 'want need know make let lets give get one two three first next last new good way work works working thing things here now still even me my mine '
  + 'quiz test tests check question questions answer answers topic about between').split(' '));
// Words that name code itself: a request using them asks about this repository even when no file or symbol is named.
const CODE_WORDS = new Set('code codebase coding repo repository repositories function functions method methods bug bugs error errors exception exceptions api endpoint endpoints script scripts commit commits variable variables implementation refactor compile compiler lint linter traceback'.split(' '));
const words = text => String(text || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length >= 3);
const stem = word => word.replace(/ies$/, 'y').replace(/(ions?|ing|ed|es|s)$/, '');
export function indexVocabulary(index) {
  const vocabulary = new Set();
  for (const path of index?.paths || []) for (const word of words(path.replace(/\.[a-z0-9]+$/i, ''))) if (!STOP.has(word)) vocabulary.add(stem(word));
  for (const label of index?.labels || []) for (const word of words(label)) if (!STOP.has(word)) vocabulary.add(stem(word));
  return vocabulary;
}
// terms: the request's words that matched; matches: the index tokens they matched (a word and a token of 5+ letters match
// when one begins the other: "percentage" and completionPercent).
export function repositoryRelevance(index, text, vocabulary = indexVocabulary(index)) {
  const asked = [...new Set(words(text).filter(word => !STOP.has(word)))];
  let list = null;
  const terms = [], matches = [];
  for (const word of asked) {
    const s = stem(word);
    const hit = vocabulary.has(s) ? s : s.length >= 5 ? (list ||= [...vocabulary]).find(v => v.length >= 5 && (v.startsWith(s) || s.startsWith(v))) : null;
    if (hit) { terms.push(word); if (!matches.includes(hit)) matches.push(hit); }
  }
  const codeWords = asked.filter(word => CODE_WORDS.has(word));
  return { relevant: terms.length > 0 || codeWords.length > 0, terms, matches, codeWords };
}
// A snapshot's index for repositoryRelevance: what the browser's snapshot route already lists, never file contents.
export const snapshotIndex = snapshot => ({
  paths: Array.isArray(snapshot?.files) ? snapshot.files.map(file => file.path) : Object.keys(snapshot?.files || {}),
  labels: (snapshot?.graph?.nodes || []).map(node => node.label).filter(Boolean),
});

// Whether the Tutor shows the codebase menu instead of its general welcome. Only on a canvas whose repository is the
// chosen material and ready, only where the general entry would offer something with no goal yet (selected, enabled,
// unpaused Tutor: resolveTutorEntry already checked that), and never while the learner types: an explicit request, about
// the code or anything else, skips the menu. "Learn something else" (dismissed) returns the general welcome.
export function showCodebaseMenu({ entry, repository, dismissed = false, typing = false }) {
  return !!repository?.commit && !dismissed && !typing && ['welcome', 'existing_work'].includes(entry?.kind);
}

// A repository source a codebase activity cites (SourceRef kind 'repository_file'): id `<owner/name>:<path>`, version the
// commit, hash the SHA-256 of the whole file at that commit, locator the cited lines and the file's role.
export const REPOSITORY_SOURCE = 'repository_file';
export const isRepositorySource = ref => ref?.kind === REPOSITORY_SOURCE && typeof ref.locator?.path === 'string';
