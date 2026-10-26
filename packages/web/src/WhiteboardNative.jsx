import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Download, Eraser, Loader2, Maximize, Volume2 } from 'lucide-react';
import { getSpeed } from './learn-audio.js';
import { registerBoardAsk } from './board-ask.js';
import { wsHeaders } from './api.js';
import PaidConfirm from './PaidConfirm.jsx';
import { afterPaint, usePerf } from './learn-perf.js';
import { boardNotice, mergeMarks, sketchOf, VIEW_START, viewStep } from './whiteboard-editor.js';
import { keptOf } from './whiteboard-kept.js';
import { explainOnBoard } from './whiteboard-explain.js';
import { countAssistant, listsOf, marksIn, removeExplanation, toSketch } from './whiteboard-sketch.js';

// The Whiteboard card without tldraw (docs/features/tldraw-removal.md, workstream A). The drawing area is the canvas's own
// sketch surface (AdaptiveCanvas renderSketch, through SketchHost): the one canvas toolbar draws here when the card is pressed,
// as in an Explain Back sketch. The marks are { strokes, shapes, items } on the block (`sketch`); a board saved by tldraw keeps
// its `snapshot` untouched beside it. There is no pan or zoom inside the card: Fit, a focus on a kept object, and 100 percent.
// The narration part below is a copy of WhiteboardBlock.jsx's; that file and this copy go away at cutover.

const button = 'flex h-7 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-50';
const download = (href, name) => Object.assign(document.createElement('a'), { href, download: name }).click();
const saveText = (name, text) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  download(url, name);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const fileName = block => (block.title || 'whiteboard').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'whiteboard';

export default function WhiteboardNative({ block, appName, onChange, host }) {
  const report = usePerf();
  const frameEl = useRef(null);
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const [state, dispatch] = useReducer(viewStep, VIEW_START);
  const [speaking, setSpeaking] = useState(false);
  const [voice, setVoice] = useState(null);
  const [voiceError, setVoiceError] = useState('');
  // Text waiting on the paid-narration confirmation: a tutor explanation, or the board's own narration after Read it aloud.
  const [offer, setOffer] = useState(null);
  // Every write starts from the block as it is now, so a save never reverts narration typed since.
  const latest = useRef(block);
  latest.current = block;
  const sketch = sketchOf(block);
  const kept = useMemo(() => keptOf(block.snapshot), [block.snapshot]);
  // What Fit and the opening view must show: the marks and the kept objects (their positions come from the original board).
  const extent = useMemo(() => ({ ...sketch, shapes: [...sketch.shapes, ...kept.items.filter(item => item.bounds).map(item => ({ kind: 'rect', x1: item.bounds.x, y1: item.bounds.y, x2: item.bounds.x2, y2: item.bounds.y2 }))] }), [sketch, kept]);
  const sketchRef = useRef(sketch);
  sketchRef.current = sketch;
  const extentRef = useRef(extent);
  extentRef.current = extent;
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const stateRef = useRef(state);
  stateRef.current = state;
  const narration = (block.narration || '').trim();
  const writable = !!host && host.writable(block.id);
  const drawn = listsOf(sketch).some(([, marks]) => marks.length > 0);
  useEffect(() => () => { if (voice) URL.revokeObjectURL(voice.url); }, [voice]);
  useEffect(() => { afterPaint(() => { report('content'); report('interactive'); }); }, []);

  // The drawing area's size in the card's own pixels (the canvas's zoom is a transform outside it).
  useLayoutEffect(() => {
    const element = frameEl.current;
    if (!element) return undefined;
    const measure = () => setFrame(previous => (previous.w === element.clientWidth && previous.h === element.clientHeight ? previous : { w: element.clientWidth, h: element.clientHeight }));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // The card chooses its view when it opens and when it is resized (a board that does not fit opens fitted, never clipped) until
  // the learner presses Fit, 100% or a kept object.
  useEffect(() => { dispatch({ type: 'frame', sketch: extentRef.current, frame }); }, [frame.w, frame.h, block.id]);
  const focus = rect => dispatch({ type: 'focus', sketch: extentRef.current, frame: frameRef.current, rect });

  const narrate = async (text, existing) => {
    const words = (text || '').trim();
    if (!words) return;
    setSpeaking(true); setVoiceError('');
    try {
      // Paid narrator: only reached from the confirmation's Generate.
      const response = await fetch('/api/learn/tts', { method: 'POST', headers: { 'Content-Type': 'application/json', ...wsHeaders() }, body: JSON.stringify({ app: appName, text: words, confirmed: true }) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `HTTP ${response.status}`);
      setVoice({ url: URL.createObjectURL(await response.blob()), text: existing ?? words });
    } catch (problem) { setVoiceError(problem.message); }
    finally { setSpeaking(false); }
  };

  // Ask about selection (board-ask.js): a client rectangle becomes sketch space through the card's frame and view.
  useEffect(() => registerBoardAsk(block.id, {
    shapesIn: screen => {
      const element = frameEl.current;
      if (!element) return [];
      const box = element.getBoundingClientRect(), ratio = box.width / (element.clientWidth || 1) || 1;
      const at = (x, y) => toSketch({ x: (x - box.left) / ratio, y: (y - box.top) / ratio }, stateRef.current.view);
      const a = at(screen.left, screen.top), b = at(screen.left + screen.width, screen.top + screen.height);
      return marksIn(sketchRef.current, { x: a.x, y: a.y, x2: b.x, y2: b.y });
    },
    explain: async ({ question, answer, onStage }) => {
      const result = await explainOnBoard({ block: latest.current, appName, question, answer, onStage, focus, addMarks: marks => host.edit(block.id, current => mergeMarks(current, marks)) });
      setOffer(result?.spoken || null);
    },
  }), [block.id, block.title, host]);

  const assistant = countAssistant(sketch);
  const notice = boardNotice(block);
  const picture = kept.picture && (
    <img data-board-kept-picture src={kept.picture.src} alt="" draggable={false}
      style={{ position: 'absolute', left: kept.picture.x, top: kept.picture.y, width: kept.picture.width, height: kept.picture.height, maxWidth: 'none', pointerEvents: 'none' }} />
  );

  return (
    <div data-native-whiteboard className="flex min-h-0 flex-1 flex-col gap-2" style={{ pointerEvents: 'auto' }} onPointerDown={event => event.stopPropagation()}>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <button type="button" data-board-fit title="Show the whole drawing" onClick={() => dispatch({ type: 'fit', sketch: extent, frame })} className={button}><Maximize size={13} />Fit</button>
        <button type="button" data-board-reset title="Show the drawing at its real size" onClick={() => dispatch({ type: 'reset', sketch: extent, frame })} className={button}>100%</button>
        {drawn && <button type="button" data-board-download-drawing title="Save your drawing as a file" onClick={() => saveText(`${fileName(block)}-drawing.json`, JSON.stringify({ app: 'rabbit-hole-whiteboard', sketch }, null, 2))} className={button}><Download size={13} />Download my drawing</button>}
        {drawn && host && <button type="button" data-board-download-picture title="Save the drawing as shown, as a picture" onClick={async () => { const svg = await host.capture(block.id, 'svg'); if (svg) download(svg, `${fileName(block)}.svg`); }} className={button}><Download size={13} />Download picture</button>}
        {block.snapshot != null && <button type="button" data-board-download-original title="Save the board exactly as it was before this editor" onClick={() => saveText(`${fileName(block)}-original.json`, JSON.stringify(block.snapshot))} className={button}><Download size={13} />Download original</button>}
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg">
        <div ref={frameEl} className="absolute inset-0 min-h-[180px]">
          {host
            ? host.render(block, { fill: true, sv: state.view, under: picture })
            : <p className="p-4 text-xs text-ink-2">Drawing is not available here.</p>}
        </div>
      </div>
      {notice && <span data-board-notice className="shrink-0 text-xs text-amber-700">{notice}</span>}
      {kept.items.length > 0 && (
        <details data-board-kept className="shrink-0 text-xs text-ink-2">
          <summary className="cursor-pointer">Kept from the original board ({kept.items.length})</summary>
          <p className="py-1">These cannot be edited in this editor. The picture is approximate; the original file has everything.</p>
          <ul className="space-y-1">
            {kept.items.map(item => (
              <li key={item.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{item.name}{item.bounds ? ` at ${Math.round(item.bounds.x)}, ${Math.round(item.bounds.y)}` : ''}</span>
                <button type="button" data-board-kept-focus disabled={!item.bounds} onClick={() => focus(item.bounds)} className={button}>Focus</button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {!!assistant && writable && (
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" data-board-clear-explanation title="Remove what the tutor drew; your own drawing and the lesson stay"
            onClick={() => host.edit(block.id, current => removeExplanation(current))} className={button}>
            <Eraser size={13} />Remove explanation
          </button>
          <span className="text-xs text-ink-3">{assistant} marks drawn by the tutor</span>
        </div>
      )}
      <div className="shrink-0 space-y-1.5">
        <textarea value={block.narration || ''} rows={2} placeholder="Narration for this board"
          onChange={event => onChange({ ...latest.current, narration: event.target.value })}
          className="w-full resize-y rounded-lg border border-line p-2 text-xs outline-none focus:border-ink-3" />
        {/* Once a player exists for this text, the player is the control. */}
        {offer && !speaking && (
          <div data-narration-offer className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-ink">Narration available</span>
            <PaidConfirm onCancel={() => setOffer(null)} onGenerate={() => { narrate(offer, offer); setOffer(null); }} />
          </div>
        )}
        {voice?.text !== narration && !offer && (
          <div className="flex items-center gap-2">
            <button type="button" data-board-speak disabled={speaking || !narration} onClick={() => setOffer(narration)}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-sm font-medium text-white disabled:opacity-50">
              {speaking ? <Loader2 size={14} className="animate-spin" /> : <Volume2 size={14} />}Read it aloud
            </button>
            {voiceError && <span className="text-xs text-red-700">{voiceError}</span>}
          </div>
        )}
        {voice && <audio data-board-audio src={voice.url} controls autoPlay
          onLoadedMetadata={event => { event.currentTarget.playbackRate = getSpeed(); }} className="w-full" />}
      </div>
    </div>
  );
}
