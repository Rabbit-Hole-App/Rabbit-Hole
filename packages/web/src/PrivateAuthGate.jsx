import { useEffect, useState } from 'react';
import { privateAuth } from './private-auth.js';

export default function PrivateAuthGate({ children }) {
  const [status, setStatus] = useState('loading');
  useEffect(() => {
    let active = true;
    privateAuth().then((client) => client.start())
      .then((ready) => { if (active) setStatus(ready ? 'ready' : 'signed-out'); })
      .catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, []);
  if (status === 'ready') return children;
  const signIn = async () => {
    setStatus('loading');
    try { await (await privateAuth()).signIn(); } catch { setStatus('error'); }
  };
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6 text-ink">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-2xl font-semibold tracking-tight">small</div>
        <h1 className="text-xl font-medium">Sign in to Small</h1>
        <p className="text-sm text-ink-2">Use your account for this workspace.</p>
        {status === 'loading' ? <p role="status" className="text-sm text-ink-2">Opening Small…</p> : (
          <>
            {status === 'error' && <p role="alert" className="text-sm text-danger">Sign-in could not be completed. Try again.</p>}
            <button onClick={signIn} className="h-9 rounded-sm bg-ink px-4 text-sm font-medium text-paper hover:opacity-90">Sign in</button>
          </>
        )}
      </div>
    </main>
  );
}
