import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import MembersPage from './Members.jsx';
import SearchModal from './Search.jsx';
import SharePage from './SharePage.jsx';
import { applyTheme, getTheme } from './api.js';
import { Toasts } from './ui.jsx';

applyTheme(getTheme()); // before first paint — no light flash for dark users

// /apps (list), /apps/<slug> (app page), /apps/<slug>/runs/<id> (run page),
// /members; /dash aliases /apps (see the control-plane cache note). No router dep.
if (!/^\/(apps(\/[a-z0-9-]+(\/runs\/[\w-]+)?)?|dash|members)$/.test(window.location.pathname)) {
  window.history.replaceState(null, '', '/apps');
}

function Root() {
  // pathname + search so ?s=shared section switches re-render too
  const [path, setPath] = useState(window.location.pathname + window.location.search);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname + window.location.search);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const m = path.split('?')[0].match(/^\/apps\/([a-z0-9-]+)(?:\/runs\/([\w-]+))?$/);
  return (
    <>
      {m ? <SharePage slug={m[1]} runId={m[2]} /> : path.split('?')[0] === '/members' ? <MembersPage /> : <App />}
      <SearchModal />
      <Toasts />
    </>
  );
}

createRoot(document.getElementById('root')).render(<Root />);
