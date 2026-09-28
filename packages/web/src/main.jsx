import React, { lazy, Suspense, useEffect, useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Minimize2 } from 'lucide-react';
import './index.css';
import App from './App.jsx';
import { AskPanel } from './ask.jsx';
import MembersPage from './Members.jsx';
import SearchModal from './Search.jsx';
import SharePage from './SharePage.jsx';
// Home and Explore exist only in the preview (routes.js pageFor), so the live bundle never carries them.
const Home = lazy(() => import('./Home.jsx'));
const ExplorePreview = lazy(() => import('./Home.jsx').then((m) => ({ default: m.ExplorePreview })));
import Shell from './Shell.jsx';
import { applyTheme, getTheme, navigate, wsName } from './api.js';
import { ExpandedPageFrame, Toasts } from './ui.jsx';
import { isPrivateByoc } from './private-auth.js';
import PrivateAuthGate from './PrivateAuthGate.jsx';
import { getSurface, setSurface } from './agent/surface.js';
import { learnPreview, PRODUCT } from './flags.js';
import { baseSurfaceFor, canonicalPath, pageFor } from './routes.js';

applyTheme(getTheme()); // before first paint - no light flash for dark users
if (learnPreview) document.title = PRODUCT; // the live build keeps index.html's title

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
              <button aria-label="Minimize chat" title="Back to Graph" onClick={() => navigate(app ? '/apps/' + encodeURIComponent(app) + '?tab=graph' : '/apps')} className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-ink-2 hover:bg-hover hover:text-ink"><Minimize2 size={14} strokeWidth={1.5} /></button>
            </div>
            {isPrivateByoc && !data?.apps?.find(a => a.name === app)?.app_chat
              ? <p className="text-sm text-ink-2">{!data ? 'Loading chat…' : app ? 'Chat is not configured for this app yet.' : 'Open an app to chat about it in Agent.'}</p>
              : <AskPanel key={isPrivateByoc ? app : undefined} scope={app ? { app } : {}} appName={app}
                  chatConfig={data?.apps?.find(a => a.name === app)?.app_chat}
                  placeholder={app ? `Ask about ${app}…` : 'Ask about your workspace…'} autoFocus />}
          </ExpandedPageFrame>
        </main>
      )}
    </Shell>
  );
}

// Rabbit Hole dev only (T02 §3.3, §5): the one Start dialog host, mounted in Root so
// Shell remounts never drop it. The live build never loads the chunk.
const StartHost = learnPreview ? lazy(() => import('./agent/StartHost.jsx')) : null;
// A 'small:start' sent before that chunk has loaded would reach no listener; keep the latest
// one so the host opens it on mount.
let earlyStart = null;
if (learnPreview) window.addEventListener('small:start', (e) => { earlyStart = e.detail?.path || 'repository'; });
const takeEarlyStart = () => { const path = earlyStart; earlyStart = null; return path; };
// T02 §6.1: one Agent Bar over every page, mounted in Root for the same reason.
const AgentBar = learnPreview ? lazy(() => import('./agent/AgentBar.jsx')) : null;

function Root() {
  // PrivateAuthGate consumes Cognito callbacks before normalizing app routes.
  // /dash aliases /apps (see the control-plane cache note). No router dep: routes.js.
  const fixed = canonicalPath(window.location.pathname, learnPreview);
  if (fixed) window.history.replaceState(null, '', fixed);
  // pathname + search so ?s=shared section switches re-render too
  const [path, setPath] = useState(window.location.pathname + window.location.search);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname + window.location.search);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const [pathname, search = ''] = path.split('?');
  const at = pageFor(pathname, search, learnPreview);
  // The Agent Bar's starting surface for this URL (T02 §6). Layout effects run before every
  // child's useEffect, so a page's own refinement always lands on top of this baseline.
  useLayoutEffect(() => {
    if (learnPreview) setSurface(baseSurfaceFor(pathname, search, getSurface()));
  }, [path]);
  return (
    <>
      {at.page === 'app' ? <SharePage slug={at.slug} runId={at.runId} /> : at.page === 'members' ? <MembersPage /> : at.page === 'chat' ? <ChatPage /> : at.page === 'home' ? <Suspense fallback={null}><Home /></Suspense> : at.page === 'explore' ? <Suspense fallback={null}><ExplorePreview /></Suspense> : <App />}
      <SearchModal />
      {StartHost && <Suspense fallback={null}><StartHost takeEarly={takeEarlyStart} /></Suspense>}
      {AgentBar && <Suspense fallback={null}><AgentBar /></Suspense>}
      <Toasts />
    </>
  );
}

createRoot(document.getElementById('root')).render(isPrivateByoc ? <PrivateAuthGate><Root /></PrivateAuthGate> : <Root />);
