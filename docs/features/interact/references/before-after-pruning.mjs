import { writeSubject, isMain } from './before-after-reference-kit.mjs';

export function pruningModel(depth = 'brief') {
  const records = {
    training: [
      ...Array.from({ length: 3 }, (_, i) => ({ id: `train-left-${i}`, practiced: false, notes: false, label: 'Needs review' })),
      ...Array.from({ length: 2 }, (_, i) => ({ id: `train-no-notes-${i}`, practiced: true, notes: false, label: 'Needs review' })),
      { id: 'train-no-notes-ready', practiced: true, notes: false, label: 'Ready' },
      ...Array.from({ length: 4 }, (_, i) => ({ id: `train-notes-${i}`, practiced: true, notes: true, label: 'Ready' })),
    ],
    heldout: [
      ...Array.from({ length: 3 }, (_, i) => ({ id: `heldout-left-${i}`, practiced: false, notes: false, label: 'Needs review' })),
      ...Array.from({ length: 2 }, (_, i) => ({ id: `heldout-no-notes-${i}`, practiced: true, notes: false, label: 'Ready' })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: `heldout-notes-${i}`, practiced: true, notes: true, label: 'Ready' })),
    ],
  };
  // A replacement leaf predicts the training majority at that branch. Ties use
  // Ready consistently; the root tie is an explicit part of this toy example.
  const majority = rows => rows.filter(r => r.label === 'Ready').length >= rows.filter(r => r.label === 'Needs review').length ? 'Ready' : 'Needs review';
  const leaf = (id, rows) => ({ id, prediction: majority(rows) });
  const left = leaf('practiced-no', records.training.filter(r => !r.practiced));
  const yesRows = records.training.filter(r => r.practiced);
  const trees = {
    full: { id: 'root', question: 'Practiced?', feature: 'practiced', no: left, yes: { id: 'notes', question: 'Notes used?', feature: 'notes', no: leaf('notes-no', yesRows.filter(r => !r.notes)), yes: leaf('notes-yes', yesRows.filter(r => r.notes)) } },
    pruned: { id: 'root', question: 'Practiced?', feature: 'practiced', no: left, yes: leaf('practiced-yes', yesRows) },
    root: leaf('root', records.training),
  };
  function predict(tree, record) { return tree.prediction ?? predict(record[tree.feature] ? tree.yes : tree.no, record); }
  function score(tree, rows) {
    const matches = {}; let nodes = 0, leaves = 0;
    function visit(node, reached) {
      nodes++; matches[node.id] = reached;
      if (node.prediction) { leaves++; return; }
      visit(node.no, reached.filter(r => !r[node.feature])); visit(node.yes, reached.filter(r => r[node.feature]));
    }
    visit(tree, rows);
    return { tree, nodes, leaves, matches, count: rows.length, mistakes: rows.filter(record => predict(tree, record) !== record.label).length };
  }
  const controls = depth === 'brief' ? [{ id: 'branch', kind: 'choice', label: 'Weak branch', options: ['Keep branch', 'Prune branch'], default: 1, wide: true }] : [
    { id: 'alpha', kind: 'range', label: 'Leaf penalty α', min: 0, max: 2, step: 0.25, default: 1.5 },
    ...(depth === 'detailed' ? [{ id: 'dataset', kind: 'choice', label: 'Readout sample', options: ['Training', 'Held-out'], default: 1 }] : []),
  ];
  const defaults = () => ({ branch: 1, alpha: 1.5, dataset: depth === 'detailed' ? 1 : 0 });
  const bounded = (value, min, max, step, fallback) => Math.max(min, Math.min(max, min + Math.round(((Number.isFinite(Number(value)) ? Number(value) : fallback) - min) / step) * step));
  const normalize = (p = {}) => ({ branch: depth === 'brief' ? bounded(p.branch, 0, 1, 1, 1) : 1, alpha: depth === 'brief' ? 1.5 : bounded(p.alpha, 0, 2, 0.25, 1.5), dataset: depth === 'detailed' ? bounded(p.dataset, 0, 1, 1, 1) : 0 });
  const evaluate = p => {
    p = normalize(p);
    const candidates = Object.entries(trees).map(([id, tree]) => ({ id, ...score(tree, records.training) })).map(s => ({ ...s, cost: s.mistakes + p.alpha * s.leaves }));
    const winner = [...candidates].sort((a, b) => a.cost - b.cost || a.leaves - b.leaves)[0];
    const selected = depth === 'brief' ? (p.branch ? 'pruned' : 'full') : winner.id;
    const sample = p.dataset ? 'heldout' : 'training', sampleLabel = p.dataset ? 'Held-out' : 'Training', rows = records[sample];
    const before = score(trees.full, rows), after = score(trees[selected], rows), beforeCost = candidates.find(c => c.id === 'full').cost, afterCost = candidates.find(c => c.id === selected).cost;
    return { selected, before, after, candidates, beforeCost, afterCost, alpha: p.alpha, sample, sampleLabel, count: rows.length,
      state: selected === 'full' ? 'Weak branch retained' : selected === 'pruned' ? 'Weak branch pruned' : 'Root leaf selected',
      description: `Before: ${before.nodes} nodes and ${before.leaves} leaves. After: ${after.nodes} nodes and ${after.leaves} leaves. On ${rows.length} ${sampleLabel.toLowerCase()} records, mistakes change from ${before.mistakes} to ${after.mistakes}. ${depth === 'brief' ? 'The branch choice is manual. Pruning replaces the Notes used? split with its training-majority Ready leaf.' : `Training count cost is mistakes plus alpha times leaves. At alpha ${p.alpha.toFixed(2)}, full-tree cost is ${beforeCost.toFixed(2)}, pruned-branch cost is ${candidates.find(c => c.id === 'pruned').cost.toFixed(2)}, and root-leaf cost is ${candidates.find(c => c.id === 'root').cost.toFixed(2)}. The lowest training cost selects the displayed subtree; ties prefer fewer leaves. Held-out records are only used for inspection.`} Pruning need not improve held-out performance in general.` };
  };
  const controlValue = (id, p) => p.alpha.toFixed(2);
  return { depth, records, trees, controls, predict, score, defaults, normalize, evaluate, controlValue };
}

export function pruningScene(depth) {
  return { prompt: 'Why prune a decision tree?', title: 'A smaller tree can tell a clearer story.',
    concept: depth === 'brief' ? 'Pruning replaces the marked Notes used? split with a leaf that predicts its training majority. The tree becomes simpler, but it can make more training mistakes.' : depth === 'balanced' ? 'Cost adds training mistakes to α times the leaf count. The cheapest subtree wins; ties favor fewer leaves. A larger penalty can replace a split with a majority leaf.' : 'Cost is training mistake count + α × leaf count. The cheapest subtree wins; ties favor fewer leaves. Held-out records are used only to inspect predictions.',
    instructions: depth === 'brief' ? 'Switch Keep branch and Prune branch. Compare tree size and training mistakes.' : depth === 'balanced' ? 'Move Leaf penalty α. Compare the selected subtree, training mistakes and cost.' : 'Move Leaf penalty α to select a subtree. Switch Readout sample to compare counts and mistakes.',
    heading: 'Tree before and after pruning', height: depth === 'detailed' ? 400 : 380 };
}

export function drawPruning(frame, model, scene) {
  function treePicture(side, x, result, title) {
    let out = R.panel(side, x, 266, title);
    const matched = node => result.matches[node.id].length;
    function node(node, bx, by, width, active = false) {
      const isLeaf = Boolean(node.prediction), height = isLeaf ? 64 : 44;
      let s = `<g id="${side}.node.${node.id}" data-kind="${isLeaf ? 'leaf' : 'split'}" data-records="${matched(node)}">` + R.box(`${side}.node.${node.id}.box`, bx, by, width, height, active, isLeaf ? 'outcome' : 'plain');
      if (!isLeaf) {
        s += R.text(`${side}.node.${node.id}.label`, bx + width / 2, by + 18, node.question, { size: 14, weight: 600, anchor: 'middle' });
        s += R.text(`${side}.node.${node.id}.count`, bx + width / 2, by + 36, `n = ${matched(node)}`, { size: 13, anchor: 'middle', color: R.C.muted });
      } else {
        const words = node.prediction === 'Ready' ? ['Ready'] : ['Needs', 'review'];
        words.forEach((word, i) => { s += R.text(`${side}.node.${node.id}.label.${i}`, bx + width / 2, by + 18 + i * 17, word, { size: 14, weight: 600, anchor: 'middle' }); });
        s += R.text(`${side}.node.${node.id}.count`, bx + width / 2, by + 54, `n = ${matched(node)}`, { size: 13, anchor: 'middle', color: R.C.muted });
      }
      return s + '</g>';
    }
    const root = result.tree;
    if (root.prediction) { out += node(root, x + 77, 82, 126, true); return out + '</g>'; }
    out += R.line(`${side}.branch.practiced-no`, [[x + 138, 94], [x + 62, 127]]);
    out += R.line(`${side}.branch.practiced-yes`, [[x + 138, 94], [x + 212, 127]], true);
    out += R.text(`${side}.edge.practiced-no`, x + 78, 113, 'No', { size: 13 });
    out += R.text(`${side}.edge.practiced-yes`, x + 183, 113, 'Yes', { size: 13 });
    out += node(root, x + 60, 50, 156);
    out += node(root.no, x + 6, 127, 112);
    out += node(root.yes, x + 152, 127, 120, true);
    if (!root.yes.prediction) {
      out += R.line(`${side}.branch.notes-no`, [[x + 212, 171], [x + 164, 208]], true);
      out += R.line(`${side}.branch.notes-yes`, [[x + 212, 171], [x + 242, 208]], true);
      out += R.text(`${side}.edge.notes-no`, x + 158, 195, 'No', { size: 13 });
      out += R.text(`${side}.edge.notes-yes`, x + 236, 195, 'Yes', { size: 13 });
      out += node(root.yes.no, x + 126, 208, 76);
      out += node(root.yes.yes, x + 211, 208, 62);
    }
    return out + '</g>';
  }
  let svg = treePicture('before', 20, frame.before, 'Before · full tree') + treePicture('after', 340, frame.after, 'After · selected subtree');
  svg += R.line('comparison.transform', [[307, 154], [332, 154]], true, true);
  const callout = frame.selected === 'full' ? 'The marked split stays at this penalty.' : 'The marked split becomes a Ready leaf.';
  svg += '<g id="callout.branch" data-part="active-callout">' + R.line('callout.branch.anchor', [[612, 149], [628, 149], [628, 299], [610, 299]], true);
  svg += R.box('callout.branch.box', 282, 284, 328, 31, false, 'process') + R.text('callout.branch.label', 446, 305, callout, { size: 14, anchor: 'middle', color: '#375d92' }) + '</g>';
  svg += R.text('record-count.label', 24, 305, `${frame.sampleLabel} records`, { size: 13, color: R.C.muted });
  svg += R.line('readouts.rule', [[20, 324], [620, 324]]);
  svg += R.readout('size', 24, 344, 'Nodes / leaves · before → after', `${frame.before.nodes} / ${frame.before.leaves} → ${frame.after.nodes} / ${frame.after.leaves}`, 21);
  svg += R.readout('mistakes', scene.depth === 'brief' ? 352 : 258, 344, `${frame.sampleLabel} mistakes`, `${frame.before.mistakes} → ${frame.after.mistakes}`, 22);
  if (scene.depth !== 'brief') svg += R.readout('cost', 456, 344, 'Training cost', `${R.fmt(frame.beforeCost)} → ${R.fmt(frame.afterCost)}`, 20);
  if (scene.depth === 'detailed') {
    const root = frame.candidates.find(candidate => candidate.id === 'root');
    svg += R.text('cost.formula', 24, 394, `Cost = training mistakes + α × leaves. Root-only cost: ${R.fmt(root.cost)}.`, { size: 14, color: R.C.muted });
  }
  return svg;
}

if (isMain(import.meta.url)) writeSubject('pruning', pruningModel, pruningScene, drawPruning);
