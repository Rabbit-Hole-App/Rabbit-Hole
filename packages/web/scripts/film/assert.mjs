// The SOP section 3 beat checklist, asserted from the take itself (requests.log, marks.json, checks.json written by capture.mjs): a draft that fails never reaches the owner.
// Usage: node assert.mjs <takeDir>      Exit 0 = every check passed, 1 = at least one failed (each failure is printed), 2 = the take left no checks.json.
//   pill seen            every slash command shows its command pill after the picker click (obs.pills all ok, at least one)
//   skeleton seen        every card that reserves a slot shows its skeleton for >= skeletonMinMs before it lands (ms from the skeleton standing to the card landing)
//   card centred         after the camera settles, the new card (or parent + child) is centred within centreTol of the viewport centre (obs.centred)
//   tooltip seen         every hovered control with a tooltip shows it for >= tooltipMinMs before the click (obs.tooltips)
//   menu in frame        every Depth menu / Ctrl+K window is wholly inside the viewport when it is read (obs.menus)
//   Chat pane shown      when an ask answers in the Chat pane, the pane is inside the viewport (obs.chat; no entries = the film does not use it)
//   no dead stretch      the take script has no hold longer than holdMax (the last hold, the overview, may be 2.6 s); dead stretches (no typing, reveal, hover, camera or cursor activity > deadMax)
//                        were marked `dead` for render.mjs to cut; the OUTPUT is checked again by deadcheck.mjs in draft.mjs (no still stretch longer than stillMax)
//   request hygiene      0 UNSCRIPTED, 0 ABORT, 0 FAILED, 0 PAGEERROR, no route polled more than pollMax times (a tight polling loop froze the first film's page for 6-12 s)
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function evaluate(dir) {
  const checks = JSON.parse(readFileSync(join(dir, 'checks.json'), 'utf8')), { obs, thresholds: TH } = checks;
  const marks = JSON.parse(readFileSync(join(dir, 'marks.json'), 'utf8'));
  const log = readFileSync(join(dir, 'requests.log'), 'utf8').split('\n');
  const rows = [], fail = (name, why) => rows.push({ name, ok: false, why }), pass = (name, why) => rows.push({ name, ok: true, why });
  const each = (name, list, test, empty) => {
    if (!list.length) return empty ? fail(name, empty) : pass(name, 'not used in this film');
    const bad = list.filter(x => !test(x));
    bad.length ? fail(name, `${bad.length} of ${list.length} failed: ${bad.map(x => JSON.stringify(x)).join(' ')}`) : pass(name, `${list.length} checked`);
  };
  each('pill seen', obs.pills, x => x.ok, 'no slash command was recorded');
  each('skeleton seen', obs.skeletons, x => x.found && x.ms >= TH.skeletonMinMs);
  each('card centred', obs.centred, x => x.ok);
  each('tooltip seen', obs.tooltips, x => x.shown && x.ms >= TH.tooltipMinMs, 'no tooltip hover was recorded');
  each('menu in frame', obs.menus, x => x.ok);
  each('Chat pane shown', obs.chat, x => x.ok);
  const holdMax = (TH.holdMax || 2.6), longHolds = (marks.hold || []).filter(([a, b], i, all) => b - a > holdMax && i !== all.length - 1 && b < marks.end - 0.2);
  longHolds.length ? fail('no dead stretch (holds)', `holds longer than ${holdMax} s: ${longHolds.map(([a, b]) => `${a}-${b}`).join(', ')}`) : pass('no dead stretch (holds)', `${(marks.hold || []).length} holds, none longer than ${holdMax} s`);
  const deadTotal = (marks.dead || []).reduce((n, [a, b]) => n + (b - a), 0);
  pass('no dead stretch (marked)', `${(marks.dead || []).length} dead stretch(es) marked for the render to cut, ${deadTotal.toFixed(1)} s`);
  const counts = {};
  for (const line of log) { const m = /^[\d.]+ (GET|POST|PUT|DELETE|PATCH) (\/\S*)/.exec(line); if (m) counts[`${m[1]} ${m[2]}`] = (counts[`${m[1]} ${m[2]}`] || 0) + 1; }
  const polled = Object.entries(counts).filter(([, n]) => n > (TH.pollMax || 20));
  const bad = log.filter(l => /UNSCRIPTED|^ABORT|^FAILED|^PAGEERROR/.test(l));
  bad.length || polled.length ? fail('request hygiene', [...bad.slice(0, 5), ...polled.map(([r, n]) => `${r} called ${n} times`)].join(' | ')) : pass('request hygiene', `${Object.keys(counts).length} routes, busiest ${Math.max(0, ...Object.values(counts))} calls, 0 unscripted, 0 aborts, 0 page errors`);
  return rows;
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  const dir = process.argv[2];
  if (!dir || !existsSync(join(dir, 'checks.json'))) { console.error('usage: node assert.mjs <takeDir> (the take must have written checks.json)'); process.exit(2); }
  const rows = evaluate(dir);
  for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}: ${r.why}`);
  const failed = rows.filter(r => !r.ok);
  console.log(failed.length ? `CHECKLIST FAILED (${failed.length}): ${failed.map(r => r.name).join(', ')}` : 'CHECKLIST PASSED');
  process.exit(failed.length ? 1 : 0);
}
