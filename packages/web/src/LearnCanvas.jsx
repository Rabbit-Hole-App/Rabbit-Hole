import { Tldraw } from 'tldraw';
import { learnShapeUtils } from './learn-shape-utils.js';
import 'tldraw/tldraw.css';

// Lesson chrome stays minimal: keep the toolbar (learner drawing) and page menu
// (the playback engine follows it); drop style panels, menus and zoom controls.
const components = {
  StylePanel: null, ActionsMenu: null, QuickActions: null, MainMenu: null,
  HelperButtons: null, NavigationPanel: null, Minimap: null, ZoomMenu: null,
  DebugMenu: null, DebugPanel: null, KeyboardShortcutsDialog: null, HelpMenu: null,
};

export default function LearnCanvas({ onReady }) {
  // ponytail: learner drawings are temporary; approved course content is saved separately.
  return <div className="absolute inset-0 isolate"><Tldraw onMount={onReady} shapeUtils={learnShapeUtils} components={components} licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY} /></div>;
}
