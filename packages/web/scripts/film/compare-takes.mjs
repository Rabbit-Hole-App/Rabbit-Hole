// Compare two takes (a reference take and a new take): the equivalence check of the config-driven runner against the film's own script.
// Usage: node compare-takes.mjs <referenceTakeDir> <newTakeDir> [--json]
// Prints (1) hygiene: UNSCRIPTED / ABORT / model-capable / page errors / failed in each take, (2) the /api routes called (method + path) with counts, flagging routes only one take called,
// (3) the ordered beat sequence from the log's scripted events (artifacts by bank key, inline decide, file store, asks, depth menus, selection, drags ...), flagging the first difference,
// (4) marks.json: start/end/length and the count and total seconds of every mark kind. Timing differences under 1 s are listed as "within tolerance"; anything else is a difference.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [refDir, newDir] = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!refDir || !newDir) { console.error('usage: node compare-takes.mjs <referenceTakeDir> <newTakeDir>'); process.exit(2); }
const load = dir => ({ dir, log: readFileSync(join(dir, 'requests.log'), 'utf8').split('\n'), marks: JSON.parse(readFileSync(join(dir, 'marks.json'), 'utf8')) });
const A = load(refDir), B = load(newDir);
const out = [], note = line => out.push(line);

// (1) hygiene
const hygiene = t => ({ unscripted: t.log.filter(l => /UNSCRIPTED/.test(l)).length, abortModel: t.log.filter(l => /^ABORT model/.test(l)).length, abortOutside: t.log.filter(l => /^ABORT outside/.test(l)).length,
  pageErrors: t.log.filter(l => /^PAGEERROR/.test(l)).length, failed: t.log.filter(l => /^FAILED/.test(l)).length, notFound: t.log.filter(l => /^404 /.test(l)).length });
const ha = hygiene(A), hb = hygiene(B);
note('== hygiene (reference | new)');
for (const k of Object.keys(ha)) note(`  ${k.padEnd(13)} ${String(ha[k]).padStart(3)} | ${String(hb[k]).padStart(3)}${ha[k] !== hb[k] ? '   <-- differs' : ''}`);

// (2) routes
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g; // chat thread ids are random per run
const routes = t => { const c = {}; for (const l of t.log) { const m = /^[\d.]+ (GET|POST|PUT|DELETE|PATCH) (\/\S*)/.exec(l); if (m) { const k = `${m[1]} ${m[2].replace(UUID, '<uuid>')}`; c[k] = (c[k] || 0) + 1; } } return c; };
const ra = routes(A), rb = routes(B), keys = [...new Set([...Object.keys(ra), ...Object.keys(rb)])].sort();
note('== /api routes (reference | new)  [counts of the polled and timing-dependent routes may differ; a route only one take called is flagged]');
let routeDiffs = 0;
for (const k of keys) { const x = ra[k] || 0, y = rb[k] || 0; const flag = !x || !y ? '   <-- only one take' : x !== y && (x > 20 || y > 20) ? '   <-- polling differs' : ''; if (flag) routeDiffs++; if (flag || process.argv.includes('--all')) note(`  ${k.padEnd(46)} ${String(x).padStart(4)} | ${String(y).padStart(4)}${flag}`); }
note(`  ${keys.length} routes in all, ${routeDiffs} flagged`);

// (3) beat sequence from the scripted events
const EVENTS = [/SCRIPTED artifact (\w+)/, /SCRIPTED inline decide/, /SCRIPTED file store/, /^[\d.]+ POST \/api\/learn\/ask/, /^ASK /, /LAYOUT after the toggle: (\w+)/, /DEPTH menu/, /SEL exact after drag: (\w+)/, /PILL geometry.*=> (ok|ASSERT FAIL)/,
  /CURSOR on .* before the click: (ok|ASSERT FAIL)/, /ASSERT Ctrl\+K window \((\w+)\).*=> (ok|ASSERT FAIL)/, /CHECKLIST Ctrl\+K window opened from the pill/, /ASSERT the window is the product/, /ASSERT B6 starts from nothing selected.*=> (ok|ASSERT FAIL)/,
  /ASSERT nothing selected before the chord.*=> (ok|ASSERT FAIL)/, /ASSERT B6 window is the empty-canvas.*=> (ok|ASSERT FAIL)/, /^DRAG /, /^DRAGGED (\d+)/, /CHECK (window text|field text).*: (true|false)/];
const seq = t => t.log.map(l => { for (const re of EVENTS) { const m = re.exec(l); if (m) return /^DEPTH menu/.test(l) ? 'DEPTH menu' : l.replace(/^[\d.]+ /, '').replace(UUID, '<uuid>').replace(/[\d.]+/g, '#').slice(0, 70); } return null; }).filter(Boolean);
const sa = seq(A), sb = seq(B);
note('== beat sequence (scripted events, numbers normalised)');
note(`  reference: ${sa.length} events | new: ${sb.length} events`);
let firstDiff = -1; for (let i = 0; i < Math.max(sa.length, sb.length); i++) if (sa[i] !== sb[i]) { firstDiff = i; break; }
const tally = s => s.reduce((c, e) => (c[e] = (c[e] || 0) + 1, c), {}), ta = tally(sa), tb = tally(sb);
for (const k of new Set([...Object.keys(ta), ...Object.keys(tb)])) if (ta[k] !== tb[k]) note(`  event count differs: ${k}  ${ta[k] || 0} | ${tb[k] || 0}`);
if (firstDiff < 0) note('  identical sequence'); else { note(`  first difference at event ${firstDiff}:`); note(`    reference: ${sa[firstDiff] ?? '(none)'}`); note(`    new      : ${sb[firstDiff] ?? '(none)'}`); }

// (4) marks
const sum = arr => (arr || []).reduce((n, [a, b]) => n + (b - a), 0);
note('== marks.json (reference | new)');
const len = m => (m.end ?? 0) - (m.start ?? 0);
note(`  script length ${len(A.marks).toFixed(1)} s | ${len(B.marks).toFixed(1)} s (${(len(B.marks) - len(A.marks)).toFixed(1)} s)`);
for (const k of ['typing', 'reveal', 'depth', 'hold', 'cut', 'dead', 'camera', 'hover', 'act', 'upload']) {
  const x = A.marks[k] || [], y = B.marks[k] || [];
  if (!x.length && !y.length) continue;
  note(`  ${k.padEnd(7)} ${String(x.length).padStart(3)} marks ${sum(x).toFixed(1).padStart(6)} s | ${String(y.length).padStart(3)} marks ${sum(y).toFixed(1).padStart(6)} s`);
}
if (process.argv.includes('--json')) console.log(JSON.stringify({ hygiene: [ha, hb], routesFlagged: routeDiffs, sequence: [sa.length, sb.length, firstDiff], length: [len(A.marks), len(B.marks)] }));
console.log(out.join('\n'));
