// Standalone mount of the real AdaptiveCanvas with lane 2's importer (src/DocImport.jsx), for e2e/file-doc-cards-check.mjs:
// files dropped on the canvas go through useDocImport exactly as LearnPage's takeDrop sends them. No app shell, auth or
// network; Vite dev serves it from disk and it is never an entry in vite.config.js, so it never ships. window.toasts lists
// the import's visible refusals.
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import AdaptiveCanvas from '../src/AdaptiveCanvas.jsx';
import { useDocImport } from '../src/DocImport.jsx';
import '../src/index.css';

const KEY = 'harness:file-import';
window.toasts = [];

function Harness() {
  const [exchanges, setExchanges] = useState([]);
  const api = useRef(null);
  window.canvasApi = api;
  const docImport = useDocImport({ canvas: () => api.current, toast: message => { window.toasts.push(message); } });
  const take = async (files, at) => { for (const file of files) if (docImport.claims(file)) await docImport.take(file, at); else window.toasts.push(`not lane 2: ${file.name}`); };
  window.takeFiles = take;
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <AdaptiveCanvas exchanges={exchanges} onMove={(id, dx, dy) => setExchanges(list => list.map(entry => entry.id === id ? { ...entry, dx, dy } : entry))}
        onAdd={list => setExchanges(previous => [...previous, ...list])} onRestore={setExchanges} onDelete={id => setExchanges(list => list.filter(entry => entry.id !== id))}
        apiRef={api} storageKey={KEY} onDropFiles={take} />
      {docImport.dialog}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
