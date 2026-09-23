// Generic standalone mount for AnimatedScene, no app shell/auth/network -
// same pattern as heat-motion-harness.jsx, but the scene is injected by the
// driving Playwright script (viz-benchmark-capture.mjs) rather than one
// harness per fixture, so it serves every viz-benchmarks case from one file.
// Vite dev serves this straight from disk; never a build entry, never ships.
import { createRoot } from 'react-dom/client';
import AnimatedScene from '../src/AnimatedScene.jsx';
import '../src/index.css';

const root = createRoot(document.getElementById('root'));

// inputs (optional): the learning-input values to evaluate the scene at, so a
// driving script can capture an interactive card in a non-default state.
window.__renderScene = (scene, time, inputs) => {
  const el = document.getElementById('root');
  el.style.width = `${scene.width}px`;
  el.style.height = `${scene.height}px`;
  const block = { id: 'render', type: 'animation', dx: 0, dy: 0, title: scene.title || scene.id, scene, time: time ?? scene.duration, selectedObject: null, marked: null, ...(inputs ? { inputs } : {}) };
  root.render(<AnimatedScene block={block} onChange={() => {}} onChangeQuiet={() => {}} onAskRegion={() => {}} />);
};
window.__sceneHarnessReady = true;
