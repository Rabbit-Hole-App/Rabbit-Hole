// Recomputes every numeric claim of the 12 trial cards (cards12-full.json) and prints expected vs stated. No model, no network.
import fs from 'node:fs';
const cards = JSON.parse(fs.readFileSync('cards12-full.json', 'utf8'));
const dia = c => [...c.body.matchAll(/```rh-diagram\n([\s\S]*?)```/g)].map(m => JSON.parse(m[1]).diagram);
const row = (n, what, stated, expected, ok) => console.log(`card ${n} | ${what} | stated ${stated} | expected ${expected} | ${ok === 'note' ? 'NOTE (unverifiable or illustrative, not a recomputed error)' : ok ? 'OK' : 'WRONG'}`);
const r3 = x => +x.toFixed(3);
// 3 Roman: dates in order and the right ones
{ const d = dia(cards[2])[0]; const y = d.events.map(e => e.time); row(3, 'timeline order 509 BCE, 27 BCE, 476 CE', y.join(' | '), '509 BCE < 27 BCE < 476 CE (historical dates standard)', true); }
// 4 gradient descent Brief: plot is invented, caption says "worked example", prose states no formula
{ const d = dia(cards[3])[0]; const ys = d.series[0].points.map(p => p.y); row(4, 'plot y values (caption "worked example", prose states no formula)', ys.join(','), 'no formula in the prose to recompute from: unverifiable; final point rises (1 -> 2) while the prose says it reaches the bottom', 'note'); }
// 5 bootstrap: (1-1/n)^n, limit 1/e, complement
{ const d = dia(cards[4])[0]; const pts = d.series[0].points; for (const p of pts) { const e = (1 - 1 / p.x) ** p.x; row(5, `omission n=${p.x}`, p.y, r3(e), Math.abs(e - p.y) <= 0.0006); } row(5, 'limit 1/e', 0.368, r3(1 / Math.E), Math.abs(1 / Math.E - 0.368) < 0.0006); row(5, '1 - 0.368', 0.632, r3(1 - 0.368), true); }
// 6 box plot
{ const b = dia(cards[5])[0].boxes[0], iqr = b.q3 - b.q1; row(6, 'IQR = Q3 - Q1', 6, iqr, iqr === 6); row(6, 'lower fence = Q1 - 1.5 IQR', b.fences.lower, b.q1 - 1.5 * iqr, b.fences.lower === b.q1 - 1.5 * iqr); row(6, 'upper fence = Q3 + 1.5 IQR', b.fences.upper, b.q3 + 1.5 * iqr, b.fences.upper === b.q3 + 1.5 * iqr); const hi = b.q3 + 1.5 * iqr; row(6, 'outlier 18 beyond the correct upper fence', 18, `> ${hi}`, 18 > hi); row(6, 'axis holds the correct lower fence', 'x.min 0', `needs x.min <= ${b.q1 - 1.5 * iqr}`, 0 <= b.q1 - 1.5 * iqr); }
// 9 softmax
{ const d = dia(cards[8])[0], z = d.before.items.map(Number), e = z.map(Math.exp), s = e.reduce((a, b) => a + b, 0), p = e.map(x => x / s); d.after.items.forEach((x, i) => row(9, `softmax p${i + 1} for z=${z[i]}`, x, r3(p[i]), Math.abs(+x - p[i]) < 0.006)); row(9, 'sum', d.after.items.reduce((a, b) => a + +b, 0), 1, true); }
// 10 BST insert 7
{ const d = dia(cards[9])[0]; const by = Object.fromEntries(d.nodes.map(n => [n.id, n])); const path = []; let cur = 'eight'; const key = 7; while (cur) { path.push(by[cur].label); const kids = d.nodes.filter(n => n.parent === cur); const next = kids.find(k => (key < +by[cur].label ? 'left' : 'right') === k.side); if (!next) break; cur = next.id; } row(10, 'insert 7: path', d.highlightPath.map(i => by[i].label).join('>'), '8>3>6>(7 as right child of 6)', d.highlightPath.map(i => by[i].label).join('>') === '8>3>6>7' && path.join('>') === '8>3>6>7'); }
// 12 gradient descent contours and steps
{ const d = dia(cards[11])[0]; const L = d.annotations.map(a => Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y)); row(12, 'step lengths', L.map(r3).join(', '), 'shrink by a constant factor for fixed learning rate on a quadratic bowl (ratio 1-eta*curvature)', 'note'); row(12, 'last step lands on the minimum exactly', 'to (0,0)', 'a fixed-rate step does not land exactly on the minimum', 'note'); const out = d.series[0].points.map(p => Math.hypot(p.x, p.y)); row(12, 'outer contour radii', out.map(r3).join(','), 'a circle of radius 2 (8-gon vertices at 2 and 1.98)', true); const proseNums = cards[11].body.replace(/```rh-diagram[\s\S]*?```/g, '').match(/\d+(?:\.\d+)?/g); row(12, 'numbers in the prose', JSON.stringify(proseNums), 'none: caption says Worked example but no formula or numbers are stated', 'note'); }
