// State-space block (EXP-T10): the Mamba-2 mixer, as implemented in
// state-spaces/mamba at e9594ce1 (mamba_ssm/modules/mamba2.py and
// ops/triton/layernorm_gated.py). Verified there:
//   in_proj: one Linear to [z, x, B, C, dt] (mamba2.py "Order: [z, x, B, C, dt]")
//   conv1d: causal depthwise Conv1D over x, B and C together, then SiLU
//   dt: softplus(dt + dt_bias); A = -exp(A_log), one per head
//   scan: h_t = exp(dt A) h_{t-1} + dt B_t x_t;  y_t = C_t h_t + D x_t (D skip)
//   gate: rmsnorm with norm_before_gate=False normalises y * SiLU(z);
//         True gates the normalised y; rmsnorm=False multiplies y by SiLU(z)
//   out_proj: Linear back to d_model
// The residual around the block lives in the wrapping Block, not in this
// module, so it is recorded as not shown. norm_before_gate is required: the
// target model's own setting, never the upstream default by assumption.
import { labelledBox, wrapLabel } from '../label.js';
import { sides, textWidth } from '../text.js';

const GAP = 32, SIDE = 56, NOTE_GAP = 28;
const text = value => ({ kind: 'text', text: value });
const math = value => ({ kind: 'math', tex: value });

// What this picture claims, detail by detail, for the stated scope.
export function coverageOf({ scope, rmsnorm, normBeforeGate }) {
  const detailed = scope === 'detailed';
  return {
    'in_proj to z, x, B, C, dt': 'shown',
    'causal depthwise Conv1D and SiLU on x, B, C': 'shown',
    'dt: softplus(dt + dt_bias)': detailed ? 'shown' : 'omitted',
    'A = -exp(A_log), per head': detailed ? 'shown' : 'omitted',
    'state carried from step to step': detailed ? 'shown' : 'simplified',
    'D skip': detailed ? 'shown' : 'omitted',
    [`gate and norm (${rmsnorm ? `RMSNorm, norm_before_gate=${normBeforeGate ? 'True' : 'False'}` : 'no RMSNorm'})`]: 'shown',
    'B and C groups (ngroups), heads (headdim)': 'simplified',
    'gated MLP split when d_ssm < d_inner': 'omitted',
    'chunked scan kernel': 'omitted',
    'outer residual and pre-norm (wrapping Block)': 'unestablished',
    out_proj: 'shown',
  };
}

export default {
  name: 'state-space-block', version: 1,
  description: 'Mamba-2 mixer (mamba2.py at e9594ce): in_proj to z, x, B, C, dt; causal Conv1D + SiLU on x, B, C; selective scan; gated RMSNorm; out_proj. normBeforeGate must be the target model\'s setting. scope main-path omits dt/A/D internals and says so; detailed shows them.',
  params: {
    normBeforeGate: { type: 'boolean', required: true },
    rmsnorm: { type: 'boolean', default: true },
    scope: { type: 'enum', values: ['main-path', 'detailed'], default: 'main-path' },
    variant: { type: 'enum', values: ['mamba2'], default: 'mamba2' },
  },
  hints: { width: { type: 'number', unit: 'px', min: 240, max: 400, default: 300 } },
  repairWritable: ['width'],
  anchors: ['top', 'bottom', 'left', 'right', 'input', 'output'],
  fixtures: ['mamba2-main-path'],
  compile({ params, hints }) {
    const detailed = params.scope === 'detailed';
    const gate = !params.rmsnorm ? [math('y \\cdot \\mathrm{SiLU}(z)')]
      : params.normBeforeGate ? [math('\\mathrm{RMSNorm}(y) \\cdot \\mathrm{SiLU}(z)')]
        : [math('\\mathrm{RMSNorm}(y \\cdot \\mathrm{SiLU}(z))')];
    const scan = detailed
      ? [text('Scan: '), math('h_t = e^{\\Delta_t A} h_{t-1} + \\Delta_t B_t x_t')]
      : [text('Selective scan over x using '), math('B, C, \\Delta')];
    const main = [
      ['input', [text('Input '), math('u')], 'input'],
      ['in_proj', [text('Linear in_proj to '), math('z, x, B, C, \\Delta')], 'neutral'],
      ['conv', [text('Causal Conv1D on x, B, C, then SiLU')], 'neutral'],
      ['scan', scan, 'neutral'],
      ...(detailed ? [['readout', [text('Readout: '), math('y_t = C_t h_t + D\\, x_t')], 'neutral']] : []),
      ['gate', [text('Gate: '), ...gate], 'neutral'],
      ['out_proj', [text('Linear out_proj')], 'neutral'],
    ];
    const objects = [], at = {};
    const sideW = detailed ? 280 : 0;
    const left = detailed ? sideW + SIDE : 0;
    let y = 0;
    for (const [id, runs, role] of main) {
      const box = labelledBox({ id, label: { runs }, role, minWidth: hints.width, maxWidth: Math.max(hints.width, 400) });
      const x = left + (Math.max(hints.width, 400) - box.w) / 2;
      for (const object of box.objects) objects.push({ ...object, initialState: { ...object.initialState, x: object.initialState.x + x, y: object.initialState.y + y } });
      at[id] = { x, y, w: box.w, h: box.h };
      y += box.h + GAP;
    }
    const mid = id => at[id].x + at[id].w / 2;
    for (let i = 1; i < main.length; i++) {
      const from = at[main[i - 1][0]], to = at[main[i][0]];
      objects.push({ id: `step${i}`, type: 'arrow', initialState: { from: { x: mid(main[i - 1][0]), y: from.y + from.h }, to: { x: mid(main[i][0]), y: to.y } } });
    }
    // z skips the conv and the scan and enters the gate from the right.
    const zx = left + Math.max(hints.width, 400) + SIDE / 2;
    const proj = at.in_proj, gateBox = at.gate;
    objects.push({ id: 'z-out', type: 'line', initialState: { from: { x: proj.x + proj.w, y: proj.y + proj.h / 2 }, to: { x: zx, y: proj.y + proj.h / 2 } } });
    objects.push({ id: 'z-down', type: 'line', initialState: { from: { x: zx, y: proj.y + proj.h / 2 }, to: { x: zx, y: gateBox.y + gateBox.h / 2 } } });
    objects.push({ id: 'z-in', type: 'arrow', initialState: { from: { x: zx, y: gateBox.y + gateBox.h / 2 }, to: { x: gateBox.x + gateBox.w, y: gateBox.y + gateBox.h / 2 } } });
    objects.push({ id: 'z-label', type: 'text', initialState: { text: 'z', runs: [math('z')], x: zx + 8, y: (proj.y + gateBox.y) / 2 + 20, typography: 'body' } });
    if (detailed) {
      // dt and A feed the scan from the left; D adds x back at the readout.
      // Side boxes keep their own column order and never overlap: each sits
      // as near its target as the box above it allows (render review: A and
      // the D skip overlapped).
      let floor = -Infinity;
      const sideBox = (id, runs, target, lift = 0) => {
        const box = labelledBox({ id, label: { runs }, minWidth: sideW, maxWidth: sideW });
        const t = at[target];
        const by = Math.max(t.y + (t.h - box.h) / 2 + lift, floor);
        floor = by + box.h + 16;
        for (const object of box.objects) objects.push({ ...object, initialState: { ...object.initialState, y: object.initialState.y + by } });
        objects.push({ id: `${id}-in`, type: 'arrow', initialState: { from: { x: box.w, y: by + box.h / 2 }, to: { x: t.x, y: Math.min(Math.max(by + box.h / 2, t.y + 8), t.y + t.h - 8) } } });
      };
      sideBox('dt', [math('\\Delta = \\mathrm{softplus}(dt + b_{dt})')], 'scan', -36);
      sideBox('a', [math('A = -e^{A_{\\log}}'), text(' per head')], 'scan', 36);
      sideBox('d', [text('D skip: '), math('+ D\\, x_t')], 'readout');
    }
    // The honesty record, on the card: what is shown, simplified, omitted.
    const record = coverageOf(params);
    const groups = ['simplified', 'omitted', 'unestablished'].map(status => [status, Object.entries(record).filter(([, value]) => value === status).map(([key]) => key)]).filter(([, keys]) => keys.length);
    const notes = [`Mamba-2 mixer as in state-spaces/mamba e9594ce, ${params.scope === 'detailed' ? 'with its internals' : 'main path only'}.`,
      ...groups.map(([status, keys]) => `${status === 'unestablished' ? 'Not in this module' : status[0].toUpperCase() + status.slice(1)}: ${keys.join('; ')}.`)];
    const noteW = Math.max(zx + 24, 640);
    const lines = notes.flatMap(note => wrapLabel(note, noteW, 'annotation').map(line => line.plain));
    let ny = y - GAP + NOTE_GAP;
    lines.forEach((line, index) => { objects.push({ id: `note${index}`, type: 'text', initialState: { text: line, x: 0, y: ny, typography: 'annotation' } }); ny += 20; });
    const w = Math.max(zx + 24, ...lines.map(line => textWidth(line, 'annotation'))), h = ny;
    return {
      w, h, objects,
      anchors: { ...sides(w, h), input: { x: mid('input'), y: at.input.y }, output: { x: mid('out_proj'), y: at.out_proj.y + at.out_proj.h } },
    };
  },
};
