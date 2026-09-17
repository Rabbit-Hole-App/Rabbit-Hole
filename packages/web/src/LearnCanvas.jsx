import { Tldraw } from 'tldraw';
import { learnShapeUtils } from './learn-shape-utils.js';
import 'tldraw/tldraw.css';

export default function LearnCanvas({ onReady }) {
  // ponytail: learner drawings are temporary; approved course content is saved separately.
  return <div className="absolute inset-0 isolate"><Tldraw onMount={onReady} shapeUtils={learnShapeUtils} licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY} /></div>;
}
