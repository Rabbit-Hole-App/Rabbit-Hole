import { Tldraw } from 'tldraw';
import { learnShapeUtils } from './learn-shape-utils.js';
import 'tldraw/tldraw.css';

// Lesson chrome is hidden entirely; only the page menu stays for the engine.
// Note editing keeps its own tool row, and keyboard shortcuts still work.
const components = {
  StylePanel: null, ActionsMenu: null, QuickActions: null, MainMenu: null,
  HelperButtons: null, NavigationPanel: null, Minimap: null, ZoomMenu: null,
  DebugMenu: null, DebugPanel: null, KeyboardShortcutsDialog: null, HelpMenu: null,
  Toolbar: null,
};

export default function LearnCanvas({ onReady }) {
  // ponytail: learner drawings are temporary; approved course content is saved separately.
  return <div className="learn-canvas absolute inset-0 isolate"><Tldraw onMount={onReady} shapeUtils={learnShapeUtils} components={components} licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY} /></div>;
}
