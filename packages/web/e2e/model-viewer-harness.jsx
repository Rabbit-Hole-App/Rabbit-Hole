// The model card on a stand-in canvas (model-viewer-check.mjs drives it): files go through the real importer
// (model-import.js) into the real card (ModelCard.jsx). The stand-in records what reaches the "canvas" - wheel and
// pointer events that bubble out of a card, keys pressed while a viewer owns the focus - and every card change.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import ModelCard from '../src/ModelCard.jsx';
import { importModelFiles } from '../src/model-import.js';
import { setSourceClient, storeModelCard } from '../src/model-storage.js';
import { liveCount } from '../src/viewer-slots.js';

const log = window.__log = { wheel: 0, pointer: 0, keys: [], changes: [], errors: [] };
window.addEventListener('keydown', event => log.keys.push({ key: event.key, viewerOwnsFocus: !!document.activeElement?.closest?.('[data-viewer-active]') }), true);

let setCards = () => {};
function Board() {
  const [cards, set] = useState([]); setCards = set;
  const [selected, setSelected] = useState(null);
  return <div data-canvas style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 24, alignItems: 'center' }}
    ref={element => { if (element && !element.wired) { element.wired = true; element.addEventListener('wheel', () => { log.wheel++; }); element.addEventListener('pointerdown', () => { log.pointer++; }); } }}>
    {cards.map(block => <div key={block.id} data-block-id={block.id} onPointerDown={() => setSelected(block.id)}
      style={{ width: block.w || 560, height: block.h || 460, display: 'flex', flexDirection: 'column', background: 'white', border: '1px solid #ddd', borderRadius: 12, paddingTop: 12, outline: selected === block.id ? '2px solid #2383e2' : 'none' }}>
      <ModelCard block={block} selected={selected === block.id} onSelect={id => setSelected(id)}
        onChange={next => { log.changes.push({ id: next.id, camera: next.camera, assetKey: next.assetKey, entry: next.model?.entry }); set(list => list.map(b => (b.id === next.id ? next : b))); }} />
    </div>)}
  </div>;
}
createRoot(document.getElementById('root')).render(<Board />);

// Fixture paths (served by the check) -> one drop. Folder files: [{ url, bundleRoot, bundlePath }].
window.__drop = async items => {
  const files = await Promise.all(items.map(async item => {
    const url = typeof item === 'string' ? item : item.url;
    const response = await fetch(`/__fixtures/${url}`);
    const file = new File([await response.arrayBuffer()], url.split('/').pop());
    return typeof item === 'string' ? file : Object.assign(file, { bundleRoot: item.bundleRoot, bundlePath: item.bundlePath });
  }));
  const started = performance.now();
  const { cards, leftovers, errors } = await importModelFiles(files);
  const blocks = [];
  for (const card of cards) blocks.push(await storeModelCard(card, { app: 'harness', board: 'main' }));
  setCards(list => [...list, ...blocks]);
  return { blocks, leftovers: leftovers.map(f => f.name), errors, importMs: Math.round(performance.now() - started) };
};
window.__clear = () => setCards([]);
// A card as a later stage would leave it (e.g. a STEP card once its job has a GLB derivative).
window.__patch = (id, patch) => setCards(list => list.map(b => (b.id === id ? { ...b, ...patch } : b)));
window.__liveCount = liveCount;

// ?sources=1: a stand-in for file-source-client.js (same signature), so cards go through the fileRef path: each file is
// its own source, kept in memory here; window.__sources counts uploads and reads.
if (new URLSearchParams(location.search).get('sources')) {
  const store = new Map(); window.__sources = { uploads: [], reads: [] };
  setSourceClient({
    async uploadSource(file, { app, board, family }) { const id = `fs_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`; store.set(id, file); window.__sources.uploads.push({ id, name: file.name, family, app, board }); return { id, rev: `rev-${id}` }; },
    async loadSource(block) { window.__sources.reads.push(block.fileRef.source.id); return store.get(block.fileRef.source.id) || null; },
  }, { app: 'harness', board: 'main' });
}
