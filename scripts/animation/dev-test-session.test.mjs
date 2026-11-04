// Offline tests for dev-test-session.mjs: a fake dev control plane and a fake preview, a temp credentials file with a fake secret, a temp sessions
// file outside the repository. No network, no real credential.
//   node --test scripts/animation/dev-test-session.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COOKIE, SECRET_NAME, emailsFor, insideRepo, main, makeCall, markUsed, mint, parse, prefixOf, readSessions, readUsed, usageLine, utcStamp, writeSessions } from './dev-test-session.mjs';

const FAKE_SECRET = 'fake-bypass-secret-not-real';
function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'gate2-session-test-'));
  const credentials = join(dir, 'creds.env'), file = join(dir, 'sessions.json');
  writeFileSync(credentials, `OTHER=1\n${SECRET_NAME}=${FAKE_SECRET}\n`);
  return { dir, credentials, file, done: () => rmSync(dir, { recursive: true, force: true }) };
}
// A fake dev control plane (/test/session) and preview (/api/learn/usage); records the requests it saw.
function fakeFetch({ used = 100, failEmail = null } = {}) {
  const seen = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url), body = init.body ? JSON.parse(init.body) : null;
    seen.push({ method: init.method, path: u.pathname, body, cookie: init.headers?.cookie });
    if (u.pathname === '/test/session') {
      if (body.secret !== FAKE_SECRET) return Response.json({ error: 'bad secret' }, { status: 401 });
      if (body.email === failEmail) return Response.json({ error: 'boom' }, { status: 500 });
      return Response.json({ session: `cookie-for-${body.email}` });
    }
    if (u.pathname === '/api/learn/usage') {
      if (!init.headers.cookie.includes('cookie-for-')) return Response.json({ error: 'sign in' }, { status: 401 });
      return Response.json({ enforced: true, period: '2026-11', resetsAt: '2026-12-01T00:00:00.000Z', allowanceCredits: 2500, usedCredits: used, reservedCredits: 0, estimatedCredits: 0, remainingCredits: 2500 - used, unknownAttempts: 0, byFeature: [] });
    }
    return Response.json({ error: 'nope' }, { status: 404 });
  };
  return { fetchImpl, seen };
}
const run = async (argv, options) => { const lines = []; const code = await main(argv, { out: line => lines.push(line), ...options }); return { code, text: lines.join('\n') }; };

test('arguments: exactly one mode, a count of 1 to 5 for check and mint, an example.com-safe prefix, a base origin for the allowance', () => {
  assert.equal(parse(['--mint', '--count', '5']).count, 5);
  for (const bad of [[], ['--mint'], ['--mint', '--count', '0'], ['--mint', '--count', '6'], ['--mint', '--count', '2.5'], ['--check', '--mint', '--count', '1'],
    ['--mint', '--count', '1', '--prefix', 'a@evil.com'], ['--allowance'], ['--allowance', '--base', 'https://x.test/path'], ['--bogus']]) assert.throws(() => parse(bad), undefined, JSON.stringify(bad));
  assert.deepEqual(emailsFor('gate2', 3), ['gate2-1@example.com', 'gate2-2@example.com', 'gate2-3@example.com']);
});

test('--check reads nothing from the network, names the key without its value, and reports a missing key or a repository path', async () => {
  const s = sandbox();
  try {
    const { fetchImpl, seen } = fakeFetch();
    const ok = await run(['--check', '--count', '5', '--credentials', s.credentials, '--file', s.file], { fetchImpl });
    assert.equal(ok.code, 0);
    assert.match(ok.text, /gate2-1@example\.com.*gate2-5@example\.com/);
    assert.match(ok.text, /CHECK OK: .* no network request was made/);
    assert.ok(!ok.text.includes(FAKE_SECRET));
    assert.deepEqual(seen, []);
    assert.equal(existsSync(s.file), false, 'check writes nothing');
    writeFileSync(s.credentials, 'OTHER=1\n');
    assert.match((await run(['--check', '--count', '1', '--credentials', s.credentials, '--file', s.file])).text, /CHECK FAILED: RABBIT_HOLE_DEV_TEST_BYPASS is missing/);
    const inRepo = fileURLToPath(new URL('./x-sessions.json', import.meta.url));
    assert.equal(insideRepo(inRepo), true);
    assert.match((await run(['--check', '--count', '1', '--credentials', s.credentials, '--file', inRepo])).text, /inside the repository/);
  } finally { s.done(); }
});

test('--mint writes 5 distinct example.com sessions to the sessions file, prints the cookie name and a placeholder only, and never the secret or a value', async () => {
  const s = sandbox();
  try {
    const { fetchImpl, seen } = fakeFetch();
    const r = await run(['--mint', '--count', '5', '--credentials', s.credentials, '--file', s.file], { fetchImpl });
    assert.equal(r.code, 0);
    assert.match(r.text, new RegExp(`cookie ${COOKIE}=<redacted>`));
    for (const hidden of [FAKE_SECRET, 'cookie-for-']) assert.ok(!r.text.includes(hidden), hidden);
    const sessions = readSessions(s.file);
    assert.deepEqual(sessions.map(x => x.email), emailsFor('gate2', 5));
    assert.deepEqual(seen.map(x => x.body.email), emailsFor('gate2', 5));
    assert.equal(sessions[2].value, 'cookie-for-gate2-3@example.com');
    if (process.platform !== 'win32') assert.equal(statSync(s.file).mode & 0o077, 0, 'owner-only mode');
    // an existing file is never overwritten without --replace
    const again = await run(['--mint', '--count', '1', '--credentials', s.credentials, '--file', s.file], { fetchImpl });
    assert.equal(again.code, 2);
    assert.match(again.text, /REFUSED: .* exists; --replace/);
    assert.equal(readSessions(s.file).length, 5);
    assert.equal((await run(['--mint', '--count', '1', '--replace', '--credentials', s.credentials, '--file', s.file], { fetchImpl })).code, 0);
    assert.equal(readSessions(s.file).length, 1);
  } finally { s.done(); }
});

test('--mint writes nothing when one mint fails, and a wrong secret never echoes the response', async () => {
  const s = sandbox();
  try {
    const { fetchImpl } = fakeFetch({ failEmail: 'gate2-3@example.com' });
    const r = await run(['--mint', '--count', '4', '--credentials', s.credentials, '--file', s.file], { fetchImpl });
    assert.equal(r.code, 1);
    assert.match(r.text, /FAILED: no dev session for gate2-3@example\.com \(HTTP 500\) \(2 minted before it; nothing was written\)/);
    assert.equal(existsSync(s.file), false);
    await assert.rejects(mint({ email: 'a@example.com', secret: 'wrong', fetchImpl: fakeFetch().fetchImpl }), /HTTP 401/);
    writeFileSync(s.credentials, 'OTHER=1\n');
    const none = await run(['--mint', '--count', '1', '--credentials', s.credentials, '--file', s.file], { fetchImpl });
    assert.equal(none.code, 2); assert.match(none.text, /REFUSED: RABBIT_HOLE_DEV_TEST_BYPASS is missing/);
  } finally { s.done(); }
});

test('refuses to write a sessions file inside the repository, and rejects a malformed or duplicated sessions file', () => {
  assert.throws(() => writeSessions(fileURLToPath(new URL('./leak.json', import.meta.url)), { sessions: [] }), /inside the repository/);
  const s = sandbox();
  try {
    const put = record => writeFileSync(s.file, JSON.stringify(record));
    put({ cookie: COOKIE, sessions: [] }); assert.throws(() => readSessions(s.file), /not a sessions file/);
    put({ cookie: COOKIE, sessions: Array.from({ length: 6 }, (_, i) => ({ email: `g-${i}@example.com`, value: 'v' })) }); assert.throws(() => readSessions(s.file), /not a sessions file/);
    put({ cookie: COOKIE, sessions: [{ email: 'a@example.com', value: 'v' }, { email: 'A@example.com', value: 'w' }] }); assert.throws(() => readSessions(s.file), /distinct/);
    put({ cookie: COOKIE, sessions: [{ email: 'a@gmail.com', value: 'v' }] }); assert.throws(() => readSessions(s.file), /example\.com/);
  } finally { s.done(); }
});

test('--allowance prints each session\'s credits used and left (read-only GETs with that session\'s cookie) and the platform day cap note', async () => {
  const s = sandbox();
  try {
    const { fetchImpl, seen } = fakeFetch({ used: 2450 });
    await run(['--mint', '--count', '2', '--credentials', s.credentials, '--file', s.file], { fetchImpl });
    seen.length = 0;
    const r = await run(['--allowance', '--base', 'https://preview.test', '--file', s.file], { fetchImpl });
    assert.equal(r.code, 0);
    assert.match(r.text, /gate2-1@example\.com: usage 2026-11: used 2450 of 2500 credits, left 50 /);
    assert.match(r.text, /gate2-2@example\.com: usage 2026-11: used 2450/);
    assert.match(r.text, /USAGE_PLATFORM_DAY_USD is US\$40 .* ROLLING 24 hours/);
    assert.deepEqual(seen.map(x => [x.method, x.path, x.cookie]), [['GET', '/api/learn/usage', `${COOKIE}=cookie-for-gate2-1@example.com`], ['GET', '/api/learn/usage', `${COOKIE}=cookie-for-gate2-2@example.com`]]);
    assert.equal(seen.every(x => x.body === null), true, 'no write');
    assert.match(usageLine({ status: 401, usage: null }), /refused \(401\)/);
    assert.match(usageLine({ status: 503, usage: { unavailable: 'accounting' } }), /unavailable \(HTTP 503, accounting\)/);
    assert.equal(readFileSync(s.file, 'utf8').includes(FAKE_SECRET), false, 'the bypass secret is never stored');
  } finally { s.done(); }
});

test('makeCall retries a network error for GET only, never for a POST', async () => {
  let n = 0;
  const flaky = async () => { n += 1; if (n < 3) throw new Error('ECONNRESET'); return Response.json({ ok: 1 }); };
  const call = makeCall({ base: 'https://x.test', session: 's', fetchImpl: flaky, wait: async () => {} });
  assert.deepEqual(await call('GET', '/a'), { status: 200, data: { ok: 1 } });
  assert.equal(n, 3);
  n = 0;
  await assert.rejects(call('POST', '/a', { x: 1 }), /ECONNRESET/);
  assert.equal(n, 1, 'a POST is sent once');
});

test('--mint --fresh: g2-<UTC yyyymmddhhmm> users, the announce line before the first write, a per-run sessions file, the prefix recorded, never reused', async () => {
  const s = sandbox(), out = join(s.dir, 'out'), at = new Date('2026-11-03T17:30:42Z');
  try {
    assert.equal(utcStamp(at), '202611031730');
    const events = [], { fetchImpl: inner } = fakeFetch();
    const fetchImpl = async (...args) => { events.push('write'); return inner(...args); };
    const lines = [], argv = ['--mint', '--fresh', '--count', '5', '--credentials', s.credentials, '--out', out, '--file', s.file];
    const code = await main(argv, { out: line => { lines.push(line); events.push('line'); }, fetchImpl, now: () => at });
    assert.equal(code, 0, lines.join('\n'));
    assert.match(lines[0], /^announce: this writes 5 dev user rows \(g2-202611031730-1@example\.com, .*, g2-202611031730-5@example\.com\) to the shared dev D1/);
    assert.deepEqual(events.slice(0, 2), ['line', 'write'], 'the announce comes before the first write');
    assert.deepEqual(readSessions(s.file).map(x => x.email), emailsFor('g2-202611031730', 5));
    assert.deepEqual(Object.keys(readUsed(out).prefixes), ['g2-202611031730']);
    assert.match(lines.join('\n'), /use it for ONE run: sgd-qualify\.mjs --sessions-file/);
    // the same minute again: the prefix is used, nothing is minted (even into another file); --replace does not apply to --fresh
    const writes = events.filter(e => e === 'write').length;
    const again = await run(['--mint', '--fresh', '--count', '5', '--credentials', s.credentials, '--out', out, '--file', join(s.dir, 'other.json')], { fetchImpl, now: () => at });
    assert.equal(again.code, 2);
    assert.match(again.text, /REFUSED: the prefix g2-202611031730 was already minted or has run/);
    assert.equal(events.filter(e => e === 'write').length, writes, 'no write for a used prefix');
    // a prefix that RAN is refused too, and the next minute is a new prefix
    markUsed(out, 'g2-202611031731', { ranAt: 'x' });
    const ran = await run(['--mint', '--fresh', '--count', '2', '--credentials', s.credentials, '--out', out, '--file', join(s.dir, 'b.json')], { fetchImpl, now: () => new Date('2026-11-03T17:31:05Z') });
    assert.equal(ran.code, 2);
    const next = await run(['--mint', '--fresh', '--count', '2', '--credentials', s.credentials, '--out', out, '--file', join(s.dir, 'c.json')], { fetchImpl, now: () => new Date('2026-11-03T17:32:00Z') });
    assert.equal(next.code, 0, next.text);
    assert.deepEqual(readSessions(join(s.dir, 'c.json')).map(x => x.email), ['g2-202611031732-1@example.com', 'g2-202611031732-2@example.com']);
    // an unreadable record never means "nothing used"
    writeFileSync(join(out, 'used-prefixes.json'), '{ not json');
    const broken = await run(['--mint', '--fresh', '--count', '1', '--credentials', s.credentials, '--out', out, '--file', join(s.dir, 'd.json')], { fetchImpl, now: () => new Date('2026-11-03T17:40:00Z') });
    assert.equal(broken.code, 2);
    assert.match(broken.text, /cannot be read .* a used prefix could be reused/);
  } finally { s.done(); }
});

test('--fresh: the default file is per run, --check says so without a network request, and it cannot be combined with a fixed prefix, --replace or --allowance', async () => {
  const s = sandbox(), at = new Date('2026-11-03T17:30:42Z');
  try {
    const { fetchImpl, seen } = fakeFetch();
    const r = await run(['--check', '--fresh', '--count', '3', '--credentials', s.credentials, '--out', join(s.dir, 'out')], { fetchImpl, now: () => at });
    assert.equal(r.code, 0, r.text);
    assert.match(r.text, /would mint g2-202611031730-1@example\.com, g2-202611031730-2@example\.com, g2-202611031730-3@example\.com/);
    assert.match(r.text, /gate2-sessions-g2-202611031730\.json absent/);
    assert.deepEqual(seen, []);
    markUsed(join(s.dir, 'out'), 'g2-202611031730', { ranAt: 'earlier' });
    assert.match((await run(['--check', '--fresh', '--count', '1', '--credentials', s.credentials, '--out', join(s.dir, 'out')], { now: () => at })).text, /CHECK FAILED: the prefix g2-202611031730 was already used/);
    for (const bad of [['--mint', '--fresh', '--count', '1', '--prefix', 'x'], ['--mint', '--fresh', '--count', '1', '--replace'], ['--allowance', '--fresh', '--base', 'https://x.test']]) assert.throws(() => parse(bad), /--fresh picks its own prefix/, JSON.stringify(bad));
    assert.equal(prefixOf(['g2-202611031730-1@example.com', 'g2-202611031730-2@example.com']), 'g2-202611031730');
    assert.equal(prefixOf(['gate2-1@example.com', 'gate2-2@example.com']), 'gate2');
    assert.equal(prefixOf(['a-1@example.com', 'b-2@example.com']), null, 'one mint, one prefix');
    assert.equal(prefixOf(['someone@example.com']), null);
    assert.deepEqual(readUsed(join(s.dir, 'nowhere')), { prefixes: {} });
  } finally { s.done(); }
});
