// Standalone mount of the real AdaptiveCanvas for the canvas-editing checks (e2e/canvas-editing-check.mjs): no app
// shell, auth or network. Vite dev serves it from disk; it is never an entry in vite.config.js, so it never ships.
// ?board=<key> picks the localStorage board; ?readonly=1 mounts it view-only, the way a shared link does.
// A composer stand-in (a textarea marked data-chat-composer) proves canvas keys stand down while it has focus.
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import AdaptiveCanvas from '../src/AdaptiveCanvas.jsx';
import '../src/index.css';

const params = new URLSearchParams(location.search);
const KEY = `harness:${params.get('board') || 'canvas-editing'}`;
const readOnly = params.get('readonly') === '1';

function Harness() {
  const [exchanges, setExchanges] = useState([]);
  const api = useRef(null);
  window.canvasApi = api;
  const state = readOnly ? JSON.parse(localStorage.getItem(KEY) || '{}') : null;
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <AdaptiveCanvas exchanges={exchanges} onMove={(id, dx, dy) => setExchanges(list => list.map(entry => entry.id === id ? { ...entry, dx, dy } : entry))}
        onAdd={list => setExchanges(previous => [...previous, ...list])} onRestore={setExchanges} onDelete={id => setExchanges(list => list.filter(entry => entry.id !== id))}
        apiRef={api} storageKey={readOnly ? null : KEY} boardState={state} readOnly={readOnly}
        composer={<textarea data-chat-composer aria-label="Composer stand-in" placeholder="Composer" className="h-10 w-full rounded border border-line px-2 text-sm" />} />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
