// Offline helper for the production owner checklist (reads items.json beside it; makes NO network call).
//   node owner-receipt.mjs init [out.json]            write a blank results file (status/seen/notes empty)
//   node owner-receipt.mjs checklist [out.md]         write the one-page owner checklist from items.json
//   node owner-receipt.mjs receipt results.json [out.md]   turn a filled results file into a dated receipt
//   node owner-receipt.mjs selftest                   run the built-in checks
// A receipt never says accepted for an item that is not PASS with a non-empty "seen". Blank, SKIP and FAIL are listed as NOT accepted.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(join(here, 'items.json'), 'utf8'));
const STATUS = new Set(['PASS', 'FAIL', 'SKIP', '']);
const pt = (d = new Date()) => d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' PT';
const cell = s => String(s ?? '').replace(/\|/g, '/').replace(/\r?\n/g, ' ');

export function blankResults() {
  return { date_pt: '', tester: 'owner', account: '', build_sha_seen: '', build_hash_seen: '', browser: '',
    items: spec.items.map(i => ({ id: i.id, status: '', seen: '', notes: '', evidence: '' })) };
}

export function checklist() {
  const out = [`# ${spec.title}`, '', `Target ${spec.target}, production main ${spec.expected_sha} (build ${spec.expected_build}). Ordered by value; \"2nd\" needs your other login.`, '',
    ...spec.rules.map((r, n) => `${n + 1}. ${r}`), '',
    'Write PASS/FAIL/SKIP in the last column, or fill a copy of owner-results.json and run: node owner-receipt.mjs receipt owner-results.json receipt.md', '',
    '| id | feature | do (clicks) | expect / FAIL if | PASS / FAIL / SKIP and notes |', '|---|---|---|---|---|'];
  for (const i of spec.items) out.push(`| ${i.id}${i.second_account ? ' (2nd)' : ''} | ${cell(i.feature)} | ${i.steps.map((s, n) => `${n + 1}) ${cell(s)}`).join(' ')} | ${cell(i.expect)} FAIL IF: ${cell(i.fail)} | [ ] PASS [ ] FAIL [ ] SKIP: |`);
  return out.join('\n') + '\n';
}

export function receipt(results, { now = new Date() } = {}) {
  const byId = new Map(spec.items.map(i => [i.id, i]));
  for (const r of results.items || []) {
    assert.ok(byId.has(r.id), `unknown item id ${r.id}`);
    assert.ok(STATUS.has(r.status ?? ''), `${r.id}: status must be PASS, FAIL, SKIP or empty, got ${JSON.stringify(r.status)}`);
  }
  const got = new Map((results.items || []).map(r => [r.id, r]));
  const rows = spec.items.map(i => ({ ...i, r: got.get(i.id) || { status: '', seen: '', notes: '', evidence: '' } }));
  const accepted = rows.filter(x => x.r.status === 'PASS' && String(x.r.seen || '').trim());
  const passNoSeen = rows.filter(x => x.r.status === 'PASS' && !String(x.r.seen || '').trim());
  const failed = rows.filter(x => x.r.status === 'FAIL');
  const skipped = rows.filter(x => x.r.status === 'SKIP');
  const blank = rows.filter(x => !x.r.status);
  const date = results.date_pt || pt(now);
  const L = [`# Production owner acceptance receipt`, '',
    `- Date: ${date} (receipt written ${pt(now)})`, `- Target: ${spec.target}`, `- Production build expected: main ${spec.expected_sha}, build ${spec.expected_build}`,
    `- Build/SHA the tester reports: ${results.build_sha_seen || 'not stated'} ${results.build_hash_seen || ''}`.trimEnd(),
    `- Tester: ${results.tester || 'owner'}; account(s): ${results.account || 'not stated'}; browser: ${results.browser || 'not stated'}`,
    `- Result: ${accepted.length} accepted (PASS with what was seen), ${failed.length} FAIL, ${skipped.length} SKIP, ${blank.length} not done, ${passNoSeen.length} PASS without a "seen" note (not accepted)`, '',
    'This receipt records only what the tester wrote. An item without a PASS and a "seen" note is not accepted.', '',
    '| id | feature | status | what was seen | notes | evidence |', '|---|---|---|---|---|---|',
    ...rows.map(x => `| ${x.id} | ${cell(x.feature)} | ${x.r.status || 'NOT DONE'} | ${cell(x.r.seen)} | ${cell(x.r.notes)} | ${cell(x.r.evidence)} |`), '',
    '## Accepted (owner observed, production)', '', ...(accepted.length ? accepted.map(x => `- ${x.id} ${x.feature}: ${cell(x.r.seen)}`) : ['- none']), '',
    '## NOT accepted', '', ...[...failed.map(x => `- ${x.id} ${x.feature}: FAIL: ${cell(x.r.seen || x.r.notes)}`), ...skipped.map(x => `- ${x.id} ${x.feature}: SKIP: ${cell(x.r.notes)}`),
      ...passNoSeen.map(x => `- ${x.id} ${x.feature}: PASS written with no "seen" note, so not recorded as accepted`), ...blank.map(x => `- ${x.id} ${x.feature}: not done`)], ''];
  const follow = rows.filter(x => x.followup && x.r.status === 'PASS');
  if (follow.length) L.push('## Integrator follow-up (public re-probe after the owner step)', '', ...follow.map(x => `- ${x.id}: ${x.followup}`), '');
  L.push('Not covered by this checklist (see blocked.md): Credits Nov 1 cutover, Motion generation, image generation, Telemetry, security headers, other time-gated or paid items.', '');
  return L.join('\n');
}

function selftest() {
  const b = blankResults();
  assert.equal(b.items.length, spec.items.length);
  assert.ok(checklist().includes('| O01 |'));
  const r0 = receipt(b, { now: new Date('2026-10-26T20:00:00Z') });
  assert.ok(r0.includes('0 accepted') && r0.includes('not done'), 'blank results accept nothing');
  b.items[0] = { id: 'O01', status: 'PASS', seen: 'N 5,000, renews October 31, 5:00 PM PDT', notes: '', evidence: '' };
  b.items[1] = { id: 'O02', status: 'PASS', seen: '', notes: '', evidence: '' };
  b.items[2] = { id: 'O03', status: 'FAIL', seen: 'text blanked', notes: '', evidence: '' };
  const r1 = receipt(b, { now: new Date('2026-10-26T20:00:00Z') });
  assert.ok(r1.includes('1 accepted') && r1.includes('1 FAIL') && r1.includes('1 PASS without a "seen" note'));
  assert.ok(r1.includes('- O01 Credits meter and usage panel: N 5,000'));
  assert.ok(!/- O02 [^\n]*accepted/.test(r1.split('## NOT accepted')[0]), 'PASS without seen is not in the accepted list');
  assert.throws(() => receipt({ items: [{ id: 'O01', status: 'OK' }] }), /status must be/);
  assert.throws(() => receipt({ items: [{ id: 'O99', status: 'PASS' }] }), /unknown item/);
  console.log('selftest ok');
}

const [cmd, a, b] = process.argv.slice(2);
{
  if (cmd === 'init') { const f = a || 'owner-results.json'; writeFileSync(f, JSON.stringify(blankResults(), null, 2)); console.log(`wrote ${f} (${spec.items.length} items; fill status PASS/FAIL/SKIP, seen, notes)`); }
  else if (cmd === 'checklist') { const f = a || 'owner-checklist.md'; writeFileSync(f, checklist()); console.log(`wrote ${f}`); }
  else if (cmd === 'receipt' && a) { const f = b || 'owner-receipt.md'; writeFileSync(f, receipt(JSON.parse(readFileSync(a, 'utf8')))); console.log(`wrote ${f}`); }
  else if (cmd === 'selftest') selftest();
  else { console.log('usage: node owner-receipt.mjs init|checklist|receipt <results.json> [out]|selftest'); process.exit(cmd ? 1 : 0); }
}
