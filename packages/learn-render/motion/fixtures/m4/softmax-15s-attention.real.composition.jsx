import React from 'react';
import { AbsoluteFill, Easing, interpolate, interpolateColors, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export const stage = { width: 1920, height: 1080, fps: 30, durationInFrames: 450 };

export const timeline = { B1: [0, 120], B2: [120, 210], B3: [210, 300], B4: [300, 375], B5: [375, 450] };

export const TEXT = {
  flashIfLine: 'if self.flash:',
  elseLine: 'else:',
  softmaxLine: 'att = F.softmax(att, dim=-1)',
  flashNote: 'If true: scaled_dot_product_attention, is_causal=True',
  branchTag: 'else branch: self.flash is false',
  chainShort: 'scores → masked_fill → softmax',
  scoreRow: '2.1 | 0.5 | 1.3 | -inf | -inf',
  negInf: '-inf',
  future: 'future positions',
  weights: 'weights',
  zero: '0',
  axis: 'dim=-1: along the row, over key positions',
  sumOne: 'sum = 1',
  rowLength: 'Row length unchanged',
  chainFull: 'scores → masked_fill → softmax → attn_dropout → att @ v',
  matmul: 'y = att @ v',
  osB2: 'After masked_fill, future positions hold -inf.',
  osB3: 'Larger scores get larger weights; -inf becomes exactly 0.',
  osB4: 'Non-negative weights that sum to 1.',
  osB5: 'Weights then flow into att @ v.',
};

// ---------- palette & layout ----------
const INTER = 'Inter';
const MONO = 'JetBrains Mono';
const C = {
  bg: '#0e1118',
  text: '#e9ecf4',
  dim: '#7d8496',
  keyword: '#c792ea',
  accent: '#f5b942',
  teal: '#3fd0b6',
  mask: '#ff6b8b',
  maskBg: '#3a1a26',
  cell: '#1d2331',
  cellBorder: '#56607a',
  arrow: '#ffd479',
  bar: '#7cc4ff',
};
const BAR_COLORS = ['#4f9dff', '#9bd0ff', '#2f6fd6'];

const [B1S] = timeline.B1;
const [B2S] = timeline.B2;
const [B3S] = timeline.B3;
const [B4S] = timeline.B4;
const [B5S] = timeline.B5;

const CODE_X = 460;
const SOFT_HOME = { x: 540, y: 500 };
const SOFT_DOCK = { x: 60, y: 36 };
const TAG_HOME = { x: 540, y: 615 };
const TAG_DOCK = { x: 560, y: 40 };

const X0 = 412;
const SLOT_W = 200;
const GAP = 24;
const PITCH = SLOT_W + GAP;
const ROW_W = 5 * SLOT_W + 4 * GAP;
const BASE = 610;
const CELL_H = 120;
const UNIT_H = 400;
const STACK_Y = 780;
const STACK_H = 50;
const ARROW_Y = 290;
const ROW_CX = 960;
const ROW_CY = 500;

const CHAIN_X = 366;
const CHAIN_Y = 170;
const CHAIN_FS = 36;
const CW = CHAIN_FS * 0.6;
const PAD = 14;
const STEPS = [[0, 6], [9, 20], [23, 30], [33, 45], [48, 55]];
const SHORT_LEN = 30;
const FULL_LEN = 55;

const SCORES = [2.1, 0.5, 1.3];
const EXPS = SCORES.map((s) => Math.exp(s));
const EXP_SUM = EXPS.reduce((a, b) => a + b, 0);
const WEIGHTS = [...EXPS.map((e) => e / EXP_SUM), 0, 0];
const CUM = WEIGHTS.reduce((acc, w, i) => { acc.push(i === 0 ? 0 : acc[i - 1] + WEIGHTS[i - 1]); return acc; }, []);
const SLOTS = [0, 1, 2, 3, 4];

const NODE = { x: 1268, y: 390, w: 420, h: 250 };

// ---------- primitives ----------
const ease = Easing.inOut(Easing.cubic);
const CL = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
const ramp = (f, a, b) => interpolate(f, [a, b], [0, 1], { ...CL, easing: ease });
const keys = (f, input, output) => interpolate(f, input, output, { ...CL, easing: ease });
const lerp = (a, b, t) => a + (b - a) * t;
const abs = { position: 'absolute' };

// ---------- objects ----------
const FlashIfLine = ({ f }) => {
  const op = keys(f, [B1S, B1S + 15, B1S + 70, B1S + 90, B2S, B2S + 15], [0, 0.55, 0.55, 0.3, 0.3, 0]);
  return (
    <div data-object="flash_if_line" style={{ ...abs, left: CODE_X, top: 210, fontFamily: MONO, fontSize: 40, color: C.keyword, opacity: op, whiteSpace: 'pre' }}>
      {TEXT.flashIfLine}
    </div>
  );
};

const FlashPathNote = ({ f }) => {
  const op = keys(f, [B1S + 8, B1S + 22, B2S, B2S + 15], [0, 0.5, 0.5, 0]);
  return (
    <div data-object="flash_path_note" style={{ ...abs, left: 860, top: 216, padding: '6px 14px', border: `2px dashed ${C.dim}`, borderRadius: 10, fontFamily: INTER, fontSize: 26, color: C.dim, opacity: op, whiteSpace: 'pre' }}>
      {TEXT.flashNote}
    </div>
  );
};

const ElseLine = ({ f }) => {
  const op = keys(f, [B1S + 18, B1S + 32, B1S + 35, B1S + 48, B2S, B2S + 15], [0, 0.6, 0.6, 1, 1, 0]);
  return (
    <div data-object="else_line" style={{ ...abs, left: CODE_X, top: 410, fontFamily: MONO, fontSize: 44, color: C.keyword, opacity: op, whiteSpace: 'pre' }}>
      {TEXT.elseLine}
    </div>
  );
};

const SoftmaxLine = ({ f }) => {
  const t = ramp(f, B1S + 28, B1S + 46);
  const h = ramp(f, B1S + 42, B1S + 55);
  const m = ramp(f, B2S, B2S + 20);
  const op = t * keys(f, [B3S, B3S + 12], [1, 0.45]);
  const dx = (SOFT_DOCK.x - SOFT_HOME.x) * m + (1 - t) * -40;
  const dy = (SOFT_DOCK.y - SOFT_HOME.y) * m;
  const s = lerp(1, 0.5, m);
  return (
    <div data-object="softmax_line" style={{ ...abs, left: SOFT_HOME.x, top: SOFT_HOME.y, transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: op, padding: '10px 22px', borderRadius: 10, background: `rgba(245,185,66,${0.16 * h})`, borderLeft: `6px solid rgba(245,185,66,${h})`, fontFamily: MONO, fontSize: 52, color: C.text, whiteSpace: 'pre' }}>
      {TEXT.softmaxLine}
    </div>
  );
};

const BranchTag = ({ f, fps }) => {
  const p = spring({ frame: Math.max(0, f - (B1S + 46)), fps, config: { damping: 13, stiffness: 170 } });
  const op = ramp(f, B1S + 46, B1S + 54);
  const m = ramp(f, B2S, B2S + 20);
  const dx = (TAG_DOCK.x - TAG_HOME.x) * m;
  const dy = (TAG_DOCK.y - TAG_HOME.y) * m;
  const s = lerp(1, 0.8, m) * lerp(0.6, 1, p);
  return (
    <div data-object="branch_tag" style={{ ...abs, left: TAG_HOME.x, top: TAG_HOME.y, transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: op, padding: '10px 20px', borderRadius: 30, background: '#12302c', border: `2px solid ${C.teal}`, fontFamily: INTER, fontSize: 30, fontWeight: 600, color: C.teal, whiteSpace: 'pre' }}>
      {TEXT.branchTag}
    </div>
  );
};

const OrderChain = ({ f }) => {
  const op = keys(f, [B2S + 4, B2S + 10, B4S, B4S + 12, B5S, B5S + 10], [0, 1, 1, 0.3, 0.3, 1]);
  const inB5 = f >= B5S;
  const len = inB5 ? lerp(SHORT_LEN, FULL_LEN, ramp(f, B5S + 2, B5S + 20)) : SHORT_LEN * ramp(f, B2S + 4, B2S + 24);
  const idx = keys(f, [B2S + 20, B3S, B3S + 12, B5S + 19, B5S + 29, B5S + 33, B5S + 43], [1, 1, 2, 2, 3, 3, 4]);
  const i0 = Math.min(3, Math.floor(idx));
  const fr = idx - i0;
  const a = STEPS[i0];
  const b = STEPS[i0 + 1];
  const hs = lerp(a[0], b[0], fr);
  const he = lerp(a[1], b[1], fr);
  const hop = ramp(f, B2S + 20, B2S + 30);
  const lh = CHAIN_FS * 1.4;
  return (
    <div data-object="order_chain" style={{ ...abs, left: CHAIN_X - PAD, top: CHAIN_Y - 10, width: len * CW + PAD * 2, height: lh + 20, overflow: 'hidden', opacity: op }}>
      <div style={{ ...abs, left: PAD + hs * CW - 8, top: 6, width: (he - hs) * CW + 16, height: lh + 8, borderRadius: 10, background: 'rgba(245,185,66,0.22)', border: `2px solid ${C.accent}`, opacity: hop, boxSizing: 'border-box' }} />
      <div style={{ ...abs, left: PAD, top: 10, fontFamily: MONO, fontSize: CHAIN_FS, lineHeight: `${lh}px`, letterSpacing: 0, color: C.text, whiteSpace: 'pre' }}>
        {inB5 ? TEXT.chainFull : TEXT.chainShort}
      </div>
    </div>
  );
};

const FiniteSlot = ({ i, f }) => {
  const a = ramp(f, B2S + 16 + i * 4, B2S + 22 + i * 4);
  const g = ramp(f, B3S + 4 + i * 3, B3S + 34 + i * 3);
  const h = lerp(CELL_H, WEIGHTS[i] * UNIT_H, g);
  const fill = interpolateColors(g, [0, 1], [C.cell, BAR_COLORS[i]]);
  const border = interpolateColors(g, [0, 1], [C.cellBorder, BAR_COLORS[i]]);
  const scoreOp = 1 - ramp(f, B3S + 4, B3S + 14);
  const wOp = ramp(f, B3S + 20, B3S + 34);
  return (
    <div style={{ ...abs, left: X0 + i * PITCH, top: BASE - h + (1 - a) * -60, width: SLOT_W, height: h, opacity: a }}>
      <div style={{ ...abs, left: 0, top: 0, width: SLOT_W, height: h, background: fill, border: `3px solid ${border}`, borderRadius: 10, boxSizing: 'border-box' }} />
      <div style={{ ...abs, left: 0, top: 0, width: SLOT_W, height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 44, color: C.text, opacity: scoreOp }}>
        {SCORES[i].toFixed(1)}
      </div>
      <div style={{ ...abs, left: 0, top: -46, width: SLOT_W, textAlign: 'center', fontFamily: MONO, fontSize: 32, color: C.text, opacity: wOp }}>
        {WEIGHTS[i].toFixed(2)}
      </div>
    </div>
  );
};

const MaskedSlot = ({ i, f }) => {
  const a = ramp(f, B2S + 16 + i * 4, B2S + 22 + i * 4);
  const fl = B2S + 32 + (i - 3) * 3;
  const sy = keys(f, [fl, fl + 4, fl + 8], [1, 0.05, 1]);
  const flipped = f >= fl + 4;
  const c = ramp(f, B3S + 10, B3S + 26);
  const h = lerp(CELL_H, 4, c);
  const textOp = flipped ? 1 - ramp(f, B3S + 10, B3S + 18) : 0;
  const bg = flipped ? interpolateColors(c, [0, 1], [C.maskBg, C.mask]) : '#151a24';
  const border = flipped ? C.mask : C.cellBorder;
  return (
    <div style={{ ...abs, left: X0 + i * PITCH, top: BASE - h + (1 - a) * -60, width: SLOT_W, height: h, opacity: a, transform: `scaleY(${sy})`, transformOrigin: '50% 50%' }}>
      <div style={{ ...abs, left: 0, top: 0, width: SLOT_W, height: h, background: bg, border: `${h > 8 ? 3 : 0}px ${flipped ? 'solid' : 'dashed'} ${border}`, borderRadius: h > 8 ? 10 : 2, boxSizing: 'border-box' }} />
      <div style={{ ...abs, left: 0, top: 0, width: SLOT_W, height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 44, color: C.mask, opacity: textOp }}>
        {TEXT.negInf}
      </div>
    </div>
  );
};

const RowLabel = ({ f }) => {
  const op1 = keys(f, [B2S + 20, B2S + 32, B3S, B3S + 10], [0, 1, 1, 0]);
  const op2 = ramp(f, B3S + 10, B3S + 22);
  return (
    <>
      <div style={{ ...abs, left: 0, width: 1920, top: BASE + 18, textAlign: 'center', fontFamily: MONO, fontSize: 28, color: C.dim, opacity: op1, whiteSpace: 'pre' }}>
        {TEXT.scoreRow}
      </div>
      <div style={{ ...abs, left: 0, width: 1920, top: BASE + 16, textAlign: 'center', fontFamily: INTER, fontSize: 30, fontWeight: 600, color: C.bar, opacity: op2 }}>
        {TEXT.weights}
      </div>
    </>
  );
};

const GhostSegment = ({ i, f }) => {
  const p = ramp(f, B4S + 2 + i * 4, B4S + 26 + i * 4);
  const op = keys(f, [B4S + 2, B4S + 8, B5S, B5S + 10], [0, 0.9, 0.9, 0]);
  const hBar = WEIGHTS[i] * UNIT_H;
  const x = lerp(X0 + i * PITCH, X0 + CUM[i] * ROW_W, p);
  const y = lerp(BASE - hBar, STACK_Y, p);
  const w = lerp(SLOT_W, WEIGHTS[i] * ROW_W, p);
  const h = lerp(hBar, STACK_H, p);
  const numOp = ramp(f, B4S + 22 + i * 4, B4S + 30 + i * 4);
  return (
    <div style={{ ...abs, left: x, top: y, width: w, height: h, opacity: op, background: BAR_COLORS[i], border: '2px solid #0e1118', borderRadius: 6, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: MONO, fontSize: 26, color: '#0e1118', fontWeight: 700, opacity: numOp }}>{WEIGHTS[i].toFixed(2)}</span>
    </div>
  );
};

const ScoreRow = ({ f }) => {
  const tx = keys(f, [B5S + 2, B5S + 19, B5S + 21, B5S + 33, B5S + 35, B5S + 51], [0, -22, -22, 248, 248, 518]);
  const ty = keys(f, [B5S + 2, B5S + 19, B5S + 35, B5S + 51], [0, -200, -200, -30]);
  const s = keys(f, [B5S + 2, B5S + 19, B5S + 35, B5S + 51], [1, 0.3, 0.3, 0.28]);
  return (
    <div data-object="score_row" style={{ ...abs, left: 0, top: 0, width: 1920, height: 1080, transformOrigin: `${ROW_CX}px ${ROW_CY}px`, transform: `translate(${tx}px, ${ty}px) scale(${s})` }}>
      {SLOTS.map((i) => (i < 3 ? <FiniteSlot key={i} i={i} f={f} /> : <MaskedSlot key={i} i={i} f={f} />))}
      <RowLabel f={f} />
      {[0, 1, 2].map((i) => <GhostSegment key={i} i={i} f={f} />)}
    </div>
  );
};

const FutureMarker = ({ f }) => {
  const op = keys(f, [B2S + 36, B2S + 43, B3S, B3S + 12], [0, 1, 1, 0]);
  const g = ramp(f, B2S + 36, B2S + 44);
  const width = 2 * SLOT_W + GAP;
  return (
    <div data-object="future_marker" style={{ ...abs, left: X0 + 3 * PITCH, top: 418, width, height: 66, opacity: op }}>
      <div style={{ ...abs, left: 0, top: 0, width, textAlign: 'center', fontFamily: INTER, fontSize: 28, fontWeight: 600, color: C.mask }}>
        {TEXT.future}
      </div>
      <div style={{ ...abs, left: 0, top: 44, width, height: 18, borderTop: `4px solid ${C.mask}`, borderLeft: `4px solid ${C.mask}`, borderRight: `4px solid ${C.mask}`, borderRadius: '6px 6px 0 0', boxSizing: 'border-box', transform: `scaleX(${lerp(0.3, 1, g)})` }} />
    </div>
  );
};

const ZeroLabels = ({ f }) => {
  const later = keys(f, [B4S, B4S + 10], [1, 0.75]) * (1 - ramp(f, B5S, B5S + 10));
  return (
    <div data-object="zero_labels" style={{ ...abs, left: 0, top: 0, width: 1920, height: 1080 }}>
      {[3, 4].map((i, k) => (
        <span key={i} style={{ ...abs, left: X0 + i * PITCH, top: BASE + 14, width: SLOT_W, textAlign: 'center', fontFamily: MONO, fontSize: 38, fontWeight: 700, color: C.mask, opacity: ramp(f, B3S + 22 + k * 3, B3S + 30 + k * 3) * later }}>
          {TEXT.zero}
        </span>
      ))}
    </div>
  );
};

const RowAxisArrow = ({ f }) => {
  const s = ramp(f, B3S + 4, B3S + 34);
  const op = keys(f, [B3S + 2, B3S + 8, B4S, B4S + 12, B5S, B5S + 10], [0, 1, 1, 0.25, 0.25, 0]);
  const lop = ramp(f, B3S + 8, B3S + 22);
  const len = ROW_W * s;
  return (
    <div data-object="row_axis_arrow" style={{ ...abs, left: 0, top: 0, width: 1920, height: 1080, opacity: op }}>
      <div style={{ ...abs, left: X0, top: ARROW_Y - 2, width: Math.max(0, len - 18), height: 5, background: C.arrow, borderRadius: 3 }} />
      <svg width={24} height={28} style={{ ...abs, left: X0 + len - 22, top: ARROW_Y - 14, opacity: s > 0.02 ? 1 : 0 }}>
        <polygon points="0,0 24,14 0,28" fill={C.arrow} />
      </svg>
      <div style={{ ...abs, left: 0, width: 1920, top: ARROW_Y - 54, textAlign: 'center', fontFamily: INTER, fontSize: 28, fontWeight: 600, color: C.arrow, opacity: lop }}>
        {TEXT.axis}
      </div>
    </div>
  );
};

const UnitBracket = ({ f }) => {
  const c = ramp(f, B4S + 30, B4S + 38);
  const op = c * (1 - ramp(f, B5S, B5S + 10));
  return (
    <div data-object="unit_bracket" style={{ ...abs, left: X0, top: STACK_Y + STACK_H + 8, width: ROW_W, height: 72, opacity: op }}>
      <div style={{ ...abs, left: 0, top: 0, width: ROW_W, height: 18, borderBottom: `4px solid ${C.text}`, borderLeft: `4px solid ${C.text}`, borderRight: `4px solid ${C.text}`, borderRadius: '0 0 6px 6px', boxSizing: 'border-box', transform: `scaleX(${lerp(1.12, 1, c)})` }} />
      <div style={{ ...abs, left: 0, top: 24, width: ROW_W, textAlign: 'center', fontFamily: INTER, fontSize: 32, fontWeight: 700, color: C.text }}>
        {TEXT.sumOne}
      </div>
    </div>
  );
};

const LengthMarker = ({ f }) => {
  const d = ramp(f, B4S + 4, B4S + 22);
  const op = ramp(f, B4S + 4, B4S + 10) * (1 - ramp(f, B5S, B5S + 10));
  const reach = d * ROW_W;
  return (
    <div data-object="length_marker" style={{ ...abs, left: X0, top: 682, width: ROW_W, height: 56, opacity: op }}>
      <div style={{ ...abs, left: 0, top: 7, width: reach, height: 3, background: C.dim }} />
      <div style={{ ...abs, left: 0, top: 0, width: 3, height: 17, background: C.dim }} />
      <div style={{ ...abs, left: ROW_W - 3, top: 0, width: 3, height: 17, background: C.dim, opacity: d > 0.97 ? 1 : 0 }} />
      {SLOTS.map((i) => {
        const cx = i * PITCH + SLOT_W / 2;
        const dop = interpolate(reach, [cx - 30, cx], [0, 1], CL);
        return <div key={i} style={{ ...abs, left: cx - 6, top: 2, width: 12, height: 12, borderRadius: 6, background: i < 3 ? BAR_COLORS[i] : C.mask, opacity: dop }} />;
      })}
      <div style={{ ...abs, left: 0, top: 20, width: ROW_W, textAlign: 'center', fontFamily: INTER, fontSize: 26, color: C.dim }}>
        {TEXT.rowLength}
      </div>
    </div>
  );
};

const MatmulNode = ({ f }) => {
  const op = ramp(f, B5S + 3, B5S + 17);
  const g = ramp(f, B5S + 49, B5S + 65);
  return (
    <div data-object="matmul_node" style={{ ...abs, left: NODE.x, top: NODE.y, width: NODE.w, height: NODE.h, opacity: op, borderRadius: 18, border: `3px solid ${C.accent}`, background: `rgba(245,185,66,${0.06 + 0.12 * g})`, boxShadow: `0 0 ${20 + 60 * g}px rgba(245,185,66,${0.15 + 0.5 * g})`, boxSizing: 'border-box' }}>
      <div style={{ ...abs, left: 0, top: 176, width: NODE.w - 6, textAlign: 'center', fontFamily: MONO, fontSize: 40, fontWeight: 700, color: interpolateColors(g, [0, 1], [C.text, C.accent]), whiteSpace: 'pre' }}>
        {TEXT.matmul}
      </div>
    </div>
  );
};

const CAPTIONS = [
  { text: TEXT.osB2, range: timeline.B2, hold: false },
  { text: TEXT.osB3, range: timeline.B3, hold: false },
  { text: TEXT.osB4, range: timeline.B4, hold: false },
  { text: TEXT.osB5, range: timeline.B5, hold: true },
];

const OnScreenText = ({ f }) => (
  <>
    {CAPTIONS.map((c, k) => {
      const [from, to] = c.range;
      const op = c.hold ? ramp(f, from + 4, from + 12) : keys(f, [from + 4, from + 12, to - 6, to], [0, 1, 1, 0]);
      return (
        <div key={k} style={{ ...abs, left: 0, width: 1920, top: 950, textAlign: 'center', fontFamily: INTER, fontSize: 38, fontWeight: 600, color: C.text, opacity: op }}>
          {c.text}
        </div>
      );
    })}
  </>
);

export default function SoftmaxAttentionWeights() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: INTER }}>
      <FlashIfLine f={f} />
      <FlashPathNote f={f} />
      <ElseLine f={f} />
      <SoftmaxLine f={f} />
      <BranchTag f={f} fps={fps} />
      <OrderChain f={f} />
      <FutureMarker f={f} />
      <RowAxisArrow f={f} />
      <ScoreRow f={f} />
      <ZeroLabels f={f} />
      <LengthMarker f={f} />
      <UnitBracket f={f} />
      <MatmulNode f={f} />
      <OnScreenText f={f} />
    </AbsoluteFill>
  );
}
