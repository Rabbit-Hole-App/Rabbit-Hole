// Source grounding (motion spec §4.4): where a resolved target lives in a pinned repository, the
// code branches that decide whether it runs, and verbatim evidence for every span. Shared by the
// Learner Intent Resolver's consumers (the Motion Director first). Deterministic; no model call.
//
// A source is { repository, commit, files: [path], read(path) -> text } at ONE pinned commit.
// The result never cites a line it did not read: every source ref carries its exact lines, and
// claims that depend on a branch can name the branch's condition (implementation_conditions).
//
// ponytail: control flow is read for Python by indentation (class/def/if/elif/else blocks);
// other languages get occurrence spans without branch analysis until a repository needs them.
const SPAN_CAP = 30; // lines in one occurrence span

const splitLines = text => String(text).replace(/\r\n/g, '\n').split('\n');
const indentOf = s => s.match(/^ */)[0].length;
const quiet = s => !s.trim() || s.trim().startsWith('#'); // blank and comment lines open no block
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const words = s => s.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

// The blocks around 0-based line i, outermost first: [{line, indent, text}].
function enclosing(lines, i) {
  const chain = [];
  let level = indentOf(lines[i]);
  for (let j = i - 1; j >= 0 && level > 0; j--) {
    if (quiet(lines[j])) continue;
    const ind = indentOf(lines[j]);
    if (ind < level) { chain.unshift({ line: j, indent: ind, text: lines[j].trim() }); level = ind; }
  }
  return chain;
}
// The last line of the block a header at line h opens.
function blockEnd(lines, h) {
  const ind = indentOf(lines[h]);
  let end = h;
  for (let j = h + 1; j < lines.length; j++) {
    if (quiet(lines[j])) continue;
    if (indentOf(lines[j]) <= ind) break;
    end = j;
  }
  return end;
}
const symbolOf = chain => chain.map(b => b.text.match(/^(?:class|def)\s+(\w+)/)?.[1]).filter(Boolean).join('.') || '<module>';
// The symbol a line belongs to. A decorator line (stacked, multi-line arguments included) or a
// def/class header belongs to the symbol it declares: `@torch.no_grad()` above `def generate`
// inside `class GPT` is GPT.generate, not GPT.
function symbolAt(lines, i) {
  let j = i;
  while (j < lines.length && lines[j].trim().startsWith('@')) {
    let depth = 0;
    do { depth += (lines[j].match(/[([{]/g) || []).length - (lines[j].match(/[)\]}]/g) || []).length; j++; } while (depth > 0 && j < lines.length);
    while (j < lines.length && quiet(lines[j])) j++;
  }
  const header = j < lines.length && /^\s*(?:async\s+)?(?:class|def)\s+\w+/.test(lines[j]) ? j : null;
  if (header === null) return symbolOf(enclosing(lines, i).filter(b => /^(?:class|def)\s/.test(b.text)));
  const chain = enclosing(lines, header).filter(b => /^(?:class|def)\s/.test(b.text));
  return symbolOf([...chain, { text: lines[header].trim().replace(/^async\s+/, '') }]);
}

// The if statement around or at line h: {condition, ifSpan, elseSpan}; elseSpan is null when the
// statement has no else (its body runs only when the condition holds). ponytail: statements
// only, read by indentation: an elif is reported as its own condition (the earlier tests it
// implies are not recorded), and one-line `if x: y`, multi-line headers and inline
// `a if c else b` expressions are not conditions.
function conditional(lines, h) {
  const text = lines[h].trim();
  const ind = indentOf(lines[h]);
  let ifLine = h;
  if (/^else\s*:/.test(text)) {
    ifLine = null;
    for (let j = h - 1; j >= 0; j--) {
      if (quiet(lines[j]) || indentOf(lines[j]) > ind) continue;
      // The nearest statement at the else's own indent opens it: if/elif, or for/while/try (not a condition).
      if (indentOf(lines[j]) === ind && /^(?:if|elif)\b/.test(lines[j].trim())) ifLine = j;
      break;
    }
    if (ifLine === null) return null;
  }
  const expr = lines[ifLine].trim().match(/^(?:if|elif)\s+(.+):\s*(?:#.*)?$/)?.[1];
  if (!expr) return null;
  const ifEnd = blockEnd(lines, ifLine);
  let elseLine = null;
  for (let j = ifEnd + 1; j < lines.length; j++) {
    if (quiet(lines[j])) continue;
    if (indentOf(lines[j]) === ind && /^else\s*:/.test(lines[j].trim())) elseLine = j;
    break;
  }
  return { condition: expr, ifSpan: [ifLine, ifEnd], elseSpan: elseLine === null ? null : [elseLine, blockEnd(lines, elseLine)] };
}

// Where `self.<name>` gets its value inside the class around line i: an assignment or a
// registered buffer, with the comment lines right above and any continuation lines.
function definitionOf(lines, i, name) {
  const cls = enclosing(lines, i).filter(b => /^class\s/.test(b.text)).at(-1);
  if (!cls) return null;
  const end = blockEnd(lines, cls.line);
  const re = new RegExp(`^\\s*(?:self\\.${escapeRe(name)}\\s*=|self\\.register_buffer\\(\\s*["']${escapeRe(name)}["'])`);
  for (let j = cls.line + 1; j <= end; j++) {
    if (!re.test(lines[j])) continue;
    let start = j, stop = j, depth = 0;
    while (start > 0 && lines[start - 1].trim().startsWith('#')) start--;
    for (let k = j; k <= end; k++) { depth += (lines[k].match(/[([{]/g) || []).length - (lines[k].match(/[)\]}]/g) || []).length; stop = k; if (depth <= 0) break; }
    return [start, stop];
  }
  return null;
}

// The ref/evidence/condition pack for spans of one file. Spans are 0-based [start, end].
// Every if statement a line sits in is a condition (K1, ...), with or without an else: a body
// that runs only when its condition holds carries that condition. A span is split wherever the
// set of enclosing branches changes, so each ref names exactly the branches its lines run under.
function pack(source, path, lines, spans) {
  const conditions = []; // {id, key, negated, pair: {condition, ifSpan, elseSpan}, defs: [span]}
  const refs = []; // {span, role, context: [{k, side}]}; side 0: the condition holds, 1: it does not
  const conditionFor = c => {
    const key = c.condition.replace(/^not\s+/, '');
    let k = conditions.find(x => x.key === key);
    if (!k) conditions.push(k = { id: `K${conditions.length + 1}`, key, pair: c, defs: [] });
    return k;
  };
  // The if statements a line sits in, outermost first (a branch header counts from its first body line).
  const branchesAround = i => {
    let body = i;
    if (/:\s*(?:#.*)?$/.test(lines[i]) && /^(?:if|elif|else)\b/.test(lines[i].trim())) for (body = i + 1; body < lines.length && quiet(lines[body]); body++);
    return enclosing(lines, body).filter(b => /^(?:if|elif|else)\b/.test(b.text)).map(b => conditional(lines, b.line)).filter(Boolean);
  };
  // Which side of which condition line i runs on.
  const contextOf = i => branchesAround(i).map(c => {
    const inIf = i >= c.ifSpan[0] && i <= c.ifSpan[1];
    return { k: conditionFor(c).id, side: inIf !== /^not\s+/.test(c.condition) ? 0 : 1, c };
  });
  const addRef = (span, role, context = contextOf(span[0])) => {
    if (!refs.some(r => r.span[0] === span[0] && r.span[1] === span[1])) refs.push({ span, role, context: context.map(({ k, side }) => ({ k, side })) });
  };
  for (const { span, role } of spans) {
    // Consecutive lines under the same branches form one ref; blank lines never split one.
    const runs = [];
    for (let j = span[0]; j <= span[1]; j++) {
      if (!lines[j].trim()) continue;
      const context = contextOf(j);
      const sig = context.map(x => `${x.k}:${x.side}`).join(',');
      const last = runs.at(-1);
      if (last && last.sig === sig) last.end = j;
      else runs.push({ start: j, end: j, sig, context });
    }
    for (const run of runs) addRef([run.start, run.end], role, run.context);
    // The other side of each branch a run sits in is evidence too (none for an if without else),
    // unless the selection already covers part of it.
    for (const run of runs) for (const { c, side } of run.context) {
      const other = (side === 0) !== /^not\s+/.test(c.condition) ? c.elseSpan : c.ifSpan;
      if (other && !runs.some(r => r.start <= other[1] && r.end >= other[0])) addRef(other, 'branch');
    }
  }
  // Buffers the spans read (a causal mask is a registered buffer), with the branch they live in.
  for (const r of [...refs]) for (let j = r.span[0]; j <= r.span[1]; j++) for (const m of lines[j].matchAll(/self\.(\w+)\[/g)) {
    const def = definitionOf(lines, j, m[1]);
    if (def && /register_buffer/.test(lines.slice(def[0], def[1] + 1).join('\n'))) addRef(def, 'definition');
  }
  // What each condition tests: the line that sets `self.<flag>`.
  for (const k of conditions) for (const name of (k.key.match(/self\.\w+/g) || []).map(s => s.slice(5))) {
    const def = definitionOf(lines, k.pair.ifSpan[0], name);
    if (def) { addRef(def, 'condition'); k.defs.push(def); }
  }
  refs.sort((a, b) => a.span[0] - b.span[0]);
  const sourceRefs = refs.map((r, i) => ({ id: `S${i + 1}`, kind: 'code', repository: source.repository, commit: source.commit, path, start_line: r.span[0] + 1, end_line: r.span[1] + 1, role: r.role, condition_ids: [...new Set(r.context.map(x => x.k))] }));
  const idOf = span => sourceRefs[refs.findIndex(r => r.span[0] === span[0] && r.span[1] === span[1])]?.id;
  const where = ([a, b]) => `${path}:${a + 1}-${b + 1}`;
  const firstCode = ([a, b]) => lines.slice(a, b + 1).map(s => s.trim()).find(s => s && !s.startsWith('#') && !/^(?:if|elif|else)\b/.test(s)) || '';
  return {
    source_refs: sourceRefs,
    evidence: refs.map((r, i) => ({ source_ref_id: sourceRefs[i].id, excerpt: lines.slice(r.span[0], r.span[1] + 1).join('\n') })),
    implementation_conditions: conditions.map(({ id, key, pair, defs }) => {
      const negated = /^not\s+/.test(pair.condition);
      const sideSpans = negated ? [pair.elseSpan, pair.ifSpan] : [pair.ifSpan, pair.elseSpan];
      const branches = [0, 1].map(side => {
        const ids = sourceRefs.filter((s, i) => refs[i].context.some(x => x.k === id && x.side === side)).map(s => s.id);
        const span = sideSpans[side];
        const when = `\`${key}\` is ${side === 0 ? 'true' : 'false'}`;
        if (span) return { when, runs: `${where(span)}: ${firstCode(span)}`, source_ref_ids: ids };
        // No code of its own on this side: the other side's body is skipped, nothing runs instead.
        return ids.length ? { when, runs: `${where(refs[sourceRefs.findIndex(s => s.id === ids[0])].span)}`, source_ref_ids: ids }
          : { when, runs: `nothing: ${where(sideSpans[1 - side])} is skipped (no else branch)`, source_ref_ids: [], no_op: true };
      });
      return {
        id, condition: `\`${key}\` (${path}:${pair.ifSpan[0] + 1})`,
        branches,
        source_ref_ids: [...new Set([...branches.flatMap(b => b.source_ref_ids), ...defs.map(idOf).filter(Boolean)])],
      };
    }),
  };
}

// Every place a named target appears, grouped by the function or class that holds it.
export function findOccurrences(source, name) {
  const re = new RegExp(`\\b${name.trim().split(/\s+/).map(escapeRe).join('[\\s_]+')}\\b`, 'i');
  const groups = new Map();
  for (const path of source.files.filter(p => /\.py$/.test(p))) {
    const lines = splitLines(source.read(path));
    lines.forEach((text, i) => {
      if (!re.test(text)) return;
      const symbol = symbolAt(lines, i);
      const key = `${path}#${symbol}`;
      if (!groups.has(key)) groups.set(key, { path, symbol, lines: [] });
      groups.get(key).lines.push(i);
    });
  }
  return [...groups.values()].map(g => {
    const lines = splitLines(source.read(g.path));
    const primary = g.lines.find(i => !lines[i].trim().startsWith('#')) ?? g.lines[0];
    return { ...g, primary, label: `${g.symbol} (${g.path}:${primary + 1})` };
  });
}

// The innermost branch or block around an occurrence, at most SPAN_CAP lines.
function occurrenceSpan(lines, i) {
  const chain = enclosing(lines, i);
  const branch = chain.filter(b => /^(?:if|elif|else)\b/.test(b.text)).at(-1);
  const block = branch ?? chain.filter(b => !/^(?:class|def)\s/.test(b.text)).at(-1) ?? chain.at(-1);
  if (!block) return [i, i];
  const end = blockEnd(lines, block.line);
  return end - block.line + 1 <= SPAN_CAP ? [block.line, end] : [Math.max(block.line, i - 5), Math.min(end, i + 5)];
}

const overlaps = (rc, g) => rc && rc.range.path === g.path && g.lines.some(i => i + 1 >= rc.range.start && i + 1 <= rc.range.end);

// turn: a LearnerTurn from learner-intent.js. source: the pinned repository (or null).
// -> { status: 'grounded' | 'needs_clarification' | 'not_found', target, resolution,
//      candidates, chosen, source_refs, evidence, implementation_conditions, clarification }
export function groundTarget(turn, source) {
  const { target } = turn.structured_interpretation;
  const rc = turn.repository_context;
  const repoLabel = source ? `${source.repository}@${source.commit.slice(0, 7)}` : 'the current repository';
  const clarify = (question, options = []) => ({ status: 'needs_clarification', target, candidates: options, chosen: null, source_refs: [], evidence: [], implementation_conditions: [], clarification: { question, options } });

  if (target.binding === 'deictic_unbound') return clarify('What should the animation explain? Select a card or a code range, or name the concept.');
  if (target.binding === 'deictic' && rc && source) {
    if (rc.commit !== source.commit) return clarify(`The selection is at ${rc.commit.slice(0, 7)}, but the loaded source is ${repoLabel}. Reopen the repository at the selection's commit.`);
    const lines = splitLines(source.read(rc.range.path));
    const span = [rc.range.start - 1, Math.min(rc.range.end, lines.length) - 1];
    const p = pack(source, rc.range.path, lines, [{ span, role: 'occurrence' }]);
    const symbol = symbolAt(lines, span[0]);
    return {
      status: 'grounded', target, resolution: 'deictic', candidates: [], chosen: { path: rc.range.path, symbol, label: rc.label, span: [rc.range.start, rc.range.end] },
      resolved_target: { kind: 'code_span', label: `${rc.label} (${symbol}, ${rc.range.path}:${rc.range.start}-${rc.range.end})`, resolution: 'deictic', candidates_considered: [], repository_context: rc },
      ...p, clarification: null,
    };
  }
  if (target.binding === 'deictic') {
    // A selected card or canvas object: its own text is the evidence.
    const card = turn.canvas_target;
    if (!card) return clarify('Select a card or a code range to explain, or name the concept.');
    return {
      status: 'grounded', target, resolution: 'deictic', candidates: [], chosen: { card_id: card.id, label: card.title || card.kind },
      resolved_target: { kind: turn.selection?.kind === 'canvas_object' ? 'canvas_object' : 'card', label: card.title || card.kind, resolution: 'deictic', candidates_considered: [], ...(turn.selection ? { selection: turn.selection } : {}) },
      source_refs: [{ id: 'S1', kind: 'card', card_id: card.id, role: 'occurrence', condition_ids: [] }],
      evidence: [{ source_ref_id: 'S1', excerpt: card.text }], implementation_conditions: [], clarification: null,
    };
  }
  if (target.binding !== 'named') return clarify('What should the animation explain? Name the concept or select it.');
  if (!source) return { ...clarify(`Nothing to ground "${target.name}" in: open its repository or select a card that covers it.`), status: 'not_found' };

  const groups = findOccurrences(source, target.name);
  if (!groups.length) return { ...clarify(`No source in ${repoLabel} mentions "${target.name}". Select a card or code that covers it.`), status: 'not_found' };
  // An explicit name is the target; the selection, then the current concept, only decide WHICH occurrence.
  const concept = words(turn.current_location.concept || '');
  let chosen = null, resolution = 'named', why = '';
  if (groups.length === 1) chosen = groups[0];
  else {
    const bySelection = groups.filter(g => overlaps(rc, g));
    const byConcept = groups.filter(g => concept.length && concept.every(w => words(g.symbol).includes(w)));
    if (bySelection.length === 1) { chosen = bySelection[0]; resolution = 'context_disambiguated'; why = 'outside the selection'; }
    else if (byConcept.length === 1) { chosen = byConcept[0]; resolution = 'context_disambiguated'; why = `not the current concept "${turn.current_location.concept}"`; }
  }
  const options = groups.map(g => ({ label: g.label, path: g.path, line: g.primary + 1, symbol: g.symbol }));
  if (!chosen) {
    const name = target.name.charAt(0).toUpperCase() + target.name.slice(1);
    return { ...clarify(`${name} in ${options.map(o => o.label).join(' or in ')}?`, options), candidates: options };
  }
  const lines = splitLines(source.read(chosen.path));
  const span = occurrenceSpan(lines, chosen.primary);
  const p = pack(source, chosen.path, lines, [{ span, role: 'occurrence' }]);
  const others = groups.filter(g => g !== chosen);
  return {
    status: 'grounded', target, resolution, candidates: options, chosen: { path: chosen.path, symbol: chosen.symbol, label: chosen.label, span: [span[0] + 1, span[1] + 1] },
    resolved_target: {
      kind: 'code_span', label: `${target.name} in ${chosen.label}`, resolution,
      candidates_considered: others.map(g => ({ label: g.label, reason: why || 'another occurrence', range: { path: g.path, start: g.primary + 1, end: g.primary + 1 } })),
      repository_context: { commit: source.commit, label: chosen.symbol, range: { path: chosen.path, start: span[0] + 1, end: span[1] + 1 } },
    },
    ...p, clarification: null,
  };
}
