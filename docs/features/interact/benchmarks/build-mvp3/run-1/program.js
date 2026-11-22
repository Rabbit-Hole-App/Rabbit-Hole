const __name = target => target;
const compute = (function (sdk, P, L, evaluate, keepIndices, curveOf, specOf, splineAt, diameterOf, labelAt) {
function compute(inputs, t) { const L = inputs.length; const g = inputs.gravity; const deg = inputs.release_angle; const mass = 1; const drag = 0; const theta0 = deg * Math.PI / 180; const T0 = 2 * Math.PI * Math.sqrt(L / g); let a = 1; let b = Math.cos(theta0 / 2); for (let i = 0; i < 4; i++) { const na = 0.5 * (a + b); b = Math.sqrt(a * b); a = na; } const period = T0 / a; const frequency = 1 / period; const peak_speed = 2 * Math.sqrt(g * L) * Math.sin(theta0 / 2); const phase = 2 * Math.PI * t / period; const theta = theta0 * Math.cos(phase); const angle = theta * 180 / Math.PI; const v_signed = -peak_speed * Math.sin(phase); const vx = v_signed * Math.cos(theta); const vy = v_signed * Math.sin(theta); const bob_x = L * Math.sin(theta); const bob_y = -L * Math.cos(theta); const scale = 0.2; return { period: period, frequency: frequency, peak_speed: peak_speed, angle: angle, plumb_y: -L, release_x: L * Math.sin(theta0), release_y: -L * Math.cos(theta0), bob_x: bob_x, bob_y: bob_y, vel_tip_x: bob_x + scale * vx, vel_tip_y: bob_y + scale * vy, is_large_angle: deg >= 40, is_long_or_weak: period >= 3.5, is_fast: period <= 2.0 }; }
;
return compute;
})(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined);
const P = {"duration":6,"defaults":{"length":1.8,"gravity":9.8,"release_angle":30},"mapping":{"pxPerUnit":48,"originPx":[164,48]},"parts":[{"type":"line","id":"support_bar","role":"neutral","from":[-1.2,0],"to":[1.2,0]},{"type":"line","id":"plumb_line","role":"neutral","from":[0,0],"to":[0,"plumb_y"]},{"type":"line","id":"release_guide","role":"neutral","from":[0,0],"to":["release_x","release_y"]},{"type":"trace","id":"bob_trace","role":"input","at":["bob_x","bob_y"]},{"type":"line","id":"rod","role":"input","from":[0,0],"to":["bob_x","bob_y"]},{"type":"dot","id":"pivot_dot","role":"neutral","at":[0,0],"size":"small"},{"type":"dot","id":"bob","role":"input","at":["bob_x","bob_y"],"size":"large"},{"type":"arrow","id":"vel_arrow","role":"input","from":["bob_x","bob_y"],"to":["vel_tip_x","vel_tip_y"],"factor":1,"edge":true}],"labels":[{"id":"pivot_label","object":"part.pivot_label","near":"pivot_dot","side":"above","text":"Pivot (1 kg, no drag)","role":"neutral","width":179},{"id":"bob_label","object":"part.bob_label","near":"bob","side":"below","text":"Bob","role":"input","width":28}],"plot":{"title":"Swing angle over time","showTitle":true,"over":"time","x":{"label":"Time","unit":"s"},"y":{"label":"Angle","unit":"deg"},"xRange":[0,6],"yRange":[-60,60],"series":[{"value":"angle","label":"Angle","role":"input"}]},"formula":"T = 2\\pi\\sqrt{L / g}","always":["No drag; 1 kg bob mass cancels out."],"cases":[{"when":"is_large_angle","text":"Wide swing: large-angle period rise"},{"when":"is_long_or_weak","text":"Slow swing from long rod or low g"},{"when":"is_fast","text":"Quick swing from short rod or high g"}],"otherwise":"Moderate swing near small-angle law","quantityIds":["period","frequency","peak_speed","angle","plumb_y","release_x","release_y","bob_x","bob_y","vel_tip_x","vel_tip_y","is_large_angle","is_long_or_weak","is_fast"]}, L = {"stageBounds":[12,12,316,272.8],"figure":{"at":[324,12],"w":304,"h":260.8},"plotGeometry":{"plotArea":{"left":74,"right":280,"top":56,"bottom":200},"x":{"min":0,"max":6,"scale":"linear"},"y":{"min":-60,"max":60,"scale":"linear"},"min":{"width":218,"height":237,"parts":[{"axis":"height","part":"title","px":35},{"axis":"height","part":"top margin and y axis title","px":21},{"axis":"height","part":"plot area","px":120},{"axis":"height","part":"x tick numbers","px":31},{"axis":"height","part":"x axis title","px":30},{"axis":"width","part":"y axis title band and tick numbers","px":74},{"axis":"width","part":"plot area floor","px":120},{"axis":"width","part":"right margin","px":24}]}},"values":[{"value":"period","label":"Period","unit":"s","decimals":2,"box":[12,282,200,28],"dot":[26,296,10],"role":"input"},{"value":"peak_speed","label":"Peak v","unit":"m/s","decimals":2,"box":[12,320.4,200,28],"dot":[26,334.4,10],"role":"input"},{"value":"frequency","label":"Freq","unit":"Hz","decimals":2,"box":[12,358.8,200,28],"dot":[26,372.8,10],"role":"input"}],"formula":{"at":[280,294.8],"align":"start"},"explanation":{"kind":"lines","x":280,"ys":[317.55,335.05]},"bullet":"• "}, NAMED = {"small":12,"medium":24,"large":36};
const keepIndices = function keepIndices(ys, max) {
const n = ys.length, spread = Math.max(...ys) - Math.min(...ys), eps = 1e-9 * (spread || 1), keep = new Set([0, n - 1]);
let last = 0;
for (let i = 1; i < n; i++) { const d = ys[i] - ys[i - 1], sign = Math.abs(d) <= eps ? 0 : d > 0 ? 1 : -1; if (sign !== 0) { if (last !== 0 && sign !== last) keep.add(i - 1); last = sign; } }
let kept = [...keep].sort((a, b) => a - b);
if (kept.length > max) kept = kept.filter((_, k) => k === 0 || k === kept.length - 1 || k % Math.ceil(kept.length / (max - 1)) === 0).slice(0, max - 1).concat(n - 1).filter((v, k, all) => all.indexOf(v) === k);
while (kept.length < max) {
let gap = 0, from = -1;
for (let k = 1; k < kept.length; k++) if (kept[k] - kept[k - 1] > gap) { gap = kept[k] - kept[k - 1]; from = k - 1; }
if (gap < 2) break;
kept.splice(from + 1, 0, kept[from] + Math.floor(gap / 2));
}
return kept;
};
const curveOf = function curveOf(xs, ys, range, max) {
const out = { x: [], y: [] };
for (const i of keepIndices(ys, max)) {
const x = Math.round(xs[i] * 1e6) / 1e6, y = Math.round(Math.min(range[1], Math.max(range[0], ys[i])) * 1e4) / 1e4;
if (out.x.length && x <= out.x[out.x.length - 1]) continue;
out.x.push(x); out.y.push(y);
}
return out;
};
const specOf = function specOf(plot, curves) {
const axis = (a, range) => ({ label: a.label, min: range[0], max: range[1], ...(a.unit ? { unit: a.unit } : {}) });
return { version: 1, diagram: { kind: 'coordinate-plot', title: plot.title, x: axis(plot.x, plot.xRange), y: axis(plot.y, plot.yRange), series: plot.series.map((entry, k) => ({ label: entry.label, kind: 'line', samples: { x: curves[k].x, y: curves[k].y } })) } };
};
const splineAt = function splineAt(xs, ys, t) {
const n = xs.length;
if (n < 2) return ys[0];
const dx = [], s = [], m = [];
for (let i = 1; i < n; i++) { dx.push(xs[i] - xs[i - 1]); s.push((ys[i] - ys[i - 1]) / dx[i - 1]); }
for (let i = 1; i < n - 1; i++) { const l = s[i - 1], r = s[i], sign = Math.sign(l); m.push(sign !== Math.sign(r) ? 0 : sign * Math.min(2 * Math.abs(l), 2 * Math.abs(r), Math.abs((l * dx[i] + r * dx[i - 1]) / (dx[i - 1] + dx[i])))); }
if (n === 2) return ys[0] + (ys[1] - ys[0]) * (t - xs[0]) / dx[0];
m.unshift((3 * s[0] - m[0]) / 2); m.push((3 * s[n - 2] - m[m.length - 1]) / 2);
let i = 0;
while (i < n - 2 && t > xs[i + 1]) i++;
const h = dx[i], u = (t - xs[i]) / h, u2 = u * u, u3 = u2 * u;
return (2 * u3 - 3 * u2 + 1) * ys[i] + (u3 - 2 * u2 + u) * h * m[i] + (3 * u2 - 2 * u3) * ys[i + 1] + (u3 - u2) * h * m[i + 1];
};
const diameterOf = function diameterOf(size, out, named, low, high) { return named[size] !== undefined ? named[size] : low + Math.min(1, Math.max(0, out[size])) * (high - low); };
const labelAt = function labelAt(ext, w, side, gap, obstacles, bounds) {
const up = 5.9, down = 10.8, cx = (ext[0] + ext[2]) / 2, cy = (ext[1] + ext[3]) / 2;
const above = ext[1] - gap - down, below = ext[3] + gap + up, right = ext[2] + gap + w / 2, left = ext[0] - gap - w / 2, middle = cy - 2.45;
const spot = { above: [cx, above], below: [cx, below], right: [right, middle], left: [left, middle], 'above-right': [right, above], 'above-left': [left, above], 'below-right': [right, below], 'below-left': [left, below] }[side];
if (!spot) return null;
const distance = (s, box) => {
const a = { x: s[0], y: s[1] }, b = { x: s[2], y: s[3] }, inside = p => p.x >= box[0] && p.x <= box[2] && p.y >= box[1] && p.y <= box[3];
if (inside(a) || inside(b)) return 0;
const corners = [{ x: box[0], y: box[1] }, { x: box[2], y: box[1] }, { x: box[2], y: box[3] }, { x: box[0], y: box[3] }];
const crosses = (p, q, r, t) => { const d = (q.x - p.x) * (t.y - r.y) - (q.y - p.y) * (t.x - r.x); if (!d) return false; const u = ((r.x - p.x) * (t.y - r.y) - (r.y - p.y) * (t.x - r.x)) / d, v = ((r.x - p.x) * (q.y - p.y) - (r.y - p.y) * (q.x - p.x)) / d; return u >= 0 && u <= 1 && v >= 0 && v <= 1; };
if (corners.some((c, i) => crosses(a, b, c, corners[(i + 1) % 4]))) return 0;
const onSegment = p => { const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy, u = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0; return Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy)); };
const toBox = p => Math.hypot(Math.max(box[0] - p.x, 0, p.x - box[2]), Math.max(box[1] - p.y, 0, p.y - box[3]));
return Math.min(toBox(a), toBox(b), ...corners.map(onSegment));
};
const [x, y] = spot, box = [x - w / 2, y - up, x + w / 2, y + down];
if (box[0] < bounds[0] || box[1] < bounds[1] || box[2] > bounds[2] || box[3] > bounds[3]) return null;
const blocked = obstacles.some(o => (o.s ? distance(o.s, box) < (Math.hypot(o.s[2] - o.s[0], o.s[3] - o.s[1]) < 16 ? 1 : 9) : Math.min(box[2], o.b[2]) - Math.max(box[0], o.b[0]) > -1 && Math.min(box[3], o.b[3]) - Math.max(box[1], o.b[1]) > -1));
return blocked ? null : { x, y };
};
const grid = (a, b, n) => { const out = []; for (let k = 0; k < n; k++) out.push(a + (b - a) * k / (n - 1)); return out; };
const X = x => P.mapping.originPx[0] + x * P.mapping.pxPerUnit, Y = y => P.mapping.originPx[1] - y * P.mapping.pxPerUnit;
export function evaluate({ inputs, time }) {
const t = Math.min(Math.max(time || 0, 0), P.duration), set = { ...P.defaults, ...inputs }, out = compute(set, t), objects = [];
const num = v => (typeof v === 'number' ? v : out[v]), extents = {}, obstacles = [];
const dots = P.parts.filter(part => part.type === 'dot').map(part => ({ x: X(num(part.at[0])), y: Y(num(part.at[1])), r: diameterOf(part.size, out, NAMED, 12, 36) / 2 }));
for (const part of P.parts) {
const id = 'part.' + part.id, opts = { role: part.role };
if (part.type === 'line') { const x1 = X(num(part.from[0])), y1 = Y(num(part.from[1])), x2 = X(num(part.to[0])), y2 = Y(num(part.to[1])); objects.push(sdk.polyline(id, [[x1, y1], [x2, y2]], opts)); extents[part.id] = [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)]; obstacles.push({ s: [x1, y1, x2, y2] }); }
else if (part.type === 'arrow') {
let x1 = X(num(part.from[0])), y1 = Y(num(part.from[1])), x2 = X(num(part.to[0])), y2 = Y(num(part.to[1]));
x2 = x1 + (x2 - x1) * part.factor; y2 = y1 + (y2 - y1) * part.factor;
const whole = Math.hypot(x2 - x1, y2 - y1), dot = part.edge ? dots.find(d => Math.abs(d.x - x1) < 0.01 && Math.abs(d.y - y1) < 0.01) : null;
if (dot) { if (whole < dot.r + 2 + 1) continue; x1 += (x2 - x1) / whole * (dot.r + 2); y1 += (y2 - y1) / whole * (dot.r + 2); }
const length = Math.hypot(x2 - x1, y2 - y1);
let head = null, wings = null;
if (length) { const dx = (x2 - x1) / length, dy = (y2 - y1) / length, back = Math.min(12, length), bx = x2 - dx * back, by = y2 - dy * back; wings = [[bx - dy * 4, by + dx * 4], [x2, y2], [bx + dy * 4, by - dx * 4]]; head = [Math.min(...wings.map(p => p[0])), Math.min(...wings.map(p => p[1])), Math.max(...wings.map(p => p[0])), Math.max(...wings.map(p => p[1]))]; }
if (head && dots.some(d => Math.min(head[2], d.x + d.r) - Math.max(head[0], d.x - d.r) > 0 && Math.min(head[3], d.y + d.r) - Math.max(head[1], d.y - d.r) > 0)) continue;
objects.push(sdk.polyline(id, [[x1, y1], [x2, y2]], opts)); if (wings) objects.push(sdk.polyline(id + '.head', wings, opts)); extents[part.id] = [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)]; obstacles.push({ s: [x1, y1, x2, y2] });
if (head) obstacles.push({ b: head });
}
else if (part.type === 'dot') { const x = X(num(part.at[0])), y = Y(num(part.at[1])), d = diameterOf(part.size, out, NAMED, 12, 36); objects.push(sdk.circle(id, x, y, d, opts)); extents[part.id] = [x - d / 2, y - d / 2, x + d / 2, y + d / 2]; obstacles.push({ b: extents[part.id] }); }
else if (part.type === 'trace' && t > 0) {
const n = Math.min(23, Math.max(1, Math.round(t / P.duration * 23))), points = [];
for (let k = 0; k <= n; k++) { const o = compute(set, t * k / n); points.push([X(o[part.at[0]]), Y(o[part.at[1]])]); }
objects.push(sdk.polyline(id, points, opts)); extents[part.id] = [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
}
}
for (const label of P.labels) {
const ext = extents[label.near]; if (!ext) continue;
const spot = labelAt(ext, label.width, label.side, 12, obstacles, L.stageBounds); if (!spot) continue;
objects.push(sdk.text(label.object, spot.x, spot.y + 4.9, label.text, { align: 'middle', role: label.role }));
obstacles.push({ b: [spot.x - label.width / 2, spot.y - 5.9, spot.x + label.width / 2, spot.y + 10.8] });
}
if (P.plot) {
const plot = P.plot, over = plot.over, xs = over === 'time' ? grid(0, P.duration, 48) : grid(plot.xRange[0], plot.xRange[1], 48), nowX = over === 'time' ? t : set[over];
const rows = xs.map(x => (over === 'time' ? compute(set, x) : compute({ ...set, [over]: x }, t))), curves = plot.series.map(entry => curveOf(xs, rows.map(row => row[entry.value]), plot.yRange, 25));
objects.push(sdk.diagram(specOf(plot, curves), { x: L.figure.at[0], y: L.figure.at[1], w: L.figure.w }));
const G = L.plotGeometry, A = G.plotArea, F = { left: L.figure.at[0] + A.left, right: L.figure.at[0] + A.right, top: L.figure.at[1] + A.top, bottom: L.figure.at[1] + A.bottom };
const nowPx = F.left + (nowX - G.x.min) / (G.x.max - G.x.min) * (F.right - F.left), yPx = y => F.top + (G.y.max - y) / (G.y.max - G.y.min) * (F.bottom - F.top);
objects.push(sdk.line('now', nowPx, F.top, nowPx, F.bottom, { role: 'neutral' }));
plot.series.forEach((entry, k) => objects.push(sdk.circle('dot.' + k, nowPx, yPx(splineAt(curves[k].x, curves[k].y, nowX)), 12, { role: entry.role })));
}
L.values.forEach((entry, k) => {
const unit = !entry.unit ? '' : entry.unit === '°' || entry.unit === '%' ? entry.unit : ' ' + entry.unit;
objects.push(sdk.box('value.' + k, entry.box[0], entry.box[1], entry.box[2], entry.box[3], { role: 'neutral', text: entry.label + ': ' + out[entry.value].toFixed(entry.decimals) + unit }), sdk.circle('chip.' + k, entry.dot[0], entry.dot[1], entry.dot[2], { role: entry.role }));
});
if (L.formula) objects.push(sdk.math('formula', L.formula.at[0], L.formula.at[1] + 5.25, P.formula, { align: L.formula.align, role: 'neutral' }));
const hit = P.cases.find(entry => out[entry.when] === true), lines = [...P.always, ...(hit ? [hit.text] : P.otherwise !== undefined ? [P.otherwise] : [])];
if (L.explanation.kind === 'box') { if (lines.length) objects.push(sdk.box('note', L.explanation.box[0], L.explanation.box[1], L.explanation.box[2], L.explanation.box[3], { role: 'neutral', text: lines[0] })); }
else L.explanation.ys.forEach((cy, k) => { if (lines[k] !== undefined) objects.push(sdk.text('line.' + k, L.explanation.x, cy + 4.9, L.bullet + lines[k], { align: 'start', role: 'neutral' })); });
const quantities = {};
for (const id of P.quantityIds) quantities[id] = typeof out[id] === 'boolean' ? (out[id] ? 1 : 0) : out[id];
return { frame: sdk.frame(objects, { width: 640, height: 400 }), quantities };
}
