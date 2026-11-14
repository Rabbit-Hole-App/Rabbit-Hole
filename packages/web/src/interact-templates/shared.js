// What every template program shares (the programs are generated source for the sandboxed QuickJS engine, sdk-8 helpers only): the number format, the kinematic read-out of one body from the plan's own
// formulas, and the JSON a template embeds so no word or number the plan or the template owns is typed inside drawing code.
// A template module exports { roles, states(W), source(ctx) }; generate.js (generateProgram) builds ctx from the approved plan and calls it. Product code, derived from the hand-written toss programs the owner
// approved on canvas (interact-toss-programs.js stays as that reference, and the tests prove frame equality against it).

export const J = value => JSON.stringify(value);

// ctx.q: { quantityId: 'js expression over inputs, t' } already built; ctx.end: 'js expression over inputs'; ctx.slots: role -> quantity id.
// -> the source head: constants, the quantity table Q, END and motion(inputs, time) for the body described by `slots` ({ height, velocity, acceleration }).
export function head(ctx, body) {
  const q = Object.entries(ctx.q).map(([id, js]) => `  ${J(id)}: (inputs, t) => { const { ${ctx.inputIds.join(', ')} } = inputs; return ${js}; },`).join('\n');
  return String.raw`
const EPS = 1e-8;
const sg = (v, d) => { const a = Math.abs(v); if (a < 0.5 * Math.pow(10, -d)) return (0).toFixed(d); return (v < 0 ? '−' : '+') + a.toFixed(d); };
const snap = x => Math.abs(x) < 1e-9 ? 0 : x;
const Q = {
${q}
};
const quantities = (inputs, time) => { const end = END(inputs), t = Math.min(Math.max(time, 0), end), out = {}; for (const id in Q) out[id] = snap(Q[id](inputs, t)); return out; };
const END = inputs => { const { ${ctx.inputIds.join(', ')} } = inputs; return ${ctx.end}; };
// One body: heights are read above its launch height (its height at time 0), time is held inside the timeline. The top is where its velocity crosses zero (found by bisection on the plan's own
// velocity formula, so no quantity has to name it); a body whose velocity never starts positive has its top at time 0.
const topOf = (inputs, end) => {
  const v = Q[${J(body.velocity)}];
  if (v(inputs, 0) <= 0) return 0;
  let lo = 0, hi = end;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (v(inputs, mid) > 0) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
};
const motion = (inputs, time) => {
  const end = END(inputs), t = Math.min(Math.max(time, 0), end), top = topOf(inputs, end), base = Q[${J(body.height)}](inputs, 0);
  const v = snap(Q[${J(body.velocity)}](inputs, t));
  return { top, end, t, peak: Q[${J(body.height)}](inputs, top) - base, h: snap(Q[${J(body.height)}](inputs, t) - base), v, a: Q[${J(body.acceleration)}](inputs, t), tau: t - top, launch: t < EPS, ended: t >= end - EPS };
};
`;
}
