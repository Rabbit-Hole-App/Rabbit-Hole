const K = 0.1, R = 0.18, H = 4, MAX = 60, S = [-3, 1.5];
const loss = (x, y) => 0.5 * (x * x + 4 * y * y);
const ball = () => ({ x: S[0], y: S[1], w: 'descending', p: [S] });
const fresh = () => ({ n: 0, on: false, a: ball(), b: ball() });
function move(o, r) {
  if (o.w !== 'descending') return o;
  const x = o.x - r * o.x, y = o.y - r * 4 * o.y;
  const w = Math.abs(x) > H || Math.abs(y) > H ? 'diverged' : loss(x, y) < 0.001 ? 'converged' : 'descending';
  return { x, y, w, p: o.p.concat([[x, y]]) };
}
const done = s => s.n >= MAX || (s.a.w !== 'descending' && s.b.w !== 'descending');
function adv(s, i) {
  if (done(s)) return { ...s, on: false };
  const t = { ...s, n: s.n + 1, a: move(s.a, i.lrA), b: move(s.b, i.lrB) };
  return done(t) ? { ...t, on: false } : t;
}
export function initialState() { return fresh(); }
export function reduce({ state: s, event: e, inputs }) {
  if (e.type === 'step') return !s.on || e.tick % 6 ? s : adv(s, inputs);
  if (e.type === 'parameter') return fresh();
  if (e.type !== 'action') return s;
  if (e.action === 'run') return done(s) ? s : { ...s, on: true };
  if (e.action === 'pause') return { ...s, on: false };
  if (e.action === 'stepOnce') return adv({ ...s, on: false }, inputs);
  if (e.action === 'newRuns') return fresh();
  return s;
}
const rim = v => Math.max(-H, Math.min(H, v));
const lift = (p, up) => { const x = rim(p[0]), y = rim(p[1]); return [x, K * loss(x, y) + up, y]; };
const word = (o, s) => o.w === 'descending' && s.n >= MAX ? 'stopped at 60 steps' : o.w;
export function evaluate({ state }) {
  const s = state || initialState();
  return {
    nodes: {
      ballA: { position: lift([s.a.x, s.a.y], R) },
      ballB: { position: lift([s.b.x, s.b.y], R) },
      trailA: { points: s.a.p.map(p => lift(p, 0.05)) },
      trailB: { points: s.b.p.map(p => lift(p, 0.05)) }
    },
    readouts: {
      lossA: loss(s.a.x, s.a.y), lossB: loss(s.b.x, s.b.y), steps: s.n,
      status: done(s) ? 'finished' : s.on ? 'running' : 'paused',
      stateA: word(s.a, s), stateB: word(s.b, s)
    }
  };
}
