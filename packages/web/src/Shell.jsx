import { useEffect, useRef, useState } from 'react';
import { Home, PanelLeft } from 'lucide-react';
import { navigate } from './api.js';
import { loadApps } from './app-data.js';
import Sidebar from './Sidebar.jsx';
import { patchSurface } from './agent/surface.js';
import { learnPreview } from './flags.js';
import { sidebarEdge } from './home/pinned.js';
import { immersiveAt } from './routes.js';
import { readSidebar, saveSidebar } from './sidebar-nav.js';

// flow.md §1: the sidebar is always present. One shell owns it everywhere -
// the /api/apps fetch it needs, the persisted collapse, the » reopen button,
// and the Ctrl/⌘+\ shortcut. Pages render inside via children(data, reload).
// The sidebar as stored. main.jsx publishes its edge (--sidebar-w) before the first paint, so the
// Agent Bar (mounted in Root, before any Shell) starts in place instead of sliding in from the left.
export const storedSidebar = () => readSidebar();

export default function Shell({ children }) {
  const [data, setData] = useState(null); // { org, email, apps, folders } | { error }
  const [collapsed, setCollapsed] = useState(() => storedSidebar().collapsed);
  const [width, setWidth] = useState(() => storedSidebar().width); // resizable, 200–400
  const [resizing, setResizing] = useState(false); // drag-resize must not fight the slide transition
  const [drawer, setDrawer] = useState(false); // Rabbit Hole dev, below md: the sidebar opened as a drawer
  const resizeTimer = useRef();
  const resize = (w) => {
    setResizing(true);
    setWidth(w);
    saveSidebar('small.sidebarW', w);
    clearTimeout(resizeTimer.current);
    resizeTimer.current = setTimeout(() => setResizing(false), 150);
  };

  const load = () => loadApps().then(setData).catch((e) => setData({ error: e.message }));
  useEffect(() => { load(); }, []);
  // Rabbit Hole dev: the workspace identity every command ctx reads (agent/commands.js
  // ctxOf). setSurface keeps identity across pages (agent/surface.js), so one patch per load.
  useEffect(() => {
    if (learnPreview && data?.apps) patchSurface({ org: data.org, email: data.email, orgName: data.orgName || null, catalog: data.apps });
  }, [data]);

  const toggle = (c) => {
    setCollapsed(c);
    saveSidebar('small.sidebar', c ? 'closed' : 'open');
  };
  // Rabbit Hole dev: Learn is immersive (routes.js immersiveAt), with no sidebar, icon rail or sidebar button; its top-left
  // corner is the canvas home (LearnPage, owner 2026-09-30). Visiting Learn no longer collapses the sidebar elsewhere.
  const immersive = learnPreview && immersiveAt(window.location.pathname, window.location.search);
  // The drawer always shows the full sidebar; a collapsed preview sidebar is the icon rail (Sidebar rail).
  const shut = collapsed && !drawer;
  const edge = immersive ? 0 : sidebarEdge(shut, width, learnPreview);
  // Rabbit Hole dev: the Agent Bar (Root) sits over the content column; publish its left edge.
  useEffect(() => {
    if (learnPreview) document.documentElement.style.setProperty('--sidebar-w', `${edge}px`);
  }, [edge]);
  // The drawer closes on navigation (navigate() fires popstate) and on Esc.
  useEffect(() => {
    if (!drawer) return;
    const close = () => setDrawer(false);
    const esc = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('popstate', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('popstate', close); window.removeEventListener('keydown', esc); };
  }, [drawer]);
  useEffect(() => {
    const on = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'j') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('small:ask-focus')); // ⌘J → nearest Ask box
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        setCollapsed((c) => {
          saveSidebar('small.sidebar', c ? 'open' : 'closed');
          return !c;
        });
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  return (
    <div className="flex h-screen" style={learnPreview ? { '--shell-top-h': '40px' } : undefined}>
      {collapsed && !learnPreview && (
        <button
          title="Back (reopens the sidebar)"
          onClick={() => { toggle(false); if (history.length > 1) history.back(); else navigate('/apps'); }}
          className="fixed top-3 left-2 z-10 rounded-md border border-line-strong bg-active p-1.5 text-ink hover:bg-hover max-md:hidden"
        >
          <Home size={16} />
        </button>
      )}
      {/* Rabbit Hole dev, below md: no rail; a top strip opens the sidebar as a drawer (index.css pads main by it). */}
      {learnPreview && (
        <div className="fixed inset-x-0 top-0 z-20 flex h-(--shell-top-h) items-center border-b border-line bg-white px-2 md:hidden">
          <button aria-label="Open sidebar" title="Open sidebar" onClick={() => setDrawer(true)} className="flex h-8 w-8 items-center justify-center rounded-md text-ink-2 hover:bg-hover hover:text-ink">
            <PanelLeft size={16} strokeWidth={1.5} />
          </button>
        </div>
      )}
      {drawer && <div data-shell-backdrop onClick={() => setDrawer(false)} className={`fixed inset-0 z-30 bg-black/20 ${immersive ? '' : 'md:hidden'}`} />}
      {/* Notion slide: the wrapper animates width to 0 while the fixed-width inner
          translates left, so the sidebar glides out instead of blinking away.
          The preview collapses to the icon rail instead. The open drawer keeps a zero-width
          wrapper and a fixed inner, so the Sidebar stays this one mounted instance. */}
      <div
        data-shell-sidebar
        style={{ width: edge, transition: resizing ? 'none' : 'width 200ms cubic-bezier(0.25,1,0.35,1)' }}
        className={`shrink-0 overflow-hidden motion-reduce:transition-none! ${drawer ? 'max-md:w-0!' : immersive ? 'hidden' : 'max-md:hidden'}`}
      >
        <div
          style={{ width: learnPreview ? (drawer ? width : edge) : width, transform: collapsed && !learnPreview ? `translateX(-${width}px)` : 'none', transition: resizing ? 'none' : 'transform 200ms cubic-bezier(0.25,1,0.35,1)' }}
          className={drawer && immersive ? 'fixed inset-y-0 left-0 z-30 flex h-full max-w-[85vw] overflow-hidden shadow-pop' : drawer ? 'flex h-full max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-30 max-md:max-w-[85vw] max-md:overflow-hidden max-md:shadow-pop' : 'flex h-full'}
        >
          <Sidebar
            org={data?.org || 'small'}
          orgName={data?.orgName || null}
            email={data?.email}
            apps={data?.apps || []}
            awsError={data?.awsError}
            awsAvailable={!!data?.awsAvailable}
            folders={data?.folders || []}
            width={width}
            rail={learnPreview && shut}
            onResize={resize}
            onReload={load}
            onCollapse={() => (drawer ? setDrawer(false) : toggle(true))}
            onExpand={() => toggle(false)}
          />
        </div>
      </div>
      {children(data, load)}
    </div>
  );
}
