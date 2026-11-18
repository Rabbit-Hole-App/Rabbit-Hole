// Section 6b checks: the card-errors checks UNMODIFIED (old classifiers, so numbers compare with section 6), plus the three 154 rules as independent re-implementations
// of the branch's validator rules (spec.js checkSoftmaxList incl. the rounding clause, ml-statistical-spec.js bootstrap draw count and whisker-inside-stated-fences).
// New flags carry a check name ending in '-154' and are returned separately: checkCard6b(card) -> { old: [...], new: [...] }.
import { checkCard } from 'file:///C:/s/sprint2-evidence/card-errors/checks.mjs';
const listNumber = item => {
  if (typeof item !== 'string') return null;
  const m = item.replace(/\$/g, '').split(/[=:]/).pop().trim().replace(/−/g, '-').match(/^(-?\d+(?:\.(\d+))?)\s*(%?)$/);
  if (!m) return null;
  const places = (m[2] ?? '').length, scale = m[3] ? 100 : 1;
  return { value: Number(m[1]) / scale, half: 0.5 * 10 ** -places / scale, text: m[1] + m[3] };
};
const SOFTMAX_OFF = /temperature|scaled|scaling|masked|causal|log[- ]?softmax/i, SOFTMAX_T = /\bT\s*=/;
function softmax154(d, out) {
  if (!/softmax/i.test(`${d.title} ${d.operation}`)) return;
  const before = (d.before?.items ?? []).map(listNumber), after = (d.after?.items ?? []).map(listNumber);
  if (!before.length || before.length !== after.length || [...before, ...after].some(x => !x)) return;
  const labels = [d.title, d.caption, d.operation, d.before?.label, d.after?.label, ...(d.links ?? []).map(l => l.label)].filter(Boolean).join(' ');
  if (SOFTMAX_OFF.test(labels) || SOFTMAX_T.test(labels)) {
    const sum = after.reduce((s, x) => s + x.value, 0), slack = after.reduce((s, x) => s + x.half, 0);
    if (/probabilit/i.test(`${d.title} ${d.caption ?? ''}`) && Math.abs(sum - 1) > slack + 1e-9) out.push({ check: 'softmax-sum-gated-154', kind: d.kind, detail: `gated card, after values ${after.map(x => x.text).join(' + ')} = ${+sum.toFixed(6)}, not 1` });
    return;
  }
  const top = Math.max(...before.map(x => x.value)), e = before.map(x => Math.exp(x.value - top)), z = e.reduce((s, x) => s + x, 0), p = e.map(x => x / z);
  const off = units => after.some((x, i) => Math.abs(p[i] - x.value) > units * x.half + 1e-9);
  const roundedToOne = Math.abs(after.reduce((s, x) => s + x.value, 0) - 1) <= 1e-9 && !off(2);
  if (off(1) && !roundedToOne) out.push({ check: 'softmax-recompute-154', kind: d.kind, detail: `softmax(${before.map(x => x.text).join(', ')}) = ${p.map(x => +x.toFixed(3)).join(', ')}, card states ${after.map(x => x.text).join(', ')}` });
}
function bootstrap154(d, out) {
  if (d.kind !== 'sample-set') return;
  const words = [d.title, d.caption, ...(d.groups ?? []).map(g => g.label), ...(d.samples ?? []).flatMap(s => [s.label, s.class])].filter(Boolean).join(' ');
  if (!(/bootstrap/i.test(words) && !/m[- ]out[- ]of[- ]n|subsample/i.test(words))) return;
  for (const g of d.groups ?? []) if (g.replacement && g.members.length !== d.samples.length) out.push({ check: 'bootstrap-draw-count-154', kind: d.kind, detail: `bootstrap draws ${g.members.length} from n = ${d.samples.length} rows` });
}
function whisker154(d, out) {
  if (d.kind !== 'box-plot') return;
  for (const b of d.boxes ?? []) {
    if (!b.fences) continue;
    const { lower, upper } = b.fences, places = Math.max(0, ...[b.q1, b.q3, lower, upper].map(v => (String(v).split('.')[1] ?? '').length));
    if (lower - b.whiskerLow > 0.5 * 10 ** -places + 1e-9 || b.whiskerHigh - upper > 0.5 * 10 ** -places + 1e-9) out.push({ check: 'whisker-outside-stated-fence-154', kind: d.kind, detail: `whiskers ${b.whiskerLow}..${b.whiskerHigh} outside stated fences ${lower}..${upper}` });
  }
}
export function checkCard6b(card) {
  const old = checkCard(card), nw = [];
  for (const d of card.diagrams) { softmax154(d, nw); bootstrap154(d, nw); whisker154(d, nw); }
  return { old, new: nw, examined: old.examined ?? [] };
}
export { carriesNumbers } from 'file:///C:/s/sprint2-evidence/card-errors/checks.mjs';
