// Hand-written reference for the M4 Author contract: the M3 reference storyboard
// (fixtures/m3/softmax-15s-attention.storyboard.json) on the M2 softmax brief. Not a model
// output; it is the known-good input for the Author checks and the compile/probe proof.
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';

export const stage = { width: 1920, height: 1080, fps: 30, durationInFrames: 450 };
export const timeline = { B1: [0, 75], B2: [75, 165], B3: [165, 270], B4: [270, 345], B5: [345, 405], B6: [405, 450] };
export const TEXT = {
  fallback: 'Fallback path: self.flash is False',
  maskLine: "att = att.masked_fill(self.bias[:,:,:T,:T] == 0, float('-inf'))",
  softmaxLine: 'att = F.softmax(att, dim=-1)',
  valueLine: 'y = att @ v # (B, nh, T, T) x (B, nh, T, hs) -> (B, nh, T, hs)',
  b2: 'Future positions become -inf before softmax.',
  b3: 'Softmax turns each row of scores into weights.',
  sum: 'sum = 1',
  arrow: 'dim=-1: along each row',
  b4: 'Each row sums to 1; its length is unchanged.',
  b5: 'Then the weights are used in y = att @ v.',
  flash: 'If self.flash: scaled_dot_product_attention(is_causal=True)',
  b6: 'When self.flash is True, scaled_dot_product_attention runs instead.',
  inf: '-inf',
};

const INK = '#37352F', MUTED = '#9B9A97', LINE = '#E3E2E0', SOFT = '#F1F1EF', BLUE = '#2383E2', RED = '#EB5757';
const SANS = 'Inter', MONO = 'JetBrains Mono';
const SCORES = [1.2, -0.4, 0.3, 2.1, 0.9, 1.6];
const ALLOWED = 4; // positions 5 and 6 are this query's future
const EXPS = SCORES.slice(0, ALLOWED).map(x => Math.exp(x));
const TOTAL = EXPS.reduce((a, b) => a + b, 0);
const WEIGHTS = SCORES.map((_, i) => (i < ALLOWED ? EXPS[i] / TOTAL : 0));
const CELL = 180, GAP = 24, ROW_X = (1920 - (6 * CELL + 5 * GAP)) / 2, ROW_Y = 470;

const ease = Easing.bezier(0.33, 0, 0.2, 1);
const ramp = (f, a, b) => interpolate(f, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
// visible from the start of beat `first` to the end of beat `last`, with short fades
const span = (f, first, last) => Math.min(ramp(f, timeline[first][0], timeline[first][0] + 9), 1 - ramp(f, timeline[last][1] - 6, timeline[last][1]));
const at = (left, top, extra) => ({ position: 'absolute', left, top, ...extra });
const code = { fontFamily: MONO, fontSize: 34, color: INK, background: SOFT, borderRadius: 12, padding: '14px 24px' };

const FallbackLabel = ({ f }) => (
  <div data-object="fallback_label" style={at(120, 150, { opacity: span(f, 'B1', 'B6'), fontSize: 30, color: MUTED, border: `2px solid ${LINE}`, borderRadius: 10, padding: '8px 16px' })}>{TEXT.fallback}</div>
);
const SoftmaxLine = ({ f }) => (
  <div data-object="softmax_line" style={at(120, 240, { ...code, opacity: Math.max(span(f, 'B1', 'B1'), span(f, 'B3', 'B3')), outline: `3px solid ${interpolateBlue(ramp(f, 20, 40))}` })}>{TEXT.softmaxLine}</div>
);
const interpolateBlue = p => (p > 0.5 ? BLUE : LINE);
const MaskLine = ({ f }) => <div data-object="mask_line" style={at(120, 240, { ...code, opacity: span(f, 'B2', 'B2') })}>{TEXT.maskLine}</div>;
const ValueLine = ({ f }) => <div data-object="value_line" style={at(120, 240, { ...code, opacity: span(f, 'B5', 'B5') })}>{TEXT.valueLine}</div>;

const ScoreRow = ({ f }) => {
  const masked = ramp(f, timeline.B2[0] + 20, timeline.B2[0] + 50);
  const weights = ramp(f, timeline.B3[0] + 10, timeline.B3[0] + 60);
  const flow = ramp(f, timeline.B5[0] + 10, timeline.B5[1] - 10);
  return (
    <div data-object="score_row" style={at(0, 0, { opacity: span(f, 'B2', 'B5'), transform: `translateX(${-120 * flow}px)` })}>
      {SCORES.map((s, i) => {
        const future = i >= ALLOWED;
        const h = WEIGHTS[i] * 300 * weights;
        return (
          <div key={i}>
            <div style={at(ROW_X + i * (CELL + GAP), ROW_Y, { width: CELL, height: 110, borderRadius: 14, border: `3px solid ${future && masked > 0.5 ? RED : LINE}`, textAlign: 'center', fontSize: 40, lineHeight: '110px', color: future ? RED : INK, opacity: 1 - 0.6 * weights * (future ? 1 : 0) })}>
              {future && masked > 0.5 ? TEXT.inf : s.toFixed(1)}
            </div>
            <div style={at(ROW_X + i * (CELL + GAP) + CELL / 2 - 50, 900 - h, { width: 100, height: h, background: BLUE, borderRadius: '8px 8px 0 0' })} />
            <div style={at(ROW_X + i * (CELL + GAP), 912, { width: CELL, textAlign: 'center', fontSize: 30, color: INK, opacity: weights })}>{WEIGHTS[i].toFixed(2)}</div>
          </div>
        );
      })}
    </div>
  );
};
const SumMarker = ({ f }) => (
  <div data-object="sum_marker" style={at(ROW_X + 6 * (CELL + GAP), 840, { opacity: span(f, 'B4', 'B4') * ramp(f, timeline.B4[0] + 15, timeline.B4[0] + 45), fontSize: 40, color: INK })}>{TEXT.sum}</div>
);
const RowArrow = ({ f }) => {
  const draw = ramp(f, timeline.B4[0], timeline.B4[0] + 40);
  return (
    <div data-object="row_arrow" style={at(ROW_X, 400, { opacity: span(f, 'B4', 'B4') })}>
      <div style={at(0, 40, { width: (6 * CELL + 5 * GAP) * draw, height: 4, background: BLUE })} />
      <div style={at(0, -10, { fontSize: 28, color: BLUE, whiteSpace: 'nowrap' })}>{TEXT.arrow}</div>
    </div>
  );
};
const FlashLane = ({ f }) => (
  <div data-object="flash_lane" style={at(120, 330 + 30 * (1 - ramp(f, timeline.B6[0], timeline.B6[0] + 15)), { opacity: span(f, 'B6', 'B6'), fontFamily: MONO, fontSize: 32, color: BLUE, border: `3px solid ${BLUE}`, borderRadius: 12, padding: '16px 24px' })}>{TEXT.flash}</div>
);
const CAPTIONS = [['B2', 'b2'], ['B3', 'b3'], ['B4', 'b4'], ['B5', 'b5'], ['B6', 'b6']];

export default function SoftmaxReference() {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: '#FFFFFF', fontFamily: SANS, color: INK }}>
      <FallbackLabel f={f} />
      <SoftmaxLine f={f} />
      <MaskLine f={f} />
      <ValueLine f={f} />
      <ScoreRow f={f} />
      <SumMarker f={f} />
      <RowArrow f={f} />
      <FlashLane f={f} />
      {CAPTIONS.map(([beat, key]) => (
        <div key={beat} style={at(0, 990, { width: 1920, textAlign: 'center', fontSize: 36, opacity: span(f, beat, beat) })}>{TEXT[key]}</div>
      ))}
    </AbsoluteFill>
  );
}
