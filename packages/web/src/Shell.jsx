import { useEffect, useRef, useState } from 'react';
import { Home } from 'lucide-react';
import { navigate } from './api.js';
import { loadApps } from './app-data.js';
import Sidebar from './Sidebar.jsx';
import { patchSurface } from './agent/surface.js';
import { learnPreview } from './flags.js';

// flow.md §1: the sidebar is always present. One shell owns it everywhere -
// the /api/apps fetch it needs, the persisted collapse, the » reopen button,
// and the Ctrl/⌘+\ shortcut. Pages render inside via children(data, reload).
// The sidebar as stored. main.jsx publishes its edge (--sidebar-w) before the first paint, so the
// Agent Bar (mounted in Root, before any Shell) starts in place instead of sliding in from the left.
export const storedSidebar = () => ({ collapsed: localStorage.getItem('small.sidebar') === 'closed', width: +localStorage.getItem('small.sidebarW') || 260 });

export default function Shell({ children }) {
  const [data, setData] = useState(null); // { org, email, apps, folders } | { error }
  const [collapsed, setCollapsed] = useState(() => storedSidebar().collapsed);
  const [width, setWidth] = useState(() => storedSidebar().width); // resizable, 200–400
  const [resizing, setResizing] = useState(false); // drag-resize must not fight the slide transition
  const resizeTimer = useRef();
  const resize = (w) => {
    setResizing(true);
    setWidth(w);
    localStorage.setItem('small.sidebarW', w);
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
    localStorage.setItem('small.sidebar', c ? 'closed' : 'open');
  };
  // Immersive pages (Learn) collapse the sidebar on entry via this event.
  useEffect(() => {
    const onSidebar = (e) => toggle(!!e.detail?.collapsed);
    window.addEventListener('small:sidebar', onSidebar);
    return () => window.removeEventListener('small:sidebar', onSidebar);
  }, []);
  // Rabbit Hole dev: the Agent Bar (Root) sits over the content column; publish its left edge.
  useEffect(() => {
    if (learnPreview) document.documentElement.style.setProperty('--sidebar-w', `${collapsed ? 0 : width}px`);
  }, [collapsed, width]);
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
          localStorage.setItem('small.sidebar', c ? 'open' : 'closed');
          return !c;
        });
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  return (
    <div className="flex h-screen">
      {collapsed && (
        <button
          title="Back (reopens the sidebar)"
          onClick={() => { toggle(false); if (history.length > 1) history.back(); else navigate('/apps'); }}
          className="fixed top-3 left-2 z-10 rounded-md border border-line-strong bg-active p-1.5 text-ink-2 hover:bg-hover hover:text-ink max-md:hidden"
        >
          <Home size={16} />
        </button>
      )}
      {/* Notion slide: the wrapper animates width to 0 while the fixed-width inner
          translates left, so the sidebar glides out instead of blinking away. */}
      <div
        data-shell-sidebar
        style={{ width: collapsed ? 0 : width, transition: resizing ? 'none' : 'width 200ms cubic-bezier(0.25,1,0.35,1)' }}
        className="shrink-0 overflow-hidden max-md:hidden"
      >
        <div
          style={{ width, transform: collapsed ? `translateX(-${width}px)` : 'none', transition: resizing ? 'none' : 'transform 200ms cubic-bezier(0.25,1,0.35,1)' }}
          className="flex h-full"
        >
          <Sidebar
            org={data?.org || 'small'}
          orgName={data?.orgName || null}
            email={data?.email}
            apps={data?.apps || []}
            awsError={data?.awsError}
            folders={data?.folders || []}
            width={width}
            onResize={resize}
            onReload={load}
            onCollapse={() => toggle(true)}
          />
        </div>
      </div>
      {children(data, load)}
    </div>
  );
}
