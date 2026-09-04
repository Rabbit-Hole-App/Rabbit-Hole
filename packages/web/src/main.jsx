import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import SharePage from './SharePage.jsx';

// /apps (list), /apps/<slug> (share page); /dash is a clean alias for /apps
// (see the control-plane cache note). No router dep for two pages.
if (!/^\/(apps(\/[a-z0-9-]+)?|dash)$/.test(window.location.pathname)) {
  window.history.replaceState(null, '', '/apps');
}

function Root() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const m = path.match(/^\/apps\/([a-z0-9-]+)$/);
  return m ? <SharePage slug={m[1]} /> : <App />;
}

createRoot(document.getElementById('root')).render(<Root />);
