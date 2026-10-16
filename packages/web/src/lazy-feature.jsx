import { lazy, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from './ui.jsx';
import { retryMayReload, unsavedEdits } from './chunk-reload.js';
import { featureLoader } from './lazy-feature-load.js';

// A feature whose code could not load says so where it would have been, with Retry (follow-up R3 item 1). The page around
// it, the canvas and its edits included, stays. Retry imports again; Chrome keeps a failed module for the life of the page,
// so when that fails too, Retry reloads - only online and with every edit on the server (chunk-reload.js).
function FeatureUnavailable({ label, retry, props }) {
  const [Loaded, setLoaded] = useState(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [unsaved, setUnsaved] = useState(false);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  if (Loaded) return <Loaded {...props} />;
  const again = async () => {
    setBusy(true);
    setUnsaved(false);
    try {
      const module = await retry();
      if (module?.default != null) { setLoaded(() => module.default); return; }
    } catch { /* still unavailable */ } finally { setBusy(false); }
    if (retryMayReload({ online: navigator.onLine, unsaved: unsavedEdits() })) window.location.reload();
    else if (navigator.onLine) setUnsaved(true);
  };
  const name = label.charAt(0).toLowerCase() + label.slice(1);
  return (
    <div role="status" data-feature-unavailable className="flex min-w-56 flex-col items-start gap-2 p-3 text-sm text-ink-2">
      <p>{online ? `${label} could not load. A newer version may be out.` : `You're offline, so ${name} could not load. Your edits stay on this page.`}</p>
      {unsaved && <p>Your latest edits are not saved yet, so the page was not reloaded. Retry once they are saved.</p>}
      <Button size="sm" disabled={busy} onClick={again}><RefreshCw size={13} aria-hidden /> Retry</Button>
    </div>
  );
}

// React.lazy for a feature inside a live page: `label` names it in the message ("The equation editor").
export const lazyFeature = (factory, label) => lazy(featureLoader(factory, ({ props, ...rest }) => <FeatureUnavailable label={label} props={props} {...rest} />));
