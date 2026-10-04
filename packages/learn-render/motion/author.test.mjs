// The Motion Author stage (spec §4.7, M4) with a fake model, the Remotion Author contract
// (author-check.js) on top of the unchanged static checks, the frame-probe rules, the stream
// reader, and one local compile. No real model calls. Generated sources are checked by contract,
// safety and compilation, never byte for byte.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { leakErrors } from './contracts.js';
import { AUTHOR_TOOL, authorContext, checkAuthorOutput, runAuthor, validateAuthorToolOutput } from './author.js';
import { checkAuthorSource, timelineFrames } from './author-check.js';
import { probeErrors, probeFrames } from './author-proof.mjs';
import { readMessage } from './stream-message.js';

const read = f => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
const text = f => readFileSync(new URL(f, import.meta.url), 'utf8');
const A = { brief: () => read('./fixtures/m2/softmax-15s-attention.brief.json'), storyboard: () => read('./fixtures/m3/softmax-15s-attention.storyboard.json'), source: () => text('./fixtures/m4/softmax-reference.composition.jsx') };
const errorsFor = (source, brief = A.brief(), storyboard = A.storyboard()) => checkAuthorOutput({ status: 'composition', composition_id: 'x', source }, brief, storyboard).errors;
const rejects = (edit, re) => { const e = errorsFor(edit(A.source())); assert.ok(e.some(x => re.test(x)), `${re} in:\n${e.join('\n') || '(no errors)'}`); };

test('the hand-written reference passes static safety and the Author contract, with a full object map', () => {
  const r = checkAuthorOutput({ status: 'composition', composition_id: 'softmax-reference', source: A.source() }, A.brief(), A.storyboard());
  assert.deepEqual(r.errors, []);
  assert.deepEqual(Object.keys(r.mapping.objects).sort(), ['fallback_label', 'flash_lane', 'mask_line', 'row_arrow', 'score_row', 'softmax_line', 'sum_marker', 'value_line']);
  assert.deepEqual(r.mapping.timeline, timelineFrames(A.storyboard()));
  assert.deepEqual(timelineFrames(A.storyboard()), { B1: [0, 75], B2: [75, 165], B3: [165, 270], B4: [270, 345], B5: [345, 405], B6: [405, 450] });
});

test('exact duration and beats: the stage and the timeline are the storyboard\'s, frame for frame', () => {
  rejects(s => s.replace('durationInFrames: 450', 'durationInFrames: 451'), /stage\.durationInFrames must be the literal 450/);
  rejects(s => s.replace('B2: [75, 165]', 'B2: [75, 166]'), /timeline\.B2: must be \[75, 165\]/);
  rejects(s => s.replace(', B6: [405, 450]', ''), /timeline\.B6: must be \[405, 450\]/);
  rejects(s => s.replace('export const timeline', 'const timeline'), /timeline: missing/);
});

test('stable object mapping: one element per storyboard object, never two, never none', () => {
  rejects(s => s.replace('<div data-object="mask_line"', '<div data-object="softmax_line"'), /data-object "softmax_line": written 2 times/);
  rejects(s => s.replace('<div data-object="mask_line"', '<div'), /data-object "mask_line": no element carries this storyboard object/);
  rejects(s => s.replace('data-object="sum_marker"', 'data-object="sum_badge"'), /data-object "sum_badge" is not a storyboard object/);
  // A primitive may take the id from its props when each id is written once as a literal at the use site.
  const viaPrimitive = A.source()
    .replace('const MaskLine = ({ f }) => <div data-object="mask_line" style={at(120, 240, { ...code, opacity: span(f, \'B2\', \'B2\') })}>{TEXT.maskLine}</div>;',
      'const CodeLine = ({ id, f, beat, line }) => <div data-object={id} style={at(120, 240, { ...code, opacity: span(f, beat, beat) })}>{TEXT[line]}</div>;\nconst MaskLine = ({ f }) => <CodeLine id="mask_line" f={f} beat="B2" line="maskLine" />;');
  assert.deepEqual(errorsFor(viaPrimitive), []);
  assert.ok(errorsFor(viaPrimitive.replace('<CodeLine id="mask_line"', '<CodeLine id={\'mask\' + \'_line\'}')).some(x => /mask_line": no element carries this storyboard object \(write the id once as a literal/.test(x)));
});

test('learner text: storyboard labels, on-screen text and shown source lines verbatim, through TEXT only', () => {
  rejects(s => s.replace("fallback: 'Fallback path: self.flash is False',", "fallback: 'Fallback path',"), /TEXT: the storyboard text "Fallback path: self\.flash is False" must appear verbatim/);
  rejects(s => s.replace("softmaxLine: 'att = F.softmax(att, dim=-1)',", "softmaxLine: 'att = softmax(att)',"), /TEXT: the shown source line "att = F\.softmax\(att, dim=-1\)" must appear verbatim/);
  rejects(s => s.replace('{TEXT.sum}', 'sum = 1'), /text "sum = 1" in JSX: render \{TEXT\.key\}/);
  rejects(s => s.replace('{TEXT.sum}', "{'sum is one'}"), /text "sum is one" in JSX/);
  rejects(s => s.replace("const CAPTIONS = [", "const NOTE = 'weights are probabilities over keys';\nconst CAPTIONS = ["), /prose outside TEXT: "weights are probabilities over keys"/);
});

test('no new claims: Author text teaches only the brief and storyboard, even when true', () => {
  rejects(s => s.replace("inf: '-inf',", "inf: '-inf',\n  extra: 'this guarantees calibrated probabilities',"), /TEXT\.extra: "guarantees" is not in the brief's claims/);
  rejects(s => s.replace("inf: '-inf',", "inf: '-inf',\n  extra: 'softmax = torch.exp(att)',"), /TEXT\.extra: names "torch\.exp", which is not in the brief's evidence/);
  rejects(s => s.replace("inf: '-inf',", "inf: '-inf',\n  extra: 'softmax picks the argmax',"), /TEXT\.extra: "argmax" echoes must_not_claim/);
});

test('conditions preserved: no unconditional wording, the condition label kept, no condition invented from raw source', () => {
  rejects(s => s.replace("inf: '-inf',", "inf: '-inf',\n  extra: 'nanoGPT always runs F.softmax',"), /TEXT\.extra: "always"/);
  rejects(s => s.replace("flash: 'If self.flash: scaled_dot_product_attention(is_causal=True)',", "flash: 'scaled_dot_product_attention(is_causal=True)',"), /storyboard text "If self\.flash: scaled_dot_product_attention\(is_causal=True\)" must appear verbatim/);
  // A condition the brief never recorded (dropout_p's inline `if self.training`) cannot become Author teaching.
  rejects(s => s.replace("inf: '-inf',", "inf: '-inf',\n  extra: 'dropout only while training',"), /TEXT\.extra: "dropout" (is not in the brief|is a topic the scope_note leaves out)|TEXT\.extra: "training"/);
});

test('safety stays the M1 static checker: imports, clocks, network, storage, CSS motion, fonts, assets', () => {
  rejects(s => s.replace("import { AbsoluteFill,", "import _ from 'lodash';\nimport { AbsoluteFill,"), /static .*import "lodash" is not on the allowlist/);
  rejects(s => s.replace('const f = useCurrentFrame();', 'const f = useCurrentFrame() + Date.now() * 0;'), /static .*"Date" is not allowed/);
  rejects(s => s.replace('const f = useCurrentFrame();', 'const f = useCurrentFrame(); fetch(\'/x\');'), /static .*"fetch" is not allowed/);
  rejects(s => s.replace('const f = useCurrentFrame();', 'const f = useCurrentFrame(); setTimeout(() => {}, 1);'), /static .*"setTimeout" is not allowed/);
  rejects(s => s.replace('const f = useCurrentFrame();', 'const f = useCurrentFrame(); localStorage.x = 1;'), /static .*"localStorage" is not allowed/);
  rejects(s => s.replace("const SANS = 'Inter'", "const SANS = 'Arial'"), /static .*font "Arial" is not bundled/);
  rejects(s => s.replace("borderRadius: 14,", "borderRadius: 14, transition: 'opacity 1s',"), /static .*CSS "transition" is not allowed/);
  rejects(s => s.replace('<FlashLane f={f} />', '<FlashLane f={f} /><img src="https://example.com/fig.png" />'), /static .*<img> is not allowed/);
  rejects(s => s.replace('const f = useCurrentFrame();', 'const f = useCurrentFrame(); import(\'remotion\');'), /static .*dynamic import\(\) is not allowed/);
});

test('the Author sees the contract, never the learner request, and only referenced evidence', () => {
  const ctx = authorContext(A.brief(), A.storyboard());
  const json = JSON.stringify(ctx);
  assert.ok(!json.includes('explain me softmax func'));
  assert.equal(ctx.brief.raw_user_request, undefined);
  assert.equal(ctx.brief.duration_seconds, 15);
  assert.deepEqual(ctx.renderer.timeline, timelineFrames(A.storyboard()));
  assert.ok(ctx.renderer.required_text.code_lines.includes('att = F.softmax(att, dim=-1)'));
  assert.deepEqual(ctx.evidence.map(e => e.source_ref_id), ['S1', 'S2', 'S3', 'S4']);
  // A ref nothing cites never reaches the Author.
  const extra = A.brief();
  extra.source_refs.push({ ...extra.source_refs[0], id: 'S5', start_line: 1, end_line: 1 });
  extra.evidence.push({ source_ref_id: 'S5', excerpt: '"""' });
  assert.deepEqual(authorContext(extra, A.storyboard()).evidence.map(e => e.source_ref_id), ['S1', 'S2', 'S3', 'S4']);
  assert.deepEqual(leakErrors(ctx, 'author_context'), []);
});

// The stage with a fake model.
const msg = (input, extra = {}) => ({ id: 'm', model: 'claude-opus-5-5', stop_reason: 'tool_use', usage: { input_tokens: 9000, output_tokens: 12000, cache_creation_input_tokens: 1900, cache_read_input_tokens: 0 }, content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'tool_use', id: 'tu', name: AUTHOR_TOOL.name, input }], ...extra });
const fake = (...replies) => { const requests = []; return { requests, call: async (env, body, model) => { requests.push({ body: structuredClone(body), model }); return Response.json(replies.shift()); } }; };
let ms = 0;
const clock = () => (ms += 1000);
const composition = () => ({ status: 'composition', composition_id: 'softmax-reference', source: A.source() });

test('the call: MOTION_AUTHOR_MODEL, tool_choice auto, adaptive thinking, high effort, streamed, 64000 max tokens', async () => {
  const m = fake(msg(composition()));
  const r = await runAuthor({ brief: A.brief(), storyboard: A.storyboard(), call: m.call, clock });
  assert.equal(r.status, 'composition', r.check?.errors.join('\n'));
  const [{ body, model }] = m.requests;
  assert.equal(model, 'claude-opus-5-5');
  assert.deepEqual([body.tool_choice, body.thinking, body.output_config, body.stream, body.max_tokens], [{ type: 'auto' }, { type: 'adaptive' }, { effort: 'high' }, true, 64000]);
  assert.deepEqual(body.tools.map(t => t.name), ['motion_composition']);
  assert.deepEqual(r.calls.map(c => [c.stage, c.role]), [['author', 'MOTION_AUTHOR_MODEL']]);
  const other = fake(msg(composition()));
  await runAuthor({ brief: A.brief(), storyboard: A.storyboard(), call: other.call, env: { MOTION_AUTHOR_MODEL: 'claude-sonnet-5-5' }, clock });
  assert.equal(other.requests[0].model, 'claude-sonnet-5-5');
});

test('exactly one schema-only re-ask; a truncated or malformed answer twice fails the stage', async () => {
  const truncated = msg({ __unparsed: '{"status":"compos' }, { stop_reason: 'max_tokens' });
  const m = fake(truncated, msg(composition()));
  const r = await runAuthor({ brief: A.brief(), storyboard: A.storyboard(), call: m.call, clock });
  assert.equal(r.status, 'composition');
  assert.deepEqual(r.format_retries.map(f => [f.stage, f.round, f.errors]), [['author', 0, ['the response hit max_tokens before the motion_composition call was complete']]]);
  assert.match(m.requests[1].body.messages[2].content[0].content, /SAME intended result/);
  const twice = await runAuthor({ brief: A.brief(), storyboard: A.storyboard(), call: fake(msg({ status: 'done' }), msg({ status: 'composition' })).call, clock });
  assert.deepEqual([twice.status, twice.error, twice.calls.length], ['failed', 'malformed', 2]);
  assert.ok(validateAuthorToolOutput({ status: 'needs_revision', reason: 'x', stage: 'storyboard', refs: ['B1'] }).some(e => /requested_changes: non-empty list/.test(e)));
});

test('source or contract failures are author_invalid: surfaced, never re-asked, never repaired', async () => {
  const bad = { ...composition(), source: A.source().replace('const f = useCurrentFrame();', 'const f = useCurrentFrame() + Date.now() * 0;') };
  const m = fake(msg(bad));
  const r = await runAuthor({ brief: A.brief(), storyboard: A.storyboard(), call: m.call, clock });
  assert.equal(r.status, 'author_invalid');
  assert.equal(m.requests.length, 1);
  assert.deepEqual(r.format_retries, []);
  assert.ok(r.check.errors.some(e => /"Date" is not allowed/.test(e)));
});

test('needs_revision: an unimplementable storyboard comes back as a revision request, not invented content', async () => {
  const brief = read('./fixtures/m4/needs-revision.brief.json'), storyboard = read('./fixtures/m4/needs-revision.storyboard.json');
  const real = read('./fixtures/m4/needs-revision.real.author.json'); // the real Claude Opus 5.5 answer, 2026-10-04
  assert.deepEqual(validateAuthorToolOutput(real), []);
  assert.equal(real.status, 'needs_revision');
  assert.ok(real.refs.includes('B6'));
  const r = await runAuthor({ brief, storyboard, call: fake(msg(real)).call, clock });
  assert.equal(r.status, 'needs_revision');
  assert.deepEqual(r.check.errors, []);
  const unknown = await runAuthor({ brief, storyboard, call: fake(msg({ ...real, refs: ['B9'] })).call, clock });
  assert.equal(unknown.status, 'author_invalid');
  assert.match(unknown.check.errors[0], /B9 is not in the brief or storyboard/);
});

test('the recorded real compositions pass safety and the contract (checked by meaning, not bytes)', () => {
  const cases = [
    ['softmax', read('./fixtures/m2/softmax-15s-attention.brief.json'), read('./fixtures/m3/softmax-15s-attention.real.storyboard.json'), text('./fixtures/m4/softmax-15s-attention.real.composition.jsx')],
    ['demo-b', read('./fixtures/m3/generate-20s-selection.brief.json'), read('./fixtures/m4/generate-20s-selection.storyboard.json'), text('./fixtures/m4/generate-20s-selection.real.composition.jsx')],
  ];
  for (const [name, brief, storyboard, source] of cases) {
    const r = checkAuthorOutput({ status: 'composition', composition_id: name, source }, brief, storyboard);
    assert.deepEqual(r.errors, [], name);
    assert.deepEqual(Object.keys(r.mapping.objects).sort(), [...new Set(storyboard.beats.flatMap(b => b.visible_objects.map(o => o.id)))].sort(), name);
  }
  // Demo B keeps the top-k condition with its no-op side on screen in its conditional beats.
  const b = checkAuthorSource(text('./fixtures/m4/generate-20s-selection.real.composition.jsx'), read('./fixtures/m3/generate-20s-selection.brief.json'), read('./fixtures/m4/generate-20s-selection.storyboard.json'));
  assert.ok(Object.values(b.mapping.text).some(v => /top_k is not None/.test(v)));
});

test('frame probe rules: visible objects, labels, code lines and fonts, condition on screen, no stray text', () => {
  const storyboard = A.storyboard(), brief = A.brief();
  const TEXT = checkAuthorSource(A.source(), brief, storyboard).mapping.text;
  const frame = probeFrames(storyboard).find(p => p.beat === 'B3').frame;
  const good = { frame, objects: [
    { id: 'score_row', opacity: 1, on_stage: true, text: '1.2 0.25' },
    { id: 'softmax_line', opacity: 1, on_stage: true, text: 'att = F.softmax(att, dim=-1)' },
    { id: 'fallback_label', opacity: 1, on_stage: true, text: 'Fallback path: self.flash is False' },
  ], text: [
    { value: 'Fallback path: self.flash is False', font: 'Inter', object: 'fallback_label' },
    { value: 'att = F.softmax(att, dim=-1)', font: '"JetBrains Mono"', object: 'softmax_line' },
    { value: 'Softmax turns each row of scores into weights.', font: 'Inter', object: null },
  ] };
  const only = p => probeErrors(new Map([[frame, p]]), brief, { ...storyboard, beats: storyboard.beats.filter(b => b.id === 'B3') }, TEXT);
  assert.deepEqual(only(good), []);
  assert.ok(only({ ...good, objects: good.objects.map(o => o.id === 'softmax_line' ? { ...o, opacity: 0 } : o) }).some(e => /object softmax_line is not visible/.test(e)));
  assert.ok(only({ ...good, text: good.text.map(t => t.object === 'softmax_line' ? { ...t, font: 'Inter' } : t) }).some(e => /code in softmax_line renders in "Inter", not JetBrains Mono/.test(e)));
  assert.ok(only({ ...good, text: [...good.text, { value: 'weights', font: 'Times New Roman', object: null }] }).some(e => /not a bundled font/.test(e)));
  assert.ok(only({ ...good, text: [...good.text, { value: 'calibrated probabilities', font: 'Inter', object: null }] }).some(e => /words not in TEXT \(calibrated, probabilities\)/.test(e)));
  const noCondition = { ...good, objects: good.objects.filter(o => o.id !== 'fallback_label'), text: good.text.filter(t => t.object !== 'fallback_label') };
  assert.ok(only(noCondition).some(e => /nothing visible says this beat runs under K1/.test(e)));
  assert.ok(only({ ...good, objects: [...good.objects, { id: 'score_row', opacity: 1, on_stage: true, text: '' }] }).some(e => /2 elements carry data-object "score_row"/.test(e)));
});

test('stream reader: rebuilds thinking, signatures, the tool input and usage from server-sent events', async () => {
  const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  const sse = [
    ev('message_start', { message: { id: 'm1', model: 'claude-opus-5-5', role: 'assistant', content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 5 } } }),
    ev('content_block_start', { index: 0, content_block: { type: 'thinking', thinking: '' } }),
    ev('content_block_delta', { index: 0, delta: { type: 'thinking_delta', thinking: 'plan ' } }),
    ev('content_block_delta', { index: 0, delta: { type: 'signature_delta', signature: 'sig' } }),
    ev('content_block_stop', { index: 0 }),
    ev('ping', {}),
    ev('content_block_start', { index: 1, content_block: { type: 'tool_use', id: 'tu1', name: 'motion_composition', input: {} } }),
    ev('content_block_delta', { index: 1, delta: { type: 'input_json_delta', partial_json: '{"status":"needs_' } }),
    ev('content_block_delta', { index: 1, delta: { type: 'input_json_delta', partial_json: 'revision"}' } }),
    ev('content_block_stop', { index: 1 }),
    ev('message_delta', { delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 42 } }),
    ev('message_stop', {}),
  ].join('');
  const m = await readMessage(new Response(sse, { headers: { 'content-type': 'text/event-stream' } }));
  assert.deepEqual(m.content, [{ type: 'thinking', thinking: 'plan ', signature: 'sig' }, { type: 'tool_use', id: 'tu1', name: 'motion_composition', input: { status: 'needs_revision' } }]);
  assert.equal(m.stop_reason, 'tool_use');
  assert.deepEqual(m.usage, { input_tokens: 10, output_tokens: 42, cache_read_input_tokens: 5 });
  assert.deepEqual(await readMessage(Response.json({ id: 'j' })), { id: 'j' });
  await assert.rejects(readMessage(new Response(ev('error', { error: { type: 'overloaded_error', message: 'busy' } }), { headers: { 'content-type': 'text/event-stream' } })), /overloaded_error/);
});

// One real compile through the M1 Remotion path, when this machine has its headless Chrome.
const chrome = existsSync(new URL('../node_modules/.remotion/chrome-headless-shell', import.meta.url)) || existsSync(new URL('../../../node_modules/.remotion/chrome-headless-shell', import.meta.url));
test('valid source compiles and its probed frames match the storyboard; a disallowed import fails safely', { skip: !chrome && 'no headless Chrome here', timeout: 180000 }, async () => {
  const { proveAuthor } = await import('./author-proof.mjs');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const brief = A.brief(), storyboard = A.storyboard(), source = A.source();
  const TEXT = checkAuthorSource(source, brief, storyboard).mapping.text;
  const ok = await proveAuthor({ brief, storyboard, source, TEXT, dir: mkdtempSync(join(tmpdir(), 'author-proof-')) });
  assert.deepEqual([ok.compiled, ok.errors, ok.frames.length], [true, [], storyboard.beats.length]);
  // Static checks reject this first; the bundler's import allowlist still stops it if one slipped.
  const bad = await proveAuthor({ brief, storyboard, source: source.replace("import { AbsoluteFill,", "import 'node:fs';\nimport { AbsoluteFill,"), TEXT, dir: mkdtempSync(join(tmpdir(), 'author-proof-')) });
  assert.equal(bad.compiled, false);
  assert.match(bad.errors[0], /^compile: /);
});
