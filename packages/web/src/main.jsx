import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Minimize2 } from 'lucide-react';
import './index.css';
import App from './App.jsx';
import { AskPanel } from './ask.jsx';
import MembersPage from './Members.jsx';
import SearchModal from './Search.jsx';
import SharePage from './SharePage.jsx';
import Shell from './Shell.jsx';
import { applyTheme, getTheme, navigate, wsName } from './api.js';
import { ExpandedPageFrame, Toasts } from './ui.jsx';
import { isPrivateByoc } from './private-auth.js';
import PrivateAuthGate from './PrivateAuthGate.jsx';

applyTheme(getTheme()); // before first paint - no light flash for dark users

// org-wide chat as a page - same panel as the app Agent tab, textbox pinned bottom.
// /chat?app=<slug> narrows the scope to one app (the Agent tab's open-as-page).
function ChatPage() {
  const app = new URLSearchParams(window.location.search).get('app');
  const crumb = 'rounded-sm px-1 py-0.5 hover:bg-hover hover:text-ink';
  return (
    <Shell>
      {(data) => (
        <main className="flex h-screen min-w-0 flex-1 flex-col">
          <ExpandedPageFrame>
            <div className="flex shrink-0 items-center gap-1 pb-6 text-sm text-ink-2">
              <button className={crumb} onClick={() => navigate('/apps')}>{data?.orgName || wsName(data?.org)}</button>
              <span>/</span>
              <button className={crumb} onClick={() => navigate('/apps')}>Apps</button>
              {app && (
                <>
                  <span>/</span>
                  <button className={crumb} onClick={() => navigate(`/apps/${app}`)}>{app}</button>
                </>
              )}
              <span>/</span>
              <span className="px-1 text-ink">Chat</span>
              <button aria-label="Minimize chat" title="Back to Agent" onClick={() => navigate(app ? '/apps/' + encodeURIComponent(app) + '?tab=agent' : '/apps')} className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-ink-2 hover:bg-hover hover:text-ink"><Minimize2 size={14} strokeWidth={1.5} /></button>
            </div>
            <AskPanel scope={app ? { app } : {}} appName={app} placeholder={app ? `Ask about ${app}…` : 'Ask about your workspace…'} autoFocus />
          </ExpandedPageFrame>
        </main>
      )}
    </Shell>
  );
}

function Root() {
  // PrivateAuthGate consumes Cognito callbacks before normalizing app routes.
  // /dash aliases /apps (see the control-plane cache note). No router dep.
  if (!/^\/(apps(\/[a-z0-9-]+(\/runs\/[\w-]+)?)?|dash|members|chat)$/.test(window.location.pathname)) {
    window.history.replaceState(null, '', '/apps');
  }
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

createRoot(document.getElementById('root')).render(isPrivateByoc ? <PrivateAuthGate><Root /></PrivateAuthGate> : <Root />);
