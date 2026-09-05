import { useEffect, useState } from 'react';
import { ChevronsRight } from 'lucide-react';
import { api } from './api.js';
import Sidebar from './Sidebar.jsx';

// flow.md §1: the sidebar is always present. One shell owns it everywhere —
// the /api/apps fetch it needs, the persisted collapse, the » reopen button,
// and the Ctrl/⌘+\ shortcut. Pages render inside via children(data, reload).
export default function Shell({ children }) {
  const [data, setData] = useState(null); // { org, email, apps, folders } | { error }
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('small.sidebar') === 'closed');
  const [width, setWidth] = useState(() => +localStorage.getItem('small.sidebarW') || 260); // resizable, 200–400

  const load = () => api('/api/apps').then(setData).catch((e) => setData({ error: e.message }));
  useEffect(() => { load(); }, []);

  const toggle = (c) => {
    setCollapsed(c);
    localStorage.setItem('small.sidebar', c ? 'closed' : 'open');
  };
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
      {collapsed ? (
        <button
          title="Open sidebar (Ctrl+\)"
          onClick={() => toggle(false)}
          className="fixed top-3 left-2 z-10 rounded-sm p-1 text-ink-2 hover:bg-hover hover:text-ink max-md:hidden"
        >
          <ChevronsRight size={16} />
        </button>
      ) : (
        <Sidebar
          org={data?.org || 'small'}
          email={data?.email}
          apps={data?.apps || []}
          folders={data?.folders || []}
          width={width}
          onResize={(w) => { setWidth(w); localStorage.setItem('small.sidebarW', w); }}
          onReload={load}
          onCollapse={() => toggle(true)}
        />
      )}
      {children(data, load)}
    </div>
  );
}
