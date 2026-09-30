import { useEffect, useState } from 'react';
import StartDialog from '../StartDialog.jsx';
import { ctxOf } from './commands.js';
import { useSurface } from './surface.js';

// T02 §3.3, §5: the one Start dialog host. Home's [Start a rabbit hole], Library
// and Settings dispatch 'small:start' {path}. Mounted once in Root (dev), so the
// dialog survives Shell remounts and Settings opening on top of it.
export default function StartHost({ takeEarly = () => null }) {
  const surface = useSurface(); // a fresh ctx once Shell publishes the workspace identity
  const [path, setPath] = useState(null);
  useEffect(() => {
    const open = (e) => { takeEarly(); setPath(e.detail?.path || 'repository'); };
    window.addEventListener('small:start', open);
    // A request sent before this listener existed (chunk still loading, or between render and now).
    const early = takeEarly();
    if (early) setPath(early);
    return () => window.removeEventListener('small:start', open);
  }, []);
  return path && <StartDialog ctx={ctxOf(surface)} initial={path} onClose={() => setPath(null)} />;
}
