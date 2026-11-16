// packages/web/src/tutor-rehearsal-text.js
// What the Tutor says in the initial pipeline (initial-pipeline-spec.md; route-catalogue-spec.md section 4; cannot-run-edge-cases.md
// sections 1, 1a, 3). The renderer, not the model, enforces the wording rules: the catalogue message is built here from the catalogue
// document, and its text and chip labels are checked by `leaks` (no command, path or file:line); a violation falls back to the
// title-less safe wording. Never a stack trace, a sandbox id, a dollar figure or a Modal term, and never "something went wrong".
// Pure: no React, no network, no storage.
import { CODEBASE_GOALS } from './learn-codebase-goals.js';
import { cannotBlock, catalogueView, chooseText, effortWord, oneText, waysOf, zeroText } from './catalogue-view.js';

export const STAR = '⭐';
export const SOMETHING_ELSE_CHIP = 'Something else';
export const FLAT_MAX = 5; // at most this many practical routes are listed flat; more are grouped by the catalogue's group label

const lower1 = text => (text ? text[0].toLowerCase() + text.slice(1) : text);
const upper1 = text => (text ? text[0].toUpperCase() + text.slice(1) : text);
const noStop = text => String(text || '').trim().replace(/[.\s]+$/, '');
export const repoName = repo => String(repo || '').split('/').pop() || 'this repository';

// ---- the wording guard -------------------------------------------------------------------------------------------------
// A command (backticks, a tool followed by what it runs), a path (a slash path with an extension, ./ or ../, or a bare file name of a
// code or config extension) or a file:line. Node.js and similar names are not file names (js and ts are not in the bare list).
const COMMAND = /`|\$ |\b(?:pip3?|npm|npx|yarn|pnpm|python3?|cargo|make|docker|pytest|torchrun|uvicorn|brew|bash|conda)\s+(?:install|run|test|build|start|apply|compose|exec|-\S+|[\w./-]+\.[a-z]{1,4}\b)/i;
const PATH = /(?:[\w.-]+\/)+[\w.-]+\.[A-Za-z0-9]{1,5}\b|(?:^|[\s(])\.{1,2}\/\S+|\b[\w-]+\.(?:py|md|toml|ya?ml|sh|cfg|ini|txt|json|rs|go|rb|java)\b/;
const FILE_LINE = /[\w./-]+:\d+\b/;
// repo: the repository's own name is allowed to look like a file (next.js, repo.py).
export function leaks(text, { repo = '' } = {}) {
  let body = String(text || '');
  const name = repoName(repo);
  if (name) body = body.split(name).join('');
  if (repo) body = body.split(String(repo)).join('');
  return COMMAND.test(body) || PATH.test(body) || FILE_LINE.test(body);
}
// What no chat line may carry (cannot-run-edge-cases.md section 1a): a Modal term, a sandbox id, a dollar figure, a stack trace.
const INTERNAL = /\bmodal\b|\bsb-[A-Za-z0-9]{6,}|\bim-[A-Za-z0-9]{6,}|\$\s?\d|\busd\b|traceback|\bat \S+:\d+|sandbox id|\bsandbox\b/i;
export const internal = text => INTERNAL.test(String(text || ''));

// ---- the catalogue message ---------------------------------------------------------------------------------------------

const practicalOf = doc => (doc?.routes || []).filter(route => route.practical);
const impracticalOf = doc => (doc?.routes || []).filter(route => !route.practical);
const hardwareOf = doc => (doc?.hardware === 'cpu' || !doc?.hardware ? 'CPU' : String(doc.hardware).toUpperCase());
const chipOf = route => ({ id: `route:${route.routeId}`, routeId: route.routeId, label: noStop(route.title), hint: effortWord(route.effort), star: !!route.recommended, recommended: !!route.recommended });
const blockOf = route => [`${route.recommended ? `${STAR} ` : ''}**${route.title}** · *${route.effort}*`, [route.description, route.recommended ? '**Recommended to start.**' : ''].filter(Boolean).join(' ')].filter(Boolean).join('\n');
const closingLine = doc => {
  const rest = impracticalOf(doc);
  return rest.length ? `Not on this canvas: ${rest.map(route => `${route.title}${route.reason ? ` - ${noStop(route.reason)}` : ''}`).join('; ')}.` : '';
};

// The route list, flat up to FLAT_MAX practical routes, else under the group labels as plain-words lines.
function routeBlocks(doc) {
  const practical = practicalOf(doc);
  if (practical.length <= FLAT_MAX) return practical.map(blockOf);
  const out = [], labels = new Map((doc.groups || []).map(group => [group.id, group.label]));
  const order = [...new Set(practical.map(route => route.group || ''))];
  for (const id of order) {
    const label = labels.get(id);
    if (label) out.push(`${upper1(label)}:`);
    out.push(...practical.filter(route => (route.group || '') === id).map(blockOf));
  }
  return out;
}

const opening = (doc, name) => `I've read **${name}**. ${doc.summary}`;
const GOAL_CHIPS = () => CODEBASE_GOALS.map(goal => ({ id: `goal:${goal.id}`, goalId: goal.id, label: goal.label }));

// The title-less wording used when anything built from the document would leak a command, a path or a file:line.
function safeMessage(doc, name) {
  const practical = practicalOf(doc);
  if (!practical.length) return { kind: 'zero', safe: true, text: `I've read **${name}**. Running it here needs more than this canvas has. You can still explore the code.`, chips: GOAL_CHIPS() };
  const text = `I've read **${name}**. Here's what you can do with it: there ${practical.length === 1 ? 'is one practical way' : `are ${practical.length} practical ways`} to use it on a ${hardwareOf(doc)}.`;
  return { kind: practical.length === 1 ? 'one' : 'choose', safe: true, text, routeId: practical[0].routeId,
    chips: practical.length === 1 ? [] : [...practical.map((route, i) => ({ id: `route:${route.routeId}`, routeId: route.routeId, label: `Way ${i + 1}`, star: !!route.recommended, recommended: !!route.recommended })), { id: 'else', label: SOMETHING_ELSE_CHIP }] };
}

// The can / cannot message. -> { kind: 'none' | 'zero' | 'one' | 'choose', text, chips, routeId?, safe? }
//   none:   the catalogue found no route at all (section 1a): the five goals.
//   zero:   routes, none practical: the four-part message (found, what it needs, what can be done, the five goals).
//   one:    exactly one practical route: no question.
//   choose: more than one practical route: the opening, the route blocks and the closing line. Its chips are the route question's
//           (routeQuestion), shown once "Use the codebase" is chosen, so the list is not repeated.
export function catalogueMessage(doc) {
  const name = repoName(doc?.repo), practical = practicalOf(doc);
  let built;
  if (!(doc?.routes || []).length) {
    built = { kind: 'none', text: `I read **${name}**. ${doc.summary} I didn't find a documented way to run it: no quick start, no scripts, no tests. You can read it, trace a feature, or tell me what you expected to run.`, chips: GOAL_CHIPS() };
  } else if (!practical.length) {
    built = { kind: 'zero', text: zeroText(catalogueView(doc, name), doc.summary), chips: GOAL_CHIPS() };
  } else if (practical.length === 1) {
    built = { kind: 'one', routeId: practical[0].routeId, text: oneText(catalogueView(doc, name)), rest: cannotBlock(catalogueView(doc, name)), chips: waysOf(catalogueView(doc, name)) };
  } else {
    built = { kind: 'choose', text: chooseText(catalogueView(doc, name)), rest: cannotBlock(catalogueView(doc, name)), chips: [...waysOf(catalogueView(doc, name)), { id: 'else', label: SOMETHING_ELSE_CHIP }] };
  }
  const labels = [built.text, built.rest, ...built.chips.map(chip => chip.label)].filter(Boolean).join('\n');
  return leaks(labels, { repo: doc?.repo }) ? safeMessage(doc, name) : built;
}

// The route question once "Use the codebase" is chosen and more than one route is practical: one chip per practical route (the star on the recommended one) and
// Something else. The blocks were shown in the can / cannot message, so this is the question and the chips.
export function routeQuestion(doc) {
  const practical = practicalOf(doc), safe = leaks(practical.map(route => route.title).join('\n'), { repo: doc?.repo }) ? safeMessage(doc, repoName(doc?.repo)) : null;
  if (safe) return { text: 'Which way should I set up?', chips: safe.chips };
  return { text: 'Which of these should I set up?', chips: [...practical.map(chipOf), { id: 'else', label: SOMETHING_ELSE_CHIP }] };
}

// Intake v2: for a codebase that can run, the facts message ahead of the Run or Learn question: its name and what it is, then what is out of reach. The ways it can run are the Run it route list.
export function factsMessage(doc, cm = catalogueMessage(doc)) {
  const name = repoName(doc?.repo), summary = noStop(doc?.summary), text = summary ? `**${name}**: ${summary}.` : `**${name}**`;
  return { text: leaks(text, { repo: doc?.repo }) ? `**${name}**` : text, rest: cm.rest || '' };
}

// ---- the other Tutor sentences (cannot-run-edge-cases.md section 1a) ------------------------------------------------------

export const SENTENCES = {
  unreachable: name => `I can't reach **${name}**: it looks private or gone. Rabbit Hole works with public GitHub repositories.`,
  tooBig: (name, files) => `**${name}** is bigger than I can index here${files ? ` (${files} files; the limit is 2,000)` : ' (the limit is 2,000 files)'}. I can still read it with you, but I can't map or run it.`,
  catalogueFailed: name => `I couldn't make sense of how **${name}** is meant to be used: the README and scripts didn't give me a clear route. You can read it, or point me at the file that starts it.`,
  noMachine: name => `I couldn't start a machine to run **${name}** just now. Nothing is wrong with the repository. Try again in a minute; if it keeps happening, tell the owner.`,
  costCap: name => `I stopped rehearsing **${name}** because it was costing more than I allow for one repository. Here is what ran.`,
  rehearsalFailed: name => `I couldn't finish rehearsing **${name}** just now. Nothing is wrong with the repository. Try again in a minute, or read it with me.`,
  runStartFailed: 'I couldn\'t start a machine for this run. Try again; nothing on the canvas is lost.',
  runFailed: 'I couldn\'t run that cell just now. Try again; nothing on the canvas is lost.',
  sessionEnded: 'Your run session ended. Starting a new one - your earlier outputs are kept.',
  soon: label => `**${label}** isn't built yet. Pick one of the others below, or tell me what you want to do with this codebase.`,
  notSure: 'I wasn\'t sure which of these you meant. Pick one below.',
  intake: 'What do you want to do with this codebase?',
  // Intake v2, Run or Learn (owner 2026-11-15, intake-run-or-learn-spec.md section 5): no repository name in any of these; the options, `thing` and `why` come from the catalogue document.
  runIt: 'Run it',
  learnIt: 'Learn from it',
  learnOptions: 'From this codebase you can learn:',
  learnOrType: "Or tell me what you'd like to learn.",
  start: 'Start',
  learnNear: 'Did you mean one of these?',
  learnCannot: (thing, why) => `This codebase doesn't have ${thing} to learn from — ${why}. I can teach:`,
  learnCannotPlain: "This codebase doesn't have that to learn from. I can teach:",
  learnNone: "I couldn't work out what to teach from this codebase just now. Tell me what you'd like to learn.",
  // Learn plan (learn-plan-toc-spec.md section 6, owner 2026-11-15): no repository word anywhere.
  planAccept: 'Accept',
  planChange: 'Change something',
  planKeep: 'Keep the previous draft',
  planTryAgain: 'Try again',
  planPlain: 'Start without a plan',
  planAccepted: n => `Plan accepted · ${n} ${n === 1 ? 'chapter' : 'chapters'}`,
  planEditPlaceholder: 'Tell me what to change',
  planInvalid: "I couldn't make a clean plan for this. Try again, or start without one.",
  planDrafting: 'Drafting a plan',
  planNotSaved: "I couldn't save the plan, so it may be gone after a reload.",
  learnIntroFailed: "I couldn't open that topic just now. Try again; nothing was lost.",
};

// Indexing failed: too big when the plain reason says so (a number of files or the limit), else the connect-time line.
export function indexingFailure(name, error) {
  const text = String(error || '');
  if (/\blimit\b|too (?:big|large)|bigger than|\d[\d,]*\s+files/i.test(text)) return SENTENCES.tooBig(name, (/(\d[\d,]*)\s+files/i.exec(text) || [])[1] || '');
  return SENTENCES.unreachable(name);
}

// A rehearsal that failed (status failed, error in plain words or not): the sentence and whether Retry is offered. A reason that names a machine, a
// sandbox or a provider, or carries a dollar figure, never reaches the chat.
export function rehearsalFailure(name, error) {
  const text = String(error || '');
  if (/\b(cost|budget|cap)\b/i.test(text)) return { text: SENTENCES.costCap(name), retry: false };
  if (!text || internal(text) || /unreachable|controller|could not start|couldn't start|failed to start|provision|image|timeout|timed out|connect/i.test(text)) return { text: SENTENCES.noMachine(name), retry: true };
  return { text: SENTENCES.rehearsalFailed(name), retry: true };
}

// A Run card cell that did not pass (rc != 0, a timeout): one line, the first error line of its output.
export function firstErrorLine(out) {
  const lines = String(out || '').split('\n').map(line => line.trim()).filter(Boolean);
  const hit = [...lines].reverse().find(line => /error|exception|failed|not found|no such|denied/i.test(line) && !/^\s*at \S+:\d+/.test(line)) || lines[lines.length - 1] || '';
  const one = hit.replace(/\s+/g, ' ').slice(0, 200);
  return internal(one) ? '' : one;
}
export function cellFailedLine({ title, out, status, inRehearsal = false }) {
  if (status === 'timeout') return `**${title}** took longer than I allow here, so I stopped it. The rehearsal's output under the cell shows how far it got.`;
  const error = firstErrorLine(out);
  const head = error ? `**${title}** failed: ${noStop(error)}.` : `**${title}** failed.`;
  return inRehearsal
    ? `${head} It stopped here in the rehearsal too, so this is not something you changed. You can run the steps before it, or read the code.`
    : `${head} In the rehearsal it passed - the difference is usually a flag you changed or a file from an earlier cell. Undo the change, or run the previous cell first. The rehearsal output under the cell is what a good run looks like.`;
}

// The validator refused a flag (POST /api/learn/run 400). accepted: the flags the cell takes.
export function flagRefusedLine({ repo, message, accepted = [] }) {
  const flag = (/--[A-Za-z0-9_-]+/.exec(String(message || '')) || [])[0];
  const takes = accepted.length ? ` The ones it takes: ${accepted.join(', ')}.` : ' This cell takes no editable flags.';
  return `That ${flag ? 'flag' : 'value'} isn't one **${repoName(repo)}** accepts here${flag ? ` (\`${flag}\`)` : ''}.${takes}`;
}

// ---- a flag the program rejects at run time (Run card v1.1 Part 1c; cannot-run-edge-cases.md section 1a) ------------------------------------------------------------

// Levenshtein distance, case-insensitive.
export function editDistance(a, b) {
  const s = String(a).toLowerCase(), t = String(b).toLowerCase();
  let row = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const next = [i];
    for (let j = 1; j <= t.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1));
    row = next;
  }
  return row[t.length];
}
// The nearest of the cell's own flags to the one that was rejected (the record's knobs, never a guess from elsewhere); null when none is close (distance more than a third of its length, at most 3).
export function didYouMean(flag, known = []) {
  const name = String(flag).replace(/^--/, '');
  let best = null, bestDistance = Infinity;
  for (const k of known) {
    const d = editDistance(name, String(k).replace(/^--/, ''));
    if (d < bestDistance) { best = k; bestDistance = d; }
  }
  return best && bestDistance > 0 && bestDistance <= Math.min(3, Math.max(1, Math.floor(name.length / 3))) ? best : null;
}
// The flag a program refused, from its error output: a config-key runner (Unknown config key), click (No such option), argparse (unrecognized arguments), a Python call (unexpected keyword). -> '--name' or null.
export function rejectedFlag(out) {
  const m = /Unknown config key:?\s*['"]?([A-Za-z0-9_-]+)|No such option:?\s*(?:--?)?([A-Za-z0-9_-]+)|unrecognized arguments:?\s*(?:--?)?([A-Za-z0-9_-]+)|unexpected keyword argument\s*['"]([A-Za-z0-9_]+)['"]/i.exec(String(out || ''));
  const name = m && (m[1] || m[2] || m[3] || m[4]);
  return name ? `--${name}` : null;
}
// The script a cell runs, for the sentence (sample.py), else the cell's title.
export const scriptOf = (cmd, title = '') => (String(cmd || '').split(/\s+/).find(token => /\.(py|js|mjs|ts|sh|rb)$/.test(token)) || title).split('/').pop();
// The one line for a rejected flag: names the flag and the script, with the nearest flag the card knows when there is one; null when the output rejects no flag (the plain failure line applies).
export function flagRejectedLine({ out, cmd, title, known = [] }) {
  const flag = rejectedFlag(out);
  if (!flag) return null;
  const near = didYouMean(flag, known), script = scriptOf(cmd, title);
  return `\`${flag}\` isn't a flag \`${script}\` takes${near ? `; did you mean \`${near}\`?` : `. The ones it takes: ${known.length ? known.join(', ') : 'none that I can set here'}.`}`;
}
// A value the card did not send because it breaks its type rule (run-card-knobs.js checkValue): nothing ran, and the chat says so.
export const valueRuleLine = ({ flag, message }) => `I didn't run it. ${flag ? `\`${flag}\` needs a different value: ` : ''}${message}`;
