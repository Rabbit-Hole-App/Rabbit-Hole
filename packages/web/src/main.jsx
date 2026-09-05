import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { AskPanel } from './ask.jsx';
import MembersPage from './Members.jsx';
import SearchModal from './Search.jsx';
import SharePage from './SharePage.jsx';
import Shell from './Shell.jsx';
import { applyTheme, getTheme } from './api.js';
import { Toasts } from './ui.jsx';

applyTheme(getTheme()); // before first paint — no light flash for dark users

// /apps (list), /apps/<slug> (app page), /apps/<slug>/runs/<id> (run page),
// /members, /chat; /dash aliases /apps (see the control-plane cache note). No router dep.
if (!/^\/(apps(\/[a-z0-9-]+(\/runs\/[\w-]+)?)?|dash|members|chat)$/.test(window.location.pathname)) {
  window.history.replaceState(null, '', '/apps');
}

// org-wide chat as a page — same panel as the app Agent tab, textbox pinned bottom
function ChatPage() {
  return (
    <Shell>
      {() => (
        <main className="flex h-screen min-w-0 flex-1 flex-col">
          <div className="mx-auto flex h-full w-full max-w-[780px] min-h-0 flex-col px-6 py-6">
            <AskPanel scope={{}} placeholder="Ask about your workspace…" autoFocus />
          </div>
        </main>
      )}
    </Shell>
  );
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
      {m ? <SharePage slug={m[1]} runId={m[2]} /> : path.split('?')[0] === '/members' ? <MembersPage /> : path.split('?')[0] === '/chat' ? <ChatPage /> : <App />}
      <SearchModal />
      <Toasts />
    </>
  );
}

createRoot(document.getElementById('root')).render(<Root />);
