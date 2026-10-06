// Demo B (spec §27), hand-written to the Author contract (§5.3, §8): the 20 s
// code walkthrough of GPT.generate in storyboard.json. The code is verbatim from
// model.py at the pinned commit, minus the 4-space class indent, in the bundled
// JetBrains Mono. Every visible state is a pure function of the frame.
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';

export const stage = { width: 1920, height: 1080, fps: 30, durationInFrames: 600 };

const FONT = 'Inter';
const MONO = 'JetBrains Mono';
const INK = '#37352F', MUTED = '#9B9A97', FAINT = '#B4B2AD', LINE = '#E3E2E0', BLUE = '#2383E2', BLUE_SOFT = '#E7F3F8';
// model.py 306 and 312-328 (the docstring 307-311 is elided).
const ROWS = [
  [306, "def generate(self, idx, max_new_tokens, temperature=1.0, top_k=None):"],
  [312, "    for _ in range(max_new_tokens):"],
  [313, "        # if the sequence context is growing too long we must crop it at block_size"],
  [314, "        idx_cond = idx if idx.size(1) <= self.config.block_size else idx[:, -self.config.block_size:]"],
  [315, "        # forward the model to get the logits for the index in the sequence"],
  [316, "        logits, _ = self(idx_cond)"],
  [317, "        # pluck the logits at the final step and scale by desired temperature"],
  [318, "        logits = logits[:, -1, :] / temperature"],
  [319, "        # optionally crop the logits to only the top k options"],
  [320, "        if top_k is not None:"],
  [321, "            v, _ = torch.topk(logits, min(top_k, logits.size(-1)))"],
  [322, "            logits[logits < v[:, [-1]]] = -float('Inf')"],
  [323, "        # apply softmax to convert logits to (normalized) probabilities"],
  [324, "        probs = F.softmax(logits, dim=-1)"],
  [325, "        # sample from the distribution"],
  [326, "        idx_next = torch.multinomial(probs, num_samples=1)"],
  [327, "        # append sampled index to the running sequence and continue"],
  [328, "        idx = torch.cat((idx, idx_next), dim=1)"],
];
const CODE = new Map(ROWS);
// [start s, first line, last line, note beside the line]: the highlight walks these in order.
const STEPS = [
  [0, 306, 306],
  [1.5, 312, 312, 'runs max_new_tokens times'],
  [3, 314, 314],
  [5, 316, 316, 'logits for every position'],
  [7, 318, 318, 'last position only, ÷ temperature'],
  [10, 320, 322],
  [13, 324, 324, 'logits → probabilities'],
  [14.5, 326, 326, 'weighted random draw'],
  [16, 328, 328, 'fed back in next step'],
  [18.5, 312, 328],
];
const CAPTIONS = [
  [0, 3, 'Each pass through this loop adds one new token, max_new_tokens times.'],
  [3, 7, 'Each step crops the context to the last block_size tokens and runs the model.'],
  [7, 10, "Only the last position's logits are kept, divided by temperature before softmax."],
  [10, 13, 'Top-k runs only if top_k is set. With the default None, it is skipped.'],
  [13, 16, 'Softmax turns the logits into probabilities; multinomial samples one token.'],
  [16, 18.5, 'The sampled token is appended to idx and the loop runs again.'],
  [18.5, 20, 'Crop, forward, ÷ temperature, optional top-k, softmax, sample, append: repeat.'],
];

// JetBrains Mono advances 0.6 em per character, so a line's width is its length x CH.
const FS = 24, CH = FS * 0.6, LH = 36;
const PANEL_X = 120, PANEL_Y = 204, PANEL_W = 1680, PAD = 20, GAP = 18;
const NUM_X = PANEL_X + 28, CODE_X = NUM_X + 5 * CH;
const rowY = n => PANEL_Y + PAD + (n === 306 ? 0 : LH + GAP + (n - 312) * LH);
const PANEL_H = rowY(328) + LH + PAD - PANEL_Y;

const ease = Easing.bezier(0.33, 0, 0.2, 1);
// 0 -> 1 between two times in seconds, clamped.
const ramp = (f, a, b) => interpolate(f, [a * 30, b * 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
// visible inside [a, b] seconds with a short fade at both ends
const during = (f, a, b) => Math.min(ramp(f, a, a + 0.35), 1 - ramp(f, b - 0.3, b));

const text = (size, color, weight = 400) => ({ fontFamily: FONT, fontSize: size, color, fontWeight: weight, lineHeight: 1.2 });
// Regular is the only bundled weight; ligatures off so the code reads exactly as written.
const mono = color => ({ fontFamily: MONO, fontSize: FS, fontWeight: 400, lineHeight: `${LH}px`, color, whiteSpace: 'pre', fontVariantLigatures: 'none' });
const at = (left, top, extra) => ({ position: 'absolute', left, top, ...extra });

// The highlight slides from step to step: each step start moves its edges over 0.35 s.
const Highlight = ({ f }) => {
  let top = rowY(STEPS[0][1]), bottom = rowY(STEPS[0][2]) + LH;
  for (let i = 1; i < STEPS.length; i++) {
    const p = ramp(f, STEPS[i][0], STEPS[i][0] + 0.35);
    top += p * (rowY(STEPS[i][1]) - rowY(STEPS[i - 1][1]));
    bottom += p * (rowY(STEPS[i][2]) - rowY(STEPS[i - 1][2]));
  }
  return (
    <div style={at(PANEL_X + 2, top, { width: PANEL_W - 4, height: bottom - top, opacity: ramp(f, 0.1, 0.5), background: BLUE_SOFT })}>
      <div style={at(0, 0, { width: 6, height: bottom - top, background: BLUE })} />
    </div>
  );
};

const Notes = ({ f }) => STEPS.map(([t, line, , note], i) => note ? (
  <div key={t} style={at(CODE_X + CODE.get(line).length * CH + 40, rowY(line) + 5, { opacity: during(f, t + 0.3, STEPS[i + 1][0]), whiteSpace: 'nowrap', ...text(22, BLUE, 500) })}>{note}</div>
) : null);

// K1 beside the short top-k lines 320-322, clear of the comment rows above and below.
const TopK = ({ f }) => (
  <div style={at(1210, rowY(320) + 2, { width: 562, height: 3 * LH - 4, opacity: during(f, 10.3, 13), boxSizing: 'border-box', padding: '16px 22px', borderRadius: 12, border: `2px solid ${BLUE}`, background: '#FFFFFF' })}>
    <div style={text(22, INK, 500)}>{'top_k=None (default): skipped'}</div>
    <div style={{ marginTop: 6, ...text(22, INK) }}>{'top_k=k: below the k-th largest → −inf'}</div>
  </div>
);

// 328 back up to 312 in the left margin: the loop runs again.
const LoopArrow = ({ f }) => {
  const y0 = rowY(328) + LH / 2, y1 = rowY(312) + LH / 2, len = 30 + (y0 - y1) + 30;
  return (
    <svg width={1920} height={1080} style={at(0, 0)}>
      <path d={`M 112 ${y0} H 82 V ${y1} H 112`} fill="none" stroke={BLUE} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={len} strokeDashoffset={len * (1 - ramp(f, 16.4, 17.4))} />
      <path d={`M 102 ${y1 - 8} L 114 ${y1} L 102 ${y1 + 8}`} fill="none" stroke={BLUE} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" opacity={ramp(f, 17.3, 17.5)} />
    </svg>
  );
};

export default function GenerateWalkthrough() {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: '#FFFFFF' }}>
      <div style={at(120, 72, text(26, MUTED))}>{'nanoGPT · model.py · your selection, lines 305–330'}</div>
      <div style={at(120, 108, text(54, INK, 500))}>{'What happens on each step of GPT.generate'}</div>
      <div style={at(PANEL_X, PANEL_Y, { width: PANEL_W, height: PANEL_H, boxSizing: 'border-box', borderRadius: 16, border: `2px solid ${LINE}`, background: '#FFFFFF' })} />
      <Highlight f={f} />
      {ROWS.map(([n, code]) => (
        <div key={n}>
          <div style={at(NUM_X, rowY(n), mono(FAINT))}>{String(n)}</div>
          <div style={at(CODE_X, rowY(n), mono(code.trim().startsWith('#') ? MUTED : INK))}>{code}</div>
        </div>
      ))}
      <Notes f={f} />
      <TopK f={f} />
      <LoopArrow f={f} />
      {CAPTIONS.map(([a, b, line], i) => (
        <div key={a} style={at(0, 962, { width: 1920, textAlign: 'center', opacity: i === CAPTIONS.length - 1 ? ramp(f, a, a + 0.35) : during(f, a, b), ...text(34, INK, 500) })}>{line}</div>
      ))}
    </AbsoluteFill>
  );
}
