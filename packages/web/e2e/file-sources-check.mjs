// Imported file sources on the real Worker (canvas-file-imports.md section 4.2), against the LOCAL stack only: create,
// upload 30 MiB (streamed, counted and hashed by workerd's FixedLengthStream and DigestStream), download it byte for byte,
// a byte range, owner-scoped reuse, a tampered upload refused, a stranger's 404 and a share link's read until it is revoked.
// No model call. Prints no secrets.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<.dev.vars>] node e2e/file-sources-check.mjs
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('file-sources-check runs against the local stack only');
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36).slice(-6);
const sessionOf = async who => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${who}-${run}@example.com`, secret, handle: `${who}_${run}` }) })).json()).session;
const owner = { cookie: `small_session=${await sessionOf('fsrc')}` }, stranger = { cookie: `small_session=${await sessionOf('fstr')}` };
const made = await (await fetch(`${BASE}/api/canvases`, { method: 'POST', headers: { ...owner, 'content-type': 'application/json' }, body: JSON.stringify({ title: `File sources ${run}` }) })).json();
const board = `${BASE}/api/learn/boards/${made.name}/main`;
const MiB = 1024 * 1024;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const webm = size => { const bytes = new Uint8Array(size).map((_, i) => (i * 31) % 251); bytes.set([0x1a, 0x45, 0xdf, 0xa3]); return bytes; };

let failed = 0, steps = 0;
const ok = (name, condition, extra = '') => { steps += 1; if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };
const STATE = { blocks: [], shapes: [], items: [], links: [], strokes: [], exchanges: [] };
const save = async state => fetch(board, { method: 'PUT', headers: { ...owner, 'content-type': 'application/json' }, body: JSON.stringify({ state, version: (await (await fetch(board, { headers: owner })).json()).version }) });
await save(STATE);
const declare = bytes => fetch(`${BASE}/api/learn/files`, { method: 'POST', headers: { ...owner, 'content-type': 'application/json' }, body: JSON.stringify({ app: made.name, board: 'main', name: 'big clip.webm', type: 'video/webm', size: bytes.byteLength, sha256: sha(bytes), family: 'video' }) });

const bytes = webm(30 * MiB);
const created = await declare(bytes), first = await created.json();
ok('create answers a source id and an upload', created.status === 201 && /^fs_[0-9a-f]{24}$/.test(first.source?.id) && first.upload?.method === 'PUT', String(created.status));
const id = first.source.id, file = `${BASE}/api/learn/files/${id}`;
const tampered = webm(30 * MiB); tampered[20 * MiB] ^= 1;
const bad = await fetch(file, { method: 'PUT', headers: { ...owner, 'content-type': 'video/webm' }, body: tampered });
ok('30 MiB that do not match the declared sha256 are refused', bad.status === 400, String(bad.status));
ok('and nothing is stored', (await fetch(file, { headers: owner })).status === 404);
const put = await fetch(file, { method: 'PUT', headers: { ...owner, 'content-type': 'video/webm' }, body: bytes });
const stored = await put.json();
ok('the declared 30 MiB upload is stored', put.status === 200 && stored.source?.status === 'stored', String(put.status));
const got = await fetch(file, { headers: owner });
ok('the owner downloads the original byte for byte, as an attachment', got.status === 200 && sha(new Uint8Array(await got.arrayBuffer())) === sha(bytes) && /^attachment/.test(got.headers.get('content-disposition') || ''), String(got.status));
const part = await fetch(file, { headers: { ...owner, Range: 'bytes=1048576-1048675' } });
ok('a byte range', part.status === 206 && part.headers.get('content-range') === `bytes 1048576-1048675/${30 * MiB}` && (await part.arrayBuffer()).byteLength === 100, `${part.status} ${part.headers.get('content-range')}`);
const reuse = await (await declare(bytes)).json();
ok('the same bytes again reuse the stored source', reuse.source?.id === id && reuse.upload === null);
ok('a stranger gets 404 by id', (await fetch(file, { headers: stranger })).status === 404);

await save({ ...STATE, blocks: [{ id: 'c1', type: 'file', kind: 'clip', fileRef: { v: 1, source: { id, rev: sha(bytes) } } }] });
const shared = await (await fetch(`${board}/share`, { method: 'POST', headers: { ...owner, 'content-type': 'application/json' }, body: JSON.stringify({ shared: true, view: true }) })).json();
const token = shared.sharing?.view;
const viaLink = await fetch(`${file}?share=${token}`, { headers: stranger });
ok('a link viewer reads the source the shared board shows', viaLink.status === 200 && (await viaLink.arrayBuffer()).byteLength === 30 * MiB, String(viaLink.status));
await fetch(`${board}/share`, { method: 'POST', headers: { ...owner, 'content-type': 'application/json' }, body: JSON.stringify({ shared: false }) });
ok('revoking the link revokes the read', (await fetch(`${file}?share=${token}`, { headers: stranger })).status === 404);

console.log(failed ? `${failed} FAILED` : 'all passed');
console.log(`file-sources-check ${steps - failed}/${steps}`);
process.exit(failed ? 1 : 0);
