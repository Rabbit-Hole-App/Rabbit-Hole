// Standalone mount of the real AdaptiveCanvas for the canvas-editing checks (e2e/canvas-editing-check.mjs): no app
// shell, auth or network. Vite dev serves it from disk; it is never an entry in vite.config.js, so it never ships.
// ?board=<key> picks the localStorage board; ?readonly=1 mounts it view-only, the way a shared link does for its owner.
// ?localcopy=1 mounts it as a visitor's temporary copy (SHARE-02): the localStorage board is the source, read only; edits go to
// the guest draft in sessionStorage (guest-draft.js), which a reload mounts again, as SharedBoardPage does.
// A composer stand-in (a textarea marked data-chat-composer) proves canvas keys stand down while it has focus and that
// hiding the composer keeps its draft. ?hooks=1 adds the real "Curious where this goes?" card on the real next-steps
// controller, whose post is local and scripted (window.hookPost: { delay, fail }) - no request leaves the page.
import { useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import AdaptiveCanvas from '../src/AdaptiveCanvas.jsx';
import { ComposerHideButton } from '../src/ChatComposer.jsx';
import { NextStepsCard } from '../src/ask.jsx';
import { nextStepsController } from '../src/learn-next-steps.js';
import { loadGuestDraft, saveGuestDraft } from '../src/guest-draft.js';
import '../src/index.css';

const params = new URLSearchParams(location.search);
const KEY = `harness:${params.get('board') || 'canvas-editing'}`;
const readOnly = params.get('readonly') === '1';
const localCopy = params.get('localcopy') === '1';
const session = () => sessionStorage;

// Each call answers a new set of three after hookPost.delay ms, or throws when hookPost.fail is set; window.hookPosts counts.
window.hookPost = { delay: 50, fail: false };
window.hookPosts = 0;
const fakeSet = n => ({ set_id: `ns_${String(n).padStart(8, '0')}`, generated_at: 'now', options: [1, 2, 3].map(i => ({ id: `ns_${String(n).padStart(8, '0')}.${i}`, hook: `Suggestion ${n}.${i}?`, selected_next_step: { v: 1, suggestion_id: `s${n}.${i}`, learning_goal: `goal ${n}.${i}` } })) });
const controller = nextStepsController({
  post: async () => { window.hookPosts += 1; const n = window.hookPosts; await new Promise(resolve => setTimeout(resolve, window.hookPost.delay)); if (window.hookPost.fail) throw new Error('scripted failure'); return fakeSet(n); },
  debounce: 10,
});
// useSyncExternalStore needs a stable snapshot: cached per change, as LearnNextSteps.jsx's held() does.
let cached = controller.view();
controller.subscribe(() => { cached = controller.view(); });
const snapshot = () => cached;
const basis = value => controller.update({ basis: value, stop: null, input: () => ({ input: {} }) });
window.hookBasis = basis;
if (params.get('hooks') === '1') basis('a');

function Hooks() {
  const view = useSyncExternalStore(controller.subscribe, snapshot, snapshot);
  return <NextStepsCard steps={{ ...view, select: id => controller.select(id), refresh: () => controller.refresh() }} onPick={() => { window.picked = (window.picked || 0) + 1; }} />;
}

function Harness() {
  const [exchanges, setExchanges] = useState([]);
  const api = useRef(null);
  window.canvasApi = api;
  const [state] = useState(() => (localCopy ? loadGuestDraft(session, KEY)?.state : null) || (readOnly || localCopy ? JSON.parse(localStorage.getItem(KEY) || '{}') : null));
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <AdaptiveCanvas exchanges={exchanges} onMove={(id, dx, dy) => setExchanges(list => list.map(entry => entry.id === id ? { ...entry, dx, dy } : entry))}
        onAdd={list => setExchanges(previous => [...previous, ...list])} onRestore={setExchanges} onDelete={id => setExchanges(list => list.filter(entry => entry.id !== id))}
        apiRef={api} storageKey={readOnly || localCopy ? null : KEY} boardState={state} readOnly={readOnly}
        localCopy={localCopy} onSave={localCopy ? draft => saveGuestDraft(session, KEY, 1, draft) : null}
        hooks={params.get('hooks') === '1' ? <Hooks /> : null}
        composer={<div data-composer-standin className="flex items-center gap-2.5 rounded-xl border border-line-strong bg-white px-3 py-2"><textarea data-chat-composer aria-label="Composer stand-in" placeholder="Composer" className="h-10 min-w-0 flex-1 rounded border border-line px-2 text-sm" /><ComposerHideButton /></div>} />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
