// Standalone mount for AnimatedScene, no app shell/auth/network needed -
// AnimatedScene is a leaf component (block + callbacks in, SVG out). Vite
// dev serves this file directly from disk; it is never part of the real
// build (not an entry in vite.config.js's rollupOptions.input), so it never
// ships. See heat-motion-manual-check.spec.js - a manual reproduction aid,
// not automated regression coverage (that's src/motion-ownership.test.mjs).
import { createRoot } from 'react-dom/client';
import AnimatedScene from '../src/AnimatedScene.jsx';
import '../src/index.css';

// One heat-mapped cell, starting blocked (null) - the same shape as the
// causal-attention scene's matrix, minimised to a single cell so the
// blocked-to-revealed transition is the only thing happening. Plus one bar
// and one token chip, each starting unlit and becoming lit later, to audit
// whether the SAME renderer's other animate-only fill usages (never
// switching style/animate branches at all) also freeze under a gradual
// scrub - see heat-motion-manual-check.spec.js.
const scene = {
  id: 'heat-motion-invariant-check',
  width: 300,
  height: 260,
  duration: 2,
  objects: [
    {
      id: 'cell', type: 'grid', semanticId: 'cell',
      initialState: { x: 40, y: 40, rows: 1, cols: 1, cell: 80, heat: { mode: 'magnitude' }, role: 'observed', matrixKind: 'input', valueScale: 'shared', valueScaleGroup: 'heat-motion-check', values: [null] },
    },
    // Same value, same heat mode, never blocked - the ground truth a
    // gradually-revealed cell must match once it catches up. Sharing this
    // cell's own valueScaleGroup is what that comparison actually means.
    {
      id: 'reference', type: 'grid', semanticId: 'reference',
      initialState: { x: 180, y: 40, rows: 1, cols: 1, cell: 80, heat: { mode: 'magnitude' }, role: 'observed', matrixKind: 'input', valueScale: 'shared', valueScaleGroup: 'heat-motion-check', values: [8] },
    },
    {
      id: 'bar', type: 'bars', semanticId: 'bar',
      initialState: { x: 40, y: 140, h: 60, peak: 1, role: 'observed', values: [1] },
    },
    {
      id: 'chip', type: 'tokens', semanticId: 'chip',
      initialState: { x: 40, y: 220, role: 'observed', tokens: ['x'] },
    },
  ],
  timeline: [
    { at: 1, action: 'replace_values', target: 'cell', value: [8] },
    { at: 1, action: 'highlight_cell', target: 'bar', value: 0 },
    { at: 1, action: 'highlight_cell', target: 'chip', value: 0 },
  ],
};
const block = { id: 'harness', type: 'animation', dx: 0, dy: 0, title: 'heat motion invariant check', scene, time: 0, selectedObject: null, marked: null };
createRoot(document.getElementById('root')).render(
  <AnimatedScene block={block} onChange={() => {}} onChangeQuiet={() => {}} onAskRegion={() => {}} />,
);
