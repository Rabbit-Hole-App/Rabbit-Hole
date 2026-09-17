import { DefaultToolbar, DrawToolbarItem, EraserToolbarItem, HandToolbarItem, SelectToolbarItem, Tldraw } from 'tldraw';
import { learnShapeUtils } from './learn-shape-utils.js';
import 'tldraw/tldraw.css';

// Lesson chrome stays hidden until the learner opens the tools from the side
// button (see .tools-hidden in index.css); page menu stays for the engine.
const components = {
  StylePanel: null, ActionsMenu: null, QuickActions: null, MainMenu: null,
  HelperButtons: null, NavigationPanel: null, Minimap: null, ZoomMenu: null,
  DebugMenu: null, DebugPanel: null, KeyboardShortcutsDialog: null, HelpMenu: null,
  Toolbar: () => <DefaultToolbar><SelectToolbarItem /><HandToolbarItem /><DrawToolbarItem /><EraserToolbarItem /></DefaultToolbar>,
};

export default function LearnCanvas({ onReady, showTools = false }) {
  // ponytail: learner drawings are temporary; approved course content is saved separately.
  return <div className={`learn-canvas absolute inset-0 isolate ${showTools ? '' : 'tools-hidden'}`}><Tldraw onMount={onReady} shapeUtils={learnShapeUtils} components={components} licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY} /></div>;
}
