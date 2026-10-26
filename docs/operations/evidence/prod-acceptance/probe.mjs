// Read-only public probe of https://digrabbithole.com. GET and HEAD only, no cookies, no credentials, custom User-Agent.
// Usage: node probe.mjs   -> writes probes.json and probe-receipts.md next to this file.
// Every request is in PROBES below (a fixed allowlist) plus the static chunks the served HTML links to (GET). Nothing else is called.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = 'https://digrabbithole.com';
const UA = 'rabbit-hole-acceptance/1';
const PROD_SHA = '0b5a8dae'; // main at 12:06 PM PT 2026-10-26: release run 40383706342, config-only Motion ceiling on top of 0bd390ed; build hash 622a36f361bce43e is identical to 0bd390ed's
const RELEASE_BUILD = '622a36f361bce43e';
const HDRS = ['content-type', 'cache-control', 'content-security-policy', 'x-frame-options', 'referrer-policy', 'strict-transport-security',
  'x-content-type-options', 'x-robots-tag', 'location', 'content-length'];
const here = dirname(fileURLToPath(import.meta.url));
const ptNow = d => d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' PT';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FAKE = 'AAAAAAAAAAAAAAAAAAAAAAAA';

async function get(path, method = 'GET') {
  const at = new Date();
  const res = await fetch(HOST + path, { method, redirect: 'manual', headers: { 'User-Agent': UA, Accept: '*/*' } });
  const text = method === 'HEAD' ? '' : await res.text();
  const headers = {};
  for (const h of HDRS) if (res.headers.has(h)) headers[h] = res.headers.get(h);
  return { at, status: res.status, headers, text };
}
const json = t => { try { return JSON.parse(t); } catch { return null; } };
const keys = o => (o && typeof o === 'object' ? Object.keys(o).join(',') : '');

// Each probe: id, feature, path, method, expect (status), fact(text, headers) -> one-line observed fact, proves, notProves.
const PROBES = [
  { id: 'P01', f: 'Build/shell', path: '/', expect: 200, fact: t => `title=${/<title>([^<]*)/.exec(t)?.[1]} entry=${/src="(\/static\/[^"]+\.js)"/.exec(t)?.[1]}`, proves: 'The landing page is served and names a built entry chunk.', not: 'Which commit: the build hash is a local bundle hash and is not served. The landing entry only changes when landing code changes.' },
  { id: 'P02', f: 'Build/shell', path: '/', method: 'HEAD', expect: 200, proves: 'HEAD works on the root.', not: 'Nothing about behavior.' },
  { id: 'P03', f: 'Build/shell', path: '/explore', expect: 200, fact: t => `title=${/<title>([^<]*)/.exec(t)?.[1]} entry=${/src="(\/static\/app-[^"]+\.js)"/.exec(t)?.[1]} modulepreloads=${(t.match(/modulepreload/g) || []).length}`, proves: 'The signed-out app shell serves the app entry chunk (the code every signed-in flow runs).', not: 'That any signed-in flow works; the shell is identical for every app route.' },
  { id: 'P04', f: 'Build/shell', path: '/library', expect: 200, proves: 'The Library route serves the app shell signed out.', not: 'Library content (needs sign-in).' },
  { id: 'P05', f: 'Build/shell', path: '/chat', expect: 200, proves: 'The Chat route serves the app shell.', not: 'Chat behavior.' },
  { id: 'P06', f: 'Auth', path: '/sign-in', expect: 200, fact: (t, h) => `title=${/<title>([^<]*)/.exec(t)?.[1]} referrer-policy=${h['referrer-policy']} robots=${h['x-robots-tag']}`, proves: 'The sign-in page is served, noindex, with a Referrer-Policy.', not: 'That sign-in completes with any provider.' },
  { id: 'P07', f: 'Auth', path: '/login', expect: 302, fact: (t, h) => `location=${h.location}`, proves: 'The legacy /login redirects to /sign-in.', not: 'Session handling.' },
  { id: 'P08', f: 'Auth', path: '/a/x', expect: 404, proves: 'Hosted apps are not served on this origin (by design).', not: 'Nothing else.' },
  { id: 'P09', f: 'Auth', path: '/api/me', expect: 401, fact: t => t.slice(0, 120), proves: 'The session probe route rejects an anonymous caller.', not: 'That a valid session is accepted.' },
  { id: 'P10', f: 'Static', path: '/robots.txt', expect: 200, proves: 'robots.txt exists (Cloudflare managed content signals).', not: 'SEO policy review.' },
  { id: 'P11', f: 'Static', path: '/sitemap.xml', expect: 404, fact: t => `title=${/<title>([^<]*)/.exec(t)?.[1]}`, proves: 'No sitemap.', not: 'Whether one is wanted. Observation: the 404 page title is the legacy "small deploy".' },
  { id: 'P12', f: 'Landing', path: '/features', expect: 200, proves: 'Landing section route serves.', not: 'Copy review.' },
  { id: 'P13', f: 'Landing', path: '/pricing', expect: 200, proves: 'Landing section route serves.', not: 'Copy review.' },
  { id: 'P14', f: 'Landing', path: '/docs', expect: 200, proves: 'Landing section route serves.', not: 'Copy review.' },
  { id: 'P15', f: 'Credits', path: '/api/learn/usage', expect: 401, fact: t => t.slice(0, 120), proves: 'The AI usage route exists and requires sign-in, and its signed-out answer carries no numbers.', not: 'The meter number, the renewal text or what a signed-in payload contains (the board row 1058a8dd credits-only usage API is only checkable signed in).' },
  { id: 'P16', f: 'Stars', path: '/api/learn/stars', expect: 401, proves: 'Personal Stars list requires sign-in.', not: 'Star/unstar behavior.' },
  { id: 'P17', f: 'Stars', path: '/api/learn/stars/analytics', expect: 401, proves: 'Creator star analytics requires sign-in.', not: 'Analytics content (also no telemetry sink in production).' },
  { id: 'P18', f: 'Stars', path: '/api/learn/creators/yudhisteer/stars', expect: 200, fact: t => t.slice(0, 160), proves: 'The public profile Stars tab API answers for a real handle (starred_count is the observable for owner step Stars).', not: 'That a star persists (no star exists yet if starred_count is 0).' },
  { id: 'P19', f: 'Stars', path: '/api/learn/creators/nobody_zz9/stars', expect: 404, proves: 'Unknown handle gives 404 without content.', not: 'Nothing else.' },
  { id: 'P20', f: 'Stars/Explore', path: '/api/learn/boards/published', expect: 200, fact: t => { const j = json(t); return `canvases=${j?.canvases?.length} star_counts=${j?.canvases?.map(c => c.star_count)} keys=${keys(j?.canvases?.[0])}`; }, proves: 'The public Explore list answers and carries star_count and fork_count; it shows no private canvas fields (no email/id keys).', not: 'That a private canvas never leaks under other states (needs owner steps).' },
  { id: 'P21', f: 'Weekly Top 5', path: '/api/learn/boards/published/weekly-top', expect: 200, fact: t => { const j = json(t); return `ranking=${j?.ranking_version} tz=${j?.timezone} week=${j?.week_start}..${j?.week_end} local=${j?.week_start_local}..${j?.week_end_local} star_history_since=${j?.star_history_since} canvases=${j?.canvases?.entries?.length} creators=${j?.creators?.entries?.length} max_age=${j?.freshness?.max_age_seconds}`; }, proves: 'The Weekly Top 5 contract is live: Los Angeles week (Monday 00:00 local), 60 s freshness, empty lists with the committed messages. star_history_since null means no star was ever added.', not: 'Ranking with real stars (WT-7), privacy with real data.' },
  { id: 'P22', f: 'Weekly Top 5', path: '/api/learn/boards/published/weekly-top?probe=1', expect: 200, fact: t => `same_keys_as_P21=see-compare`, proves: 'A query string does not change the contract.', not: 'Nothing else.' },
  { id: 'P23', f: 'Comments', path: '/api/learn/comments/inbox', expect: 401, fact: t => t.slice(0, 100), proves: 'Inbox requires sign-in (route reaches the comments gate).', not: 'Inbox content.' },
  { id: 'P24', f: 'Comments', path: '/api/learn/comments/unread', expect: 401, proves: 'Unread counts require sign-in.', not: 'Unread dot behavior.' },
  { id: 'P25', f: 'Comments', path: `/api/learn/boards/shared/${FAKE}/comments`, expect: 404, proves: 'An unknown shared canvas returns no comments content.', not: 'Access control for a real member/non-member (needs two accounts).' },
  { id: 'P26', f: 'Comments', path: '/api/learn/c/nonexistent/threads', expect: 404, proves: 'An unknown canvas returns no threads.', not: 'Nothing else.' },
  { id: 'P27', f: 'Comments', path: `/api/learn/boards/shared/${FAKE}/comments/x/attachments/y`, expect: 404, proves: 'An unknown attachment link returns no content.', not: 'That a removed member loses a real attachment link (owner step).' },
  { id: 'P28', f: 'Creators/Profile', path: '/api/learn/creators', expect: 200, fact: t => { const j = json(t); return `total=${j?.total} keys=${keys(j?.creators?.[0])}`; }, proves: 'Public creators list answers with no email/id fields.', not: 'The Creators UI layout.' },
  { id: 'P29', f: 'Creators/Profile', path: '/api/learn/creators/yudhisteer', expect: 200, fact: t => { const j = json(t); return `keys=${keys(j)} explainers=${j?.explainers?.length}`; }, proves: 'A public profile payload answers (handle, counts, public canvases only).', not: 'Header/badge/avatar rendering (G4 creators header) which is client UI.' },
  { id: 'P30', f: 'Creators/Profile', path: '/@yudhisteer', expect: 200, fact: t => `title=${/<title>([^<]*)/.exec(t)?.[1]} og=${/property="og:/.test(t)}`, proves: 'Profile page serves the shell.', not: 'Rendering. Observation: no og:* tags (title is the shell title).' },
  { id: 'P31', f: 'Creators/Profile', path: '/@nobody_zz9_x', expect: 200, proves: 'An unknown handle still returns the shell with HTTP 200 (the page, not the server, shows not-found).', not: 'Nothing else.' },
  { id: 'P32', f: 'Share/OG', path: '/e/ACE6FOn3M7YXV48sOrVeBMoQE0QFnKTb', expect: 200, fact: t => `title=${/<title>([^<]*)/.exec(t)?.[1]} og=${/property="og:/.test(t)} twitter=${/name="twitter:/.test(t)}`, proves: 'A published canvas page (/e/<token>, token from the public Explore list) serves the shell.', not: 'OG/share preview: there are no og:* or twitter:* tags in the server HTML, so link previews show the generic shell title.' },
  { id: 'P33', f: 'Share/OG', path: `/b/${FAKE}`, expect: 200, proves: 'An unknown share token still serves the shell with HTTP 200 (decided client side).', not: 'Revocation behavior of a real token.' },
  { id: 'P34', f: 'Telemetry', path: '/api/owner/telemetry/access', expect: 404, fact: t => t.slice(0, 60), proves: 'The owner dashboard API answers a plain 404 to an anonymous caller (same as to any non-owner).', not: 'That the owner sees it (production has no TELEMETRY_DB binding; owner path not accepted).' },
  { id: 'P35', f: 'Telemetry', path: '/owner/telemetry', expect: 200, proves: 'The dashboard page route serves the shell (the API is what 404s).', not: 'Any dashboard content.' },
  { id: 'P36', f: 'Telemetry', path: '/api/telemetry/client', expect: null, fact: t => t.slice(0, 80), proves: 'Records how the client-error sink answers a GET (writes are POST only; not exercised).', not: 'That error reports are stored (TELEMETRY_DB unbound; POST would answer 204 and keep nothing).' },
  { id: 'P37', f: 'Image/Voice gates', path: '/api/learn/transcribe', expect: null, fact: t => t.slice(0, 80), proves: 'Recorded-answer transcription route answers a GET signed out.', not: 'The 503 after recording (needs sign-in and a recording). Observation: legacy wording "run small login first".' },
  { id: 'P38', f: 'Image/Voice gates', path: '/api/learn/chat/image-proposals', expect: null, fact: t => t.slice(0, 80), proves: 'The image proposal route does not serve a GET signed out.', not: 'That generation is disabled (server flag is read from config, not probed).' },
  { id: 'P39', f: 'File jobs', path: '/api/learn/file-jobs', expect: null, fact: t => t.slice(0, 80), proves: 'The FILE_JOBS route answer signed out.', not: 'Converter availability (not configured by design).' },
];

const results = [];
for (const p of PROBES) {
  let r;
  try { r = await get(p.path, p.method); } catch (e) { r = { at: new Date(), status: 0, headers: {}, text: '', error: String(e) }; }
  const ok = p.expect == null ? true : r.status === p.expect;
  results.push({ id: p.id, feature: p.f, method: p.method || 'GET', path: p.path, status: r.status, expected: p.expect, ok, headers: r.headers,
    fact: p.fact ? p.fact(r.text, r.headers) : '', servedEntry: (r.headers['content-type'] || '').startsWith('text/html') ? (/src="(\/static\/(?:app|landing)-[^"]+\.js)"/.exec(r.text)?.[1] ?? null) : null, proves: p.proves, notProves: p.not, utc: r.at.toISOString(), pt: ptNow(r.at), bytes: r.text.length, _text: r.text });
  await sleep(150);
}

// P22 against P21: the same keys in the same order.
{
  const a = json(results.find(r => r.id === 'P21')._text), b = json(results.find(r => r.id === 'P22')._text);
  const same = keys(a) === keys(b) && keys(a?.canvases) === keys(b?.canvases) && keys(a?.creators) === keys(b?.creators);
  results.find(r => r.id === 'P22').fact = `same top-level, canvases and creators keys as P21: ${same}`;
}

// Static assets: the app entry and its modulepreload chunks, then a bounded scan of linked chunks for UI marker strings.
const shell = results.find(r => r.id === 'P03')._text;
const staticLinks = [...new Set([...shell.matchAll(/(?:src|href)="(\/static\/[^"]+)"/g)].map(m => m[1]))];
const MARKERS = [
  ['Credits meter and usage', 'AI credits every month'], ['Credits meter and usage', 'Renews on'], ['Credits meter and usage', 'Not enough AI credits'], ['Settings', 'AI usage'],
  ['Stars', 'data-star-button'], ['Stars', 'The star could not be saved'], ['Stars', 'Canvas unavailable'],
  ['Weekly Top 5', 'Top canvases this week'], ['Weekly Top 5', 'data-weekly-top'],
  ['Comments reactions/history', 'Add reaction'], ['Comments reactions/history', 'Earlier versions'], ['Comments attachments', 'Attach file'],
  ['Comments inbox/follow', 'Comment inbox'], ['Comments inbox/follow', 'Share in a new public thread'], ['Comments inbox/follow', 'Continue in a new thread'],
  ['Focus', 'Back to canvas'], ['CAD Focus', 'Show dimensions'], ['Start dialog', 'Use as context'],
  ['Chat generation UX / Motion failure', 'Charge not confirmed yet'], ['Chat generation UX / Motion failure', 'No credits charged'],
  ['Motion paused notice', 'Motion generation is temporarily unavailable while'],
  ['Webpage card', 'No capture yet'], ['Webpage card', 'Add webpage card'],
  ['Voice paused', 'Voice mode is paused'],
];
const seen = new Set(), queue = [...staticLinks.filter(l => l.endsWith('.js'))], chunkRes = [];
const found = new Map(MARKERS.map(([f, s]) => [s, []]));
const CAP = 700;
while (queue.length && seen.size < CAP) {
  const batch = queue.splice(0, 4).filter(l => !seen.has(l));
  await Promise.all(batch.map(async link => {
    seen.add(link);
    try {
      const r = await get(link);
      chunkRes.push({ link, status: r.status, ct: r.headers['content-type'], cc: r.headers['cache-control'] });
      if (r.status !== 200) return;
      for (const [, s] of MARKERS) if (r.text.includes(s)) found.get(s).push(link);
      for (const m of r.text.matchAll(/["'`]\.\/([A-Za-z0-9_.-]+\.js)["'`]/g)) { const l = '/static/' + m[1]; if (!seen.has(l) && !queue.includes(l)) queue.push(l); }
    } catch (e) { chunkRes.push({ link, status: 0, error: String(e) }); }
  }));
  await sleep(100);
}
const scanned = chunkRes.filter(c => c.status === 200).length;
const cssLinks = staticLinks.filter(l => l.endsWith('.css'));
const cssRes = [];
for (const l of cssLinks.slice(0, 3)) { const r = await get(l, 'HEAD'); cssRes.push({ link: l, status: r.status, ct: r.headers['content-type'], cc: r.headers['cache-control'] }); await sleep(100); }

// Security headers across everything probed.
const hdrNames = ['content-security-policy', 'x-frame-options', 'referrer-policy', 'strict-transport-security', 'x-content-type-options', 'cache-control'];
const hdrTable = hdrNames.map(h => [h, results.filter(r => r.headers[h]).length, results.length]);

const started = results[0].utc, endedAt = new Date();
const entries = [...new Set(results.map(r => r.servedEntry).filter(Boolean))];
const out = { releaseBuild: RELEASE_BUILD, distinctServedEntries: entries, host: HOST, userAgent: UA, productionShaExpected: PROD_SHA, startedUtc: started, endedUtc: endedAt.toISOString(), endedPt: ptNow(endedAt),
  probes: results.map(({ _text, ...r }) => r), scan: { chunksFetched: chunkRes.length, chunks200: scanned, cap: CAP, non200: chunkRes.filter(c => c.status !== 200).map(c => `${c.link} ${c.status}`), markers: [...found].map(([s, l]) => ({ marker: s, feature: MARKERS.find(m => m[1] === s)[0], chunks: l })) }, css: cssRes, headerCoverage: hdrTable };
writeFileSync(join(here, 'probes.json'), JSON.stringify(out, null, 1));

const row = r => `| ${r.id} | ${r.method} ${r.path} | ${r.status}${r.expected != null && !r.ok ? ` (expected ${r.expected})` : ''} | ${r.headers['content-type'] ?? ''} | ${r.servedEntry ?? ''} | ${r.fact.replace(/\|/g, '/').replace(/\n/g, ' ')} | ${r.utc} / ${r.pt} |`;
const md = [
  `# Production public probe receipts`, ``,
  `Host ${HOST}, User-Agent \`${UA}\`. GET and HEAD only, no cookies or credentials. Run ${started} to ${endedAt.toISOString()} (${out.endedPt}).`,
  `Production main expected: ${PROD_SHA} (release run 40383706342, deployed 19:08:22Z, build ${RELEASE_BUILD}, a config-only Motion ceiling change on top of 0bd390ed/C17 whose bundle hash is the same). The served pages print no commit or build hash, so each HTML probe records the entry chunk it was served (column 'served entry'); all must be the same entry for the same build.`,
  `Generated by \`probe.mjs\` (rerun any time; the raw data is \`probes.json\`).`, ``,
  `## Results (${results.length} probes, ${results.filter(r => r.ok && r.expected != null).length} of ${results.filter(r => r.expected != null).length} met their expected status, ${results.filter(r => r.expected == null).length} recorded without an expectation (status noted only))`, ``,
  `| id | request | status | content-type | served entry | observed | UTC / PT |`, `|---|---|---|---|---|---|---|`, ...results.map(row), ``,
  `Distinct entry chunks served across all HTML probes: ${entries.join(', ')}`, ``, `## What each probe proves and does not prove`, ``, `| id | feature | proves | does NOT prove |`, `|---|---|---|---|`, ...results.map(r => `| ${r.id} | ${r.feature} | ${r.proves} | ${r.notProves} |`), ``,
  `## Security-relevant headers (count of the ${results.length} probes that carried each)`, ``, `| header | present on | of |`, `|---|---|---|`, ...hdrTable.map(([h, n, t]) => `| ${h} | ${n} | ${t} |`), ``,
  `## Served bundle (static chunks)`, ``,
  `App shell links ${staticLinks.length} static files; ${chunkRes.length} JS chunks fetched (cap ${CAP}), ${scanned} answered 200. CSS HEAD: ${cssRes.map(c => `${c.link} ${c.status} ${c.cc ?? ''}`).join('; ')}.`,
  `A marker string found in a served chunk shows the code is shipped, not that it behaves.`, ``, `| feature | marker | found in |`, `|---|---|---|`,
  ...out.scan.markers.map(m => `| ${m.feature} | \`${m.marker}\` | ${m.chunks.length ? m.chunks.length + ' chunk(s): ' + m.chunks.slice(0, 2).join(', ') : 'NOT FOUND in scanned chunks'} |`), ``,
].join('\n');
writeFileSync(join(here, 'probe-receipts.md'), md);
console.log(`probes ${results.length}, expected-met ${results.filter(r => r.ok).length}, chunks200 ${scanned}, markers found ${out.scan.markers.filter(m => m.chunks.length).length}/${MARKERS.length}`);
for (const r of results) if (!r.ok) console.log('MISMATCH', r.id, r.path, r.status, 'expected', r.expected);
