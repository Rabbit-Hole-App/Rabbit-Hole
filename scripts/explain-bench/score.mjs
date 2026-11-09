// /explain card benchmark: scoring (owner 2026-11-08). Pure functions over saved cards, no network. Rules reused from the 2026-11-08 visual-choice study
// (C:/s/spec/benchmarks/explain-visual-choice-2026-11-08: score.mjs mix matching, richness.mjs richness, report5d.mjs repair causes and timing).
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ownSpec from '../../packages/web/src/tutor-diagrams/spec.js';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
// The diagram words and descriptions come from this tree's spec.js unless useSpecTree points at the tree the cards were made on (its newer kinds and wording).
let spec = ownSpec;
// The card's width follows its widest diagram (owner 2026-11-08): each diagram's natural width is what the stack tree's own renderer draws at the card's usual 408 px of room (renderTutorDiagram,
// pure, no DOM); null where the tree has no renderer or the spec is not drawable. Recorded as `width`, no gate.
let renderer = null;
const loadRenderer = async tree => { const file = tree && join(tree, 'packages/web/src/tutor-diagrams/TutorDiagram.js'); try { renderer = file && existsSync(file) ? (await import(pathToFileURL(file).href)).renderTutorDiagram : null; } catch { renderer = null; } };
await loadRenderer(join(dirname(fileURLToPath(import.meta.url)), '../..'));
export const diagramWidthOf = d => { try { return renderer ? Math.round(renderer({ version: 1, diagram: d }, 408).width) : null; } catch { return null; } };
export async function useSpecTree(tree) { const file = tree && join(tree, 'packages/web/src/tutor-diagrams/spec.js'); spec = file && existsSync(file) ? await import(pathToFileURL(file).href) : ownSpec; await loadRenderer(file ? tree : join(dirname(fileURLToPath(import.meta.url)), '../..')); return file && existsSync(file) ? file : null; }

// The words a diagram draws (spec.js tutorDiagramVisibleText); a kind newer than this copy of spec.js falls back to the caller's own label list.
export const visibleText = (d, fallback = []) => { let t; try { t = spec.tutorDiagramVisibleText({ diagram: d }); } catch { /* unknown kind */ } return (Array.isArray(t) ? t : fallback).filter(x => typeof x === 'string' && x.trim()); };
export const SETS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'sets');
export const SET_NAMES = ['regression', 'baseline', 'aiml', 'sequence', 'content'];
export const loadSet = (name, dir = SETS_DIR) => JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8'));
export const availableSets = (dir = SETS_DIR) => readdirSync(dir).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));

const FENCE = /^\s*```\s*(rh-diagram|rh-illustration)[^\n]*\n([\s\S]*?)^\s*```/gim;
export const QUANT_KINDS = ['coordinate-plot', 'bar-chart', 'number-line', 'waterfall'];
export const PLOT_KINDS = ['coordinate-plot', 'bar-chart'];
const NODE_KINDS = ['flow', 'tree', 'relationship', 'layers', 'cycle'];
export const GRAPH_KINDS = ['flow', 'tree', 'relationship', 'cycle'];
// Content-flag rules (owner 2026-11-08), written here and in README.md.
export const PLACEHOLDER_EDGE_LABELS = new Set(['input', 'output', 'compare', 'comparison', 'link', 'links', 'relates', 'relation', 'uses', 'connects', '→', '->']);
export const VERBS = new Set(('add apply ask assign average backpropagate break build calculate call check choose close collect combine compare compute convert copy create ' +
  'decode delete divide drop emit encode evaluate execute expand extend fall feed fetch filter find fit flow forward generate get grow initialise initialize insert ' +
  'learn look lookup make map mask measure merge minimise minimize mix move multiply normalise normalize open pass pick pool pop predict propagate push query rank ' +
  'read receive reduce remove repeat reply request resolve retrieve return rise rotate route run sample scale score search select send set sort split start stop ' +
  'store subtract sum swap take test train transform traverse tune update use visit vote weight write ' +
  'absorb arrive attach bind carry condense contract cool deliver detach enter evaporate exit form freeze heat leave melt precipitate produce pump reach relax release replicate transcribe translate').split(' '));

// The visuals of a saved card in body order: diagrams as their parsed spec, pictures as their fence.
export function visuals(block) {
  const out = [];
  for (const m of String(block?.body || '').matchAll(FENCE)) {
    if (m[1].toLowerCase() === 'rh-diagram') {
      let d = null; try { d = JSON.parse(m[2]).diagram; } catch { /* an unreadable spec is a diagram of no kind */ }
      out.push(d?.kind ? { type: 'diagram', kind: d.kind, diagram: d } : { type: 'diagram', kind: null });
    } else {
      let s = null; try { s = JSON.parse(m[2]); } catch { /* unreadable */ }
      // The prose paragraphs either side of the picture (where its visual marker was placed), for the picture-content judge.
      const body = String(block.body), paras = t => t.replace(FENCE, '\n\n').split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
      out.push({ type: 'picture', id: s?.id ?? null, prompt: s?.prompt ?? null, alt: s?.alt ?? null, caption: s?.caption ?? null, status: (s && block.figures?.[s.id]?.status) || null,
        before: paras(body.slice(0, m.index)).at(-1) ?? null, after: paras(body.slice(m.index + m[0].length))[0] ?? null });
    }
  }
  return out;
}
export const mixOf = vis => vis.map(v => (v.type === 'picture' ? 'P' : `D:${v.kind}`));
export const proseOf = body => String(body || '').replace(FENCE, ' ');

// A mix matches a pattern in any order; D:a|b = either kind, D:* = any diagram.
const tokenOk = (pat, got) => pat === got || (pat.startsWith('D:') && got.startsWith('D:') && (pat === 'D:*' || pat.slice(2).split('|').includes(got.slice(2))));
const perms = a => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(r => [x, ...r])));
export const matches = (pattern, mix) => pattern.length === mix.length && perms(mix).some(m => m.every((t, i) => tokenOk(pattern[i], t)));
// Visual-mix matrix (owner 2026-11-08): a mix by what it holds, not which kinds: svg, pic, svg-svg, svg-pic, pic-pic (none = nothing delivered).
export const mixName = m => (m.length ? [...m.filter(t => t !== 'P').map(() => 'svg'), ...m.filter(t => t === 'P').map(() => 'pic')].join('-') : 'none');
// The expected row is the label's best mix; a label that lists best mixes of several shapes puts the card on the shape it made when that is one of them, else on the first.
export const expectedMix = (best, made) => { const shapes = [...new Set((best || []).map(mixName))]; return shapes.includes(made) ? made : shapes[0] || 'none'; };
const mixClass = m => m.map(t => (t === 'P' ? 'pic' : 'svg')).sort().join('-');
// One rule: right = matches a best mix including the diagram kind; acceptable = matches an acceptable mix; else wrong.
export function scoreMix(p, vis) {
  const mix = mixOf(vis), of = m => (p.best.some(b => matches(b, m)) ? 'right' : p.acceptable.some(a => matches(a, m)) ? 'acceptable' : 'wrong');
  const score = of(mix);
  // Owner relabel 2026-11-08 (DNS lookup, decision tree): a flow counts toward "right" only with a decision node; a decision-free flow stays acceptable.
  if (score === 'right' && p.flowNeedsDecision) {
    const plain = vis.map((v, i) => (mix[i] === 'D:flow' && !(v.diagram?.nodes || []).some(n => n.role === 'decision') ? 'D:flow-without-decision' : mix[i]));
    if (of(plain) !== 'right') return 'acceptable';
  }
  return score;
}

// LaTeX-lite formula -> a one-variable function, or null. Numbers, one variable (a letter or a Greek name), + - * / ^, \frac, \sqrt, \exp, \ln, \log, e, \pi.
const FUNCS = { exp: 'Math.exp', ln: 'Math.log', log: 'Math.log', sqrt: 'Math.sqrt', sin: 'Math.sin', cos: 'Math.cos', tanh: 'Math.tanh' };
const GREEK = new Set(['alpha', 'beta', 'gamma', 'delta', 'eta', 'theta', 'lambda', 'mu', 'sigma', 'tau', 'omega', 'epsilon']);
export function compileFormula(tex) {
  let s = String(tex).replace(/\\left|\\right|\\[,;!]|\\displaystyle/g, '').replace(/\\(?:cdot|times)/g, '*').replace(/\\[dt]frac/g, '\\frac');
  // Innermost groups first, so a fraction may hold an exponent: \frac{1}{1+e^{-z}}.
  for (let i = 0, was = null; i < 20 && was !== s; i++) { was = s; s = s.replace(/\^\s*\{([^{}]*)\}/g, '^($1)').replace(/\\sqrt\s*\{([^{}]*)\}/g, '\\sqrt($1)').replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '(($1)/($2))'); }
  if (s.includes('\\frac')) return null;
  s = s.replace(/\{/g, '(').replace(/\}/g, ')');
  const tokens = s.match(/\d+(?:\.\d+)?|\.\d+|\\[a-zA-Z]+|[a-zA-Z]|\S/g) || [];
  let out = '', prev = null, last = null; const vars = new Set();
  for (const t of tokens) {
    let kind, js;
    if (/^[\d.]/.test(t)) [kind, js] = ['val', t];
    else if (t[0] === '\\' || /^[a-zA-Z]$/.test(t)) {
      const name = t.replace('\\', '');
      if (FUNCS[name]) [kind, js] = ['fn', FUNCS[name]];
      else if (name === 'e') [kind, js] = ['val', 'Math.E'];
      else if (name === 'pi') [kind, js] = ['val', 'Math.PI'];
      else if (t[0] === '\\' && !GREEK.has(name)) return null;
      else { [kind, js] = ['val', `v_${name}`]; vars.add(name); }
    } else if (t === '(' || t === ')') [kind, js] = [t === '(' ? 'open' : 'close', t];
    else if ('+-*/^'.includes(t)) [kind, js] = ['op', t === '^' ? '**' : t];
    else return null; // a subscript, a sum, anything else: not checkable
    if (prev === 'fn' && kind !== 'open') return null;
    if ((t === '-' || t === '+') && (prev === null || prev === 'op' || prev === 'open')) { if (last === '^') return null; if (t === '-') out += '(-1)*'; prev = 'op'; last = t; continue; }
    if ((prev === 'val' || prev === 'close') && (kind === 'val' || kind === 'open' || kind === 'fn')) out += '*';
    out += js; prev = kind; last = t;
  }
  if (vars.size !== 1 || !out) return null;
  const [v] = vars;
  try { const f = new Function('Math', `return (v_${v}) => (${out});`)(Math); f(1); return { variable: v, f }; } catch { return null; }
}
const decimals = y => (String(y).split('.')[1] || '').length;
// Every plotted point recomputed from the formula the prose states; an error = off by more than 0.01 after rounding to the plotted precision.
// mode 'strict' (default, owner 2026-11-08, per series): EACH series is checked against the formula the prose states for it. Functions the prose defines ($f(x) = ...$, $f'(x) = ...$) are
// expanded, so a derivative series is checked against the derivative and the base series against the base function: each series takes the stated formula that fits its points best, and a series
// that fits no stated formula on half its points is not checked (nothing was stated for it). Any remaining wrong point is an error; a plot with one is wrong.
// mode 'legacy': every point of the plot against the FIRST stated formula (runs scored before 2026-11-08; the 'strict-first' plot rule uses it too).
const NAME_LHS = /^\s*(\\[a-zA-Z]+|[a-zA-Z])('?)\s*\(\s*([a-zA-Z])\s*\)\s*$/;
function definitions(prose) {
  const defs = new Map();
  for (const m of String(prose).matchAll(/\$([^$]+)\$/g)) { const parts = m[1].split('='); const l = parts.length > 1 && NAME_LHS.exec(parts[0]); if (l) defs.set(l[1] + l[2], { param: l[3], rhs: parts[1] }); }
  return defs;
}
const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Replace each call name(arg) in tex by the definition's right side with its parameter set to (arg); the formula being defined is not expanded into itself.
function expandCalls(tex, defs, own) {
  let out = String(tex);
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const [name, def] of [...defs].sort((a, b) => b[0].length - a[0].length)) {
      if (name === own) continue;
      const re = new RegExp((name.startsWith('\\') ? '' : '(?<![a-zA-Z\\\\])') + esc(name) + '\\s*\\(', 'g');
      let m;
      while ((m = re.exec(out))) {
        let depth = 1, k = m.index + m[0].length;
        while (k < out.length && depth) { depth += out[k] === '(' ? 1 : out[k] === ')' ? -1 : 0; k++; }
        if (depth) break;
        const arg = out.slice(m.index + m[0].length, k - 1), body = def.rhs.replace(new RegExp('(?<![a-zA-Z\\\\])' + esc(def.param) + '(?![a-zA-Z])', 'g'), () => '(' + arg + ')');
        out = out.slice(0, m.index) + '(' + body + ')' + out.slice(k); changed = true; re.lastIndex = m.index;
      }
    }
    if (!changed) break;
  }
  return out;
}
const offBy = (c, pts) => pts.map(([x, y]) => { const e = c.f(x); return Number.isFinite(e) ? Math.abs(y - +e.toFixed(decimals(y))) > 0.01 : null; }).filter(e => e !== null);
export function arithmetic(d, prose, mode = 'strict') {
  const series = d.kind === 'coordinate-plot' ? (d.series || []).map(s => ({ label: s.label || 'series', points: (s.points || []).map(p => [p.x, p.y]) }))
    : d.kind === 'bar-chart' && (d.bars || []).length && d.bars.every(b => String(b.label).trim() !== '' && Number.isFinite(Number(b.label))) ? [{ label: 'bars', points: d.bars.map(b => [Number(b.label), b.value]) }] : null;
  if (!series) return { checked: false, reason: 'bars are not numeric inputs' };
  if (mode === 'strict') {
    const defs = definitions(prose), cands = [];
    for (const m of String(prose).matchAll(/\$([^$]+)\$/g)) {
      const parts = m[1].split('='), l = NAME_LHS.exec(parts[0] || '');
      for (let k = 1; k < parts.length; k++) { const c = compileFormula(expandCalls(parts[k], defs, l ? l[1] + l[2] : null)); if (c) cands.push({ formula: parts[k].trim(), ...c }); }
    }
    if (!cands.length) return { checked: false, reason: 'no one-variable formula in the prose', series: series.map(s => ({ label: s.label, checked: false, reason: 'no one-variable formula in the prose' })) };
    const per = series.map(s => {
      let best = null;
      for (const c of cands) { const bad = offBy(c, s.points); if (bad.length && (!best || bad.filter(Boolean).length / bad.length < best.errors / best.points)) best = { formula: c.formula, points: bad.length, errors: bad.filter(Boolean).length }; }
      if (!best) return { label: s.label, checked: false, reason: 'no stated formula evaluates at its points' };
      if (best.errors / best.points > 0.5) return { label: s.label, checked: false, reason: `no stated formula fits half the points (best: ${best.formula}, ${best.errors}/${best.points} off): a different function` };
      return { label: s.label, checked: true, ...best };
    });
    const ok = per.filter(x => x.checked);
    if (!ok.length) return { checked: false, reason: per.map(x => `${x.label}: ${x.reason}`).join('; '), series: per };
    return { checked: true, formula: [...new Set(ok.map(x => x.formula))].join(' ; '), points: ok.reduce((t, x) => t + x.points, 0), errors: ok.reduce((t, x) => t + x.errors, 0), series: per };
  }
  const points = series.flatMap(s => s.points);
  for (const m of String(prose).matchAll(/\$([^$]+)\$/g)) {
    for (const rhs of m[1].split('=').slice(1)) {
      const c = compileFormula(rhs); if (!c) continue;
      const checked = offBy(c, points);
      if (!checked.length) continue;
      return { checked: true, formula: rhs.trim(), variable: c.variable, points: checked.length, errors: checked.filter(Boolean).length };
    }
  }
  return { checked: false, reason: 'no one-variable formula in the prose' };
}

const verbStart = label => {
  const w = String(label).trim().toLowerCase().replace(/^[^a-z]+/, '').split(/[^a-z]/)[0] || '';
  return [w, w.replace(/s$/, ''), w.replace(/es$/, ''), w.replace(/ed$/, ''), w.replace(/ed$/, 'e'), w.replace(/ing$/, ''), w.replace(/ing$/, 'e')].some(x => VERBS.has(x));
};
const norm = s => String(s ?? '').trim().toLowerCase();
// One diagram's richness and content columns (never blended into one score).
export function diagramScore(d, prose, kinds = null, plotRule = 'strict') {
  const L = [], edges = [];
  const add = (...xs) => xs.flat().filter(x => typeof x === 'string' && x.trim()).forEach(x => L.push(x));
  switch (d.kind) {
    case 'flow': case 'tree': case 'relationship': add((d.nodes || []).map(n => n.label)); edges.push(...(d.kind === 'tree' ? [] : d.edges || [])); break;
    case 'cycle': add(d.steps || []); break;
    case 'sequence': add((d.actors || []).map(a => a.label), (d.messages || []).map(m => m.label)); edges.push(...(d.messages || [])); break;
    case 'timeline': add((d.events || []).flatMap(e => [e.time, e.label])); break;
    case 'layers': add((d.layers || []).map(l => l.label)); break;
    case 'comparison': add((d.columns || []).flatMap(c => [c.heading, ...(c.items || [])])); break;
    case 'matrix': add(d.columns || [], (d.rows || []).flatMap(r => [r.heading, ...(r.cells || [])])); break;
    case 'transformation': add(d.before?.items || [], d.after?.items || [], d.operation); edges.push(...(d.links || [])); break;
    case 'argument': add(d.claim, (d.support || []).map(s => s.label), (d.objections || []).map(s => s.label), d.conclusion); break;
    case 'bar-chart': add((d.bars || []).map(b => b.label), d.categories || [], (d.series || []).map(s => s.label)); break; // grouped variant: categories x series
    case 'coordinate-plot': add((d.series || []).flatMap(s => [s.label, ...(s.points || []).map(p => `${p.x},${p.y}`)])); break;
    case 'number-line': add((d.markers || []).map(m => m.label), (d.intervals || []).map(i => i.label)); break;
    case 'figure': add((d.callouts || []).map(c => c.label)); break;
    default: break;
  }
  const units = d.kind === 'sequence' ? (d.messages || []).length : d.kind === 'coordinate-plot' ? (d.series || []).reduce((s, x) => s + (x.points || []).length, 0) : d.kind === 'timeline' ? (d.events || []).length
    : d.kind === 'comparison' ? (d.columns || []).reduce((s, c) => s + (c.items || []).length, 0) : d.kind === 'matrix' ? (d.rows || []).length * (d.columns || []).length : L.length;
  const json = JSON.stringify(d);
  const optional = [d.caption ? 'caption' : null, /"detail":/.test(json) ? 'detail' : null, d.highlightPath ? 'highlightPath' : null, /"units?":/.test(json) ? 'units' : null,
    (d.series || []).some(s => (s.points || []).some(p => p.label)) || (d.markers || []).length ? 'point labels' : null].filter(Boolean);
  const labelled = edges.filter(e => typeof e.label === 'string' && e.label.trim()).length;
  const nodeLabels = d.kind === 'cycle' ? d.steps || [] : d.kind === 'layers' ? (d.layers || []).map(l => l.label) : NODE_KINDS.includes(d.kind) ? (d.nodes || []).map(n => n.label) : [];
  const p = String(prose).toLowerCase(), labelSet = new Set(nodeLabels.map(norm));
  const edgeLabels = (['flow', 'relationship'].includes(d.kind) ? d.edges || [] : d.kind === 'transformation' ? d.links || [] : []).map(e => e.label).filter(l => typeof l === 'string' && l.trim());
  const seen = new Set(), duplicateLabels = [...new Set(nodeLabels.map(norm).filter(l => (seen.has(l) ? true : (seen.add(l), false))))];
  const degree = {}; if (d.kind === 'relationship') (d.edges || []).forEach(e => [e.from, e.to].forEach(id => (degree[id] = (degree[id] || 0) + 1)));
  const flags = {
    placeholderEdge: edgeLabels.filter(l => PLACEHOLDER_EDGE_LABELS.has(norm(l)) || labelSet.has(norm(l))),
    duplicateLabels,
    nounBoxFlow: d.kind === 'flow' && !(d.nodes || []).some(n => n.role === 'decision') && !(d.nodes || []).some(n => verbStart(n.label)),
    bareMaths: (() => { let t = []; try { t = spec.tutorDiagramVisibleText({ diagram: d }) ?? L; } catch { t = L; } return t.filter(x => typeof x === 'string' && /[_^\\]/.test(x.replace(/\$[^$]*\$/g, ''))); })(),
    // Any formula or maths in the drawn words (owner, overview depth): $...$, a subscript/power/backslash, or an equals sign.
    formulaLabels: (() => { let t = []; try { t = spec.tutorDiagramVisibleText({ diagram: d }) ?? L; } catch { t = L; } return t.filter(x => typeof x === 'string' && /\$[^$]+\$|[_^\\=]/.test(x)); })(),
  };
  let describe = null; try { describe = spec.describeTutorDiagram({ diagram: d }); } catch { /* an unexpected shape: no description */ }
  return {
    kind: d.kind, width: diagramWidthOf(d), kindRight: kinds ? kinds.includes(d.kind) : null, units, edges: edges.length, labelledEdges: labelled, optional,
    numericLabels: L.filter(x => /\$[^$]+\$|\d/.test(x)).length, labels: L.length,
    // 2026-11-08 study rule: every node label <= 4 words, found verbatim in the prose, and no edge label.
    proseNounBox: NODE_KINDS.includes(d.kind) && nodeLabels.length > 0 && nodeLabels.every(l => l.trim().split(/\s+/).length <= 4 && p.includes(l.trim().toLowerCase())) && labelled === 0,
    flags, flagged: flags.placeholderEdge.length > 0 || flags.duplicateLabels.length > 0 || flags.nounBoxFlow,
    // The relationship layout (teaching-layouts.js) draws one row per edge, so a node in 2+ edges is drawn as 2+ boxes.
    // Graph layout (the server sets it on every relationship since release 115, relationshipsAsGraphs) draws each node once; only the pairs layout repeats a node that is in 2+ edges.
    duplicatedRelationshipNodes: d.layout === 'graph' ? [] : Object.entries(degree).filter(([, n]) => n >= 2).map(([id]) => (d.nodes || []).find(n => n.id === id)?.label ?? id),
    arithmetic: PLOT_KINDS.includes(d.kind) ? arithmetic(d, prose, plotRule === 'strict' ? 'strict' : 'legacy') : null,
    describe, spec: d,
  };
}

const CAUSES = [[/over_budget/, 'length / over budget'], [/decision needs/, 'decision with too few branches'], [/exactly one root|needs one root/, 'two roots'], [/cannot contain a cycle|unreachable/, 'loop or unreachable node in a flow'],
  [/connect a node to itself/, 'edge from a node to itself'], [/at most one outgoing edge/, 'process with two outgoing edges'], [/outcome cannot have outgoing/, 'outcome with an outgoing edge'], [/repeat the same directed/, 'repeated edge'],
  [/Use at most \d+ characters/, 'label too long'], [/explanation_layout|marker|missing_visual/, 'visual marker / layout'], [/required_visual_missing/, 'required visual missing']];
export const repairCause = e => CAUSES.find(([re]) => re.test(e))?.[1] ?? `other: ${String(e).slice(0, 100)}`;

// One saved card -> its scored row. rec: { set, run, id, delivered, failure, block, totalMs, repaired, repairCauses, diagramCorrections, visualFallback, costUsd, costSource, tokens, raw, unknownKeysStripped }
// The JEV planner's plan, from the dev-only explanation_author_raw line of attempt 0: { planner: 'jev', ms, kind, fixed, offered: [a, b] | null } | { planner: 'rules' } (the planner failed: the author ran as without it) | null (no planner).
export function planOf(raw) {
  const e = (raw || []).find(x => (x.attempt ?? 0) === 0);
  if (!e || !e.plan) return null;
  if (e.plan.planner === 'rules') return { planner: 'rules' };
  const d = (e.plan.visuals || []).find(v => v.type === 'diagram');
  // physical = the planner's isPhysical probability; pictures = pictures in the plan; physicalOverride only when the server logs it (the raw line does not carry it yet: see the summary's physical counts).
  return { planner: 'jev', ms: e.plan.ms ?? null, kind: e.plan.kind ?? null, fixed: e.plan.fixed ?? null, offered: d?.choose || null, treatment: e.plan.depthTreatment ?? null, confidence: e.plan.confidence?.kind ?? null,
    physical: e.plan.flags?.isPhysical ?? null, pictures: (e.plan.visuals || []).filter(v => v.type === 'picture').length, diagrams: (e.plan.visuals || []).filter(v => v.type === 'diagram').length, physicalOverride: e.plan.physicalOverride ?? null };
}
// A kind's label against a prompt's labels, as one diagram of a card: right = in a best pattern with one diagram token, acceptable = in an acceptable one, else wrong (pictures are ignored).
export const kindStatus = (p, k) => { const hit = list => list.some(b => { const d = b.filter(t => t !== 'P'); return d.length === 1 && tokenOk(d[0], `D:${k}`); }); return hit(p.best) ? 'right' : hit(p.acceptable) ? 'acceptable' : 'wrong'; };
const RANK = { right: 2, acceptable: 1, wrong: 0 }, bestOf = xs => xs.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'wrong');
export const cardKey = c => `${c.set}/r${c.run}${c.depth ? `/${c.depth}` : ''}/${c.id}`;
// opts.plotRule: 'strict' (default, owner 2026-11-08) = a coordinate-plot or bar-chart with ANY wrong point (second plots too) makes the card "wrong", each plot compared with its best-fitting stated formula;
// 'strict-first' = the same rule against the FIRST stated formula only (a second plot of a derivative then counts as wrong); 'legacy' = points are reported, the score is unchanged.
export function scoreCard(p, rec, opts = {}) {
  const plotRule = opts.plotRule || 'strict';
  // A per-depth prompt (correct-svg): that depth's kinds, acceptable kinds and sketch, as best/acceptable mixes (a picture or a second diagram allowed beside).
  if (p.depths) { const dp = p.depths[rec.depth || 'standard'], k = `D:${dp.kinds.join('|')}`, a = dp.acceptableKinds.length ? `D:${dp.acceptableKinds.join('|')}` : null;
    p = { ...p, kinds: dp.kinds, sketch: dp.sketch, best: [[k], [k, 'D:*'], [k, 'P'], ...(dp.extraBest || [])], acceptable: [...(a ? [[a], [a, 'D:*'], [a, 'P']] : []), ...(dp.extraAcceptable || [])] }; }
  const block = rec.delivered ? rec.block : null, vis = block ? visuals(block) : [], mix = mixOf(vis), prose = block ? proseOf(block.body) : '', plan = planOf(rec.raw);
  const diagrams = vis.filter(v => v.diagram).map(v => diagramScore(v.diagram, prose, p.kinds || null, plotRule));
  const plotWrong = plotRule.startsWith('strict') && diagrams.some(d => PLOT_KINDS.includes(d.kind) && d.arithmetic?.errors > 0);
  const score = block ? (plotWrong ? 'wrong' : scoreMix(p, vis)) : 'failed', it = block?.interactions;
  return {
    set: rec.set, run: rec.run, depth: rec.depth || null, plotRule, plotWrong, deepPlot: !!p.deepPlot, id: p.id, prompt: p.prompt, group: p.group, category: p.category || null, sketch: p.sketch || null, regressionKind: p.regressionKind || null,
    delivered: !!block, failure: rec.failure || null, title: block?.title || null, mix, score,
    expectedMix: expectedMix(p.best, mixName(mix)), madeMix: block ? mixName(mix) : 'none', expectedShapes: [...new Set((p.best || []).map(mixName))],
    mixRight: !!block && p.best.some(b => mixClass(b) === mixClass(mix)), badKinds: mix.filter(t => t.startsWith('D:') && (p.badKinds || []).includes(t.slice(2))).map(t => t.slice(2)),
    needsPicture: !!p.needsPicture, noPicture: !!p.noPicture, hasPicture: mix.includes('P'), pictures: vis.filter(v => v.type === 'picture').map(({ type, id, ...v }) => v),
    diagrams, quantKind: diagrams.some(d => QUANT_KINDS.includes(d.kind)),
    formulaPlotOk: diagrams.some(d => PLOT_KINDS.includes(d.kind)) && !diagrams.some(d => d.arithmetic?.errors > 0),
    repaired: !!rec.repaired || (rec.repairCauses || []).length > 0, repairCauses: (rec.repairCauses || []).map(c => ({ attempt: c.attempt, cause: repairCause(c.error), error: String(c.error).slice(0, 240) })),
    corrections: rec.diagramCorrections || block?.diagramCorrections || null, visualFallback: rec.visualFallback || block?.visualFallback || null,
    unknownKeysStripped: rec.unknownKeysStripped ?? null, raw: rec.raw ?? null,
    // The plan's kind (or the two offered) against the card's FIRST diagram (the plan's main one; the author places visuals in the plan's order). A card with no diagram where one was planned is a disagreement.
    plan, planCheck: plan?.kind && block ? (kinds => { const drawn = diagrams.map(d => d.kind), first = drawn[0] ?? null; return { planKind: plan.kind, offered: plan.fixed ? null : plan.offered, agree: first !== null && kinds.includes(first), drawn, first,
      planStatus: bestOf(kinds.map(k => kindStatus(p, k))), authorStatus: first === null ? 'wrong' : kindStatus(p, first) }; })(plan.fixed || !plan.offered ? [plan.kind] : plan.offered) : null,
    // Pictures dropped: a figure with status "dropped", or (from the app log) a picture that never reached "ready", whose fence the server removed. null = not known (no log).
    // The author examples the server attached (dev-only log line explanation_author_raw, attempt 0: references [ids]). null = not logged.
    references: (e => (Array.isArray(e?.references) ? { count: e.references.length, ids: e.references } : null))((rec.raw || []).find(x => (x.attempt ?? 0) === 0)),
    picturesDropped: (f => (rec.picturesDropped || f.length ? [...new Set([...(rec.picturesDropped || []), ...f])] : null))(Object.entries(block?.figures || {}).filter(([, x]) => x?.status === 'dropped').map(([id]) => id)),
    proseLists: block?.proseLists ?? null,
    output: block ? { title: (block.title || '').length, visuals: [...String(block.body).matchAll(FENCE)].reduce((s, m) => s + m[2].trim().length, 0), body: prose.trim().length,
      questions: (it?.questions || []).reduce((s, x) => s + String(x.text || '').length, 0), terms: (it?.terms || []).reduce((s, x) => s + String(x.label || '').length + String(x.definition || '').length, 0) } : null,
    totalMs: rec.totalMs ?? null, costUsd: rec.costUsd ?? null, costSource: rec.costSource || null, tokens: rec.tokens || null, judge: rec.judge || null,
  };
}

export const quantile = (a, p) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; };
const timing = xs => ({ n: xs.length, p50: quantile(xs, 0.5), p90: quantile(xs, 0.9) });
const tally = (xs, key) => xs.reduce((o, x) => ((o[key(x)] = (o[key(x)] || 0) + 1), o), {});

const MIX_ORDER = ['svg', 'pic', 'svg-svg', 'svg-pic', 'pic-pic'];
// rows = expected mix, columns = what the card got; off-diagonal cells list their cards so the missing mixes (a 'X vs Y' that got one comparison) are findable.
export function mixMatrix(cards) {
  const sent = cards.filter(c => c.expectedMix), rows = [...new Set([...MIX_ORDER, ...sent.map(c => c.expectedMix)])].filter(r => sent.some(c => c.expectedMix === r));
  const colsAll = [...new Set([...MIX_ORDER, ...sent.map(c => c.madeMix)])].filter(m => MIX_ORDER.includes(m) || sent.some(c => c.madeMix === m)), cols = [...colsAll.filter(m => m !== 'none'), ...(colsAll.includes('none') || sent.some(c => c.madeMix === 'none') ? ['none'] : [])];
  const cell = (r, m) => sent.filter(c => c.expectedMix === r && c.madeMix === m), two = m => m.split('-').length === 2;
  const key = c => `${c.set}/${c.id}${c.depth ? '@' + c.depth : ''}#r${c.run}`;
  const expTwo = sent.filter(c => two(c.expectedMix)), madeTwo = sent.filter(c => two(c.madeMix));
  return { cards: sent.length, rows, cols, counts: Object.fromEntries(rows.map(r => [r, Object.fromEntries(cols.map(m => [m, cell(r, m).length]))])),
    off: rows.flatMap(r => cols.filter(m => m !== r).flatMap(m => (cell(r, m).length ? [{ expected: r, made: m, cards: cell(r, m).map(key) }] : []))),
    twoVisuals: { expected: expTwo.length, madeTwoOfExpected: expTwo.filter(c => two(c.madeMix)).length, madeTwo: madeTwo.length, madeTwoNotExpected: madeTwo.filter(c => !two(c.expectedMix)).length } };
}

// Every metric of a group of scored cards (counts with their denominators).
export function summarize(cards) {
  const D = cards.filter(c => c.delivered), dg = D.flatMap(c => c.diagrams.map(d => ({ ...d, at: cardKey(c) }))), graph = dg.filter(d => GRAPH_KINDS.includes(d.kind));
  const n = f => D.filter(f).length, at = cardKey;
  const regCards = cards.filter(c => c.regressionKind);
  const regression = regCards.length ? Object.entries(regCards.reduce((o, c) => ((o[c.id] ||= []).push(c), o), {}))
    .map(([id, cs]) => ({ id, kind: cs[0].regressionKind, hits: cs.filter(c => c.mix.includes(`D:${cs[0].regressionKind}`)).length, runs: cs.length })) : null;
  const need = D.filter(c => c.needsPicture), none = D.filter(c => c.noPicture), labelled = D.filter(c => c.category), formula = cards.filter(c => c.category === 'formula');
  const withKinds = dg.filter(d => d.kindRight !== null), plots = dg.filter(d => d.arithmetic?.checked), judgedF = dg.filter(d => d.faithful);
  const rep = cards.filter(c => c.repaired), clean = cards.filter(c => !c.repaired), byCause = {}, corr = {};
  rep.forEach(c => [...new Set(c.repairCauses.filter(x => x.attempt === 0).map(x => x.cause))].forEach(k => (byCause[k] = (byCause[k] || 0) + 1)));
  if (rep.some(c => !c.repairCauses.length)) byCause['cause not logged (no --log)'] = rep.filter(c => !c.repairCauses.length).length;
  cards.forEach(c => Object.entries(c.corrections || {}).forEach(([k, v]) => (corr[k] = (corr[k] || 0) + v)));
  const tok = D.filter(c => Number.isFinite(c.tokens?.output)), byKind = {};
  for (const c of tok) for (const k of new Set(c.diagrams.length ? c.diagrams.map(d => d.kind) : [c.hasPicture ? 'picture only' : 'no visual'])) (byKind[k] ||= []).push(c);
  const mean = (xs, f) => (xs.length ? +(xs.reduce((s, x) => s + f(x), 0) / xs.length).toFixed(2) : null);
  const slow = cards.filter(c => Number.isFinite(c.totalMs)).reduce((a, c) => (!a || c.totalMs > a.totalMs ? c : a), null);
  const costed = cards.filter(c => Number.isFinite(c.costUsd)), judged = D.filter(c => c.judge?.factual);
  return {
    cards: { sent: cards.length, delivered: D.length, failed: cards.length - D.length, failures: cards.filter(c => !c.delivered).map(c => `${at(c)}: ${c.failure}`) },
    choice: { right: n(c => c.score === 'right'), acceptable: n(c => c.score === 'acceptable'), wrong: n(c => c.score === 'wrong'), of: D.length,
      rightMixWrongKind: D.filter(c => c.mixRight && c.score !== 'right').map(c => `${at(c)}: ${c.mix.join('+')} (${c.score})`), badKindUsed: D.filter(c => c.badKinds.length).map(c => `${at(c)}: ${c.badKinds.join(', ')}`),
      wrongList: D.filter(c => c.score === 'wrong').map(c => `${at(c)}: ${c.mix.join('+') || 'no visual'}`), kinds: tally(D.flatMap(c => c.mix), k => k) },
    mixMatrix: mixMatrix(cards),
    regression: regression && { prompts: regression.length, pass: regression.filter(r => r.hits === r.runs).length, list: regression },
    pictures: { needed: need.length, given: need.filter(c => c.hasPicture).length, missing: need.filter(c => !c.hasPicture).map(c => `${at(c)}: ${c.mix.join('+')}`),
      noPictureSubjects: none.length, violations: none.filter(c => c.hasPicture).map(c => `${at(c)}: ${c.mix.join('+')}`),
      present: D.reduce((s, c) => s + c.pictures.length, 0),
      dropped: (k => (k.length ? { known: k.length, count: k.reduce((s, c) => s + c.picturesDropped.length, 0), list: k.filter(c => c.picturesDropped.length).map(c => `${at(c)}: ${c.picturesDropped.join(', ')}`) } : null))(D.filter(c => Array.isArray(c.picturesDropped))),
      content: (j => (j.length ? { judged: j.length, no: j.filter(x => x.content.verdict === 'no').length, list: j.filter(x => x.content.verdict === 'no').map(x => `${x.at}: "${x.caption}" (${x.content.reason})`) } : null))(D.flatMap(c => c.pictures.filter(x => x.content).map(x => ({ ...x, at: at(c) })))) },
    richness: { diagrams: dg.length, sizeMedian: quantile(dg.map(d => d.units), 0.5), graphDiagrams: graph.length, graphOutside3to8: graph.filter(d => d.units < 3 || d.units > 8).length,
      edges: dg.reduce((s, d) => s + d.edges, 0), labelledEdges: dg.reduce((s, d) => s + d.labelledEdges, 0),
      fieldUse: Object.fromEntries(['caption', 'detail', 'highlightPath', 'units', 'point labels'].map(k => [k, dg.filter(d => d.optional.includes(k)).length])),
      labels: dg.reduce((s, d) => s + d.labels, 0), numericLabels: dg.reduce((s, d) => s + d.numericLabels, 0), proseNounBox: dg.filter(d => d.proseNounBox).length,
      quant: { labelled: labelled.length, used: labelled.filter(c => c.quantKind).length, list: labelled.map(c => `${at(c)}: ${c.diagrams.map(d => d.kind).join('+') || 'no diagram'}`) },
      // The 6 quantity prompts (baseline + aiml category "quantity"): a coordinate-plot or bar-chart drawn.
      quantityPlot: { prompts: D.filter(c => c.category === 'quantity').length, withPlot: D.filter(c => c.category === 'quantity' && c.diagrams.some(d => PLOT_KINDS.includes(d.kind))).length, withCorrectPlot: D.filter(c => c.category === 'quantity' && c.diagrams.some(d => PLOT_KINDS.includes(d.kind)) && !c.plotWrong).length },
      binaryLayout: dg.filter(d => d.kind === 'tree' && d.spec?.layout === 'binary').length },
    references: (k => (k.length ? { known: k.length, none: k.filter(c => !c.references.count).length, some: k.filter(c => c.references.count > 0).length } : null))(cards.filter(c => c.references)),
    // Natural diagram width (card width follows it): how many diagrams fit the usual 408 px, need up to 700, up to 960, or more (they scroll); no gate.
    widths: (w => ({ measured: w.length, le408: w.filter(x => x <= 408).length, to700: w.filter(x => x > 408 && x <= 700).length, to960: w.filter(x => x > 700 && x <= 960).length, over960: w.filter(x => x > 960).length, max: w.length ? Math.max(...w) : null }))(dg.map(d => d.width).filter(Number.isFinite)),
    content: { diagrams: dg.length, flagged: dg.filter(d => d.flagged).length, placeholderEdge: dg.filter(d => d.flags.placeholderEdge.length).length, duplicateLabels: dg.filter(d => d.flags.duplicateLabels.length).length,
      nounBoxFlow: dg.filter(d => d.flags.nounBoxFlow).length, bareMaths: dg.filter(d => d.flags.bareMaths.length).length,
      relationships: dg.filter(d => d.kind === 'relationship').length, duplicatedRelationshipNodes: dg.filter(d => d.duplicatedRelationshipNodes.length).length,
      flaggedList: dg.filter(d => d.flagged || d.flags.bareMaths.length || d.duplicatedRelationshipNodes.length).map(d => `${d.at} ${d.kind}: ${[d.flags.placeholderEdge.length ? `placeholder edge ${d.flags.placeholderEdge.map(l => JSON.stringify(l)).join(', ')}` : '', d.flags.duplicateLabels.length ? `duplicate labels ${d.flags.duplicateLabels.join(', ')}` : '', d.flags.nounBoxFlow ? 'noun-box flow' : '', d.flags.bareMaths.length ? `bare maths ${d.flags.bareMaths.map(l => JSON.stringify(l)).join(', ')}` : '', d.duplicatedRelationshipNodes.length ? `duplicated boxes ${d.duplicatedRelationshipNodes.join(', ')}` : ''].filter(Boolean).join('; ')}`),
      kindRight: withKinds.filter(d => d.kindRight).length, kindJudged: withKinds.length,
      formulaLabelCards: n(c => c.diagrams.some(d => d.flags.formulaLabels.length)),
      formulaPrompts: formula.length, formulaPlotOk: formula.filter(c => c.formulaPlotOk).length, formulaWithPlot: formula.filter(c => c.diagrams.some(d => PLOT_KINDS.includes(d.kind))).length,
      plotChecks: (ps => ({ plots: ps.length, checked: ps.filter(d => d.arithmetic.checked).length, unchecked: ps.filter(d => !d.arithmetic.checked).length, points: ps.reduce((s, d) => s + (d.arithmetic.points || 0), 0), errors: ps.reduce((s, d) => s + (d.arithmetic.errors || 0), 0),
        list: ps.map(d => `${d.at} ${d.kind}: ${d.arithmetic.series?.length > 1 ? d.arithmetic.series.map(x => (x.checked ? `${x.label}: ${x.errors}/${x.points} off (${x.formula})` : `${x.label}: not checked (${x.reason})`)).join('; ') : d.arithmetic.checked ? `${d.arithmetic.errors}/${d.arithmetic.points} points off (${d.arithmetic.formula})` : `not checked (${d.arithmetic.reason})`}`) }))(dg.filter(d => d.arithmetic)),
      plots: dg.filter(d => PLOT_KINDS.includes(d.kind)).length, plotsChecked: plots.length, points: plots.reduce((s, d) => s + d.arithmetic.points, 0), pointErrors: plots.reduce((s, d) => s + d.arithmetic.errors, 0),
      arithmeticList: dg.filter(d => d.arithmetic).map(d => `${d.at} ${d.kind}: ${d.arithmetic.checked ? `${d.arithmetic.errors}/${d.arithmetic.points} points off, formula $${d.arithmetic.formula}$` : `not checked (${d.arithmetic.reason})`}`),
      // Verdicts fully / partly / not (faithful-v2, Core line only); faithful-v1 verdicts yes / no are counted as fully / not.
      faithful: judgedF.length ? { judged: judgedF.length, fully: judgedF.filter(d => ['fully', 'yes'].includes(d.faithful.verdict)).length, partly: judgedF.filter(d => d.faithful.verdict === 'partly').length, not: judgedF.filter(d => ['not', 'no'].includes(d.faithful.verdict)).length,
        list: judgedF.filter(d => !['fully', 'yes'].includes(d.faithful.verdict)).map(d => `${d.at} ${d.kind}: ${d.faithful.verdict} (${d.faithful.reason})`) } : null,
      beyond: (j => (j.length ? { judged: j.length, yes: j.filter(d => d.beyond.verdict === 'yes').length, list: j.filter(d => d.beyond.verdict === 'yes').map(d => `${d.at} ${d.kind}: ${d.beyond.reason}`) } : null))(dg.filter(d => d.beyond)) },
    planner: (pl => { if (!pl.length) return null; const jev = pl.filter(c => c.plan.planner === 'jev'), group = cs => ({ cards: cs.length, right: cs.filter(c => c.score === 'right').length, acceptable: cs.filter(c => c.score === 'acceptable').length, wrong: cs.filter(c => c.score === 'wrong').length });
      const dis = jev.filter(c => c.planCheck && !c.planCheck.agree), ok = s => s !== 'wrong';
      return { cards: pl.length, failed: pl.length - jev.length, ms: timing(jev.map(c => c.plan.ms)), pictureOnly: jev.filter(c => !c.plan.kind).length, fixed: group(jev.filter(c => c.plan.kind && c.plan.fixed)), suggested: group(jev.filter(c => c.plan.kind && c.plan.fixed === false)),
        physical: (ph => ({ cards: ph.length, withPicture: ph.filter(c => c.plan.pictures > 0).length, pictureOnly: ph.filter(c => c.plan.pictures > 0 && c.plan.diagrams === 0).length, both: ph.filter(c => c.plan.pictures > 0 && c.plan.diagrams > 0).length, noPicture: ph.filter(c => c.plan.pictures === 0).map(c => c.id), logged: jev.filter(c => c.plan.physicalOverride).length }))(jev.filter(c => c.plan.physical >= 0.7)),
        disagreements: { cards: dis.length, planOnly: dis.filter(c => ok(c.planCheck.planStatus) && !ok(c.planCheck.authorStatus)).length, authorOnly: dis.filter(c => !ok(c.planCheck.planStatus) && ok(c.planCheck.authorStatus)).length, both: dis.filter(c => ok(c.planCheck.planStatus) && ok(c.planCheck.authorStatus)).length, neither: dis.filter(c => !ok(c.planCheck.planStatus) && !ok(c.planCheck.authorStatus)).length,
          list: dis.map(c => `${at(c)}: plan ${c.planCheck.planKind} (${c.planCheck.offered ? 'offered ' + c.planCheck.offered.join(' or ') : 'fixed'}) = ${c.planCheck.planStatus}; author drew ${c.planCheck.drawn.join('+') || 'no diagram'} = ${c.planCheck.authorStatus}`) } }; })(cards.filter(c => c.plan)),
    repairs: { repaired: rep.length, of: cards.length, byCause, corrections: corr, correctionTotal: Object.values(corr).reduce((s, v) => s + v, 0),
      visualFallback: cards.filter(c => c.visualFallback).map(c => `${at(c)}: ${c.visualFallback}`),
      unknownKeysStripped: cards.some(c => c.unknownKeysStripped) ? { events: cards.reduce((s, c) => s + (c.unknownKeysStripped?.events || 0), 0), keys: cards.reduce((s, c) => s + (c.unknownKeysStripped?.keys || 0), 0), cards: cards.filter(c => c.unknownKeysStripped?.events).length } : null,
      rawLogged: cards.filter(c => Array.isArray(c.raw)).length },
    speed: { all: timing(cards.map(c => c.totalMs)), cleanNoPicture: timing(clean.filter(c => !c.hasPicture).map(c => c.totalMs)), cleanPicture: timing(clean.filter(c => c.hasPicture).map(c => c.totalMs)),
      repaired: timing(rep.map(c => c.totalMs)), within4s: cards.filter(c => c.totalMs <= 4000).length, of: cards.length,
      slowest: slow && { at: at(slow), ms: slow.totalMs, repaired: slow.repaired, pictures: slow.pictures.length, causes: slow.repairCauses.map(x => x.cause) } },
    output: { cardsWithLists: n(c => (c.proseLists || 0) > 0), proseListsTotal: D.reduce((s, c) => s + (c.proseLists || 0), 0),
      fields: Object.fromEntries(['title', 'visuals', 'body', 'questions', 'terms'].map(k => [k, mean(D, c => c.output[k])])) },
    tokens: tok.length ? { cards: tok.length, inputMean: mean(tok, c => c.tokens.input), outputMean: mean(tok, c => c.tokens.output), outputP90: quantile(tok.map(c => c.tokens.output), 0.9),
      byKind: Object.fromEntries(Object.entries(byKind).map(([k, cs]) => [k, { cards: cs.length, outputMean: mean(cs, c => c.tokens.output), outputP90: quantile(cs.map(c => c.tokens.output), 0.9), msP50: quantile(cs.map(c => c.totalMs), 0.5), msP90: quantile(cs.map(c => c.totalMs), 0.9) }])) } : null,
    cost: { cards: costed.length, total: +costed.reduce((s, c) => s + c.costUsd, 0).toFixed(4), perCard: costed.length ? +(costed.reduce((s, c) => s + c.costUsd, 0) / costed.length).toFixed(5) : null, sources: tally(costed, c => c.costSource || 'unknown') },
    factual: judged.length ? { judged: judged.length, mean: mean(judged, c => c.judge.factual.score), withErrors: judged.filter(c => c.judge.factual.errors.length).length,
      list: judged.filter(c => c.judge.factual.errors.length).map(c => `${at(c)} (${c.judge.factual.score}): ${c.judge.factual.errors.map(e => e.claim).join(' | ')}`) } : null,
  };
}

// Pass criteria on record (each set file's "pass"). -> [{ set, rule, ok, detail }]
export function criteria(setDef, cards) {
  const p = setDef.pass || {}, out = [], s = summarize(cards), runs = [...new Set(cards.map(c => c.run))].sort((a, b) => a - b);
  const add = (rule, ok, detail) => out.push({ set: setDef.name, rule, ok, detail });
  if (p.kindEveryRun && s.regression) add('best kind in every run', s.regression.pass === s.regression.prompts, s.regression.list.map(r => `${r.id} ${r.kind} ${r.hits}/${r.runs}`).join(', '));
  if (p.rightShare) for (const [id, share] of Object.entries(p.rightShare)) { const cs = cards.filter(c => c.id === id), r = cs.filter(c => c.score === 'right').length; add(`${id} right in >= ${share} of runs`, cs.length > 0 && r / cs.length >= share, `${r}/${cs.length}`); }
  if (p.maxNoPictureViolations !== undefined) add(`picture where none belongs <= ${p.maxNoPictureViolations}`, s.pictures.violations.length <= p.maxNoPictureViolations, `${s.pictures.violations.length}/${s.pictures.noPictureSubjects}`);
  if (p.maxFlaggedPer60Diagrams !== undefined) add(`noun-box or placeholder labels on <= ${p.maxFlaggedPer60Diagrams} of 60 diagrams`, s.content.flagged * 60 <= p.maxFlaggedPer60Diagrams * s.content.diagrams, `${s.content.flagged}/${s.content.diagrams}`);
  if (p.minFormulaPlotsPerRun !== undefined) { const per = runs.map(r => { const f = cards.filter(c => c.run === r && c.category === 'formula'); return [f.filter(c => c.formulaPlotOk).length, f.length]; });
    add(`coordinate-plot or bar-chart with values that recompute on >= ${p.minFormulaPlotsPerRun} of the 8 formula prompts, every run`, per.length > 0 && per.every(([ok, of]) => of === 8 && ok >= p.minFormulaPlotsPerRun), per.map(([ok, of], i) => `r${runs[i]} ${ok}/${of}`).join(', ')); }
  // correct-svg (owner 2026-11-08): per-depth pass line.
  const depths = [...new Set(cards.map(c => c.depth).filter(Boolean))], of = dep => cards.filter(c => c.depth === dep);
  if (p.minRightPerDepth !== undefined) add(`right kind >= ${p.minRightPerDepth}/14 at every depth`, depths.length > 0 && depths.every(dep => of(dep).filter(c => c.score === 'right').length >= p.minRightPerDepth), depths.map(dep => `${dep} ${of(dep).filter(c => c.score === 'right').length}/${of(dep).length}`).join(', '));
  if (p.deepPlots) { const deep = of('deep').filter(c => c.deepPlot), drawn = deep.filter(c => c.diagrams.some(d => PLOT_KINDS.includes(d.kind))), plots = drawn.filter(c => !c.plotWrong), errs = deep.reduce((s, c) => s + c.diagrams.reduce((t, d) => t + (d.arithmetic?.errors || 0), 0), 0);
    add(`deep: plot or chart on >= ${p.deepPlots.min}/6 quantity prompts with ${p.deepPlots.maxPointErrors} point errors`, deep.length > 0 && plots.length >= p.deepPlots.min && errs <= p.deepPlots.maxPointErrors, `${plots.length}/${deep.length}${drawn.length !== plots.length ? ` (${drawn.length} drawn, ${drawn.length - plots.length} with a wrong point)` : ''}, ${errs} point errors`); }
  if (p.maxPlaceholdersPlusDuplicates !== undefined) add(`placeholder + duplicate labels <= ${p.maxPlaceholdersPlusDuplicates} across all cards`, s.content.placeholderEdge + s.content.duplicateLabels <= p.maxPlaceholdersPlusDuplicates, `${s.content.placeholderEdge} + ${s.content.duplicateLabels} of ${s.content.diagrams} diagrams`);
  if (p.overviewFormulaLabels !== undefined) { const o = of('overview').filter(c => c.diagrams.some(d => d.flags.formulaLabels.length)).length; add(`overview: cards with formulas in diagram labels <= ${p.overviewFormulaLabels}`, depths.includes('overview') && o <= p.overviewFormulaLabels, `${o}/${of('overview').length}`); }
  if (p.maxRepairRate !== undefined) add(`repairs <= ${100 * p.maxRepairRate}% (merged baseline)`, s.repairs.of > 0 && s.repairs.repaired / s.repairs.of <= p.maxRepairRate, `${s.repairs.repaired}/${s.repairs.of}`);
  if (p.maxDuplicatedRelationshipNodes !== undefined) add('no duplicated node in any relationship', s.content.duplicatedRelationshipNodes <= p.maxDuplicatedRelationshipNodes, `${s.content.duplicatedRelationshipNodes}/${s.content.relationships} relationship diagrams`);
  return out;
}
