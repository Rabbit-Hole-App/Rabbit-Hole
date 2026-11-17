// packages/web/src/learn-runbook.js
// The Reviewer's Runbook v1: the document a learner takes to their own machine to install and run a repository the way the
// rehearsal proved it works. Pure and deterministic (no model, no network, no storage): buildRunbook(record) returns BlockNote
// blocks limited to canvas-doc.js's DOC_BLOCK_TYPES, from the rehearsal record only (rehearsal-runtime/schemas/record.json).
// Principles (docs/features/runbook.md, the six that still apply): ordered by reader; every claim checkable (a citation, else
// omitted); examples from the record's real runs; symptoms before causes; omit rather than fill (a section with no data is
// absent); no secret values, ever. Every citation is a link to GitHub at the record's commit (card-sources.js repositoryUrl),
// so it stays honest when the document is copied out; the doc card's click handler turns a click on one into Files at those
// lines (parseRepoLink / openRunbookLink below).
import { repositoryUrl } from './card-sources.js';

export const HEAD_LINES = 20; // stdout heads are cut here; commands never are
const TAIL_LINES = 5;
const RUNBOOK_ID = /^runbook-\d+$/;
// The route's title follows (initial pipeline: one runbook per (repo, commit, routeId)): the record's own route title, else the one the caller passes.
export const runbookTitle = (record, routeTitle) => [`Runbook - ${record.repo} @ ${String(record.commit || '').slice(0, 7)}`, String(record.route?.title || routeTitle || '').trim()].filter(Boolean).join(' · ');
// The runbook's own blocks carry these ids (BlockNote keeps a block's id through edits and saves): regenerating replaces only them.
export const isRunbookBlock = block => RUNBOOK_ID.test(String(block?.id || ''));

// The same secret idea as learn-codebase-goals.js (SECRET_NAME / SECRET_TEXT): a matching string never reaches a block.
const SECRET_NAME = /(^|\/)(\.env(\.[\w-]+)?|[\w.-]+\.(pem|key|p12|pfx|jks|keystore)|id_(rsa|dsa|ecdsa|ed25519)|credentials(\.[a-z]+)?|secrets?(\.[a-z]+)?|[\w-]+\.secrets?\.[a-z]+)$/i;
const SECRET_TEXT = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bxox[abpr]-[A-Za-z0-9-]{10,}|\bsk-[A-Za-z0-9_-]{20,}/g;
export const scrub = text => String(text ?? '').replace(SECRET_TEXT, '[redacted]');

// ---- citations -------------------------------------------------------------------------------------------------------

// "README.md:85" or "README.md:82-103" -> { path, line, lineEnd }; anything else null.
const CITE = /^([\w][\w./-]*\.[A-Za-z0-9]+):(\d+)(?:-(\d+))?$/;
export function parseSource(source) {
  const m = CITE.exec(String(source || '').trim());
  return m ? { path: m[1], line: Number(m[2]), lineEnd: m[3] ? Number(m[3]) : undefined } : null;
}
const CITE_IN_TEXT = /\b([\w][\w./-]*\.(?:md|py|js|txt|toml|cfg|json|yaml|yml|sh)):(\d+)(?:-(\d+))?/g;

// The click handler's parse (repository-canvas.jsx): a link to this repository at this commit -> { path, start, end } or null.
// Inverse of repositoryUrl; the path may or may not be percent-encoded.
export function parseRepoLink(href, { repo, commit }) {
  const prefix = `https://github.com/${repo}/blob/${commit}/`;
  const text = String(href || '');
  if (!repo || !commit || !text.startsWith(prefix)) return null;
  const [rawPath, hash = ''] = text.slice(prefix.length).split('#');
  let path;
  try { path = rawPath.split('/').map(decodeURIComponent).join('/'); } catch { return null; }
  if (!path || path.split('/').includes('..')) return null;
  const m = /^L(\d+)(?:-L(\d+))?$/.exec(hash);
  return m ? { path, start: Number(m[1]), end: Number(m[2] || m[1]) } : { path, start: undefined, end: undefined };
}

// A click on a runbook citation: opens the Files reader at the lines exactly as TutorCodebase.jsx openFiles does (small:open-code,
// cancelable; the repository canvas answers it), else GitHub at that commit. true: the link is this repository's and was handled here.
// sameRepo: the card's own commit may not be the snapshot's (and an older card has no app), so the canvas's repository answers by repo alone (answersOpenCode).
export function openRunbookLink(href, { app, repo, commit }, { dispatch = event => window.dispatchEvent(event), open = url => window.open(url, '_blank', 'noopener') } = {}) {
  const at = parseRepoLink(href, { repo, commit });
  if (!at) return false;
  const event = new CustomEvent('small:open-code', { detail: { app, repo, commit, sameRepo: true, path: at.path, start: at.start, end: at.end }, cancelable: true });
  if (dispatch(event) !== false && !event.defaultPrevented) open(href);
  return true;
}

// Whether a repository canvas answers a small:open-code event (repository-canvas.jsx): { appName, repo, commit } are its own app and indexed snapshot. A Runbook or Run card's event
// (sameRepo) is answered for the same repository whatever commit or app name the card carries (cards made before app was stored have none), and Files opens the snapshot's file;
// any other card (a code card) is answered only at its own app and commit, never shown against a different revision.
export function answersOpenCode(detail, { appName, repo, commit }) {
  if (!detail?.path) return false;
  if (detail.sameRepo) return !!detail.repo && !!repo && String(detail.repo).toLowerCase() === String(repo).toLowerCase();
  return !!appName && detail.app === appName && !!commit && detail.commit === commit;
}

// ---- inline content --------------------------------------------------------------------------------------------------

const text = (value, styles = {}) => ({ type: 'text', text: scrub(value), styles });
const code = value => text(value, { code: true });
const link = (href, label) => ({ type: 'link', href, content: [text(label)] });
const cellText = value => [text(value)];
// A citation as a link to its lines on GitHub at the commit; text that is not a citation stays text.
const cite = (ctx, source) => {
  const at = parseSource(source);
  return at && !SECRET_NAME.test(at.path) ? link(repositoryUrl({ ...ctx, ...at }), source) : text(source);
};
// Prose from the record with every file:line in it made a link.
const linkify = (ctx, value) => {
  const out = [];
  let last = 0;
  for (const m of String(value).matchAll(CITE_IN_TEXT)) {
    if (m.index > last) out.push(text(value.slice(last, m.index)));
    out.push(cite(ctx, m[0]));
    last = m.index + m[0].length;
  }
  if (last < String(value).length) out.push(text(String(value).slice(last)));
  return out;
};
const fileLink = (ctx, path) => (SECRET_NAME.test(path) ? text(path) : link(repositoryUrl({ ...ctx, path }), path));

// ---- blocks ----------------------------------------------------------------------------------------------------------

const heading = (level, value) => ({ type: 'heading', props: { level }, content: [text(value)], children: [] });
const para = (...inline) => ({ type: 'paragraph', content: inline.flat(), children: [] });
const bullet = (...inline) => ({ type: 'bulletListItem', content: inline.flat(), children: [] });
const quote = (...inline) => ({ type: 'quote', content: inline.flat(), children: [] });
const codeBlock = value => ({ type: 'codeBlock', content: [text(value)], children: [] });
const table = (header, rows) => ({ type: 'table', content: { type: 'tableContent', headerRows: 1, rows: [header, ...rows].map(cells => ({ cells })) }, children: [] });

const num = n => Number(n).toLocaleString('en-US');
const fixed = (n, digits) => Number(n).toFixed(digits);
const size = bytes => (bytes < 1048576 ? `${fixed(bytes / 1024, 1)} KiB` : `${fixed(bytes / 1048576, 1)} MiB`);
const bytesText = bytes => `${num(bytes)} bytes, ${size(bytes)}`;
const lines = value => String(value || '').replace(/\s+$/, '').split('\n');
// The head of an output, at most HEAD_LINES lines; the cut is said, never silent.
const head = value => {
  const all = lines(value);
  return all.length > HEAD_LINES ? `${all.slice(0, HEAD_LINES).join('\n')}\n(${all.length - HEAD_LINES} more lines not shown)` : all.join('\n');
};
const tail = value => lines(value).slice(-TAIL_LINES).join('\n');
const lastLine = value => lines(value).filter(line => line.trim()).at(-1) || '';
const pad = id => String(id); // step ids stay verbatim: they are what the record and the Run card call the step

// Route steps with the command the record ran, in route order, each with its plan title when the plan has one.
const routeSteps = record => (record.route?.steps || []).map(route => {
  const ran = (record.steps || []).find(step => step.id === route.id) || null;
  const title = (record.draftPlan?.steps || []).find(step => step.cmd === route.cmd)?.title;
  return { route, ran, title };
});
// --flag=value pairs of a command.
const flagValues = cmd => Object.fromEntries([...String(cmd || '').matchAll(/(--[\w-]+)=(\S*)/g)].map(m => [m[1], m[2]]));
// The .py files a command names, in order: the script and a config file it loads.
const scriptsOf = cmd => String(cmd || '').split(/\s+/).filter(token => /\.py$/.test(token) && !token.startsWith('-'));
// A trap's trace: the file that was exec'd (sample.py runs exec(open('configurator.py'))) and the line inside it.
const trapSite = trap => {
  const file = /exec\(open\('([\w./-]+\.py)'\)/.exec(trap.stderrTail || '')?.[1];
  const line = /File "<string>", line (\d+)/.exec(trap.stderrTail || '')?.[1];
  return file && line ? { path: file, line: Number(line) } : null;
};
// The plan's warning for a trap: matched by position, which holds only when the plan lists one warning per trap.
// ponytail: no per-trap key on trapsToWarn; with unequal counts the warnings are listed apart, never guessed onto a trap.
const warningFor = (record, index) => ((record.draftPlan?.trapsToWarn || []).length === (record.traps || []).length ? record.draftPlan.trapsToWarn[index] : null);

// ---- sections (each returns [] when its data is absent) -----------------------------------------------------------------

// Purpose. Reads: repo, commit, route.title, route.whyChosen, steps[-1].stdoutHead.
export function purpose(record, ctx) {
  if (!record.repo || !record.route?.title) return [];
  const sample = [...(record.steps || [])].reverse().find(step => step.stdoutHead);
  const short = String(record.commit || '').slice(0, 7);
  return [
    heading(2, 'Purpose'),
    para(text('Install and run '), record.commit ? link(`https://github.com/${record.repo}/tree/${record.commit}`, `${record.repo} at ${short}`) : text(record.repo), text(`: ${record.route.title}.`)),
    ...(record.route.whyChosen ? [para(text('Why this route: '), ...linkify(ctx, record.route.whyChosen))] : []),
    ...(sample ? [para(text(`What it prints (the first lines of ${pad(sample.id)}):`)), codeBlock(lines(sample.stdoutHead).slice(0, 8).join('\n'))] : []),
  ];
}

// What you need. Reads: environment.python, environment.cpu, environment.memGiB, environment.packagesAfter, image.ref, wallSec,
// attempts[step=install].sec, steps[].sec, route.install[0] (cmd, source, trimmedFrom).
export function needs(record, ctx) {
  const env = record.environment, install = record.route?.install?.[0];
  if (!env && !install) return [];
  const base = /\(([^)]+)\)\s*$/.exec(record.image?.ref || '')?.[1];
  const out = [heading(2, 'What you need')];
  if (env?.python) out.push(bullet(text(`Python ${env.python}${base ? ` (the rehearsal's image was ${base})` : ''}.`)));
  if (env?.cpu) out.push(bullet(text(`Hardware: CPU only, ${env.cpu} cores${env.memGiB ? `, ${fixed(env.memGiB, 0)} GiB of memory` : ''}. No GPU was used.`)));
  const installTime = (record.attempts || []).filter(a => a.step === 'install').at(-1)?.sec;
  const times = [...(installTime != null ? [`install ${fixed(installTime, 2)} s`] : []), ...(record.steps || []).map(step => `${pad(step.id)} ${fixed(step.sec, 2)} s`)];
  if (times.length) out.push(bullet(text(`Measured in the rehearsal on that hardware: ${times.join(', ')}${record.wallSec ? `; the whole job took ${fixed(record.wallSec, 1)} s` : ''}. Expect different times on yours.`)));
  if (install?.cmd) {
    const names = String(install.cmd).replace(/^.*?pip install\s+/, '').split(/\s+/).filter(name => name && !name.startsWith('-'));
    const have = Object.fromEntries(Object.entries(env?.packagesAfter || {}).map(([name, version]) => [name.toLowerCase(), version]));
    const versions = names.filter(name => have[name.toLowerCase()]).map(name => `${name} ${have[name.toLowerCase()]}`);
    out.push(para(text('Install, as run in the rehearsal'), ...(install.source ? [text(' (from '), cite(ctx, install.source), text(')')] : []), text(':')), codeBlock(install.cmd));
    if (install.trimmedFrom && install.trimmedFrom !== install.cmd.replace(/^pip install\s+/, '')) out.push(para(text('The README says '), code(install.trimmedFrom), text('; these are the packages the scripts import.')));
    if (versions.length) out.push(para(text(`Versions that were installed: ${versions.join(', ')}.`)));
  }
  return out;
}

// Run it. Reads: route.steps[] (id, cmd, source), draftPlan.steps[].title, steps[] (sec, files, stdoutHead, stdoutTail, checks[].first/last).
export function runIt(record, ctx) {
  const steps = routeSteps(record).filter(step => step.route.cmd);
  if (!steps.length) return [];
  const out = [heading(2, 'Run it')];
  steps.forEach(({ route, ran, title }, index) => {
    out.push(heading(3, `Step ${index + 1}: ${title || pad(route.id)}`));
    if (route.source) out.push(para(text('From '), cite(ctx, route.source), text(':')));
    out.push(codeBlock(route.cmd));
    if (!ran) return;
    const files = Object.entries(ran.files || {});
    if (files.length) out.push(para(text('It produces: '), ...files.flatMap(([path, f], i) => [...(i ? [text('; ')] : []), code(path), text(` (${bytesText(f.bytes)})`)])));
    const metric = (ran.checks || []).find(check => check.type === 'metric_decreased' && check.first != null && check.last != null);
    if (metric) {
      const iterations = flagValues(route.cmd)['--max_iters'];
      out.push(para(text(`The loss goes from ${fixed(metric.first, 2)} to ${fixed(metric.last, 2)}${iterations ? ` over ${num(iterations)} iterations` : ''} (first ${metric.first}, last ${metric.last} in the printed output).`)));
    }
    out.push(para(text(`Took ${fixed(ran.sec, 2)} s in the rehearsal (exit code ${ran.rc}).`)));
    if (ran.stdoutHead) out.push(para(text('The first lines it printed:')), codeBlock(head(ran.stdoutHead)));
    if (ran.stdoutTail && ran.stdoutTail !== ran.stdoutHead) out.push(para(text('The last lines it printed:')), codeBlock(tail(ran.stdoutTail)));
  });
  return out;
}

// Make it yours. Reads: route.steps[] (cmd), route.knobs[] (step, flag, type, default, source), knobsVerified[0] (cmd, rc, sec, startsWithPrompt, separators).
export function makeItYours(record, ctx) {
  const knobs = record.route?.knobs || [];
  if (!knobs.length) return [];
  const verified = record.knobsVerified?.[0];
  const stepCmd = Object.fromEntries((record.route?.steps || []).map(step => [step.id, flagValues(step.cmd)]));
  const tried = Object.fromEntries(Object.entries(flagValues(verified?.cmd)));
  const row = knob => [cellText(knob.flag), cellText(pad(knob.step)), cellText(knob.type), [code(String(knob.default))],
    knob.source ? [cite(ctx, knob.source)] : cellText(''), cellText(tried[knob.flag] ?? stepCmd[knob.step]?.[knob.flag] ?? '')];
  const out = [heading(2, 'Make it yours'),
    para(text('Every flag the scripts accept on the command line. The last column is the value the rehearsal tried: in the verified command below, else in the step command above.')),
    table(['Flag', 'Step', 'Type', 'Default', 'Defined at', 'Tried'].map(cellText), knobs.map(row))];
  if (verified?.cmd) {
    out.push(para(text(`A changed command the rehearsal ran${verified.rc === 0 ? ' successfully' : ''}${verified.sec != null ? ` (${fixed(verified.sec, 2)} s)` : ''}${verified.startsWithPrompt ? '; the output starts with your prompt' : ''}${verified.separators != null ? ` and has ${verified.separators} separators between samples` : ''}:`)), codeBlock(verified.cmd));
  }
  return out;
}

// What the README didn't say. Reads: fixes[] (kind, change, step, evidence), attempts[].n, traps[] (cmd, stderrTail), draftPlan.trapsToWarn[].
export function readmeGaps(record, ctx) {
  const fixes = record.fixes || [], traps = record.traps || [];
  const out = [heading(2, "What the README didn't say")];
  if (fixes.length) fixes.forEach(fix => out.push(bullet(text(`${fix.kind.replace(/_/g, ' ')}: ${fix.change} (step ${pad(fix.step)}), evidence: `), ...linkify(ctx, fix.evidence))));
  else if (record.steps?.length) out.push(para(text((record.attempts || []).every(a => a.n === 1) ? 'No fixes were needed: every step passed on its first attempt.' : 'No fixes were recorded.')));
  traps.forEach((trap, i) => {
    const why = warningFor(record, i);
    out.push(para(text('This fails:')), codeBlock(trap.cmd), para(text('Error: '), code(lastLine(trap.stderrTail)), ...(why ? [text(`. Why: ${why}`)] : [])));
  });
  if (traps.length && !traps.every((_, i) => warningFor(record, i))) (record.draftPlan?.trapsToWarn || []).forEach(warning => out.push(bullet(text(warning))));
  return out.length > 1 ? out : [];
}

// How it is organised. Reads: route.steps[] (id, cmd, source), route.knobs[] (source, flag), traps[].stderrTail.
export function organised(record, ctx) {
  const files = new Map(); // path -> { steps, source, flags, sites }
  const entry = path => { if (!files.has(path)) files.set(path, { steps: [], source: null, flags: [], sites: [] }); return files.get(path); };
  for (const step of record.route?.steps || []) for (const path of scriptsOf(step.cmd)) { const e = entry(path); e.steps.push(step); e.source ||= step.source; }
  for (const knob of record.route?.knobs || []) { const at = parseSource(knob.source); if (at) entry(at.path).flags.push(knob.flag); }
  for (const trap of record.traps || []) { const site = trapSite(trap); if (site) entry(site.path).sites.push(site.line); }
  const order = [...files.keys()].sort((a, b) => (files.get(a).steps.length ? 0 : 1) - (files.get(b).steps.length ? 0 : 1));
  const wording = e => [
    ...(e.steps.length ? [`run by ${e.steps.map(step => pad(step.id)).join(' and ')}`] : []),
    ...(e.flags.length ? [`defines ${e.flags.join(', ')}`] : []),
    ...(e.sites.length ? [`the failing commands in this runbook stop inside it, at line ${[...new Set(e.sites)].join(', ')}`] : []),
  ].join('; ');
  const items = order.map(path => {
    const e = files.get(path);
    return bullet(fileLink(ctx, path), text(`: ${wording(e)}`), ...(e.source ? [text(' ('), cite(ctx, e.source), text(')')] : []));
  });
  return items.length ? [heading(2, 'How it is organised'), ...items] : [];
}

// If it breaks. Reads: traps[] (stderrTail, cmd), draftPlan.trapsToWarn[], fixes[] (stderrTail via attempts[], change), steps[].cmd / route.steps[].source.
export function ifItBreaks(record, ctx) {
  const rows = [];
  (record.traps || []).forEach((trap, i) => {
    const site = trapSite(trap), why = warningFor(record, i);
    rows.push([[code(lastLine(trap.stderrTail))], why ? linkify(ctx, why) : cellText('See the failing command in the section above.'), site ? [cite(ctx, `${site.path}:${site.line}`)] : cellText('')]);
  });
  (record.fixes || []).forEach(fix => {
    const failed = (record.attempts || []).find(a => a.step === fix.step && a.rc !== 0);
    rows.push([[code(lastLine(failed?.stderrTail || ''))], cellText(`${fix.change}`), fix.evidence ? linkify(ctx, fix.evidence) : cellText('')]);
  });
  const carries = flag => (record.route?.steps || []).find(step => step.cmd?.includes(flag));
  const cpu = carries('--device=cpu'), compile = carries('--compile=False');
  if (cpu) rows.push([cellText('A CUDA error'), [text('There is no GPU: pass '), code('--device=cpu'), text(' as the command above does.')], cpu.source ? [cite(ctx, cpu.source)] : cellText('')]);
  if (compile) rows.push([cellText('torch.compile is unavailable or fails'), [text('Pass '), code('--compile=False'), text(' as the command above does.')], compile.source ? [cite(ctx, compile.source)] : cellText('')]);
  return rows.length ? [heading(2, 'If it breaks'), table(['Symptom', 'Likely cause', 'Where to look'].map(cellText), rows)] : [];
}

// Provenance. Reads: startedUtc, sandboxId, image.digest. (modelSpendUsd is deliberately not shown: users see AI units only, CLAUDE.md.)
export function provenance(record) {
  if (!record.startedUtc || !record.sandboxId) return [];
  const digest = String(record.image?.digest || '').replace(/^sha256:/, '').slice(0, 12);
  return [heading(2, 'Provenance'),
    quote(text(`Generated from a rehearsal on ${record.startedUtc.slice(0, 10)} in sandbox ${record.sandboxId}${digest ? `, image ${digest}` : ''}. Every number above is from that run.`))];
}

export const SECTIONS = [['Purpose', purpose], ['What you need', needs], ['Run it', runIt], ['Make it yours', makeItYours], ["What the README didn't say", readmeGaps], ['How it is organised', organised], ['If it breaks', ifItBreaks], ['Provenance', provenance]];

// record -> blocks (the title, then each section that has data, in the spec's order). Ids mark the blocks as the runbook's own.
export function buildRunbook(record, { routeTitle } = {}) {
  if (!record || !record.repo || !record.commit) return [];
  const ctx = { repo: record.repo, commit: record.commit };
  const body = SECTIONS.flatMap(([, section]) => section(record, ctx));
  if (!body.length) return [];
  return [heading(1, runbookTitle(record, routeTitle)), ...body].map((block, i) => ({ id: `runbook-${i + 1}`, ...block }));
}
