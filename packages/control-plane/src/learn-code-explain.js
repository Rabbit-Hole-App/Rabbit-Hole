// The code-explain handler (docs tutor-prompts-and-routing.md sections 1c, 5, 5b, 5c, 7, 8; code-explain-card-spec.md sections 2 and 5).
// A chat turn whose verified route is code-explain (index.js apiAsk) is answered here instead of by the research loop: ONE Sonnet call
// (LEARN_TASKS.code_explain, one tool on auto, exactly one call of it) composed through composeTutorPrompt({ task: 'code-explain', use }), with
// the cited code widened to whole functions (at most 400 lines), the one-hop relationships of the symbols in it and the repository's file names.
// The server then places the answer on the code (ranking, the cap of CODE_EXPLAIN_MAX_CARDS cards, the rest as mentions), validates it with the
// contract's server validator (one re-ask with the errors), attaches the /explain figure when a worked reference hits, and returns the chat answer
// text (the Standard prose, plus "Also touched" when something was left off) and the payload for the message meta. No card is never silent:
// codeExplain null always carries a reason, and the chat appends UNANCHORED_LINE.
import SCHEMA from './code-explain.schema.json' with { type: 'json' };
import { CODE_EXPLAIN_MAX_CARDS, validateCodeExplain } from './code-explain-contract.js';
import { codebaseUseId, composeTutorPrompt, logTutorCall, tutorRecord } from './tutor-prompt.js';
import { parseCodeRef, repositoryTool } from './repository-context.js';
import { symbolEnd } from './learn-codebase-source-map.js';
import { selectForAuthor } from './explanation-references.js';
import { LEARN_TASKS, costUsd, loggedModel } from './learn-models.js';
import { creditsOf } from './pricing-registry.js';
import { anthropic } from './ask.js';
import { normalizeToolInput } from './tool-input.js';

export const CODE_EXPLAIN_MODEL = LEARN_TASKS.code_explain.model;
export const CODE_EXPLAIN_LIMITS = Object.freeze({ inputTokens: 30000, outputTokens: LEARN_TASKS.code_explain.maxTokens, usd: 0.5, codeLines: 400, readLines: 120 });
export const UNANCHORED_LINE = 'I couldn\'t anchor this to the code well enough to make a card; the answer is above.';
export const CODE_EXPLAIN_TOOL_NAME = 'code_explain';

// The model's output schema (the contract's codeExplainModelOutput), with its $refs inlined: normalizeToolInput follows properties and items only.
const deref = node => (Array.isArray(node) ? node.map(deref) : node && typeof node === 'object'
  ? node.$ref ? deref(SCHEMA.$defs[node.$ref.split('/').pop()]) : Object.fromEntries(Object.entries(node).map(([key, value]) => [key, deref(value)])) : node);
export const CODE_EXPLAIN_OUTPUT_SCHEMA = deref(SCHEMA.$defs.codeExplainModelOutput);
export const CODE_EXPLAIN_TOOL = { name: CODE_EXPLAIN_TOOL_NAME, description: 'Return the explanation at three depths and the data that places it on the code.', input_schema: CODE_EXPLAIN_OUTPUT_SCHEMA };

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = n => Number.isInteger(n);
const cmp = (a, b) => (a > b) - (a < b);
const source = (path, start, end) => `${path}:${start}${start === end ? '' : `-${end}`}`;
// The renderer's split, the web's exact rule (packages/web/src/code-explain.js splitSentences): white space after . ! or ? (and closing quotes, brackets, backticks).
// A "." inside a name such as model.py never splits; "e.g. " does. Anchors index sentences in this split.
export const SENTENCE_BREAK = /(?<=[.!?]["')\]`]*)\s+/;
export const sentencesOf = prose => { const text = String(prose ?? '').trim(); return text ? text.split(SENTENCE_BREAK) : []; };
const linesOf = (snapshot, path) => (Object.hasOwn(snapshot.files, path) ? snapshot.files[path].split('\n') : null);

// ---- The code the learner added, widened to whole functions ----------------------------------------------------------------------------------

// shortcut: a function or class header is found by its keyword (Python def/class, JS function), the block's end by the layout (symbolEnd); the graph carries
// a start line per symbol but no span. Upgrade when the indexer writes spans.
const HEADER = /^\s*(?:(?:async\s+)?def|class)\s+\w|^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\b/;
// The innermost def or class whose block holds `line`: [start, end], or null.
function enclosing(lines, line) {
  for (let l = Math.min(line, lines.length); l >= 1; l--) {
    if (!HEADER.test(lines[l - 1])) continue;
    const end = symbolEnd(lines, l);
    if (end >= line) return [l, end];
  }
  return null;
}
// A range that cuts a function is widened to the whole function (the class only when no function holds the line).
const widen = (lines, start, end) => {
  const a = enclosing(lines, start), b = enclosing(lines, end);
  return [Math.min(start, a?.[0] ?? start, b?.[0] ?? start), Math.max(end, a?.[1] ?? end, b?.[1] ?? end)];
};

// The learner's code refs resolved against the snapshot -> { shown: [{path, start, end}], text, skipped }. Each ref is read at the snapshot's own commit only;
// whole-function widening while the 400-line budget lasts, the ref's own lines (clipped) after; every read is read_source's (at most 120 lines per call).
export function gatherCode(snapshot, refs, { budget = CODE_EXPLAIN_LIMITS.codeLines } = {}) {
  const covered = new Map(); // path -> Set of line numbers, in order of first use
  let skipped = 0, remaining = budget;
  for (const ref of (refs || []).filter(r => r?.kind === 'code')) {
    const at = parseCodeRef(ref);
    if (!at || at.repo !== snapshot.repo || at.commit !== snapshot.commit) { skipped++; continue; }
    let path = ref.range?.path ?? at.path, start = ref.range?.start, end = ref.range?.end;
    if (at.nodeId && !ref.range) {
      const node = snapshot.graph?.nodes?.find(n => n.id === at.nodeId);
      path = node?.path ?? null;
      const lines = path && linesOf(snapshot, path);
      if (lines) { const whole = node.label === path.split('/').pop(); start = whole ? 1 : node.line || 1; end = whole ? lines.length : symbolEnd(lines, start); }
    } else if (!ref.range) { start = 1; end = Infinity; }
    const lines = path && linesOf(snapshot, path);
    if (!lines || !isInt(start) || start < 1 || start > lines.length) { skipped++; continue; }
    end = Math.min(isInt(end) ? end : lines.length, lines.length);
    if (end < start) { skipped++; continue; }
    const have = covered.get(path) ?? new Set();
    const fresh = (s, e) => { let n = 0; for (let l = s; l <= e; l++) if (!have.has(l)) n++; return n; };
    let [s, e] = widen(lines, start, end);
    if (fresh(s, e) > remaining) [s, e] = [start, end]; // does not fit: the ref's own lines
    for (let l = s; l <= e && remaining > 0; l++) if (!have.has(l)) { have.add(l); remaining--; }
    if (have.size) covered.set(path, have);
  }
  // Contiguous groups per path, read through read_source (at most 120 lines a call), numbered "n: text".
  const shown = [], blocks = [];
  for (const [path, set] of covered) {
    const sorted = [...set].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length;) {
      let j = i; while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
      const start = sorted[i], end = sorted[j];
      const out = [];
      for (let s = start; s <= end; s += CODE_EXPLAIN_LIMITS.readLines) {
        const read = repositoryTool(snapshot, 'read_source', { path, start: s, end: Math.min(end, s + CODE_EXPLAIN_LIMITS.readLines - 1) });
        out.push(...read.content.split('\n'));
      }
      const got = Math.min(out.length, end - start + 1); // read_source clips a very long chunk; only what was returned counts as shown
      if (got) { shown.push({ path, start, end: start + got - 1 }); blocks.push(`### ${path}  lines ${start}-${start + got - 1}   (commit ${snapshot.commit.slice(0, 7)})\n${out.slice(0, got).join('\n')}`); }
      i = j + 1;
    }
  }
  return { shown, text: blocks.join('\n'), skipped };
}

const STRUCTURAL = new Set(['contains', 'method']);
const VERBS = { calls: ['calls', 'called by'], imports: ['imports', 'imported by'], imports_from: ['imports from', 'imported by'] };
const where = n => `${n?.path ?? 'external'}${n?.line ? `:${n.line}` : ''}`;
// One hop of the graph for the symbols whose definition line is inside a shown range (repository tool get_relationships), one line per symbol.
export function relationshipLines(snapshot, shown, { maxLines = 30, maxParts = 8 } = {}) {
  const nodes = snapshot.graph?.nodes ?? [], byId = new Map(nodes.map(n => [n.id, n])), lines = [];
  for (const { path, start, end } of shown) {
    for (const n of nodes) {
      if (lines.length >= maxLines) return lines;
      if (n.path !== path || !isInt(n.line) || n.line < start || n.line > end || n.label === path.split('/').pop()) continue;
      let rel; try { rel = repositoryTool(snapshot, 'get_relationships', { nodeId: n.id }); } catch { continue; }
      const parts = [];
      for (const e of rel.edges) {
        if (STRUCTURAL.has(e.relation)) continue;
        const out = e.source === n.id, other = byId.get(out ? e.target : e.source);
        const [forward, backward] = VERBS[e.relation] ?? [e.relation, `${e.relation} (reverse)`];
        parts.push(`${out ? forward : backward} ${other?.label ?? 'unknown'} ${where(other)}${e.confidence && !['EXTRACTED', 'RECORDED'].includes(e.confidence) ? ' (INFERRED)' : ''}`);
      }
      if (parts.length) lines.push(`${n.label} defined ${where(n)} → ${[...new Set(parts)].slice(0, maxParts).join('; ')}`);
    }
  }
  return lines;
}

// Prompts file 5b, exactly. The use case is not in the message: it is the overlay layer of the system prompt.
export function userMessage({ question, snapshot, code, relationships, fileNames }) {
  return `QUESTION\n${question}\n\n\nCODE THE LEARNER ADDED\n${code}\n\nRELATIONSHIPS (one hop, from the repository graph; EXTRACTED unless marked INFERRED)\n${relationships.join('\n') || '(none)'}\n\nREPOSITORY FILES (names only; you cannot read these unless they appear above)\n${fileNames}\n\nOUTPUT SCHEMA\n${JSON.stringify(CODE_EXPLAIN_OUTPUT_SCHEMA)}\n\nReturn it by calling the ${CODE_EXPLAIN_TOOL_NAME} tool once. repo: ${snapshot.repo}, commit: ${snapshot.commit}, depth: standard.`;
}
const fileList = (snapshot, max) => {
  const names = Object.keys(snapshot.files);
  return names.slice(0, max).join(', ') + (names.length > max ? `, and ${names.length - max} more` : '');
};
// No tokenizer in a Worker: three characters a token, rounded up (it over-counts code, which is the safe side of a cap).
export const estimateTokens = (...parts) => Math.ceil(parts.reduce((n, p) => n + String(p).length, 0) / 3);

// ---- Placement and validation ---------------------------------------------------------------------------------------------------------------

// Card spec section 5: rank the files by the number of Standard sentences anchored to them (ties: the first anchor, then the model's order), keep the first
// CODE_EXPLAIN_MAX_CARDS, put them in walk order (the order of first Standard anchor); the ranges of the others become mentions under the same ids, so no anchor dangles.
export function placeFiles(files, mentioned, standardAnchors, max = CODE_EXPLAIN_MAX_CARDS) {
  const owner = new Map();
  files.forEach((f, i) => f.ranges.forEach(r => owner.set(r.id, i)));
  const sentences = files.map(() => new Set()), first = files.map(() => Infinity);
  for (const a of standardAnchors) {
    const i = owner.get(a.target);
    if (i === undefined || !isInt(a.sentence)) continue;
    sentences[i].add(a.sentence);
    first[i] = Math.min(first[i], a.sentence);
  }
  const all = files.map((_, i) => i);
  const kept = [...all].sort((a, b) => cmp(sentences[b].size, sentences[a].size) || cmp(first[a], first[b]) || a - b).slice(0, max).sort((a, b) => cmp(first[a], first[b]) || a - b);
  const left = all.filter(i => !kept.includes(i));
  return { files: kept.map(i => files[i]), mentioned: [...mentioned, ...left.flatMap(i => files[i].ranges.map(r => ({ id: r.id, path: files[i].path, start: r.start, end: r.end })))] };
}

const pickRange = r => (isObject(r) ? { id: r.id, start: r.start, end: r.end } : r);
const pickMention = m => (isObject(m) ? { id: m.id, path: m.path, start: m.start, end: m.end } : m);
const pickBody = (d, detailed) => (isObject(d)
  ? { prose: d.prose, anchors: Array.isArray(d.anchors) ? d.anchors.map(a => (isObject(a) ? { sentence: a.sentence, target: a.target } : a)) : d.anchors, ...(detailed && d.trace != null ? { trace: d.trace } : {}) } : d);
const MARKDOWN = /```|^\s*(?:[-*•]|\d+[.)])\s|^\s*#{1,6}\s/m;

// The model's tool input -> the card payload (the contract's 2a minus files[*].cardId, figure not yet attached) and the errors the validator and the handler's own
// checks find. The server's own facts are set here, never taken from the model: type, question, repo, commit, depth (the switch defaults to Standard), evidence.
export function settleOutput(input, { question, snapshot, shown, model = CODE_EXPLAIN_MODEL, now = () => new Date().toISOString() }) {
  const o = isObject(input) ? input : {};
  const byPath = new Map(); // a file named twice is one file
  for (const f of Array.isArray(o.files) ? o.files : []) {
    if (!isObject(f) || typeof f.path !== 'string' || !f.path) continue;
    byPath.set(f.path, [...(byPath.get(f.path) ?? []), ...(Array.isArray(f.ranges) ? f.ranges.map(pickRange) : [])]);
  }
  const depthsIn = isObject(o.depths) ? o.depths : {};
  const depths = {};
  for (const name of ['brief', 'standard', 'detailed']) if (name in depthsIn) depths[name] = pickBody(depthsIn[name], name === 'detailed');
  const anchors = Array.isArray(depths.standard?.anchors) ? depths.standard.anchors.filter(a => isObject(a) && typeof a.target === 'string') : [];
  const placed = placeFiles([...byPath].map(([path, ranges]) => ({ path, ranges: ranges.filter(isObject) })), (Array.isArray(o.mentioned) ? o.mentioned : []).map(pickMention).filter(isObject), anchors);
  const sources = new Set();
  for (const f of placed.files) for (const r of f.ranges) sources.add(source(f.path, r.start, r.end));
  for (const m of placed.mentioned) sources.add(source(m.path, m.start, m.end));
  const card = {
    type: 'codeExplain', title: typeof o.title === 'string' ? o.title.trim() : o.title, question, repo: snapshot.repo, commit: snapshot.commit,
    files: placed.files, mentioned: placed.mentioned, depth: 'standard', depths,
    suggestions: o.suggestions, evidence: { model, sources: [...sources], createdAt: now() },
  };
  const lines = path => linesOf(snapshot, path)?.length;
  const errors = validateCodeExplain(card, { mode: 'server', lines });
  // The handler's own checks (the prompt's rules the contract cannot see).
  if (typeof card.title !== 'string' || !card.title) errors.push('title is required');
  else if (card.title.length > 60 || card.title.endsWith('.')) errors.push('title must be at most 60 characters and have no trailing period');
  for (const [name, d] of Object.entries(depths)) {
    if (!isObject(d) || typeof d.prose !== 'string') continue;
    const count = sentencesOf(d.prose).length;
    if (MARKDOWN.test(d.prose)) errors.push(`depths.${name}.prose must be plain sentences: no markdown lists, headings or code fences`);
    if (name === 'brief' && count > 2) errors.push(`depths.brief has ${count} sentences; at most 2`);
    if (Array.isArray(d.anchors)) for (const a of d.anchors) if (isObject(a) && isInt(a.sentence) && a.sentence >= count) errors.push(`depths.${name}: anchor sentence ${a.sentence} does not exist (the prose has ${count} sentences, counted from 0)`);
  }
  if (isObject(depths.standard) && !anchors.length) errors.push('depths.standard needs at least one anchored sentence');
  for (const [i, f] of card.files.entries()) {
    const seen = shown.filter(s => s.path === f.path);
    for (const r of f.ranges) {
      if (!isInt(r.start) || !isInt(r.end)) continue;
      if (!seen.length) errors.push(`files[${i}] (${r.id}): ${f.path} was not given to you; list it in mentioned instead of ranges`);
      else if (!seen.some(s => r.start >= s.start && r.end <= s.end)) errors.push(`files[${i}] (${r.id}): ${source(f.path, r.start, r.end)} is outside the lines you were shown (${seen.map(s => `${s.start}-${s.end}`).join(', ')})`);
    }
  }
  return { card, errors };
}

// The chat answer: the Standard prose, and the closing line naming what was left off.
export function answerText(card) {
  const touched = [...new Set(card.mentioned.map(m => source(m.path, m.start, m.end)))];
  const list = touched.slice(0, 8).join(', ') + (touched.length > 8 ? `, and ${touched.length - 8} more` : '');
  return `${card.depths.standard.prose.trim()}${touched.length ? `\n\nAlso touched: ${list}.` : ''}`;
}

// Card spec section 5, Figure: the /explain selector on the question and the Standard prose's first two sentences; a worked reference, else null. No author, no planner.
export function figureFor(question, standardProse, select = selectForAuthor) {
  try {
    const prompt = `${question}\n${sentencesOf(standardProse).slice(0, 2).join(' ')}`;
    const hit = select({ prompt, depth: 'standard', plan: null, excludeReferencePrefixes: ['shape-', 'general-'] }).references?.[0];
    return hit ? { referenceId: hit.id, spec: hit.spec } : null;
  } catch { return null; }
}

// ---- The call --------------------------------------------------------------------------------------------------------------------------------

const addUsage = (total, u) => ({
  input: total.input + (u?.input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0) + (u?.cache_read_input_tokens ?? 0), output: total.output + (u?.output_tokens ?? 0),
  usd: total.usd + (costUsd({ model: CODE_EXPLAIN_MODEL, ...(u ?? {}) }) ?? 0),
});
const refusal = (reason, extra = {}) => ({ answer: null, codeExplain: null, reason, tutor: null, attempts: 0, firstTry: false, usage: { input: 0, output: 0, usd: 0 }, ...extra });
const REASONS = {
  snapshot: 'The repository snapshot for this code is not available.',
  code: 'None of the selected code could be read at this commit.',
  large: 'The selected code is too large to explain at once.',
  failed: 'The explanation could not be generated right now.',
  validation: errors => `The explanation did not validate after one retry: ${errors[0]}`,
  cap: 'The explanation did not validate and the cost limit for one card did not allow another try.',
};

// One code-explain answer. snapshot: the repository snapshot ({ repo, commit, files: {path: text}, graph }); refs: the chat's context refs; use: a CODEBASE_USES id or null.
// -> { answer, codeExplain, reason?, tutor, attempts, firstTry, usage: { input, output, usd } }. answer null: nothing usable was produced (the caller answers as ordinary chat).
export async function runCodeExplain({ env = {}, snapshot, question, refs, use = null, route = null, callModel = loggedModel('code_explain', anthropic), now, log = logTutorCall }) {
  if (!snapshot?.files) return refusal(REASONS.snapshot);
  const composed = composeTutorPrompt({ task: 'code-explain', use: codebaseUseId(use) });
  const record = tutorRecord(composed, { route, model: CODE_EXPLAIN_MODEL });
  const code = gatherCode(snapshot, refs);
  if (!code.shown.length) return refusal(REASONS.code);
  // The input cap (30k tokens): the file names and relationships go first; the code itself is already at most 400 lines.
  let message;
  const budgets = [{ files: 300, relationships: 30 }, { files: 40, relationships: 8 }, { files: 0, relationships: 0 }];
  const system = env.SUBSCRIPTION_ONLY === 'true' ? composed.text : [{ type: 'text', text: composed.text, cache_control: { type: 'ephemeral' } }];
  for (const budget of budgets) {
    message = userMessage({ question, snapshot, code: code.text, relationships: relationshipLines(snapshot, code.shown, { maxLines: budget.relationships }), fileNames: fileList(snapshot, budget.files) });
    if (estimateTokens(composed.text, message, JSON.stringify(CODE_EXPLAIN_TOOL)) <= CODE_EXPLAIN_LIMITS.inputTokens) break;
    message = null;
  }
  if (!message) return refusal(REASONS.large);

  const request = messages => ({ max_tokens: CODE_EXPLAIN_LIMITS.outputTokens, output_config: { effort: LEARN_TASKS.code_explain.effort }, system, tools: [CODE_EXPLAIN_TOOL], tool_choice: { type: 'auto' }, messages });
  let messages = [{ role: 'user', content: message }], usage = { input: 0, output: 0, usd: 0 }, last = null, errors = [], attempts = 0;
  const tutor = () => ({ ...record, usage: { inputTokens: usage.input, outputTokens: usage.output, credits: Math.round(creditsOf(Math.ceil(usage.usd * 1e6)) * 100) / 100 } });
  const done = fields => {
    // The operator's line (dollars live here and nowhere a learner reads): the section 1c record, the usage and the outcome.
    try { console.log(JSON.stringify({ event: 'code_explain_call', ...record, attempts, inputTokens: usage.input, outputTokens: usage.output, usd: Number(usage.usd.toFixed(6)), outcome: fields.codeExplain ? 'card' : 'no_card', reason: fields.reason ?? null })); } catch { /* never worth a failed turn */ }
    return { attempts, firstTry: !!fields.codeExplain && attempts === 1, usage, tutor: tutor(), ...fields };
  };
  for (let round = 0; round < 2; round++) {
    attempts++;
    log(record);
    let result;
    try {
      const response = await callModel(env, request(messages), CODE_EXPLAIN_MODEL, null);
      if (!response.ok) return done({ answer: null, codeExplain: null, reason: REASONS.failed });
      result = await response.json();
    } catch { return done({ answer: null, codeExplain: null, reason: REASONS.failed }); }
    usage = addUsage(usage, result?.usage);
    const calls = Array.isArray(result?.content) ? result.content.filter(b => b?.type === 'tool_use' && b.name === CODE_EXPLAIN_TOOL_NAME) : [];
    let settled = null;
    if (result?.stop_reason === 'max_tokens') errors = ['the output was cut off before the tool call finished; answer more briefly'];
    else if (calls.length !== 1) errors = [`call ${CODE_EXPLAIN_TOOL_NAME} exactly once (got ${calls.length})`];
    else {
      settled = settleOutput(normalizeToolInput(CODE_EXPLAIN_OUTPUT_SCHEMA, calls[0].input), { question, snapshot, shown: code.shown, now });
      errors = settled.errors;
      if (typeof settled.card.depths?.standard?.prose === 'string' && settled.card.depths.standard.prose.trim()) last = settled.card.depths.standard.prose.trim();
      if (!errors.length) {
        const card = settled.card;
        return done({ answer: answerText(card), codeExplain: { ...card, figure: figureFor(question, card.depths.standard.prose) } });
      }
    }
    if (round === 1) break;
    // One re-ask with the errors, if one more call still fits the card's cost cap and the input cap.
    const next = [...messages,
      ...(calls.length === 1 ? [{ role: 'assistant', content: [calls[0]] }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: calls[0].id, is_error: true, content: `Not accepted:\n${errors.slice(0, 12).join('\n')}\nCall ${CODE_EXPLAIN_TOOL_NAME} again with a corrected result.` }] }]
        : [{ role: 'user', content: `Not accepted:\n${errors.slice(0, 12).join('\n')}\nCall ${CODE_EXPLAIN_TOOL_NAME} again.` }])];
    const worst = estimateTokens(composed.text, JSON.stringify(next), JSON.stringify(CODE_EXPLAIN_TOOL));
    if (usage.usd + (costUsd({ model: CODE_EXPLAIN_MODEL, input_tokens: worst, output_tokens: CODE_EXPLAIN_LIMITS.outputTokens }) ?? Infinity) > CODE_EXPLAIN_LIMITS.usd) return done({ answer: last, codeExplain: null, reason: REASONS.cap });
    if (worst > CODE_EXPLAIN_LIMITS.inputTokens) return done({ answer: last, codeExplain: null, reason: REASONS.large });
    messages = next;
  }
  return done({ answer: last, codeExplain: null, reason: REASONS.validation(errors) });
}

// ---- The apiAsk seam -------------------------------------------------------------------------------------------------------------------------

// The turn's code-explain state for apiAsk (index.js): answer() is research.answer (askStream calls it instead of the research loop; null = answer as ordinary chat),
// close(text) is the last step of research.onAnswer (appends UNANCHORED_LINE when there is no card), meta() joins the answer's meta, tutor() is the record of the call
// that ran (null until one did, or when the turn fell back to ordinary chat). snapshot: async () => snapshot|null. logChat: logs the ordinary chat's record on a fall back.
export function codeExplainTurn({ env, question, refs, use, route, snapshot, callModel, logChat = () => {} }) {
  let outcome = null;
  return {
    async answer() {
      try { outcome = await runCodeExplain({ env, snapshot: await snapshot(), question, refs, use, route, ...(callModel ? { callModel } : {}) }); }
      catch (error) { console.warn('code_explain_failed', String(error?.message ?? error).slice(0, 200)); outcome = refusal(REASONS.failed); }
      if (outcome.answer == null) { logChat(); return null; }
      return { answer: outcome.answer, papers: [], shown: null };
    },
    close: text => (outcome && !outcome.codeExplain ? `${text}\n\n${UNANCHORED_LINE}` : text),
    meta: () => (outcome ? { codeExplain: outcome.codeExplain, ...(outcome.reason ? { reason: outcome.reason } : {}) } : {}),
    tutor: () => (outcome?.answer != null ? outcome.tutor : null),
  };
}
