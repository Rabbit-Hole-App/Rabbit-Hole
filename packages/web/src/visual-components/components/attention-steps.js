// Symbolic attention steps (EXP-T08a): for one query position, the
// projections, the scaled query-key scores, softmax normalisation and the
// weighted sum of values, written as typeset formulas. Notation follows
// Vaswani et al. 2017, "Attention Is All You Need", section 3.2.1:
// Attention(Q, K, V) = softmax(Q K^T / sqrt(d_k)) V, so for query i
// s_ij = q_i . k_j / sqrt(d_k), a_ij = exp(s_ij) / sum_t exp(s_it),
// o_i = sum_j a_ij v_j. Shown rows are symbolic, never a numeric result.
import { labelWidth, labelledBox } from '../label.js';
import { sides, textWidth } from '../text.js';

const ROW_H = 48, ROW_GAP = 16, COL_GAP = 40, HEAD_H = 32, PROJ_GAP = 40;
const tex = value => ({ runs: [{ kind: 'math', tex: value }] });

export default {
  name: 'attention-steps', version: 1,
  description: 'Symbolic scaled dot-product attention for one query: projections, scores q_i.k_j/sqrt(d_k), softmax weights and the weighted sum o_i. query is the position i; rows (2 to 4) key positions are shown; symbolicLast ends the rows at T after a vertical ellipsis. Static, symbolic, no numbers.',
  params: {
    query: { type: 'int', min: 1, max: 999, required: true },
    rows: { type: 'int', min: 2, max: 4, default: 3 },
    symbolicLast: { type: 'boolean', default: true },
  },
  hints: { columnGap: { type: 'number', unit: 'px', min: 32, max: 120, default: COL_GAP } },
  repairWritable: ['columnGap'],
  anchors: ['top', 'bottom', 'left', 'right', 'output'],
  fixtures: ['attention-steps-q2'],
  compile({ params, hints }) {
    const i = params.query;
    // Displayed key positions: 1..rows, or 1..rows-1 then T after an ellipsis.
    const keys = params.symbolicLast ? [...Array.from({ length: params.rows - 1 }, (_, n) => String(n + 1)), 'T'] : Array.from({ length: params.rows }, (_, n) => String(n + 1));
    const last = params.symbolicLast ? 'T' : String(params.rows);
    if (!params.symbolicLast && i > params.rows) throw new Error(`query ${i} is outside the ${params.rows} positions shown: show more rows or end them at T`);
    const sub = j => `${i},${j}`;
    const columns = [
      { head: 'Scores', cells: keys.map(j => `s_{${sub(j)}} = \\frac{q_{${i}} \\cdot k_{${j}}}{\\sqrt{d_k}}`) },
      { head: 'Softmax weights', cells: keys.map(j => `\\alpha_{${sub(j)}} = \\frac{e^{s_{${sub(j)}}}}{Z_{${i}}}`) },
      { head: 'Weighted values', cells: keys.map(j => `\\alpha_{${sub(j)}}\\, v_{${j}}`) },
    ];
    // The softmax normaliser is defined once, beside the projections.
    const projections = [`q_{${i}} = x_{${i}} W^{Q}`, 'k_j = x_j W^{K}', 'v_j = x_j W^{V}', `Z_{${i}} = \\sum_{t=1}^{${last}} e^{s_{${i},t}}`];
    const objects = [];
    const boxOf = (id, value, x, y, width, role) => {
      const box = labelledBox({ id, label: tex(value), role, minWidth: width, maxWidth: Math.max(width, 640), minHeight: ROW_H });
      for (const object of box.objects) objects.push({ ...object, initialState: { ...object.initialState, x: object.initialState.x + x, y: object.initialState.y + y } });
      return { x, y, w: box.w, h: box.h };
    };

    // Projections across the top, then a header and one row per key position.
    let px = 0;
    objects.push({ id: 'head-proj', type: 'text', initialState: { text: 'Projections', x: 0, y: 20, typography: 'caption' } });
    projections.forEach((value, n) => { const at = boxOf(`proj${n}`, value, px, HEAD_H, labelWidth(tex(value)) + 32, n === 0 ? 'input' : 'neutral'); px += at.w + ROW_GAP; });
    const top = HEAD_H + ROW_H + PROJ_GAP;
    const ellipsisRow = params.symbolicLast ? keys.length - 1 : -1;
    const rowY = n => top + HEAD_H + n * (ROW_H + ROW_GAP) + (ellipsisRow >= 0 && n >= ellipsisRow ? ROW_H : 0);
    let x = 0;
    const placed = columns.map((column, c) => {
      const width = Math.max(...column.cells.map(value => labelWidth(tex(value)))) + 32;
      objects.push({ id: `head${c}`, type: 'text', initialState: { text: column.head, x, y: top + 20, typography: 'caption' } });
      const cells = column.cells.map((value, n) => boxOf(`c${c}r${n}`, value, x, rowY(n), width, 'neutral'));
      if (ellipsisRow >= 0) objects.push({ id: `gap${c}`, type: 'text', initialState: { text: '⋮', runs: [{ kind: 'math', tex: '\\vdots' }], x: x + width / 2 - 4, y: rowY(ellipsisRow) - ROW_GAP - 8, typography: 'body' } });
      x += width + hints.columnGap;
      return cells;
    });
    // Arrows carry each row from score to weight to weighted value.
    for (let c = 0; c < placed.length - 1; c++) {
      placed[c].forEach((cell, n) => {
        const next = placed[c + 1][n];
        objects.push({ id: `flow${c}-${n}`, type: 'arrow', initialState: { from: { x: cell.x + cell.w, y: cell.y + cell.h / 2 }, to: { x: next.x, y: next.y + next.h / 2 } } });
      });
    }
    // The weighted values sum into the output for query i.
    const lastCells = placed[placed.length - 1];
    const middle = (lastCells[0].y + lastCells[lastCells.length - 1].y + ROW_H) / 2;
    const out = boxOf('output', `o_{${i}} = \\sum_{j=1}^{${last}} \\alpha_{${i},j}\\, v_j`, x, middle - ROW_H / 2, 0, 'output');
    lastCells.forEach((cell, n) => objects.push({ id: `sum${n}`, type: 'arrow', initialState: { from: { x: cell.x + cell.w, y: cell.y + cell.h / 2 }, to: { x: out.x, y: out.y + out.h / 2 } } }));
    const bottom = rowY(keys.length - 1) + ROW_H;
    const note = 'Symbolic rows: each line is the formula for one key position, not a computed number.';
    objects.push({ id: 'note', type: 'text', initialState: { text: note, x: 0, y: bottom + 32, typography: 'annotation' } });
    const w = Math.max(out.x + out.w, px - ROW_GAP, textWidth(note, 'annotation')), h = bottom + 40;
    return { w, h, objects, anchors: { ...sides(w, h), output: { x: out.x + out.w / 2, y: out.y + out.h } } };
  },
};
