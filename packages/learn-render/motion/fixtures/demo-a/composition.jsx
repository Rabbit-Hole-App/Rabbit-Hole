// Demo A (spec §27), hand-written to the Author contract (§5.3, §8): the 15 s
// softmax-in-attention storyboard in storyboard.json. Every visible state is a pure
// function of the frame. This is the shape an Author composition must have.
import { AbsoluteFill, Easing, interpolate, interpolateColors, useCurrentFrame } from 'remotion';

export const stage = { width: 1920, height: 1080, fps: 30, durationInFrames: 450 };

const FONT = 'Inter';
const INK = '#37352F', MUTED = '#9B9A97', LINE = '#E3E2E0', SOFT = '#F1F1EF', BLUE = '#2383E2', BLUE_SOFT = '#E7F3F8', RED = '#EB5757';
// Row 4 of att: query token 4 scored against keys 1..6. Keys 5 and 6 are its future.
const SCORES = [1.2, -0.4, 0.3, 2.1, 0.9, 1.6];
const QUERY = 4;
const EXPS = SCORES.slice(0, QUERY).map(x => Math.exp(x));
const TOTAL = EXPS.reduce((a, b) => a + b, 0);
const WEIGHTS = SCORES.map((_, i) => (i < QUERY ? EXPS[i] / TOTAL : 0));

const CELL_W = 200, CELL_H = 128, GAP = 24;
const ROW_W = SCORES.length * CELL_W + (SCORES.length - 1) * GAP;
const ROW_X = (1920 - ROW_W) / 2;
const cellX = i => ROW_X + i * (CELL_W + GAP);
const CELLS_Y = 456, BASE_Y = 800, BAR_SCALE = 280, TRACK_Y = 880;

const ease = Easing.bezier(0.33, 0, 0.2, 1);
// 0 -> 1 between two times in seconds, clamped.
const ramp = (f, a, b) => interpolate(f, [a * 30, b * 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
// visible inside [a, b] seconds with a short fade at both ends
const during = (f, a, b) => Math.min(ramp(f, a, a + 0.35), 1 - ramp(f, b - 0.3, b));

const text = (size, color, weight = 400) => ({ fontFamily: FONT, fontSize: size, color, fontWeight: weight, lineHeight: 1.2 });
const at = (left, top, extra) => ({ position: 'absolute', left, top, ...extra });

const CAPTIONS = [
  [0, 3, 'Token 4 scores every key, but keys 5 and 6 are in its future.'],
  [3, 7, 'Fallback path: future scores become −∞ before softmax runs.'],
  [7, 11, 'Softmax turns the eligible scores into non-negative weights that sum to 1.'],
  [11, 13.2, 'Which code runs depends on K1: is flash attention available?'],
];
const CODE = [
  [3, 7, 'model.py:68 · fallback path (flash attention unavailable)', "att = att.masked_fill(self.bias[:,:,:T,:T] == 0, float('-inf'))"],
  [7, 11, 'model.py:69 · fallback path (flash attention unavailable)', 'att = F.softmax(att, dim=-1)'],
];

const Cell = ({ f, i }) => {
  const future = i >= QUERY;
  const show = ramp(f, 0.15 + i * 0.08, 0.6 + i * 0.08);
  const grey = future ? ramp(f, 1.5, 2.1) : 0;
  const mask = future ? ramp(f, 4.2, 5.2) : 0;
  const weight = future ? 0 : ramp(f, 7.4, 8.6);
  return (
    <div style={at(cellX(i), CELLS_Y + 12 * (1 - show), {
      width: CELL_W, height: CELL_H, opacity: show, borderRadius: 14, boxSizing: 'border-box',
      border: `3px solid ${interpolateColors(mask, [0, 1], [future ? interpolateColors(grey, [0, 1], [LINE, '#D3D1CB']) : LINE, RED])}`,
      background: future ? interpolateColors(grey, [0, 1], ['#FFFFFF', SOFT]) : interpolateColors(weight, [0, 1], ['#FFFFFF', BLUE_SOFT]),
    })}>
      <div style={at(0, 34, { width: CELL_W, textAlign: 'center', opacity: 1 - mask, ...text(46, interpolateColors(grey, [0, 1], [INK, MUTED]), 500) })}>{SCORES[i].toFixed(1).replace('-', '−')}</div>
      <div style={at(0, 34, { width: CELL_W, textAlign: 'center', opacity: mask, ...text(46, RED, 500) })}>{'−∞'}</div>
    </div>
  );
};

const Bar = ({ f, i }) => {
  const grow = ramp(f, 7.4, 8.6);
  const h = WEIGHTS[i] * BAR_SCALE * grow;
  const cx = cellX(i) + CELL_W / 2;
  return (
    <>
      <div style={at(cx - 60, BASE_Y - h, { width: 120, height: h, background: BLUE, borderRadius: '8px 8px 0 0' })} />
      <div style={at(cellX(i), BASE_Y + 12, { width: CELL_W, textAlign: 'center', opacity: grow, ...text(32, i < QUERY ? INK : MUTED, 500) })}>
        {i < QUERY ? WEIGHTS[i].toFixed(2) : '0'}
      </div>
    </>
  );
};

const SumTrack = ({ f }) => {
  const show = ramp(f, 8.6, 9.0);
  let x = ROW_X;
  return (
    <div style={{ opacity: show }}>
      <div style={at(ROW_X, TRACK_Y, { width: ROW_W, height: 36, borderRadius: 8, background: SOFT })} />
      {WEIGHTS.slice(0, QUERY).map((w, i) => {
        const p = ramp(f, 8.9 + i * 0.35, 9.3 + i * 0.35);
        const left = x;
        x += w * ROW_W;
        return <div key={i} style={at(left, TRACK_Y, { width: Math.max(0, w * ROW_W * p - 3), height: 36, background: BLUE, opacity: 0.55 + 0.15 * i, borderRadius: 6 })} />;
      })}
      <div style={at(ROW_X, TRACK_Y + 44, text(24, MUTED))}>{'weights over keys 1–4'}</div>
      <div style={at(ROW_X + ROW_W + 24, TRACK_Y - 2, { opacity: ramp(f, 10.3, 10.7), ...text(36, INK, 500) })}>{'Σ = 1.00'}</div>
    </div>
  );
};

const Lane = ({ top, accent, head, code, note }) => (
  <div style={at(120, top, { width: 1160, height: 170, borderRadius: 16, border: `3px solid ${accent}`, background: '#FFFFFF', boxSizing: 'border-box', padding: '22px 32px' })}>
    <div style={text(30, accent, 500)}>{head}</div>
    <div style={{ marginTop: 14, ...text(30, INK, 500) }}>{code}</div>
    <div style={{ marginTop: 12, ...text(24, MUTED) }}>{note}</div>
  </div>
);

const Branches = ({ f }) => {
  const show = during(f, 11, 13.4);
  return (
    <div style={at(260, 250, { width: 1400, height: 540, opacity: show, transform: `translateY(${16 * (1 - show)}px)`, borderRadius: 24, background: '#FFFFFF', border: `2px solid ${LINE}`, boxShadow: '0 24px 60px rgba(55,53,47,0.12)' })}>
      <div style={at(120, 40, text(40, INK, 500))}>{'Which code runs? It depends on K1.'}</div>
      <Lane top={120} accent={BLUE} head={'flash available (PyTorch ≥ 2.0)'} code={'scaled_dot_product_attention(q, k, v, …, is_causal=True)'} note={'does the causal masking and softmax internally · model.py:62–64'} />
      <Lane top={320} accent={MUTED} head={'flash unavailable'} code={'masked_fill(… −∞) → F.softmax: the steps you just saw'} note={'explicit fallback path · model.py:65–71'} />
    </div>
  );
};

export default function SoftmaxInAttention() {
  const f = useCurrentFrame();
  const dim = 1 - 0.94 * during(f, 11, 13.4);
  const takeaway = ramp(f, 13.35, 13.85);
  return (
    <AbsoluteFill style={{ backgroundColor: '#FFFFFF' }}>
      <div>
        <div style={at(120, 72, text(26, MUTED))}>{'nanoGPT · model.py · CausalSelfAttention.forward'}</div>
        <div style={at(120, 108, text(54, INK, 500))}>{'How softmax turns attention scores into weights'}</div>
      </div>
      <div style={{ opacity: dim }}>
        {CODE.map(([a, b, label, code]) => (
          <div key={a} style={{ opacity: during(f, a, b) }}>
            <div style={at(120, 220, text(24, MUTED))}>{label}</div>
            <div style={at(120, 252, { height: 64, padding: '0 24px', borderRadius: 12, background: SOFT, display: 'flex', alignItems: 'center', ...text(30, INK, 500) })}>{code}</div>
          </div>
        ))}
        <div style={at(ROW_X, 372, text(28, INK))}>{'Row 4 of the attention scores: query token 4 against keys 1–6'}</div>
        {SCORES.map((_, i) => (
          <div key={i} style={at(cellX(i), 420, { width: CELL_W, textAlign: 'center', opacity: ramp(f, 0.15 + i * 0.08, 0.6 + i * 0.08), ...text(24, i < QUERY ? MUTED : '#B4B2AD') })}>{`key ${i + 1}`}</div>
        ))}
        {SCORES.map((_, i) => <Cell key={i} f={f} i={i} />)}
        {[4, 5].map(i => (
          <div key={i} style={at(cellX(i), CELLS_Y + CELL_H + 12, { width: CELL_W, textAlign: 'center', opacity: ramp(f, 1.5, 2.1), ...text(22, interpolateColors(ramp(f, 4.2, 5.2), [0, 1], [MUTED, RED]), 500) })}>
            {'future'}
          </div>
        ))}
        <div style={at(ROW_X, BASE_Y, { width: ROW_W, height: 2, background: LINE, opacity: ramp(f, 7.2, 7.6) })} />
        {SCORES.map((_, i) => <Bar key={i} f={f} i={i} />)}
        <SumTrack f={f} />
      </div>
      {CAPTIONS.map(([a, b, line]) => (
        <div key={a} style={at(0, 985, { width: 1920, textAlign: 'center', opacity: during(f, a, b), ...text(34, INK, 500) })}>{line}</div>
      ))}
      <Branches f={f} />
      <div style={{ opacity: takeaway }}>
        <div style={at(0, 978, { width: 1920, textAlign: 'center', ...text(40, INK, 500) })}>{'Softmax turns the allowed scores into weights that sum to 1.'}</div>
        <div style={at(0, 1032, { width: 1920, textAlign: 'center', ...text(24, MUTED) })}>{'nanoGPT runs this explicit mask-then-softmax code only when flash attention is unavailable.'}</div>
      </div>
    </AbsoluteFill>
  );
}
