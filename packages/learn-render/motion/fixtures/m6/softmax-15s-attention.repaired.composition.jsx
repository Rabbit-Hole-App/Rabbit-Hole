import React, { Fragment } from 'react';
import { AbsoluteFill, Easing, interpolate, interpolateColors, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export const stage = { width: 1920, height: 1080, fps: 30, durationInFrames: 450 };

export const timeline = { B1: [0, 120], B2: [120, 210], B3: [210, 300], B4: [300, 375], B5: [375, 450] };

export const TEXT = {
  codeIf: 'if self.flash:',
  codeElse: 'else:',
  codeSoftmax: 'att = F.softmax(att, dim=-1)',
  flashNote: 'If true: scaled_dot_product_attention, is_causal=True',
  branchTag: 'else branch: self.flash is false',
  chainShort: 'scores → masked_fill → softmax',
  scoreRow: '2.1 | 0.5 | 1.3 | -inf | -inf',
  future: 'future positions',
  weights: 'weights',
  zero: '0',
  dimArrow: 'dim=-1: along the row, over key positions',
  sum: 'sum = 1',
  rowLength: 'Row length unchanged',
  chainFull: 'scores → masked_fill → softmax → attn_dropout → att @ v',
  matmul: 'y = att @ v',
  capB2: 'After masked_fill, future positions hold -inf.',
  capB3: 'Larger scores get larger weights; -inf becomes exactly 0.',
  capB4: 'Non-negative weights that sum to 1.',
  capB5: 'Weights then flow into att @ v.',
};

// ---------- palette & layout ----------
const FONT_UI = 'Inter';
const FONT_CODE = 'JetBrains Mono';

const C = {
  bg: '#0d1018',
  panel: '#1a2030',
  line: '#2f3a50',
  text: '#e9ecf3',
  dim: '#7c849a',
  faint: '#4f5870',
  amber: '#ffb44d',
  red: '#ff6b6b',
  green: '#5fd39a',
};
const BAR_COLORS = ['#5fa8ff', '#8ec5ff', '#3d7fd6'];

const B2s = timeline.B2[0];
const B3s = timeline.B3[0];
const B4s = timeline.B4[0];
const B5s = timeline.B5[0];

const ROW_X = 430;
const CELL_W = 180;
const GAP = 40;
const ROW_W = 5 * CELL_W + 4 * GAP;
const BOX_TOP = 500;
const BOX_H = 120;
const BASE_Y = 660;
const BAR_K = 480;
const ARROW_Y = 290;
const LEN_Y = 740;
const UNIT_X = 560;
const UNIT_W = 800;
const UNIT_Y = 815;
const UNIT_H = 44;
const CHAIN_X = 300;
const CHAIN_FS = 40;
const CHAIN_TOP = 150;
const CHAIN_TOP_B5 = 360;
const NODE_X = 1536;
const cellX = (i) => ROW_X + i * (CELL_W + GAP);

// ---------- primitives ----------
const CL = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
const EASE = Easing.inOut(Easing.cubic);
const ramp = (f, a, b, easing = EASE) => interpolate(f, [a, b], [0, 1], { ...CL, easing });
const mix = (t, a, b) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

const PIPE = '|';
const splitRow = (s) => {
  const cells = [];
  const seps = [];
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === PIPE) {
      cells.push(s.slice(start, i - 1));
      seps.push(s.slice(i - 1, i + 2));
      start = i + 2;
    }
  }
  cells.push(s.slice(start));
  return { cells, seps };
};

const ARROW = '\u2192';
const splitChain = (s) => {
  const parts = [];
  let start = 0;
  let k = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === ARROW) {
      parts.push({ text: s.slice(start, i - 1), step: true, k, at: start });
      k += 1;
      parts.push({ text: s.slice(i - 1, i + 2), step: false, k: -1, at: i - 1 });
      start = i + 2;
    }
  }
  parts.push({ text: s.slice(start), step: true, k, at: start });
  return parts;
};

const ROW = splitRow(TEXT.scoreRow);
const SCORES = ROW.cells.map((c) => {
  const v = parseFloat(c);
  return Number.isFinite(v) ? v : -Infinity;
});
const EXPS = SCORES.map((v) => Math.exp(v));
const EXP_SUM = EXPS.reduce((a, b) => a + b, 0);
const WEIGHTS = EXPS.map((e) => e / EXP_SUM);
const MASKED_IDX = WEIGHTS.map((w, i) => (w > 0 ? -1 : i)).filter((i) => i >= 0);

// ---------- B1 code objects ----------
const FlashIfLine = ({ f }) => {
  const op = (0.7 - 0.25 * ramp(f, 50, 75)) * (1 - ramp(f, B2s, B2s + 15));
  const slide = (1 - ramp(f, 0, 16, Easing.out(Easing.cubic))) * -30;
  return (
    <div data-object="flash_if_line" style={{ position: 'absolute', left: 420, top: 230 + slide, fontFamily: FONT_CODE, fontSize: 48, color: C.dim, opacity: op, whiteSpace: 'pre' }}>
      {TEXT.codeIf}
    </div>
  );
};

const FlashPathNote = ({ f }) => {
  const op = 0.6 * (1 - ramp(f, B2s, B2s + 15));
  const slide = (1 - ramp(f, 0, 22, Easing.out(Easing.cubic))) * 40;
  return (
    <div data-object="flash_path_note" style={{ position: 'absolute', left: 870 + slide, top: 242, fontFamily: FONT_UI, fontSize: 28, fontStyle: 'italic', color: C.dim, opacity: op, borderLeft: `2px solid ${C.faint}`, paddingLeft: 14, whiteSpace: 'nowrap' }}>
      {TEXT.flashNote}
    </div>
  );
};

const ElseLine = ({ f }) => {
  const op = 1 - ramp(f, B2s, B2s + 15);
  const color = interpolateColors(ramp(f, 10, 30), [0, 1], [C.dim, C.text]);
  const slide = (1 - ramp(f, 0, 20, Easing.out(Easing.cubic))) * -40;
  return (
    <div data-object="else_line" style={{ position: 'absolute', left: 420 + slide, top: 420, fontFamily: FONT_CODE, fontSize: 48, color, opacity: op, whiteSpace: 'pre' }}>
      {TEXT.codeElse}
    </div>
  );
};

const SoftmaxLine = ({ f }) => {
  const t = ramp(f, B2s, B2s + 25);
  const inT = ramp(f, 0, 24, Easing.out(Easing.cubic));
  const hl = 0.4 + 0.6 * ramp(f, 20, 40);
  const dimT = ramp(f, B3s, B3s + 15);
  return (
    <div
      data-object="softmax_line"
      style={{
        position: 'absolute',
        left: mix(t, 535, 60) + (1 - inT) * 60,
        top: mix(t, 520, 46),
        fontFamily: FONT_CODE,
        fontSize: mix(t, 48, 26),
        color: interpolateColors(hl, [0, 1], [C.text, '#ffe2b5']),
        opacity: 1 - 0.45 * dimT,
        background: `rgba(255,180,77,${0.16 * hl})`,
        borderLeft: `${mix(t, 6, 3)}px solid rgba(255,180,77,${hl})`,
        padding: `${mix(t, 10, 4)}px ${mix(t, 20, 10)}px`,
        borderRadius: 6,
        whiteSpace: 'pre',
      }}
    >
      {TEXT.codeSoftmax}
    </div>
  );
};

const BranchTag = ({ f }) => {
  const { fps } = useVideoConfig();
  const t = ramp(f, B2s, B2s + 25);
  const pop = spring({ frame: Math.max(0, f - 10), fps, config: { damping: 12, stiffness: 170 } });
  return (
    <div
      data-object="branch_tag"
      style={{
        position: 'absolute',
        left: mix(t, 535, 545),
        top: mix(t, 616, 44),
        transform: `scale(${0.85 + 0.15 * pop})`,
        transformOrigin: 'left center',
        opacity: 1,
        fontFamily: FONT_UI,
        fontSize: mix(t, 28, 22),
        fontWeight: 600,
        color: C.amber,
        background: 'rgba(255,180,77,0.12)',
        border: '2px solid rgba(255,180,77,0.7)',
        borderRadius: 999,
        padding: `${mix(t, 8, 5)}px ${mix(t, 18, 12)}px`,
        whiteSpace: 'nowrap',
      }}
    >
      {TEXT.branchTag}
    </div>
  );
};

// ---------- chain ----------
const OrderChain = ({ f }) => {
  const full = f >= B5s;
  const parts = splitChain(full ? TEXT.chainFull : TEXT.chainShort);
  const reveal = ramp(f, B2s, B2s + 22, Easing.out(Easing.cubic));
  const op = (f < B2s ? 0 : 1) * (1 - 0.65 * ramp(f, B4s, B4s + 12) + 0.65 * ramp(f, B5s, B5s + 10));
  const top = mix(ramp(f, B5s, B5s + 18), CHAIN_TOP, CHAIN_TOP_B5);
  const act = ramp(f, B2s + 18, B2s + 30) + ramp(f, B3s, B3s + 15) + ramp(f, B5s + 17, B5s + 30) + ramp(f, B5s + 45, B5s + 57);
  const ext = ramp(f, B5s + 3, B5s + 20);
  return (
    <div
      data-object="order_chain"
      style={{
        position: 'absolute',
        left: CHAIN_X - 14,
        top: top - 14,
        padding: 14,
        opacity: op,
        clipPath: `inset(0 ${(1 - reveal) * 100}% 0 0)`,
        whiteSpace: 'pre',
        fontFamily: FONT_CODE,
        fontSize: CHAIN_FS,
        lineHeight: 1.2,
      }}
    >
      {parts.map((p, idx) => {
        const isNew = full && p.at >= TEXT.chainShort.length;
        const pieceOp = isNew ? ext : 1;
        if (!p.step) {
          return (
            <span key={idx} style={{ fontFamily: FONT_CODE, color: C.faint, opacity: pieceOp }}>
              {p.text}
            </span>
          );
        }
        const glow = clamp01(1 - Math.abs(p.k - act));
        const base = p.k <= act + 0.001 ? C.text : C.dim;
        return (
          <span
            key={idx}
            style={{
              fontFamily: FONT_CODE,
              color: interpolateColors(glow, [0, 1], [base, C.amber]),
              background: `rgba(255,180,77,${0.18 * glow})`,
              boxShadow: `0 0 0 6px rgba(255,180,77,${0.18 * glow})`,
              borderRadius: 4,
              opacity: pieceOp,
            }}
          >
            {p.text}
          </span>
        );
      })}
    </div>
  );
};

// ---------- score row ----------
const ScoreCell = ({ f, i }) => {
  const w = WEIGHTS[i];
  const masked = !(w > 0);
  const arrive = ramp(f, B2s + i * 4, B2s + i * 4 + 12, Easing.out(Easing.cubic));
  const flip = masked ? ramp(f, B2s + 14 + i * 4, B2s + 28 + i * 4, Easing.linear) : 1;
  const m = ramp(f, B3s + 5 + i * 4, B3s + 27 + i * 4);
  const barH = masked ? 6 : w * BAR_K;
  const top = mix(m, mix(arrive, 210, BOX_TOP), BASE_Y - barH);
  const h = mix(m, BOX_H, barH);
  const face = masked ? Math.abs(1 - 2 * flip) : 1;
  const flipped = flip >= 0.5;
  const fill = interpolateColors(m, [0, 1], [C.panel, masked ? '#7a3540' : BAR_COLORS[i % 3]]);
  const border = masked ? (flipped ? C.red : C.line) : interpolateColors(m, [0, 1], [C.line, BAR_COLORS[i % 3]]);
  const scoreOp = (masked && !flipped ? 0 : 1) * (1 - clamp01(m * 2));
  const numOp = clamp01(m * 2 - 1);
  return (
    <div
      style={{
        position: 'absolute',
        left: cellX(i),
        top,
        width: CELL_W,
        height: h,
        boxSizing: 'border-box',
        background: fill,
        border: `2px solid ${border}`,
        borderRadius: mix(m, 14, 6),
        opacity: arrive,
        transform: `scaleY(${face})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {f < B4s ? (
        <span style={{ fontFamily: FONT_CODE, fontSize: 44, color: masked ? C.red : C.text, opacity: scoreOp, whiteSpace: 'pre' }}>
          {ROW.cells[i]}
        </span>
      ) : null}
      {f >= B3s && !masked ? (
        <span style={{ position: 'absolute', left: 0, width: '100%', top: -46, textAlign: 'center', fontFamily: FONT_CODE, fontSize: 30, color: C.text, opacity: numOp }}>
          {w.toFixed(2)}
        </span>
      ) : null}
    </div>
  );
};

const RowSep = ({ f, i }) => {
  const op = ramp(f, B2s + (i + 1) * 4, B2s + (i + 1) * 4 + 12) * (1 - ramp(f, B3s, B3s + 15));
  return (
    <span style={{ position: 'absolute', left: cellX(i) + CELL_W - 16, width: 72, top: BOX_TOP + 34, textAlign: 'center', fontFamily: FONT_CODE, fontSize: 40, color: C.faint, opacity: op, whiteSpace: 'pre' }}>
      {ROW.seps[i]}
    </span>
  );
};

const ScoreRow = ({ f }) => {
  const tr1 = ramp(f, B5s + 5, B5s + 32);
  const tr2 = ramp(f, B5s + 45, B5s + 68);
  const cx = mix(tr2, mix(tr1, 960, 1220), NODE_X);
  const cy = mix(tr2, mix(tr1, 500, 590), 640);
  const sc = mix(tr2, mix(tr1, 1, 0.26), 0.2);
  const ghostFade = 1 - ramp(f, B5s, B5s + 12);
  let cum = 0;
  const ghosts = WEIGHTS.map((w, i) => {
    const start = cum;
    cum += w;
    return { w, i, start };
  }).filter((g) => g.w > 0);
  return (
    <div data-object="score_row" style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080 }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transform: `translate(${cx - 960}px, ${cy - 500}px) scale(${sc})`, transformOrigin: '960px 500px' }}>
        {ROW.cells.map((_, i) => (
          <Fragment key={i}>
            <ScoreCell f={f} i={i} />
            {i < ROW.seps.length && f < B4s ? <RowSep f={f} i={i} /> : null}
          </Fragment>
        ))}
        {f >= B3s ? (
          <div style={{ position: 'absolute', left: ROW_X - 230, width: 200, top: 560, textAlign: 'right', fontFamily: FONT_UI, fontSize: 36, fontWeight: 600, color: BAR_COLORS[0], opacity: ramp(f, B3s + 10, B3s + 25) }}>
            {TEXT.weights}
          </div>
        ) : null}
      </div>
      {f >= B4s
        ? ghosts.map((g) => {
            const t = ramp(f, B4s + 3 + g.i * 3, B4s + 22 + g.i * 3);
            const h0 = g.w * BAR_K;
            return (
              <div
                key={g.i}
                style={{
                  position: 'absolute',
                  left: mix(t, cellX(g.i), UNIT_X + g.start * UNIT_W),
                  top: mix(t, BASE_Y - h0, UNIT_Y),
                  width: mix(t, CELL_W, g.w * UNIT_W),
                  height: mix(t, h0, UNIT_H),
                  boxSizing: 'border-box',
                  background: BAR_COLORS[g.i % 3],
                  border: `1px solid ${C.bg}`,
                  borderRadius: 4,
                  opacity: ghostFade * mix(t, 0.35, 0.95),
                }}
              />
            );
          })
        : null}
    </div>
  );
};

const FutureMarker = ({ f }) => {
  const op = ramp(f, B2s + 28, B2s + 42) * (1 - ramp(f, B3s, B3s + 12));
  const x1 = cellX(MASKED_IDX[0]);
  const x2 = cellX(MASKED_IDX[MASKED_IDX.length - 1]) + CELL_W;
  return (
    <div data-object="future_marker" style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, opacity: op }}>
      <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0 }}>
        <path d={`M ${x1} 490 L ${x1} 476 L ${x2} 476 L ${x2} 490`} stroke={C.red} strokeWidth={3} fill="none" />
      </svg>
      <div style={{ position: 'absolute', left: x1, width: x2 - x1, top: 428, textAlign: 'center', fontFamily: FONT_UI, fontSize: 28, fontWeight: 600, color: C.red }}>
        {TEXT.future}
      </div>
    </div>
  );
};

const ZeroLabels = ({ f }) => (
  <div data-object="zero_labels" style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080 }}>
    {MASKED_IDX.map((i) => {
      const op = ramp(f, B3s + 18 + i * 4, B3s + 30 + i * 4) * (1 - 0.5 * ramp(f, B4s, B4s + 12)) * (1 - ramp(f, B5s, B5s + 10));
      return (
        <div key={i} style={{ position: 'absolute', left: cellX(i), width: CELL_W, top: BASE_Y + 12, textAlign: 'center', fontFamily: FONT_UI, fontSize: 40, fontWeight: 700, color: C.red, opacity: op }}>
          {TEXT.zero}
        </div>
      );
    })}
  </div>
);

const RowAxisArrow = ({ f }) => {
  const sweep = ramp(f, B3s + 5, B3s + 40);
  const op = ramp(f, B3s, B3s + 8) * (1 - 0.75 * ramp(f, B4s, B4s + 12)) * (1 - ramp(f, B5s, B5s + 10));
  const tip = ROW_X + sweep * ROW_W;
  return (
    <div data-object="row_axis_arrow" style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, opacity: op }}>
      <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0 }}>
        <line x1={ROW_X} y1={ARROW_Y} x2={tip} y2={ARROW_Y} stroke={C.amber} strokeWidth={4} />
        <polygon points={`${tip + 4},${ARROW_Y} ${tip - 16},${ARROW_Y - 11} ${tip - 16},${ARROW_Y + 11}`} fill={C.amber} opacity={sweep > 0.02 ? 1 : 0} />
      </svg>
      <div style={{ position: 'absolute', left: ROW_X, width: ROW_W, top: 232, textAlign: 'center', fontFamily: FONT_UI, fontSize: 30, fontWeight: 600, color: C.amber, opacity: ramp(f, B3s + 10, B3s + 25) }}>
        {TEXT.dimArrow}
      </div>
    </div>
  );
};

// ---------- B4 objects ----------
const UnitBracket = ({ f }) => {
  const fade = 1 - ramp(f, B5s, B5s + 12);
  const frameOp = ramp(f, B4s, B4s + 10) * fade;
  const close = ramp(f, B4s + 22, B4s + 32);
  const lab = ramp(f, B4s + 28, B4s + 36) * fade;
  const cxu = UNIT_X + UNIT_W / 2;
  const half = (close * UNIT_W) / 2;
  const by = UNIT_Y + UNIT_H + 18;
  return (
    <div data-object="unit_bracket" style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080 }}>
      <div style={{ position: 'absolute', left: UNIT_X - 5, top: UNIT_Y - 5, width: UNIT_W + 10, height: UNIT_H + 10, boxSizing: 'border-box', border: `2px dashed ${C.dim}`, borderRadius: 6, opacity: frameOp * 0.8 }} />
      <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0, opacity: fade * (close > 0.01 ? 1 : 0) }}>
        <path d={`M ${cxu - half} ${by - 12} L ${cxu - half} ${by} L ${cxu + half} ${by} L ${cxu + half} ${by - 12}`} stroke={C.green} strokeWidth={4} fill="none" />
      </svg>
      <div style={{ position: 'absolute', left: UNIT_X, width: UNIT_W, top: by + 10, textAlign: 'center', fontFamily: FONT_UI, fontSize: 36, fontWeight: 700, color: C.green, opacity: lab }}>
        {TEXT.sum}
      </div>
    </div>
  );
};

const LengthMarker = ({ f }) => {
  const draw = ramp(f, B4s, B4s + 18);
  const op = ramp(f, B4s, B4s + 6) * (1 - ramp(f, B5s, B5s + 12));
  const end = ROW_X + draw * ROW_W;
  return (
    <div data-object="length_marker" style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, opacity: op }}>
      <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0 }}>
        <line x1={ROW_X} y1={LEN_Y} x2={end} y2={LEN_Y} stroke={C.dim} strokeWidth={3} />
        <line x1={ROW_X} y1={LEN_Y - 10} x2={ROW_X} y2={LEN_Y + 10} stroke={C.dim} strokeWidth={3} />
        <line x1={end} y1={LEN_Y - 10} x2={end} y2={LEN_Y + 10} stroke={C.dim} strokeWidth={3} />
        {WEIGHTS.map((_, i) => {
          const x = cellX(i) + CELL_W / 2;
          return <circle key={i} cx={x} cy={LEN_Y} r={6} fill={WEIGHTS[i] > 0 ? BAR_COLORS[i % 3] : C.red} opacity={x <= end ? 1 : 0} />;
        })}
      </svg>
      <div style={{ position: 'absolute', left: ROW_X, width: ROW_W, top: LEN_Y + 14, textAlign: 'center', fontFamily: FONT_UI, fontSize: 28, color: C.text, opacity: ramp(f, B4s + 8, B4s + 20) }}>
        {TEXT.rowLength}
      </div>
    </div>
  );
};

// ---------- B5 object ----------
const MatmulNode = ({ f }) => {
  const op = ramp(f, B5s + 8, B5s + 22);
  const glow = ramp(f, B5s + 55, B5s + 70);
  return (
    <div data-object="matmul_node" style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, opacity: op }}>
      <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0 }}>
        <line x1={NODE_X} y1={CHAIN_TOP_B5 + 58} x2={NODE_X} y2={516} stroke={C.dim} strokeWidth={3} strokeDasharray="8 8" />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: NODE_X - 160,
          top: 520,
          width: 320,
          height: 180,
          boxSizing: 'border-box',
          background: C.panel,
          border: `3px solid ${interpolateColors(glow, [0, 1], [C.line, C.green])}`,
          borderRadius: 16,
          boxShadow: `0 0 ${40 * glow}px rgba(95,211,154,${0.6 * glow})`,
        }}
      >
        <div style={{ position: 'absolute', left: 0, width: '100%', top: 18, textAlign: 'center', fontFamily: FONT_CODE, fontSize: 36, color: interpolateColors(glow, [0, 1], [C.text, C.green]), whiteSpace: 'pre' }}>
          {TEXT.matmul}
        </div>
      </div>
    </div>
  );
};

// ---------- captions ----------
const CAPTIONS = [
  { beat: timeline.B2, text: TEXT.capB2, last: false },
  { beat: timeline.B3, text: TEXT.capB3, last: false },
  { beat: timeline.B4, text: TEXT.capB4, last: false },
  { beat: timeline.B5, text: TEXT.capB5, last: true },
];

const Captions = ({ f }) => (
  <Fragment>
    {CAPTIONS.map((c, i) => {
      const [s, e] = c.beat;
      if (f < s || f >= e) return null;
      const op = ramp(f, s, s + 10) * (c.last ? 1 : 1 - ramp(f, e - 8, e));
      return (
        <div key={i} style={{ position: 'absolute', left: 160, width: 1600, top: 968, textAlign: 'center', fontFamily: FONT_UI, fontSize: 40, fontWeight: 500, color: C.text, opacity: op }}>
          {c.text}
        </div>
      );
    })}
  </Fragment>
);

// ---------- composition ----------
const SoftmaxWeights = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <FlashIfLine f={f} />
      <FlashPathNote f={f} />
      <ElseLine f={f} />
      <SoftmaxLine f={f} />
      <BranchTag f={f} />
      <OrderChain f={f} />
      <FutureMarker f={f} />
      <RowAxisArrow f={f} />
      <LengthMarker f={f} />
      <UnitBracket f={f} />
      <MatmulNode f={f} />
      <ScoreRow f={f} />
      <ZeroLabels f={f} />
      <Captions f={f} />
    </AbsoluteFill>
  );
};

export default SoftmaxWeights;
