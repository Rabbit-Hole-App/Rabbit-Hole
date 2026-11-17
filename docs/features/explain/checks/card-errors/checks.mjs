// Deterministic number/fact consistency checks over saved /explain cards. No model, no network. Pure functions: check(card) -> [{ check, kind, detail }].
// Reuses the bench's own LaTeX-lite formula compiler (scripts/explain-bench/score.mjs compileFormula) for plot recomputation.
import { compileFormula } from 'file:///C:/s/explain-layout-web/scripts/explain-bench/score.mjs';

const NUM = String.raw`[-−]?\d[\d,]*(?:\.\d+)?(?:[eE][-+]?\d+)?`;
const toNum = s => Number(String(s).replace(/,/g, '').replace('−', '-'));
const decimals = s => { const t = String(s).replace(/,/g, '').replace(/[eE].*$/, ''); return (t.split('.')[1] || '').length; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
let EX = null; const ex = n => EX && EX.add(n);
const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const proseOf = body => String(body).replace(/```rh-[a-z-]+\n[\s\S]*?```/g, ' ');
const strings = (o, out = []) => { if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach(x => strings(x, out)); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (!['kind', 'id', 'from', 'to', 'version'].includes(k)) strings(v, out); return out; };
const diagramText = d => strings(d).join(' ');

// ---------------------------------------------------------------- arithmetic in text
const normMath = s => {
  let t = String(s).replace(/\\left|\\right|\\[,;!:]|\\displaystyle|\\mathrm|\\operatorname/g, '').replace(/\\text\{([^{}]*)\}/g, '$1')
    .replace(/\\(?:times|cdot|ast)|[×·⋅]/g, '*').replace(/\\div|÷/g, '/').replace(/[−–‑—]/g, '-').replace(/\\(?:approx|simeq|sim)|[≈≃~]/g, '≈').replace(/\\%/g, '%').replace(/\\ /g, ' ');
  for (let i = 0; i < 12; i++) { const was = t; t = t.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '(($1)/($2))').replace(/\^\s*\{([^{}]*)\}/g, '^($1)').replace(/\\sqrt\s*\{([^{}]*)\}/g, 'sqrt($1)'); if (t === was) break; }
  return t.replace(/\\(?:exp|ln|log)\b/g, m => m.slice(1)).replace(/\{/g, '(').replace(/\}/g, ')');
};
// A numeric expression -> value, or null. Only digits, + - * / ^ ( ), exp ln sqrt, and the constant e as the base of a power.
function evalExpr(raw) {
  let s = String(raw).trim().replace(/,(?=\d{3}\b)/g, '').replace(/(\d)\s+(?=\d)/g, '$1'); // 22 026 -> 22026 is rare; thousands commas removed
  if (!s || /[A-Za-df-zA-Z_\\]/.test(s.replace(/exp|ln|sqrt|\be\b/g, ''))) return null;
  s = s.replace(/\be\^\(([^()]*)\)/g, 'exp($1)').replace(/\be\^(-?\d+(?:\.\d+)?)/g, 'exp($1)').replace(/\be\b/g, '').trim();
  if (/^[+*/^]|[+\-*/^]$/.test(s) || !/\d/.test(s)) return null;
  const js = s.replace(/\^/g, '**').replace(/\b(exp|ln|sqrt)\(/g, (_, f) => ({ exp: 'Math.exp(', ln: 'Math.log(', sqrt: 'Math.sqrt(' })[f]).replace(/(\d)\s*\(/g, '$1*(').replace(/\)\s*(\d)/g, ')*$1').replace(/\)\s*\(/g, ')*(');
  if (!/^[\d\s.+\-*/()]*$/.test(js.replace(/\*\*/g, '*').replace(/Math\.(exp|log|sqrt)/g, ''))) return null;
  try { const v = new Function(`return (${js})`)(); return Number.isFinite(v) ? v : null; } catch { return null; }
}
const hasOperator = s => /[+*/^]|\d\s*-\s*\d|\bexp\b|\bln\b|\bsqrt\b|\)\s*-|\(.*-/.test(s) && !/^\s*-?[\d.,]+\s*%?\s*$/.test(s);
// ulp: the last written digit of the stated value.
function agree(computed, stated, statedText, mode) {
  const d = decimals(statedText), ulp = 10 ** -d, base = mode === 'strict' || d === 0 ? 0.5 : 1; // lenient = 1 unit of the last written decimal (a truncated value passes); an integer must round correctly
  const tol = base * ulp * 1.0001;
  // large integers written to fewer significant figures ("about 22000"): allow the rounding of the leading digits
  const sig = /^\d+$/.test(String(statedText).replace(/[,−-]/g, '')) && Math.abs(stated) >= 1000 && /0{2,}$/.test(String(statedText).replace(/,/g, '')) ? 10 ** (String(Math.abs(stated)).length - 2) : 0;
  return near(computed, stated, Math.max(tol, sig));
}
// LaTeX or plain segments: a chain a = b = c / a ≈ c where at least one term is an expression with an operator and all terms are numeric.
export function mathEquations(text) {
  const out = [];
  for (const m of String(text).matchAll(/\$([^$]+)\$/g)) {
    const src = normMath(m[1]);
    const parts = src.split(/(=|≈)/).map(x => x.trim());
    if (parts.length < 3) continue;
    const terms = parts.filter((_, i) => i % 2 === 0), ops = parts.filter((_, i) => i % 2 === 1);
    out.push({ src: m[1], terms, ops });
  }
  return out;
}
const PLAIN_OP = String.raw`(?:\+|-|−|×|x|\*|/|÷|plus|minus|times|multiplied by|divided by|over)`;
const OPMAP = { plus: '+', minus: '-', times: '*', 'multiplied by': '*', 'divided by': '/', over: '/', '÷': '/', '×': '*', x: '*', '−': '-' };
const PLAIN_EQ = new RegExp(String.raw`(?<![.,/^+×*÷=-]\s{0,2})(?<![\w.,/^-])(${NUM})\s*(${PLAIN_OP})\s*(${NUM})\s*(?:=|≈|is about|is roughly|is approximately|is close to|is|gives|give|equals|makes|comes to|yields|→)\s*(?:about |roughly |approximately |around |≈ )?(${NUM})(?![\d]*\s*(?:\^|[-+*/×]\s*\d))`, 'gi');
const EXP_EQ = new RegExp(String.raw`\be\s*\^\s*\{?\s*(${NUM})\s*\}?\s*(?:=|≈|is about|is roughly|is approximately|is close to|is|gives|equals)\s*(?:about |roughly |approximately |around |≈ )?(${NUM})`, 'gi');
const OUTOF = new RegExp(String.raw`(${NUM})\s+(?:out of|of the)\s+(${NUM})[^.;\n]{0,45}?(${NUM})\s*(?:%|percent)`, 'gi');
export function arithmeticFlags(text, stats = {}) {
  const flags = [];
  for (const eq of mathEquations(text)) {
    const vals = eq.terms.map(t => { const pct = /%\s*$/.test(t); const v = evalExpr(t.replace(/%\s*$/, '')); return v === null ? null : { v, pct, t: t.replace(/%\s*$/, '') }; });
    if (vals.some(v => v === null)) continue;
    if (!eq.terms.some((t, i) => hasOperator(t.replace(/%\s*$/, '')))) continue;
    stats.latex = (stats.latex || 0) + 1;
    for (let i = 1; i < vals.length; i++) {
      const a = vals[i - 1], b = vals[i];
      if (!hasOperator(a.t) && !hasOperator(b.t)) continue;
      const lit = !hasOperator(b.t) ? b : !hasOperator(a.t) ? a : null, other = lit === b ? a : b;
      // a term written with % is a share: compare as written, as a fraction, and as a percent (the author may write 0.368 = 36.8%)
      const okOf = mode => (lit ? [[other.v, lit.v], [other.v * 100, lit.v], [other.v, lit.v / 100]].some(([x, y], i) => (i === 0 || lit.pct || other.pct) && agree(x, y, lit.t, mode)) : near(a.v, b.v, 1e-6 * Math.max(1, Math.abs(a.v))));
      if (!okOf('lenient')) flags.push({ type: 'wrong', text: eq.src, computed: other.v, stated: lit ? lit.v : null });
      else if (!okOf('strict')) flags.push({ type: 'imprecise', text: eq.src, computed: other.v, stated: lit ? lit.v : null });
    }
  }
  const plain = String(text).replace(/\$[^$]*\$/g, ' ').replace(/[−–]/g, '-');
  for (const m of plain.matchAll(PLAIN_EQ)) {
    const [whole, a, op, b, c] = m;
    const o = OPMAP[op.toLowerCase()] || op, A = toNum(a), B = toNum(b);
    const v = o === '+' ? A + B : o === '-' ? A - B : o === '*' ? A * B : B === 0 ? NaN : A / B;
    if (!Number.isFinite(v)) continue;
    stats.plain = (stats.plain || 0) + 1;
    const stated = toNum(c);
    const ok = mode => agree(v, stated, c, mode) || agree(v * 100, stated, c, mode) && /%|percent/.test(plain.slice(m.index, m.index + whole.length + 10));
    if (!ok('lenient')) flags.push({ type: 'wrong', text: whole.trim(), computed: v, stated }); else if (!ok('strict')) flags.push({ type: 'imprecise', text: whole.trim(), computed: v, stated });
  }
  for (const m of plain.matchAll(EXP_EQ)) {
    const v = Math.exp(toNum(m[1])), stated = toNum(m[2]);
    if (!agree(v, stated, m[2], 'lenient') && !near(v, stated, 0.01 * Math.abs(v) && /0{2,}$/.test(m[2]) ? 0.01 * Math.abs(v) : 0)) flags.push({ type: 'wrong', text: m[0].trim(), computed: v, stated });
  }
  for (const m of plain.matchAll(OUTOF)) {
    const a = toNum(m[1]), b = toNum(m[2]), p = toNum(m[3]);
    if (b > 0 && a <= b) { const v = (a / b) * 100; if (!agree(v, p, m[3], 'lenient') && !near(v, p, 0.5)) flags.push({ type: 'wrong', text: m[0].trim(), computed: v, stated: p }); }
  }
  return flags;
}

// ---------------------------------------------------------------- per-kind checks
const unitSum = (txt) => /softmax|probability distribution|class probabilit|sum(?:s)? (?:to|up to|of) (?:exactly )?(?:1\b|one\b|100)|add(?:s)? up to (?:1\b|one\b|100)|proportions?\b|fractions? of|attention weights?|(?:each|per|every)[^.]{0,40}(?:sums?|totals?|adds?)[^.]{0,20}(?:1\b|100)|totals? 100/i.test(txt);
const rowsOf = d => d.rows ?? [];
function checkBox(d, prose, flags) {
  const txt = `${prose} ${diagramText(d)}`;
  for (const b of d.boxes ?? []) {
    const iqr = b.q3 - b.q1, lo = b.q1 - 1.5 * iqr, hi = b.q3 + 1.5 * iqr;
    const kmul = (txt.match(/(\d+(?:\.\d+)?)\s*(?:×|x|\*|times|\\times)\s*(?:the\s*)?IQR/i) || [])[1];
    const k = kmul ? Number(kmul) : 1.5;
    if (b.fences) {
      ex('box-fence-arithmetic');
      const L = b.q1 - k * iqr, U = b.q3 + k * iqr, tol = 0.05 * Math.max(iqr, 1);
      if (!near(b.fences.lower, L, tol) || !near(b.fences.upper, U, tol)) flags.push({ check: 'box-fence-arithmetic', detail: `fences ${b.fences.lower} / ${b.fences.upper} stated; Q1 ${b.q1}, Q3 ${b.q3}, IQR ${iqr}, ${k} x IQR gives ${L} / ${U}` });
    }
    const F = b.fences ? { lower: b.q1 - k * iqr, upper: b.q3 + k * iqr } : { lower: lo, upper: hi };
    for (const o of b.outliers ?? []) if (o.value >= F.lower && o.value <= F.upper) flags.push({ check: 'box-outlier-inside-correct-fence', detail: `outlier ${o.value} lies inside the correct fences ${F.lower} / ${F.upper}` });
    for (const w of ['whiskerLow', 'whiskerHigh']) if ((w === 'whiskerLow' && b[w] < F.lower) || (w === 'whiskerHigh' && b[w] > F.upper)) flags.push({ check: 'box-whisker-beyond-correct-fence', detail: `${w} ${b[w]} beyond the correct fence ${F.lower} / ${F.upper}` });
  }
}
function checkBar(d, prose, flags) {
  const txt = `${prose} ${diagramText(d)}`;
  const bars = d.bars ?? [];
  if (!bars.length && d.series?.length) { // grouped or stacked: each series is one distribution
    if (!unitSum(`${d.title} ${d.caption ?? ''} ${d.unit ?? ''}`)) return;
    const pctG = /%|percent/i.test(`${d.unit ?? ''} ${d.title} ${d.caption ?? ''}`);
    for (const sr of d.series) { const v = sr.values, sum = v.reduce((a, b) => a + b, 0), n = v.length; ex('bars-sum');
      if (v.every(x => x >= 0 && x <= 1) && !near(sum, 1, Math.max(0.02, n * 0.005))) flags.push({ check: 'bars-should-sum-to-1', detail: `series ${sr.label}: ${v.join(', ')} sum to ${+sum.toFixed(4)}, text says a distribution` });
      else if (pctG && sum > 1.5 && !near(sum, 100, Math.max(2, n * 0.5))) flags.push({ check: 'bars-should-sum-to-100', detail: `series ${sr.label}: ${v.join(', ')} sum to ${+sum.toFixed(2)}, text says percent shares` }); }
    return;
  }
  if (!bars.length) return;
  const vals = bars.map(b => b.value), sum = vals.reduce((a, b) => a + b, 0), n = vals.length;
  const pct = /%|percent/i.test(`${d.unit ?? ''} ${d.title} ${d.caption ?? ''}`);
  if (unitSum(`${d.title} ${d.caption ?? ''} ${d.unit ?? ''}`) || /(?:sum(?:s)?|add(?:s)? up) (?:to )?(?:exactly )?(?:1|one|100)\b/i.test(prose) && /probab|share|proportion|fraction/i.test(`${d.title} ${d.caption ?? ''}`)) {
    ex('bars-sum');
    if (vals.every(v => v >= 0 && v <= 1) && !near(sum, 1, Math.max(0.02, n * 0.005))) flags.push({ check: 'bars-should-sum-to-1', detail: `values ${vals.join(', ')} sum to ${+sum.toFixed(4)}, text says a distribution/proportion` });
    else if (pct && vals.every(v => v >= 0) && sum > 1.5 && !near(sum, 100, Math.max(2, n * 0.5))) flags.push({ check: 'bars-should-sum-to-100', detail: `values ${vals.join(', ')} sum to ${+sum.toFixed(2)}, text says percent shares` });
  }
  if (pct && /%/.test(d.unit ?? '') && vals.some(v => v > 100 || v < 0)) flags.push({ check: 'percent-out-of-range', detail: `percent bars ${vals.join(', ')}` });
}
function checkTransformation(d, flags) {
  // an item is a number only when it is one (optionally after "z_1 =" or "Score:" and with $ or %); "h1", "p_1" and "z_1" are not
  const num = a => (a?.items ?? []).map(x => { if (typeof x !== 'string') return NaN; const t = x.replace(/\$/g, '').split(/[=:]/).pop().trim().replace(/−/g, '-'); const m = t.match(/^(-?\d+(?:\.\d+)?)\s*(%?)$/); return m ? Number(m[1]) / (m[2] ? 100 : 1) : NaN; });
  const b = num(d.before), a = num(d.after);
  const txt = `${d.title} ${d.operation} ${d.after?.label} ${d.caption ?? ''}`;
  if (a.length && a.every(Number.isFinite) && /softmax|probabilit/i.test(txt)) {
    ex('probabilities-sum'); const sum = a.reduce((x, y) => x + y, 0); if (!near(sum, 1, Math.max(0.02, a.length * 0.005))) flags.push({ check: 'probabilities-should-sum-to-1', detail: `after items ${a.join(', ')} sum to ${+sum.toFixed(4)}` });
    if (/softmax/i.test(txt) && b.length === a.length && b.every(Number.isFinite)) {
      ex('softmax-recompute'); const m = Math.max(...b), e = b.map(x => Math.exp(x - m)), z = e.reduce((x, y) => x + y, 0), p = e.map(x => x / z);
      if (!p.every((x, i) => near(x, a[i], 0.011))) flags.push({ check: 'softmax-recompute', detail: `softmax(${b.join(', ')}) = ${p.map(x => +x.toFixed(3)).join(', ')}, card states ${a.join(', ')}` });
    }
  }
}
function checkHeatmap(d, prose, flags) {
  const txt = `${d.title} ${d.caption ?? ''} ${d.rowLabel ?? ''} ${d.columnLabel ?? ''}`;
  if (!/attention weight|softmax|probabilit|normali[sz]ed|weights? sum/i.test(txt)) return;
  const R = rowsOf(d), cells = R.flatMap(r => r.cells).filter(v => v !== null);
  if (!cells.length || cells.some(v => v < 0 || v > 1)) return;
  ex('heatmap-sum'); const tol = 0.02 + 0.005 * (d.columns?.length ?? 0);
  const rowsOk = R.every(r => { const s = r.cells.reduce((a, v) => a + (v ?? 0), 0); return near(s, 1, tol); });
  const colsOk = (d.columns ?? []).every((_, j) => near(R.reduce((a, r) => a + (r.cells[j] ?? 0), 0), 1, tol));
  if (!rowsOk && !colsOk) flags.push({ check: 'heatmap-weights-should-sum-to-1', detail: `row sums ${R.map(r => +r.cells.reduce((a, v) => a + (v ?? 0), 0).toFixed(3)).join(', ')}` });
}
function yearOf(t) { const m = String(t).trim().match(/^(?:c\.\s*)?(\d{1,4})\s*(BCE|BC|CE|AD)?$/i); if (!m) return null; const y = Number(m[1]); return /^(BCE|BC)$/i.test(m[2] ?? '') ? -y : y; }
function checkTimeline(d, flags) {
  const ev = d.events ?? []; if (ev.length < 2) return;
  const ys = ev.map(e => yearOf(e.time)); if (ys.some(y => y === null)) return;
  ex('timeline-order');
  for (let i = 1; i < ys.length; i++) if (ys[i] < ys[i - 1]) { flags.push({ check: 'timeline-out-of-order', detail: `${ev[i - 1].time} then ${ev[i].time}` }); break; }
}
function checkWaterfall(d, prose, flags) {
  const end = d.opening + d.changes.reduce((a, c) => a + c.amount, 0);
  const m = prose.match(new RegExp(String.raw`(?:clos|end|final|total|balance|left|result)[a-z]*[^.\d]{0,40}?(${NUM})`, 'i'));
  if (m) { ex('waterfall-closing'); const v = toNum(m[1]); if (!near(v, end, 0.01 * Math.max(1, Math.abs(end))) && Math.abs(v) > 0 && decimals(m[1]) <= 2 && !near(v, d.opening, 1e-9)) flags.push({ check: 'waterfall-closing-mismatch', detail: `opening ${d.opening} + changes = ${+end.toFixed(2)}, prose near closing says ${m[1]}` }); }
}
function checkTAccount(d, prose, flags) {
  const dr = d.debits.reduce((a, c) => a + c.amount, 0), cr = d.credits.reduce((a, c) => a + c.amount, 0);
  if (/balanced|debits? (?:equal|=)|totals? (?:match|equal)/i.test(`${prose} ${d.title} ${d.caption ?? ''}`) && !near(dr, cr, 0.005)) flags.push({ check: 't-account-unbalanced', detail: `debits ${dr}, credits ${cr}, text says balanced` });
}
function checkBootstrap(d, flags) {
  for (const g of d.groups ?? []) if (g.replacement && /bootstrap/i.test(`${d.title} ${d.caption ?? ''} ${g.label}`) && (ex('bootstrap-draw-count'), true) && g.members.length !== (d.samples ?? []).length) flags.push({ check: 'bootstrap-draw-count-not-n', detail: `bootstrap sample has ${g.members.length} draws from ${d.samples.length} rows` });
}
function checkHistogram(d, flags) {
  if (d.measure !== 'count') return;
  const txt = `${d.caption ?? ''} ${d.title}`;
  const m = txt.match(/(?:values?|data|observations?|raw|sample)[^:]*:\s*((?:-?\d+(?:\.\d+)?\s*,\s*)+-?\d+(?:\.\d+)?)/i); if (!m) return;
  ex('histogram-counts'); const xs = m[1].split(',').map(Number), E = d.binEdges, counts = E.slice(1).map((_, i) => xs.filter(x => x >= E[i] && (i === E.length - 2 ? x <= E[i + 1] : x < E[i + 1])).length);
  for (const s of d.series) if (s.values.length === counts.length && xs.length === s.values.reduce((a, b) => a + b, 0) && !counts.every((c, i) => c === s.values[i])) flags.push({ check: 'histogram-counts-vs-listed-values', detail: `listed values bin to ${counts.join(', ')}, chart ${s.values.join(', ')}` });
}
const DOWN = /\b(loss|cost|error|objective|mse|risk|residual|cross[- ]?entropy|perplexity|temperature gap|training loss)\b/i;
const NOT_DOWN = /valid|test|held|dev\b|generali[sz]|overfit|u-shaped|bias|variance|noisy|stochastic|spike|diverg|oscillat|too large|too high|large (?:learning|step)|unstable/i;
const UP = /cumulative|cdf|accumulated|running total/i;
function checkPlot(d, prose, flags) {
  const ctx = `${d.title} ${d.caption ?? ''} ${prose}`;
  for (const s of d.series ?? []) {
    const pts = s.points; if (!pts || pts.length < 3 || s.kind !== 'line') continue;
    const sortedX = pts.every((p, i) => !i || p.x >= pts[i - 1].x); if (!sortedX) continue;
    const label = `${s.label} ${d.y?.label ?? ''}`;
    if (DOWN.test(label) && /epoch|iter|step|round|time|update|trees|boost/i.test(d.x?.label ?? '')) ex('loss-monotone');
    if (DOWN.test(label) && !NOT_DOWN.test(`${s.label} ${d.title} ${d.caption ?? ''}`) && /epoch|iter|step|round|time|update|trees|boost/i.test(d.x?.label ?? '') && !pts.every((p, i) => !i || p.y <= pts[i - 1].y + 1e-9)) flags.push({ check: 'loss-curve-not-monotone', detail: `${s.label}: y ${pts.map(p => p.y).join(', ')}` });
    if (UP.test(label) && !pts.every((p, i) => !i || p.y >= pts[i - 1].y - 1e-9)) flags.push({ check: 'cumulative-not-monotone', detail: `${s.label}: y ${pts.map(p => p.y).join(', ')}` });
    if (/probab/i.test(`${s.label} ${d.y?.label ?? ''}`) && pts.some(p => p.y < 0 || p.y > 1)) flags.push({ check: 'probability-out-of-0-1', detail: `${s.label}: y ${pts.map(p => p.y).join(', ')}` });
  }
}
// Plot recomputation: every $...$ of the card's prose and diagram captions is a candidate one-variable formula (the bench only reads "f(x) = ..."; this also reads a bare formula).
const offBy = (c, pts) => pts.map(([x, y]) => { const e = c.f(x); return Number.isFinite(e) ? Math.abs(y - +e.toFixed(decimals(y))) > 0.01 : null; }).filter(e => e !== null);
function formulaCandidates(text) {
  const cands = [];
  for (const m of String(text).matchAll(/\$([^$]+)\$/g)) for (const part of m[1].split('=')) { const c = compileFormula(part); if (c) cands.push({ formula: part.trim(), ...c }); }
  return cands;
}
export function plotRecompute(d, text) {
  const series = d.kind === 'coordinate-plot' ? (d.series ?? []).filter(s => s.points?.length >= 3).map(s => ({ label: s.label, pts: s.points.map(p => [p.x, p.y]) })) : [];
  if (!series.length) return null;
  const cands = formulaCandidates(text); if (!cands.length) return null;
  const out = [];
  for (const s of series) {
    let best = null;
    for (const c of cands) { const bad = offBy(c, s.pts); if (bad.length >= 3 && (!best || bad.filter(Boolean).length / bad.length < best.errors / best.points)) best = { formula: c.formula, points: bad.length, errors: bad.filter(Boolean).length }; }
    // a series that follows the formula on at least 4 points and 2/3 of them and misses some: an arithmetic slip, not another curve (3 of 5 matching points are a coincidence: entropy vs 2p(1-p)). A bare symbol or a number is not a formula.
    if (best && best.points - best.errors >= 4 && best.errors / best.points <= 1 / 3 && /[+\-*/^]|exp|log|sqrt|sin|cos|tanh|frac/.test(best.formula)) out.push({ label: s.label, ...best });
  }
  return out.length ? out : null;
}
// Same label, different value: a label of the diagram followed in the prose by a number that is not the diagram's value for it.
function labelValues(d) {
  const out = [];
  const add = (label, value) => { if (label && Number.isFinite(value) && String(label).length >= 2) out.push([String(label), value]); };
  switch (d.kind) {
    case 'bar-chart': (d.bars ?? []).forEach(b => add(b.label, b.value)); break;
    case 'number-line': (d.markers ?? []).forEach(m => add(m.label, m.value)); break;
    case 'box-plot': (d.boxes ?? []).forEach(b => { add('Q1', b.q1); add('Q3', b.q3); add('median', b.median); add('IQR', b.q3 - b.q1); if (b.fences) { add('lower fence', b.fences.lower); add('upper fence', b.fences.upper); } (b.outliers ?? []).forEach(o => add(o.label, o.value)); }); break;
    case 'waterfall': add('opening', d.opening); (d.changes ?? []).forEach(c => add(c.label, c.amount)); break;
    case 't-account': [...d.debits, ...d.credits].forEach(c => add(c.label, c.amount)); break;
    case 'coordinate-plot': (d.annotations ?? []).forEach(a => { if (a.kind === 'reference-line') add(a.label, a.value); }); break;
    case 'histogram': (d.markers ?? []).forEach(m => add(m.label, m.value)); break;
  }
  return out;
}
export function labelMismatches(d, prose) {
  const out = [];
  for (const [label, value] of labelValues(d)) {
    const re = new RegExp(String.raw`(?<![A-Za-z0-9])${esc(label)}(?![A-Za-z0-9])[\s:=≈(]{0,3}(?:(?:is|are|of|at|equals?|about|around|roughly|≈|=|:)[\s:=≈(]{0,3}){0,3}\$?(${NUM})(?!\s*(?:-|–|—|to)\s*\d)`, 'gi');
    for (const m of prose.replace(/(?<=\s)[–−](?=\d)/g, '-').matchAll(re)) {
      const v = toNum(m[1]), ok = near(v, value, Math.max(1e-6, 0.5 * 10 ** -decimals(m[1]) * 1.0001)) || near(v, value * 100, 0.51) || near(v / 100, value, 0.0051);
      if (!ok && !/^\d{4}$/.test(m[1])) out.push({ label, diagram: value, prose: v, text: m[0] });
    }
  }
  return out;
}

export function checkCard(card) {
  EX = new Set();
  const flags = [], prose = proseOf(card.body), P = String(prose).replace(/\n+/g, ' ');
  const dtexts = card.diagrams.map(diagramText);
  const textAll = [P, ...dtexts].join(' \n ');
  const st = {}; const af = arithmeticFlags(textAll, st); if (st.latex || st.plain) ex('arithmetic-statement');
  for (const a of af) if (a.type === 'wrong') flags.push({ check: 'arithmetic-statement', kind: 'text', detail: `${a.text} (computed ${+Number(a.computed).toPrecision(6)}, stated ${a.stated})` });
  for (const d of card.diagrams) {
    const f = [];
    switch (d.kind) {
      case 'box-plot': checkBox(d, P, f); break;
      case 'bar-chart': checkBar(d, P, f); break;
      case 'transformation': checkTransformation(d, f); break;
      case 'heatmap': checkHeatmap(d, P, f); break;
      case 'timeline': checkTimeline(d, f); break;
      case 'waterfall': checkWaterfall(d, P, f); break;
      case 'sample-set': checkBootstrap(d, f); break;
      case 'histogram': checkHistogram(d, f); break;
      case 'coordinate-plot': checkPlot(d, P, f); break;
    }
    if (d.kind === 'coordinate-plot') {
      const r = plotRecompute(d, [P, diagramText(d)].join(' '));
      for (const s of r ?? []) ex('plot-recompute');
      for (const s of r ?? []) if (s.errors) flags.push({ check: 'plot-point-off-formula', kind: d.kind, detail: `${s.label}: ${s.errors}/${s.points} points off ${s.formula}` });
    }
    if (labelValues(d).some(([l]) => new RegExp(String.raw`(?<![A-Za-z0-9])${esc(l)}(?![A-Za-z0-9])`, 'i').test(P))) ex('label-value-vs-prose');
    for (const m of labelMismatches(d, P)) flags.push({ check: 'label-value-vs-prose', kind: d.kind, detail: `${m.label}: diagram ${m.diagram}, prose "${m.text}"` });
    for (const x of f) flags.push({ ...x, kind: d.kind });
  }
  flags.examined = [...EX]; EX = null;
  return flags;
}
export const numericKinds = new Set(['coordinate-plot', 'bar-chart', 'histogram', 'box-plot', 'heatmap', 'sample-set', 'waterfall', 't-account', 'number-line', 'timeline', 'tensor', 'token-links', 'transformation', 'matrix', 'figure']);
// A diagram "carries numbers" when its spec holds numeric data (not merely a kind): plots, bars, histograms, box plots, heatmaps, waterfall, t-account, number-line, token-links weights, tensor values, and any other diagram whose visible text contains a digit.
export function carriesNumbers(d) {
  if (['coordinate-plot', 'bar-chart', 'histogram', 'box-plot', 'heatmap', 'waterfall', 't-account', 'number-line', 'token-links', 'tensor'].includes(d.kind)) return true;
  if (d.kind === 'sample-set') return (d.samples ?? []).some(s => s.weight !== undefined) || (d.groups ?? []).some(g => g.replacement);
  if (d.kind === 'timeline') return (d.events ?? []).some(e => yearOf(e.time) !== null);
  const numeric = x => typeof x === 'string' && /^\s*\$?-?\d+(?:\.\d+)?\s*%?\$?\s*$/.test(x);
  if (d.kind === 'transformation') return [...(d.before?.items ?? []), ...(d.after?.items ?? [])].some(x => numeric(String(x).split(/[=:]/).pop()));
  if (d.kind === 'matrix') return (d.rows ?? []).flatMap(r => r.cells ?? []).filter(numeric).length >= 3;
  return false;
}
