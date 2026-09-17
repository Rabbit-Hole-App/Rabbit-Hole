import { DefaultToolbar, DrawToolbarItem, EraserToolbarItem, HandToolbarItem, SelectToolbarItem, Tldraw } from 'tldraw';
import { learnShapeUtils } from './learn-shape-utils.js';
import 'tldraw/tldraw.css';

// Lesson chrome stays minimal: four essential tools that fade until hovered
// (see .learn-canvas rules in index.css); page menu stays for the engine.
const components = {
  StylePanel: null, ActionsMenu: null, QuickActions: null, MainMenu: null,
  HelperButtons: null, NavigationPanel: null, Minimap: null, ZoomMenu: null,
  DebugMenu: null, DebugPanel: null, KeyboardShortcutsDialog: null, HelpMenu: null,
  Toolbar: () => <DefaultToolbar><SelectToolbarItem /><HandToolbarItem /><DrawToolbarItem /><EraserToolbarItem /></DefaultToolbar>,
};

export default function LearnCanvas({ onReady }) {
  // ponytail: learner drawings are temporary; approved course content is saved separately.
  return <div className="learn-canvas absolute inset-0 isolate"><Tldraw onMount={onReady} shapeUtils={learnShapeUtils} components={components} licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY} /></div>;
}
