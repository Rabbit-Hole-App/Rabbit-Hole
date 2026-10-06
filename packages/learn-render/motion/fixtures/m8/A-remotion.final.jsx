import React from 'react';
import { AbsoluteFill, Easing, interpolate, interpolateColors, useCurrentFrame } from 'remotion';

export const stage = { width: 1920, height: 1080, fps: 30, durationInFrames: 450 };

export const timeline = { B1: [0, 90], B2: [90, 180], B3: [180, 300], B4: [300, 375], B5: [375, 450] };

export const TEXT = {
  cap1: 'Softmax turns each row of scores into weights.',
  cap2: 'Scale, then mask: future positions become -inf.',
  cap3: 'Larger scores become larger weights.',
  cap4: "Each row's weights sum to 1.",
  cap5: 'Weights then mix the value vectors.',
  tag: 'Manual path: self.flash is false',
  rowLabel: 'One row of scores',
  maskedLabel: '-inf after masked_fill',
  weightLabel: 'Weights: masked positions 0, remaining positive',
  arrowLabel: 'Along each row (dim=-1)',
  sumLabel: 'Sum = 1',
  valueLabel: 'y = att @ v',
  flashLabel: 'Flash path: scaled_dot_product_attention instead',
  negInf: '-inf',
  codeSoftmax: 'att = F.softmax(att, dim=-1)',
  codeScale: 'att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(k.size(-1)))',
  codeMask: "att = att.masked_fill(self.bias[:,:,:T,:T] == 0, float('-inf'))",
  codeDropout: 'att = self.attn_dropout(att)',
  codeMatmul: 'y = att @ v # (B, nh, T, T) x (B, nh, T, hs) -> (B, nh, T, hs)',
};

// ---------- palette & layout ----------
const C = {
  bg: '#0e1120',
  panel: '#181d31',
  panelEdge: '#2c3456',
  text: '#e8ecf5',
  soft: '#c3c9da',
  dim: '#7f88a3',
  accent: '#f5b942',
  accentBg: '#4a3c14',
  mask: '#ef6b6b',
  maskBg: '#3a1c24',
  weight: '#4fd1c5',
  weightHi: '#c4fbf5',
  value: '#8fa8ff',
};
const T = timeline;
const S2 = T.B2[0];
const S3 = T.B3[0];
const S4 = T.B4[0];
const S5 = T.B5[0];

const CODE_LEFT = 340;
const CODE_TOP = 120;
const LINE_H = 52;

const N = 6;
const CELL_W = 160;
const CELL_GAP = 20;
const PITCH = CELL_W + CELL_GAP;
const ROW_W = N * CELL_W + (N - 1) * CELL_GAP;
const ROW_LEFT = 960 - ROW_W / 2;
const SCORE_TOP = 350;
const CELL_H = 80;

const WR_TOP = 450;
const WR_H = 360;
const BASE_Y = 300;
const BAR_W = 110;
const PX_PER = 416;
const ARROW_TOP = 815;

const SCORES = [1.2, -0.4, 2.1, 0.6, 0.9, 1.5];
const MASK_FROM = 4;
const WEIGHTS = [0.24, 0.05, 0.58, 0.13, 0, 0];
const V = [
  [0.9, 0.3, 0.6, 0.2],
  [0.2, 0.8, 0.4, 0.7],
  [0.5, 0.4, 1.0, 0.3],
  [0.7, 0.9, 0.2, 0.6],
  [0.3, 0.6, 0.8, 0.9],
  [0.8, 0.2, 0.5, 0.4],
];
const Y = [0, 1, 2, 3].map((j) => V.reduce((acc, row, r) => acc + WEIGHTS[r] * row[j], 0));
const Y_MAX = Math.max(...Y);

const LABEL = { fontFamily: 'Inter', fontSize: 26, fontWeight: 600, whiteSpace: 'nowrap' };

// ---------- primitives ----------
const ramp = (f, a, b, ease = Easing.inOut(Easing.cubic)) =>
  interpolate(f, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

function CodeRow({ text, hl, fontSize, padV, padH, radius, mb }) {
  return (
    <div
      style={{
        fontFamily: 'JetBrains Mono',
        fontSize,
        lineHeight: 1.3,
        whiteSpace: 'pre',
        width: 'fit-content',
        padding: `${padV}px ${padH}px`,
        borderRadius: radius,
        marginBottom: mb,
        color: interpolateColors(hl, [0, 1], [C.soft, '#fff6dd']),
        background: interpolateColors(hl, [0, 1], [C.panel, C.accentBg]),
        border: `2px solid ${interpolateColors(hl, [0, 1], [C.panelEdge, C.accent])}`,
        boxShadow: `0 0 ${Math.round(28 * hl)}px rgba(245,185,66,${0.35 * hl})`,
      }}
    >
      {text}
    </div>
  );
}

// ---------- objects ----------
function CodeSoftmaxLine({ f }) {
  const up = ramp(f, S2, S2 + 24);
  let hl;
  if (f < S2) hl = mix(0.35, 1, ramp(f, 0, 40));
  else if (f < S3) hl = mix(1, 0.1, up);
  else hl = mix(0.1, 1, ramp(f, S3, S3 + 15));
  const op = 1 - ramp(f, S4, S4 + 15);
  return (
    <div
      data-object="code_softmax_line"
      style={{
        position: 'absolute',
        left: mix(462, CODE_LEFT, up),
        top: mix(430, CODE_TOP + 2 * LINE_H, up),
        transform: `scale(${mix(1, 0.5, up)})`,
        transformOrigin: 'left top',
        opacity: op,
      }}
    >
      <CodeRow text={TEXT.codeSoftmax} hl={hl} fontSize={56} padV={10} padH={24} radius={12} mb={0} />
    </div>
  );
}

function BranchTag({ f }) {
  const slide = ramp(f, 0, 20, Easing.out(Easing.cubic));
  const corner = ramp(f, S2, S2 + 24);
  return (
    <div
      data-object="branch_tag"
      style={{
        position: 'absolute',
        left: mix(462, 48, corner),
        top: mix(548, 36, corner),
        transform: `translateX(${(1 - slide) * -80}px)`,
        ...LABEL,
        color: C.accent,
        background: '#2b2410',
        border: `2px solid ${C.accent}`,
        borderRadius: 999,
        padding: '8px 22px',
      }}
    >
      {TEXT.tag}
    </div>
  );
}

function CodeStepsBefore({ f }) {
  const enter = ramp(f, S2, S2 + 15);
  const leave = ramp(f, S3, S3 + 20);
  const hl0 = ramp(f, S2 + 4, S2 + 12) * (1 - ramp(f, S2 + 30, S2 + 36));
  const hl1 = ramp(f, S2 + 30, S2 + 36) * (1 - ramp(f, S3, S3 + 15));
  return (
    <div
      data-object="code_steps_before"
      style={{
        position: 'absolute',
        left: CODE_LEFT,
        top: CODE_TOP,
        opacity: enter * (1 - leave),
        transform: `translateY(${(1 - enter) * -14}px)`,
      }}
    >
      <CodeRow text={TEXT.codeScale} hl={hl0} fontSize={28} padV={5} padH={12} radius={6} mb={6} />
      <CodeRow text={TEXT.codeMask} hl={hl1} fontSize={28} padV={5} padH={12} radius={6} mb={6} />
    </div>
  );
}

function ScoreCell({ f, i, sweepX, sweepOn }) {
  const appear = ramp(f, S2 + 6 + i * 4, S2 + 12 + i * 4);
  const lit = sweepOn * clamp01(1 - Math.abs(sweepX - (i * PITCH + CELL_W / 2)) / 130);
  return (
    <div
      style={{
        position: 'absolute',
        left: i * PITCH,
        top: 0,
        width: CELL_W,
        height: CELL_H,
        borderRadius: 10,
        background: interpolateColors(lit, [0, 1], [C.panel, C.accentBg]),
        border: `2px solid ${interpolateColors(lit, [0, 1], [C.panelEdge, C.accent])}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span style={{ fontFamily: 'Inter', fontSize: 36, fontWeight: 700, color: C.text, opacity: appear }}>
        {SCORES[i].toFixed(1)}
      </span>
    </div>
  );
}

function MaskedCells({ f, sweepX, sweepOn }) {
  const flip = ramp(f, S2 + 34, S2 + 42, Easing.linear);
  const lab = ramp(f, S2 + 34, S2 + 40);
  const dim = 1 - 0.35 * ramp(f, S3, S3 + 15);
  const flipped = flip >= 0.5 ? 1 : 0;
  const sy = Math.max(0.08, Math.abs(Math.cos(Math.PI * flip)));
  return (
    <div
      data-object="masked_cells"
      style={{ position: 'absolute', left: MASK_FROM * PITCH, top: 0, width: 2 * PITCH - CELL_GAP, height: CELL_H, opacity: dim }}
    >
      <div style={{ position: 'absolute', left: 0, top: -44, ...LABEL, color: C.mask, opacity: lab }}>{TEXT.maskedLabel}</div>
      {[4, 5].map((i) => {
        const appear = ramp(f, S2 + 6 + i * 4, S2 + 12 + i * 4);
        const lit = sweepOn * clamp01(1 - Math.abs(sweepX - (i * PITCH + CELL_W / 2)) / 130);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: (i - MASK_FROM) * PITCH,
              top: 0,
              width: CELL_W,
              height: CELL_H,
              borderRadius: 10,
              transform: `scaleY(${sy})`,
              background: flipped ? C.maskBg : C.panel,
              border: `2px solid ${flipped ? interpolateColors(lit, [0, 1], [C.mask, C.accent]) : C.panelEdge}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontFamily: 'Inter', fontSize: 36, fontWeight: 700, color: flipped ? C.mask : C.text, opacity: appear }}>
              {flipped ? TEXT.negInf : SCORES[i].toFixed(1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ScoreRow({ f }) {
  const enter = ramp(f, S2 + 4, S2 + 18, Easing.out(Easing.cubic));
  const out = ramp(f, S3 + 65, S3 + 110);
  const sweep = ramp(f, S3 + 15, S3 + 75, Easing.linear);
  const sweepOn = ramp(f, S3 + 12, S3 + 16) * (1 - ramp(f, S3 + 75, S3 + 82));
  const sweepX = sweep * ROW_W;
  return (
    <div
      data-object="score_row"
      style={{
        position: 'absolute',
        left: ROW_LEFT,
        top: SCORE_TOP,
        width: ROW_W,
        height: CELL_H,
        opacity: enter * (1 - out),
        transform: `translateY(${(1 - enter) * -40}px)`,
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: -44, ...LABEL, color: C.soft }}>{TEXT.rowLabel}</div>
      {[0, 1, 2, 3].map((i) => (
        <ScoreCell key={i} f={f} i={i} sweepX={sweepX} sweepOn={sweepOn} />
      ))}
      <MaskedCells f={f} sweepX={sweepX} sweepOn={sweepOn} />
      <div
        style={{
          position: 'absolute',
          left: sweepX - 4,
          top: -10,
          width: 8,
          height: CELL_H + 20,
          borderRadius: 4,
          background: C.accent,
          opacity: sweepOn,
          boxShadow: `0 0 24px ${C.accent}`,
        }}
      />
    </div>
  );
}

function WeightBar({ f, i }) {
  const grow = ramp(f, S3 + 20 + i * 10, S3 + 35 + i * 10, Easing.out(Easing.cubic));
  const masked = i >= MASK_FROM;
  const h = WEIGHTS[i] * PX_PER * grow;
  const s = S4 + 5 + i * 10;
  const g = masked ? 0 : ramp(f, s, s + 5) * (1 - ramp(f, s + 10, s + 18));
  const x = i * PITCH + (CELL_W - BAR_W) / 2;
  return (
    <>
      {masked ? (
        <div
          style={{
            position: 'absolute',
            left: x,
            top: BASE_Y - 8,
            width: BAR_W,
            height: 8,
            border: `2px dashed ${C.mask}`,
            borderRadius: 3,
            opacity: grow,
          }}
        />
      ) : (
        <div
          style={{
            position: 'absolute',
            left: x,
            top: BASE_Y - h,
            width: BAR_W,
            height: h,
            borderRadius: '8px 8px 0 0',
            background: interpolateColors(g, [0, 1], [C.weight, C.weightHi]),
            boxShadow: `0 0 ${Math.round(36 * g)}px ${C.weight}`,
          }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          left: i * PITCH,
          top: BASE_Y - (masked ? 8 : h) - 42,
          width: CELL_W,
          textAlign: 'center',
          fontFamily: 'Inter',
          fontSize: 30,
          fontWeight: 700,
          color: masked ? C.mask : interpolateColors(g, [0, 1], [C.text, C.weightHi]),
          opacity: grow,
        }}
      >
        {masked ? 0 : WEIGHTS[i].toFixed(2)}
      </div>
    </>
  );
}

function WeightRow({ f }) {
  const show = ramp(f, S3 + 10, S3 + 22);
  const lab = ramp(f, S3 + 15, S3 + 30);
  const move = ramp(f, S5, S5 + 30);
  return (
    <div
      data-object="weight_row"
      style={{
        position: 'absolute',
        left: ROW_LEFT,
        top: WR_TOP,
        width: ROW_W,
        height: WR_H,
        opacity: show,
        transform: `translateX(${170 * move}px) scale(${1 - 0.3 * move})`,
        transformOrigin: 'left center',
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: BASE_Y, width: ROW_W, height: 3, background: C.panelEdge }} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <WeightBar key={i} f={f} i={i} />
      ))}
      <div style={{ position: 'absolute', left: 0, top: BASE_Y + 16, ...LABEL, color: C.weight, opacity: lab }}>
        {TEXT.weightLabel}
      </div>
    </div>
  );
}

function DirectionArrow({ f }) {
  const p = ramp(f, S3 + 15, S3 + 75, Easing.linear);
  const on = ramp(f, S3 + 10, S3 + 15);
  const lab = ramp(f, S3 + 15, S3 + 30);
  const out = ramp(f, S4, S4 + 15);
  const x1 = Math.max(p * ROW_W, 1);
  return (
    <div
      data-object="direction_arrow"
      style={{ position: 'absolute', left: ROW_LEFT, top: ARROW_TOP, width: ROW_W + 400, height: 40, opacity: on * (1 - out) }}
    >
      <svg width={ROW_W + 24} height={40} style={{ position: 'absolute', left: 0, top: 0 }}>
        <line x1={0} y1={20} x2={x1} y2={20} stroke={C.accent} strokeWidth={5} strokeLinecap="round" />
        <polygon points={`${x1 + 16},20 ${x1 - 4},7 ${x1 - 4},33`} fill={C.accent} opacity={p > 0.01 ? 1 : 0} />
      </svg>
      <div style={{ position: 'absolute', left: ROW_W + 40, top: 3, ...LABEL, color: C.accent, opacity: lab }}>
        {TEXT.arrowLabel}
      </div>
    </div>
  );
}

function SumTotal({ f }) {
  const vis = ramp(f, S4, S4 + 10) * (1 - ramp(f, S5, S5 + 15));
  let total = 0;
  for (let i = 0; i < MASK_FROM; i++) total += WEIGHTS[i] * ramp(f, S4 + 5 + i * 10, S4 + 13 + i * 10);
  const settled = ramp(f, S4 + 45, S4 + 55);
  return (
    <div
      data-object="sum_total"
      style={{
        position: 'absolute',
        left: 1530,
        top: 560,
        width: 320,
        paddingLeft: 24,
        borderLeft: `4px solid ${interpolateColors(settled, [0, 1], [C.panelEdge, C.weight])}`,
        opacity: vis,
      }}
    >
      <div
        style={{
          fontFamily: 'Inter',
          fontSize: 80,
          fontWeight: 800,
          color: interpolateColors(settled, [0, 1], [C.text, C.weight]),
          transform: `scale(${1 + 0.08 * settled * (1 - ramp(f, S4 + 55, S4 + 70))})`,
          transformOrigin: 'left center',
        }}
      >
        {total.toFixed(2)}
      </div>
      <div style={{ fontFamily: 'Inter', fontSize: 34, fontWeight: 700, color: C.weight }}>{TEXT.sumLabel}</div>
    </div>
  );
}

function CodeStepsAfter({ f }) {
  const enter = ramp(f, S5, S5 + 15);
  const hl1 = ramp(f, S5 + 10, S5 + 25);
  return (
    <div
      data-object="code_steps_after"
      style={{
        position: 'absolute',
        left: CODE_LEFT,
        top: CODE_TOP,
        opacity: enter,
        transform: `translateY(${(1 - enter) * -14}px)`,
      }}
    >
      <CodeRow text={TEXT.codeDropout} hl={0} fontSize={28} padV={5} padH={12} radius={6} mb={6} />
      <CodeRow text={TEXT.codeMatmul} hl={hl1} fontSize={28} padV={5} padH={12} radius={6} mb={6} />
    </div>
  );
}

function ValueTarget({ f }) {
  const vis = ramp(f, S5 + 5, S5 + 20);
  const recv = ramp(f, S5 + 20, S5 + 40);
  const emerge = ramp(f, S5 + 35, S5 + 55, Easing.out(Easing.cubic));
  const midY = 56 + (N * 40 - 8) / 2;
  return (
    <div data-object="value_target" style={{ position: 'absolute', left: 1370, top: 470, width: 470, height: 320, opacity: vis }}>
      <div style={{ position: 'absolute', left: 60, top: 0, ...LABEL, fontSize: 30, fontWeight: 700, color: C.value }}>
        {TEXT.valueLabel}
      </div>
      <svg width={300} height={320} style={{ position: 'absolute', left: 0, top: 0 }}>
        <line x1={0} y1={midY} x2={Math.max(1, 40 * recv)} y2={midY} stroke={C.weight} strokeWidth={4} opacity={recv > 0.01 ? 1 : 0} />
        <polygon points={`52,${midY} 40,${midY - 9} 40,${midY + 9}`} fill={C.weight} opacity={recv} />
        <line x1={222} y1={midY} x2={222 + 46 * emerge} y2={midY} stroke={C.weight} strokeWidth={4} opacity={emerge > 0.01 ? 1 : 0} />
        <polygon points={`${282},${midY} ${270},${midY - 9} ${270},${midY + 9}`} fill={C.weight} opacity={emerge} />
      </svg>
      {V.map((row, r) => {
        const w = WEIGHTS[r];
        const target = w > 0 ? 0.35 + 0.65 * (w / 0.58) : 0.2;
        return (
          <div key={r} style={{ position: 'absolute', left: 60, top: 56 + r * 40, opacity: mix(0.7, target, recv) }}>
            {row.map((val, j) => (
              <div
                key={j}
                style={{
                  position: 'absolute',
                  left: j * 38,
                  top: 0,
                  width: 32,
                  height: 32,
                  borderRadius: 5,
                  background: `rgba(143,168,255,${0.2 + 0.8 * val})`,
                }}
              />
            ))}
          </div>
        );
      })}
      <div
        style={{
          position: 'absolute',
          left: 295,
          top: midY - 16,
          transform: `scale(${emerge})`,
          transformOrigin: 'left center',
        }}
      >
        {Y.map((val, j) => (
          <div
            key={j}
            style={{
              position: 'absolute',
              left: j * 38,
              top: 0,
              width: 32,
              height: 32,
              borderRadius: 5,
              background: `rgba(79,209,197,${0.25 + 0.75 * (val / Y_MAX)})`,
              boxShadow: `0 0 14px rgba(79,209,197,0.5)`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function FlashMarker({ f }) {
  const vis = ramp(f, S5, S5 + 12, Easing.out(Easing.cubic));
  return (
    <div
      data-object="flash_marker"
      style={{
        position: 'absolute',
        left: 1442,
        top: 36,
        width: 430,
        boxSizing: 'border-box',
        padding: '12px 18px',
        border: `2px dashed ${C.dim}`,
        borderRadius: 12,
        background: C.panel,
        fontFamily: 'Inter',
        fontSize: 24,
        fontWeight: 500,
        lineHeight: 1.35,
        color: C.soft,
        opacity: vis,
        transform: `translateY(${(1 - vis) * -12}px)`,
        zIndex: 10,
      }}
    >
      {TEXT.flashLabel}
    </div>
  );
}

function Caption({ f, range, text, first }) {
  const on = f >= range[0] && f < range[1];
  if (!on) return null;
  const enter = first ? 1 : ramp(f, range[0], range[0] + 10, Easing.out(Easing.cubic));
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: 930,
        width: 'fit-content',
        whiteSpace: 'nowrap',
        textAlign: 'center',
        fontFamily: 'Inter',
        fontSize: 42,
        fontWeight: 600,
        color: C.text,
        transform: `translate(-50%, ${(1 - enter) * 18}px)`,
      }}
    >
      {text}
    </div>
  );
}

// ---------- composition ----------
export default function SoftmaxScoresToWeights() {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <CodeStepsBefore f={f} />
      <CodeStepsAfter f={f} />
      <CodeSoftmaxLine f={f} />
      <BranchTag f={f} />
      <ScoreRow f={f} />
      <WeightRow f={f} />
      <DirectionArrow f={f} />
      <SumTotal f={f} />
      <ValueTarget f={f} />
      <Caption f={f} range={T.B1} text={TEXT.cap1} first />
      <Caption f={f} range={T.B2} text={TEXT.cap2} />
      <Caption f={f} range={T.B3} text={TEXT.cap3} />
      <Caption f={f} range={T.B4} text={TEXT.cap4} />
      <Caption f={f} range={T.B5} text={TEXT.cap5} />
      <FlashMarker f={f} />
    </AbsoluteFill>
  );
}
