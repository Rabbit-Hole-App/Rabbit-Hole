import React, { Fragment } from 'react';
import { AbsoluteFill, Easing, interpolate, interpolateColors, random, useCurrentFrame } from 'remotion';

export const stage = { width: 1920, height: 1080, fps: 30, durationInFrames: 600 };

export const timeline = {
  B1: [0, 90],
  B2: [90, 180],
  B3: [180, 300],
  B4: [300, 390],
  B5: [390, 450],
  B6: [450, 540],
  B7: [540, 600],
};

export const TEXT = {
  idx: 'idx',
  counterFirst: 'pass 1 / max_new_tokens',
  chipIdxCond: 'idx_cond',
  cropWindow: 'last block_size if too long',
  chipModel: 'self(idx_cond)',
  chipLast: 'logits[:, -1, :]',
  chipTemperature: '/ temperature',
  gate: 'top_k is not None',
  truePath: 'true: below k-th largest → -Inf',
  falsePath: 'false: unchanged',
  chipSoftmax: 'softmax',
  probs: 'probs',
  chipMultinomial: 'multinomial',
  idxNext: 'idx_next',
  chipCat: 'torch.cat',
  counterMany: 'pass … / max_new_tokens',
  returnIdx: 'return idx',
  prompt: 'prompt',
  generated: 'generated',
  counterDone: 'max_new_tokens / max_new_tokens',
  negInf: '-Inf',
  capB1: 'generate repeats one pass max_new_tokens times.',
  capB2: 'Only final-step logits continue.',
  capB3: 'Top-k runs only when top_k is set.',
  capB4: 'A random draw, not always the tallest bar.',
  capB5: 'idx grows by one index.',
  capB6: 'One new index per pass, max_new_tokens times.',
  capB7: 'Returned idx still begins with the prompt indices.',
};

// ---------- beat anchors (from timeline) ----------
const B1 = timeline.B1[0];
const B2 = timeline.B2[0];
const B3 = timeline.B3[0];
const B4 = timeline.B4[0];
const B5 = timeline.B5[0];
const B6 = timeline.B6[0];
const B7 = timeline.B7[0];
const END = timeline.B7[1];

// ---------- palette ----------
const C = {
  bg: '#0e1222',
  text: '#e8ecff',
  muted: '#8a93b8',
  chipFill: '#181d33',
  chipBorder: '#353d5e',
  chipLit: '#25366a',
  accent: '#7aa2ff',
  prompt: '#4f6396',
  gen: '#f2b84b',
  logit: '#7aa2ff',
  heatLo: '#1d2440',
  heatHi: '#5b7bd6',
  inf: '#ff6b6b',
  trueC: '#6fd3a8',
  falseC: '#a0a8c8',
  prob: '#6fd3a8',
  axis: '#3a4366',
  gate: '#f2b84b',
  gateDim: '#7a6430',
  gateFill: '#3b2f14',
};

// ---------- layout ----------
const W = 1920;
const H = 1080;
const ROW_LEFT = 588;
const ROW_Y = 150;
const FINAL_Y = 480;
const CELL = 52;
const STEP = 62;
const PROMPT_N = 6;
const GEN_N = 6;
const TRACK_Y = 360;
const LANE_Y = 640;
const FALSE_Y = 860;
const GATE_X = 1070;
const FORK_IN = 890;
const FORK_OUT = 1250;
const NB = 8;
const BAR_W = 32;
const BAR_STEP = 40;
const BAR_MAX = 100;
const V = [0.55, 0.9, 0.3, 0.7, 0.15, 1.0, 0.4, 0.25];
const TOP = [5, 1, 3];
const LOW_ORDER = [4, 7, 2, 6, 0];
const TEMP_SCALE = 0.65;
const P = [0, 0.32, 0, 0.18, 0, 0.5, 0, 0];
const PICK = 1;
const PROB_CX = 1460;
const PROB_MAX = 300;
const ROW_REST_X = 1120;
const PASS_STEP = 18;
const JOINS = [B5 + 22, B6 + 15, B6 + 15 + PASS_STEP, B6 + 15 + 2 * PASS_STEP, B6 + 15 + 3 * PASS_STEP, B6 + 15 + 4 * PASS_STEP];

const CHIPS = [
  { id: 'chip_idx_cond', key: 'chipIdxCond', x: 120, enter: B2, lit: [B2 + 5, B2 + 30], early: true, order: 0 },
  { id: 'chip_model', key: 'chipModel', x: 320, enter: B2 + 2, lit: [B2 + 24, B2 + 48], early: true, order: 1 },
  { id: 'chip_last', key: 'chipLast', x: 560, enter: B2 + 4, lit: [B2 + 46, B2 + 66], early: true, order: 2 },
  { id: 'chip_temperature', key: 'chipTemperature', x: 800, enter: B2 + 6, lit: [B2 + 68, B2 + 90], early: true, order: 3 },
  { id: 'chip_softmax', key: 'chipSoftmax', x: 1370, enter: B4, lit: [B4 + 18, B4 + 45], early: false, order: 5 },
  { id: 'chip_multinomial', key: 'chipMultinomial', x: 1550, enter: B4 + 26, lit: [B4 + 50, B4 + 85], early: false, order: 6 },
  { id: 'chip_cat', key: 'chipCat', x: 1760, enter: B5, lit: [B5 + 20, B5 + 38], early: false, order: 7 },
];

const CAPTIONS = { B1: 'capB1', B2: 'capB2', B3: 'capB3', B4: 'capB4', B5: 'capB5', B6: 'capB6', B7: 'capB7' };

// ---------- primitives ----------
const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
const lin = (f, a, b) => interpolate(f, [a, b], [0, 1], CLAMP);
const ramp = (f, a, b) => interpolate(f, [a, b], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.cubic) });
const mix = (a, b, t) => a + (b - a) * t;
const tri = (f, peak, half) => Math.max(0, 1 - Math.abs(f - peak) / half);
const win = (f, a, b, e = 6) => Math.min(lin(f, a, a + e), 1 - lin(f, b - e, b));
const full = { position: 'absolute', left: 0, top: 0, width: W, height: H };
const cellX = (i) => ROW_LEFT + i * STEP;
const bx = (i) => PROB_CX - (NB * BAR_STEP) / 2 + i * BAR_STEP + BAR_STEP / 2;

const sweepLit = (f, i) => {
  let v = tri(f, B5 + 30 + i * 4, 5);
  for (let p = 0; p < 5; p++) v = Math.max(v, tri(f, B6 + p * PASS_STEP + i * 2, 3));
  return v;
};

const chipOpacity = (f, s) => {
  const inO = lin(f, s.enter, s.enter + 10);
  const dim = s.early ? interpolate(f, [B3, B3 + 15, B5, B5 + 10], [1, 0.4, 0.4, 0.9], CLAMP) : 1;
  return inO * dim * (1 - lin(f, B7, B7 + 16));
};

const Bars = ({ cx, baseline, scale, keep, inf, color }) => {
  const left = cx - (NB * BAR_STEP) / 2;
  return (
    <div style={{ position: 'absolute', left, top: baseline - BAR_MAX, width: NB * BAR_STEP, height: BAR_MAX }}>
      {V.map((v, i) => (
        <Fragment key={i}>
          <div
            style={{
              position: 'absolute',
              left: i * BAR_STEP + (BAR_STEP - BAR_W) / 2,
              bottom: 0,
              width: BAR_W,
              height: Math.max(0, v * scale * BAR_MAX * (keep ? keep[i] : 1)),
              background: color,
              borderRadius: '4px 4px 0 0',
            }}
          />
          {inf && inf[i] > 0 ? (
            <div
              style={{
                position: 'absolute',
                left: i * BAR_STEP,
                width: BAR_STEP,
                bottom: 6,
                textAlign: 'center',
                fontFamily: 'JetBrains Mono',
                fontSize: 14,
                fontWeight: 700,
                color: C.inf,
                opacity: inf[i],
              }}
            >
              {TEXT.negInf}
            </div>
          ) : null}
        </Fragment>
      ))}
      <div style={{ position: 'absolute', left: 0, width: NB * BAR_STEP, bottom: -3, height: 3, background: C.axis }} />
    </div>
  );
};

// ---------- objects ----------
const TrackLine = ({ f }) => {
  const right = interpolate(
    f,
    [B2, B2 + 10, B3, B3 + 12, B4, B4 + 10, B4 + 26, B4 + 36, B5, B5 + 10],
    [120, 800, 800, GATE_X, GATE_X, 1370, 1370, 1550, 1550, 1760],
    CLAMP
  );
  const op = lin(f, B2, B2 + 8) * (1 - lin(f, B7, B7 + 16));
  return <div style={{ position: 'absolute', left: 120, top: TRACK_Y - 1, width: Math.max(0, right - 120), height: 2, background: C.axis, opacity: op }} />;
};

const Chip = ({ f, spec }) => {
  const op = chipOpacity(f, spec);
  const lit = Math.max(win(f, spec.lit[0], spec.lit[1]), sweepLit(f, spec.order));
  return (
    <div
      data-object={spec.id}
      style={{
        position: 'absolute',
        left: spec.x,
        top: TRACK_Y,
        transform: `translate(-50%, -50%) scale(${1 + 0.06 * lit})`,
        opacity: op,
        padding: '12px 14px',
        borderRadius: 12,
        border: `2px solid ${interpolateColors(lit, [0, 1], [C.chipBorder, C.accent])}`,
        background: interpolateColors(lit, [0, 1], [C.chipFill, C.chipLit]),
        color: C.text,
        fontFamily: 'JetBrains Mono',
        fontSize: 20,
        whiteSpace: 'nowrap',
        boxShadow: lit > 0.05 ? `0 0 ${22 * lit}px ${C.accent}` : 'none',
      }}
    >
      {TEXT[spec.key]}
    </div>
  );
};

const TopKGate = ({ f }) => {
  const op = lin(f, B3, B3 + 12) * interpolate(f, [B4, B4 + 15, B5, B5 + 12], [1, 0.55, 0.55, 0.95], CLAMP) * (1 - lin(f, B7, B7 + 16));
  const lit = Math.max(win(f, B3 + 8, B4 + 4), sweepLit(f, 4));
  const nodeOp = 1 - 0.8 * lin(f, B4, B4 + 15);
  return (
    <div data-object="top_k_gate" style={{ ...full, opacity: op }}>
      <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, opacity: nodeOp }}>
        <line x1={GATE_X} y1={TRACK_Y + 30} x2={GATE_X} y2={LANE_Y - 125} stroke={C.gate} strokeWidth={2} strokeDasharray="6 6" />
        <circle cx={FORK_IN} cy={LANE_Y + 12} r={9} fill={C.gate} />
        <circle cx={FORK_OUT} cy={LANE_Y + 12} r={9} fill={C.gate} />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: GATE_X,
          top: TRACK_Y,
          transform: `translate(-50%, -50%) scale(${1 + 0.06 * lit})`,
          padding: '12px 18px',
          borderRadius: 28,
          border: `3px solid ${interpolateColors(lit, [0, 1], [C.gateDim, C.gate])}`,
          background: interpolateColors(lit, [0, 1], [C.chipFill, C.gateFill]),
          color: C.text,
          fontFamily: 'JetBrains Mono',
          fontSize: 20,
          whiteSpace: 'nowrap',
          boxShadow: lit > 0.05 ? `0 0 ${22 * lit}px ${C.gate}` : 'none',
        }}
      >
        {TEXT.gate}
      </div>
    </div>
  );
};

const TruePath = ({ f }) => {
  const op = lin(f, B3 + 2, B3 + 16) * (1 - lin(f, B4, B4 + 15));
  return (
    <div data-object="true_path" style={{ ...full, opacity: op }}>
      <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0 }}>
        <line x1={FORK_IN} y1={LANE_Y + 12} x2={FORK_OUT} y2={LANE_Y + 12} stroke={C.trueC} strokeWidth={4} />
      </svg>
      <div style={{ position: 'absolute', left: GATE_X, top: LANE_Y - 100, transform: 'translate(-50%, -50%)', fontFamily: 'Inter', fontSize: 24, color: C.trueC, whiteSpace: 'nowrap' }}>
        {TEXT.truePath}
      </div>
    </div>
  );
};

const FalsePath = ({ f }) => {
  const op = lin(f, B3 + 2, B3 + 16) * (1 - lin(f, B4, B4 + 15));
  const glide = ramp(f, B3 + 15, B3 + 45);
  const ghostX = mix(880, GATE_X, glide);
  const ghostOp = lin(f, B3 + 15, B3 + 25) * 0.6;
  const y = FALSE_Y + 12;
  return (
    <div data-object="false_path" style={{ ...full, opacity: op }}>
      <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0 }}>
        <polyline
          points={`${FORK_IN},${LANE_Y + 12} ${FORK_IN + 40},${y} ${FORK_OUT - 40},${y} ${FORK_OUT},${LANE_Y + 12}`}
          fill="none"
          stroke={C.falseC}
          strokeWidth={3}
          strokeDasharray="10 8"
        />
      </svg>
      <div style={{ ...full, opacity: ghostOp }}>
        <Bars cx={ghostX} baseline={FALSE_Y} scale={TEMP_SCALE} color={C.logit} />
      </div>
      <div style={{ position: 'absolute', left: GATE_X, top: FALSE_Y + 50, transform: 'translate(-50%, -50%)', fontFamily: 'Inter', fontSize: 24, color: C.falseC, whiteSpace: 'nowrap' }}>
        {TEXT.falsePath}
      </div>
    </div>
  );
};

const CropWindow = ({ f }) => {
  const op = lin(f, B2, B2 + 6) * (1 - lin(f, B2 + 58, B2 + 72));
  const snap = mix(1.15, 1, ramp(f, B2, B2 + 8));
  const x0 = cellX(2) - 8;
  const x1 = cellX(5) + CELL + 8;
  const tailCx = (cellX(2) + cellX(5) + CELL) / 2;
  const drop = ramp(f, B2 + 8, B2 + 24);
  const enter = ramp(f, B2 + 26, B2 + 38);
  const cx = mix(mix(tailCx, 120, drop), 320, enter);
  const cy = mix(mix(ROW_Y, 460, drop), TRACK_Y, enter);
  const sc = mix(STEP / 36, 1, drop) * mix(1, 0.3, enter);
  const copyOp = lin(f, B2 + 6, B2 + 10) * (1 - lin(f, B2 + 32, B2 + 40));
  return (
    <div data-object="crop_window" style={full}>
      <div style={{ ...full, opacity: op }}>
        <div
          style={{
            position: 'absolute',
            left: x0,
            top: ROW_Y - 36,
            width: x1 - x0,
            height: 72,
            border: `3px dashed ${C.accent}`,
            borderRadius: 12,
            boxSizing: 'border-box',
            transform: `scale(${snap})`,
          }}
        />
        <div style={{ position: 'absolute', left: (x0 + x1) / 2, top: ROW_Y - 62, transform: 'translate(-50%, -50%)', fontFamily: 'Inter', fontSize: 22, color: C.accent, whiteSpace: 'nowrap' }}>
          {TEXT.cropWindow}
        </div>
      </div>
      <div style={{ position: 'absolute', left: cx - 72, top: cy - 15, width: 144, height: 30, opacity: copyOp, transform: `scale(${sc})` }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ position: 'absolute', left: i * 36 + 3, top: 0, width: 30, height: 30, borderRadius: 6, background: C.prompt }} />
        ))}
      </div>
    </div>
  );
};

const LogitsGrid = ({ f }) => {
  const appear = ramp(f, B2 + 32, B2 + 44);
  const aside = ramp(f, B2 + 48, B2 + 62);
  const op = appear * mix(1, 0.18, aside) * (1 - lin(f, B3, B3 + 15));
  return (
    <div
      data-object="logits_grid"
      style={{
        position: 'absolute',
        left: 340,
        top: 428,
        width: NB * BAR_STEP,
        height: 202,
        opacity: op,
        transform: `translateX(${-170 * aside}px) scaleX(${mix(0.3, 1, appear)})`,
        transformOrigin: 'left center',
        border: `2px solid ${C.axis}`,
        borderRadius: 10,
        boxSizing: 'border-box',
      }}
    >
      {[0, 1, 2].map((r) =>
        V.map((_, i) => (
          <div
            key={`${r}-${i}`}
            style={{
              position: 'absolute',
              left: i * BAR_STEP + 2,
              top: 6 + r * 28,
              width: BAR_W,
              height: 22,
              borderRadius: 4,
              background: interpolateColors(random(`grid-${r}-${i}`), [0, 1], [C.heatLo, C.heatHi]),
            }}
          />
        ))
      )}
    </div>
  );
};

const LastLogitsRow = ({ f }) => {
  const appear = lin(f, B2 + 32, B2 + 42);
  const sep = ramp(f, B2 + 48, B2 + 62);
  const toTemp = ramp(f, B2 + 62, B2 + 84);
  const toGate = ramp(f, B3 + 15, B3 + 45);
  const toSoft = ramp(f, B4, B4 + 24);
  const cx = 500 + 60 * sep + 240 * toTemp + (GATE_X - 800) * toGate + (ROW_REST_X - GATE_X) * toSoft;
  const baseline = mix(620, LANE_Y, sep);
  const scale = mix(1, TEMP_SCALE, ramp(f, B2 + 72, B2 + 86));
  const rank = (i) => LOW_ORDER.indexOf(i);
  const flipT = (i) => B3 + 50 + rank(i) * 7;
  const keep = V.map((_, i) => (TOP.includes(i) ? 1 : 1 - lin(f, flipT(i), flipT(i) + 8)));
  const inf = V.map((_, i) => (TOP.includes(i) ? 0 : lin(f, flipT(i) + 4, flipT(i) + 10)));
  const dim = interpolate(f, [B4 + 30, B4 + 45], [1, 0.55], CLAMP);
  const op = appear * dim * (1 - lin(f, B5, B5 + 10));
  return (
    <div data-object="last_logits_row" style={{ ...full, opacity: op }}>
      <Bars cx={cx} baseline={baseline} scale={scale} keep={keep} inf={inf} color={C.logit} />
    </div>
  );
};

const ProbBars = ({ f }) => {
  const grow = ramp(f, B4 + 40, B4 + 60);
  const op = lin(f, B4 + 38, B4 + 44) * (1 - lin(f, B5, B5 + 55));
  const picked = lin(f, B4 + 76, B4 + 84);
  const left = PROB_CX - (NB * BAR_STEP) / 2;
  return (
    <div data-object="prob_bars" style={{ ...full, opacity: op }}>
      <div style={{ position: 'absolute', left, top: LANE_Y - PROB_MAX * 0.5 - 10, width: NB * BAR_STEP, height: PROB_MAX * 0.5 + 10 }}>
        {P.map((p, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: i * BAR_STEP + (BAR_STEP - BAR_W) / 2,
              bottom: 0,
              width: BAR_W,
              height: Math.max(3, p * PROB_MAX * grow),
              borderRadius: '4px 4px 0 0',
              background: i === PICK ? interpolateColors(picked, [0, 1], [C.prob, C.gen]) : C.prob,
            }}
          />
        ))}
        <div style={{ position: 'absolute', left: 0, width: NB * BAR_STEP, bottom: -3, height: 3, background: C.axis }} />
      </div>
      <div style={{ position: 'absolute', left: PROB_CX, top: LANE_Y + 28, transform: 'translate(-50%, -50%)', fontFamily: 'Inter', fontSize: 26, color: C.prob }}>
        {TEXT.probs}
      </div>
    </div>
  );
};

const DrawMarker = ({ f }) => {
  const op = lin(f, B4 + 38, B4 + 46) * (1 - lin(f, B5 + 38, B5 + 54));
  const s = interpolate(f, [B4 + 52, B4 + 78], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) });
  const px = interpolate(s, [0, 0.35, 0.7, 1], [bx(0), bx(7), bx(3), bx(PICK)]);
  const lift = ramp(f, B4 + 78, B4 + 90);
  const travel = ramp(f, B5, B5 + 22);
  const pointerOp = 1 - lin(f, B4 + 80, B4 + 88);
  const cellOp = lin(f, B4 + 78, B4 + 84);
  const barTop = LANE_Y - P[PICK] * PROB_MAX;
  const liftY = mix(barTop - CELL / 2, 452, lift);
  const targetX = cellX(PROMPT_N) + CELL / 2;
  const cx = mix(px, targetX, travel);
  const cy = mix(liftY, ROW_Y, travel);
  const labelY = mix(436, cy - 46, lift);
  return (
    <div data-object="draw_marker" style={{ ...full, opacity: op }}>
      <svg width={28} height={22} style={{ position: 'absolute', left: px - 14, top: 457, opacity: pointerOp }}>
        <polygon points="0,0 28,0 14,22" fill={C.gen} />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: cx - CELL / 2,
          top: cy - CELL / 2,
          width: CELL,
          height: CELL,
          borderRadius: 10,
          background: C.gen,
          opacity: cellOp,
          transform: `scale(${mix(0.5, 1, lift)})`,
          boxShadow: `0 0 18px ${C.gen}`,
        }}
      />
      <div style={{ position: 'absolute', left: cx, top: labelY, transform: 'translate(-50%, -50%)', fontFamily: 'JetBrains Mono', fontSize: 22, color: C.gen, whiteSpace: 'nowrap' }}>
        {TEXT.idxNext}
      </div>
    </div>
  );
};

const IdxRow = ({ f }) => {
  const y = mix(ROW_Y, FINAL_Y, ramp(f, B7, B7 + 26));
  const op = interpolate(f, [B3, B3 + 15, B5, B5 + 10], [1, 0.55, 0.55, 1], CLAMP);
  const cells = [];
  for (let i = 0; i < PROMPT_N + GEN_N; i++) {
    let a = 1;
    let dx = 0;
    let sc = 1;
    let color;
    let glow = 0;
    if (i < PROMPT_N) {
      const s = ramp(f, B1 + i * 6, B1 + 12 + i * 6);
      dx = -(cellX(i) - cellX(0)) * (1 - s);
      color = C.prompt;
      glow = 0;
    } else {
      const t = JOINS[i - PROMPT_N];
      a = ramp(f, t, t + 6);
      sc = mix(0.5, 1, a);
      color = C.gen;
      glow = tri(f, t + 3, 8);
    }
    cells.push(
      <div
        key={i}
        style={{
          position: 'absolute',
          left: cellX(i) + dx,
          top: y - CELL / 2,
          width: CELL,
          height: CELL,
          borderRadius: 10,
          background: color,
          opacity: a,
          transform: `scale(${sc})`,
          border: '2px solid rgba(255,255,255,0.18)',
          boxSizing: 'border-box',
          boxShadow: glow > 0 ? `0 0 ${24 * glow}px ${C.gen}` : 'none',
        }}
      />
    );
  }
  return (
    <div data-object="idx_row" style={{ ...full, opacity: op }}>
      <div style={{ position: 'absolute', left: ROW_LEFT - 22, top: y, transform: 'translate(-100%, -50%)', fontFamily: 'JetBrains Mono', fontSize: 34, color: C.text }}>
        {TEXT.idx}
      </div>
      {cells}
    </div>
  );
};

const LoopCounter = ({ f }) => {
  const shift = JOINS.reduce((s, t) => s + ramp(f, t - 10, t), 0);
  const x = ROW_LEFT + (PROMPT_N + shift) * STEP + 24;
  const op = lin(f, B1 + 32, B1 + 42) * interpolate(f, [B2, B2 + 10, B5, B5 + 10], [1, 0.6, 0.6, 1], CLAMP) * (1 - lin(f, B7, END));
  let pulse = tri(f, B1 + 58, 10);
  JOINS.forEach((t) => {
    pulse = Math.max(pulse, tri(f, t + 3, 6));
  });
  const done = JOINS.filter((t) => f >= t).length;
  const key = f < B6 ? 'counterFirst' : f < B7 ? 'counterMany' : 'counterDone';
  return (
    <div
      data-object="loop_counter"
      style={{
        position: 'absolute',
        left: x,
        top: ROW_Y,
        transform: `translateY(-50%) scale(${1 + 0.1 * pulse})`,
        transformOrigin: 'left center',
        opacity: op,
        padding: '8px 16px',
        borderRadius: 12,
        border: `2px solid ${interpolateColors(pulse, [0, 1], [C.chipBorder, C.gen])}`,
        background: C.chipFill,
      }}
    >
      <div style={{ fontFamily: 'Inter', fontSize: 26, color: C.text, whiteSpace: 'nowrap' }}>{TEXT[key]}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        {JOINS.map((_, i) => (
          <div
            key={i}
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              boxSizing: 'border-box',
              background: i < done ? C.gen : 'transparent',
              border: `2px solid ${i < done ? C.gen : i === done ? C.text : C.chipBorder}`,
            }}
          />
        ))}
      </div>
    </div>
  );
};

const ReturnLabel = ({ f }) => {
  const op = lin(f, B7 + 14, B7 + 26);
  const cx = (cellX(0) + cellX(PROMPT_N + GEN_N - 1) + CELL) / 2;
  return (
    <div
      data-object="return_label"
      style={{
        position: 'absolute',
        left: cx,
        top: FINAL_Y - 80 + 12 * (1 - op),
        transform: 'translate(-50%, -50%)',
        opacity: op,
        fontFamily: 'JetBrains Mono',
        fontSize: 34,
        color: C.text,
        padding: '6px 18px',
        borderRadius: 10,
        border: `2px solid ${C.accent}`,
        whiteSpace: 'nowrap',
      }}
    >
      {TEXT.returnIdx}
    </div>
  );
};

const Bracket = ({ f, id, i0, i1, start, textKey, color }) => {
  const draw = ramp(f, start, start + 12);
  const lop = lin(f, start + 5, start + 12);
  const x0 = cellX(i0);
  const x1 = cellX(i1) + CELL;
  const y = FINAL_Y + CELL / 2 + 12;
  return (
    <div data-object={id} style={full}>
      <div
        style={{
          position: 'absolute',
          left: x0,
          top: y,
          width: x1 - x0,
          height: 16,
          boxSizing: 'border-box',
          borderLeft: `3px solid ${color}`,
          borderRight: `3px solid ${color}`,
          borderBottom: `3px solid ${color}`,
          transform: `scaleX(${draw})`,
          transformOrigin: 'left top',
          opacity: draw > 0 ? 1 : 0,
        }}
      />
      <div style={{ position: 'absolute', left: (x0 + x1) / 2, top: y + 44, transform: 'translate(-50%, -50%)', fontFamily: 'Inter', fontSize: 28, color, opacity: lop }}>
        {TEXT[textKey]}
      </div>
    </div>
  );
};

const Caption = ({ f }) => {
  const id = Object.keys(timeline).find((k) => f >= timeline[k][0] && f < timeline[k][1]) || 'B7';
  const [a, b] = timeline[id];
  const inO = a === B1 ? 1 : lin(f, a, a + 8);
  const op = inO * (b === END ? 1 : 1 - lin(f, b - 6, b));
  return (
    <div
      style={{
        position: 'absolute',
        left: W / 2,
        top: 1000,
        transform: 'translate(-50%, -50%)',
        opacity: op,
        fontFamily: 'Inter',
        fontSize: 38,
        fontWeight: 600,
        color: C.text,
        whiteSpace: 'nowrap',
      }}
    >
      {TEXT[CAPTIONS[id]]}
    </div>
  );
};

// ---------- composition ----------
const GptGenerate = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <TrackLine f={f} />
      {CHIPS.map((s) => (
        <Chip key={s.id} f={f} spec={s} />
      ))}
      <TopKGate f={f} />
      <TruePath f={f} />
      <FalsePath f={f} />
      <LogitsGrid f={f} />
      <LastLogitsRow f={f} />
      <ProbBars f={f} />
      <CropWindow f={f} />
      <IdxRow f={f} />
      <LoopCounter f={f} />
      <DrawMarker f={f} />
      <ReturnLabel f={f} />
      <Bracket f={f} id="prompt_bracket" i0={0} i1={PROMPT_N - 1} start={B7 + 15} textKey="prompt" color={C.accent} />
      <Bracket f={f} id="generated_bracket" i0={PROMPT_N} i1={PROMPT_N + GEN_N - 1} start={B7 + 21} textKey="generated" color={C.gen} />
      <Caption f={f} />
    </AbsoluteFill>
  );
};

export default GptGenerate;
