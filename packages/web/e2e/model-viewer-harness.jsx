// The model card on a stand-in canvas (model-viewer-check.mjs drives it): files go through the real importer
// (model-import.js) into the real card (ModelCard.jsx). The stand-in records what reaches the "canvas" - wheel and
// pointer events that bubble out of a card, keys pressed while a viewer owns the focus - and every card change.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import ModelCard from '../src/ModelCard.jsx';
import { importModelFiles } from '../src/model-import.js';
import { placeModelCard, setSourceClient } from '../src/model-storage.js';
import { cacheAsset, cachedAsset } from '../src/learn-asset-cache.js';
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
        onChange={next => { log.changes.push({ id: next.id, camera: next.camera, assetKey: next.assetKey, entry: next.model?.entry, fileRef: next.fileRef }); set(list => list.map(b => (b.id === next.id ? next : b))); }} />
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
  // Without ?sources the card keeps a board asset (the pre-fileRef path older cards use).
  for (const card of cards) {
    if (window.__sources) blocks.push(await placeModelCard(card));
    else { await cacheAsset(card.block.assetKey, card.blob); blocks.push(card.block); }
  }
  setCards(list => [...list, ...blocks]);
  return { blocks, leftovers: leftovers.map(f => f.name), errors, importMs: Math.round(performance.now() - started) };
};
window.__clear = () => setCards([]);
// A card as a later stage would leave it (e.g. a STEP card once its job has a GLB derivative).
window.__patch = (id, patch) => setCards(list => list.map(b => (b.id === id ? { ...b, ...patch } : b)));
window.__liveCount = liveCount;

// ?sources=1: a stand-in for file-source-client.js (its startUpload / watchUpload / uploadState / canWrite / loadSource), so
// cards take the fileRef path: each file uploads as its own source, kept in memory here. window.__sources counts uploads
// and reads; window.__failUploads = n makes the next n uploads fail (retryable).
if (new URLSearchParams(location.search).get('sources')) {
  const store = new Map(), states = new Map(), listeners = new Map();
  window.__sources = { uploads: [], reads: [] }; window.__failUploads = 0;
  const emit = (key, state) => { states.set(key, state); for (const fn of listeners.get(key) || []) fn(state); };
  setSourceClient({
    canWrite: () => true,
    uploadState: key => states.get(key) || null,
    watchUpload(key, fn) { if (!listeners.has(key)) listeners.set(key, new Set()); listeners.get(key).add(fn); return () => listeners.get(key)?.delete(fn); },
    startUpload(key, { family, file = null }) {
      const now = states.get(key); if (now && now.stage !== 'failed') return now;
      emit(key, { stage: 'waiting' });
      (async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        const bytes = file || await cachedAsset(key);
        if (window.__failUploads > 0) { window.__failUploads--; emit(key, { stage: 'failed', error: 'the network dropped (test)', retryable: true }); return; }
        const id = `fs_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
        store.set(id, bytes); window.__sources.uploads.push({ id, family, name: bytes?.name || '' });
        emit(key, { stage: 'stored', source: { id, rev: `rev-${id}` } });
      })();
      return states.get(key);
    },
    async loadSource(block) { const ref = block.fileRef; if (ref.source?.id) { window.__sources.reads.push(ref.source.id); return store.get(ref.source.id) || null; } return ref.local ? cachedAsset(ref.local) : null; },
  });
}
