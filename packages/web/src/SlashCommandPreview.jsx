// One command's preview in View > Slash Commands (owner spec 2026-10-29 sections 7.4 and 9): a stage measured from the space the
// window leaves it (ResizeObserver), and in it one example at a time - the command's finished card drawn by the canvas's own card
// body, the shared brief card, Learning Goals, the source finder, the notebook, YouTube, Wikipedia or webpage card, or a plain
// statement that no matching saved result exists. The card sits just under the command's details, sized to the stage, never at its
// canvas size inside a scroller: its width and height are capped by the stage, and a card whose content keeps an aspect (an
// explanation's scene, a video) is narrowed until the whole card fits. Fixtures come from slash-sheet.js; nothing here generates,
// searches, captures, grades or saves (the notebook's own in-browser Python runs only what the visitor runs).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BLOCK_TYPES, LearningBlockBody } from './LearningBlocks.jsx';
import NotebookBody from './NotebookCard.jsx';
import GoalManager from './GoalManager.jsx';
import GenerationProposalCard from './GenerationProposalCard.jsx';
import { FinderPanel } from './SearchBar.jsx';
import { CadViewerTools } from './CadCard.jsx';
import { YouTubeMoment } from './AdaptiveCanvas.jsx';
import LearnWiki from './LearnWiki.jsx';
import WebpageCard from './WebpageCard.jsx';
import { CardSourceScope } from './use-card-source.js';
import { ExplainBackService } from './ExplainBackPanel.jsx';
import { BRIEFS, briefView, previewBlock } from './slash-sheet.js';

// Controls that would reach a provider or the account from inside a card: in the window a press on one does nothing (Find and
// Generate on the photo card, Generate on a video or scene, a paid Generate).
const LIVE = '[data-sketch-toggle], [data-photo-search], [data-image-generate], [data-photo-result], [data-generate-video], [data-generate-scene], [data-paid-generate], [data-recovery-action]';
const swallow = event => { event.preventDefault(); event.stopPropagation(); };
const guard = { onClickCapture: event => { if (event.target.closest?.(LIVE)) swallow(event); } };
// The photo card searches on Enter in its field: the window's copy never does.
const noEnter = { onKeyDownCapture: event => { if (event.key === 'Enter' && event.target.tagName === 'INPUT') swallow(event); } };
// An image card shows its picture, not the card's Generate offer or its availability line (owner, 2026-10-29).
const IMAGE_RESULT = '[&_[data-image-generate]]:hidden [&_[data-image-generate-unavailable]]:hidden';
const reducedMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

// The stage's size: what is left of the pane under the command's details.
function useSize(ref) {
  const [size, setSize] = useState(null);
  useLayoutEffect(() => {
    const element = ref.current;
    const read = () => { const box = element.getBoundingClientRect(); setSize(previous => (previous && previous.w === Math.floor(box.width) && previous.h === Math.floor(box.height) ? previous : { w: Math.floor(box.width), h: Math.floor(box.height) })); };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return size;
}

export default function SlashCommandPreview({ name, preview, view, example, appName, narrow }) {
  const stage = useRef(null);
  const size = useSize(stage);
  return (
    <div ref={stage} data-slash-stage data-stage-size={size ? `${size.w}x${size.h}` : undefined} className="relative flex min-h-0 min-w-0 flex-1 items-start justify-center overflow-hidden">
      {size && size.w > 0 && size.h > 0 && (view === 'brief'
        ? <BriefPreview key={`brief:${name}`} name={name} example={example} stage={size} />
        : preview.kind === 'card' ? <CardPreview key={`card:${name}:${narrow}`} preview={preview} stage={size} appName={appName} narrow={narrow} />
        : preview.kind === 'notebook' ? <NotebookPreview block={preview.block} stage={size} />
        : preview.kind === 'youtube' ? <YouTubePreview block={preview.block} stage={size} appName={appName} />
        : preview.kind === 'wiki' ? <WikiPreview preview={preview} stage={size} appName={appName} />
        : preview.kind === 'webpage' ? <WebpagePreview preview={preview} stage={size} appName={appName} />
        : preview.kind === 'goal' ? <GoalPreview key={name} draft={preview.draft} stage={size} />
        : preview.kind === 'finder' ? <FinderPreview key={name} preview={preview} stage={size} />
        : <p data-slash-unavailable className="max-w-md rounded-xl border border-dashed border-line px-4 py-3 text-sm text-ink-2">{preview.reason}</p>)}
    </div>
  );
}

// Whether any scroller inside the card holds more than it shows (the measured-fit check; a notebook or webpage may scroll inside).
const overflowing = card => [card, ...card.querySelectorAll('[data-scroll]')].some(node => node.scrollHeight > node.clientHeight + 1);

// A canvas card fitted to the stage. Its canvas size (BLOCK_TYPES width, height or auto height up to autoMax, an explanation's own
// sizeFor) is the most it takes; the stage caps both. aspect: the element inside whose shape is fixed by its content (a scene's
// frame, a video), so the card is narrowed (or, for a scene, shortened) until that element keeps its shape and the card fits.
function CardPreview({ preview, stage, appName, narrow }) {
  const type = preview.card;
  const [block, setBlock] = useState(() => {
    const made = { id: `slash-help-${type}`, dx: 0, dy: 0, ...previewBlock(preview, { narrow }) };
    // The viewer fetches an absolute URL, as a real scene's asset URL is; the committed model is served by this origin.
    if (made.modelUrl) made.modelUrl = new URL(made.modelUrl, window.location.origin).href;
    if (made.animation?.autoplay && reducedMotion()) made.animation = { ...made.animation, autoplay: false };
    return made;
  });
  const clip = useSeekableClip(block.src);
  const spec = BLOCK_TYPES[type] || {};
  const own = preview.size?.(narrow) || spec.sizeFor?.(block) || {};
  const viewKey = block.type === 'scene' && block.modelUrl ? 'slash-sheet:scene' : block.type === 'cad' ? block.id : null;
  // /explain's saved result answers ProgramScene's result read from the bundled fixture (ProgramScene programExample).
  const [scope] = useState(() => (preview.program ? { programExample: { client: { result: async () => structuredClone(preview.program) } } } : null));
  // The 3D view's Interact and Fit view sit above the card, as on the canvas's selected-card toolbar: the toolbar row and its 8 px
  // gap take 46 px (CI fast-e2e 40853008983 measured the card 4 px over its stage with 40 reserved), so 48 keeps the whole card in.
  const room = { w: stage.w - 2, h: stage.h - 2 - (viewKey ? 48 : 0) };
  const nativeW = own.width ?? spec.width ?? 380, nativeH = own.height ?? spec.height;
  const aspect = type === 'animation' && block.scene ? { selector: '[data-animation-frame]', ratio: block.scene.width / block.scene.height, fixed: true }
    : type === 'videoGenerate' ? { selector: 'video', ratio: 16 / 9, fixed: false } : null;
  const [trim, setTrim] = useState({ w: 0, h: 0, at: '' });
  const key = `${room.w}x${room.h}`;
  const cut = trim.at === key ? trim : { w: 0, h: 0 };
  const width = Math.max(240, Math.min(nativeW, room.w) - cut.w);
  const height = nativeH ? Math.max(200, Math.min(nativeH, room.h) - cut.h) : undefined;
  const maxHeight = nativeH ? undefined : Math.min(spec.autoMaxFor?.(block) ?? spec.autoMax ?? 420, room.h);
  const card = useRef(null);
  const passes = useRef(0);
  useEffect(() => { passes.current = 0; }, [key]);
  // A video's or scene's own size changes after React has drawn it (its metadata loads, its frame is measured): each change
  // measures the card again.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!aspect) return undefined;
    const observer = new ResizeObserver(() => setTick(value => value + 1));
    let seen = null;
    const timer = setInterval(() => {
      const element = card.current?.querySelector(aspect.selector);
      if (element && element !== seen) { if (seen) observer.unobserve(seen); seen = element; observer.observe(element); }
    }, 250);
    return () => { clearInterval(timer); observer.disconnect(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const node = card.current;
    if (!node) return;
    node.dataset.slashFit = `${Math.round(node.offsetWidth)}x${Math.round(node.offsetHeight)}`;
    node.dataset.slashOverflow = overflowing(node) ? 'true' : 'false';
    if (!aspect || passes.current > 6) return;
    const frame = node.querySelector(aspect.selector);
    if (!frame) return;
    const fw = frame.clientWidth, fh = frame.clientHeight;
    if (!fw || !fh) return;
    let next = null;
    if (aspect.fixed) {
      // The card's height is set: a frame taller than its scene shortens the card, a shorter one narrows it.
      if (fh > fw / aspect.ratio + 2) next = { w: cut.w, h: cut.h + Math.floor(fh - fw / aspect.ratio) };
      else if (fh < fw / aspect.ratio - 2) next = { w: cut.w + Math.ceil(fw - fh * aspect.ratio), h: cut.h };
    } else {
      // The card grows with its content: while it holds more than it shows, narrow it by what the video would lose.
      const scroller = node.querySelector('[data-scroll]') || node;
      const extra = scroller.scrollHeight - scroller.clientHeight;
      if (extra > 1) next = { w: cut.w + Math.ceil(extra * aspect.ratio), h: 0 };
    }
    if (next) { passes.current += 1; setTrim({ ...next, at: key }); }
  });
  const grade = preview.feedback ? async (committed, answer, push) => { push(preview.feedback); } : undefined;
  const body = (
    <div ref={card} data-slash-card={type} style={{ width, height, maxHeight }} {...guard} {...(type === 'image' ? noEnter : {})}
      className={`group relative flex shrink-0 cursor-default flex-col rounded-xl border select-text ${spec.ghost ? 'border-line bg-surface' : 'border-line bg-surface shadow-sm'} ${type === 'image' ? IMAGE_RESULT : ''}`}>
      <div aria-hidden className="flex h-6 shrink-0 items-center justify-center rounded-t-xl"><span className="h-1 w-12 rounded-full bg-line" /></div>
      {clip === null
        ? <p data-slash-clip-loading className="px-4 py-3 text-xs text-ink-2">Loading the example video</p>
        : <LearningBlockBody block={clip && clip !== block.src ? { ...block, src: clip, variants: [{ src: clip }], variant: 0 } : block} onChange={setBlock} onChangeQuiet={setBlock}
            appName={appName} selected viewKey={viewKey} onGrade={grade} />}
    </div>
  );
  // An example card never saves an attempt: the Explain-back store is withheld, so /practice shows its canned local feedback.
  const local = <ExplainBackService.Provider value={null}>{body}</ExplainBackService.Provider>;
  const shown = scope ? <CardSourceScope.Provider value={scope}>{local}</CardSourceScope.Provider> : local;
  return viewKey
    ? <div data-slash-viewer-preview className="flex shrink-0 flex-col items-end gap-2"><CadViewerTools viewKey={viewKey} cardId={block.id} ruler={type === 'cad'} />{shown}</div>
    : shown;
}

// A committed sample clip (/motion's real Motion video) plays from memory. Static assets are served without byte ranges, so a
// browser cannot seek one (its seekable range is 0 to 0); a blob URL seeks (owner, 2026-10-20: playback, pause and seeking
// work). Fetching the file is all the window does: no generation route. null while it loads; the plain path if the fetch fails.
function useSeekableClip(src) {
  const committed = /^\/lesson-assets\/[\w.-]+\.mp4$/.test(src || '');
  const [url, setUrl] = useState(committed ? null : src);
  useEffect(() => {
    if (!committed) return undefined;
    let made = null, live = true;
    fetch(src).then(response => (response.ok ? response.blob() : Promise.reject(Error(String(response.status)))))
      .then(blob => { made = URL.createObjectURL(blob); if (live) setUrl(made); else URL.revokeObjectURL(made); }, () => { if (live) setUrl(src); });
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [src, committed]);
  return url;
}

// The notebook card itself on a saved notebook (NotebookBody preview): JupyterLab from the notebook site, its workspace replaced by
// the saved notebook each time it opens, nothing saved or reported back.
function NotebookPreview({ block, stage }) {
  return (
    <Shell kind="notebook" width={Math.min(640, stage.w - 2)} height={Math.min(600, stage.h - 2)}>
      <NotebookBody preview block={block} onSelect={() => {}} onDocument={() => {}} onManifest={() => {}} />
    </Shell>
  );
}

// A canvas card's frame for the bodies that draw their own header (notebook, YouTube, Wikipedia, webpage): the card's border and
// drag strip, at a size capped by the stage.
function Shell({ kind, width, height, children }) {
  return (
    <div data-slash-card={kind} style={{ width, height }} {...guard} className="flex shrink-0 flex-col rounded-xl border border-line bg-surface shadow-sm">
      <div aria-hidden className="flex h-6 shrink-0 items-center justify-center rounded-t-xl"><span className="h-1 w-12 rounded-full bg-line" /></div>
      {children}
    </div>
  );
}

// The YouTube card's body (AdaptiveCanvas YouTubeMoment): YouTube's own player, which plays only when Play is pressed. A seek on
// its bar stays in this card.
function YouTubePreview({ block: saved, stage, appName }) {
  const [block, setBlock] = useState(saved);
  return (
    <Shell kind="youtube" width={Math.min(560, stage.w - 2)} height={Math.min(420, stage.h - 2)}>
      <YouTubeMoment block={block} selected appName={appName} onChange={setBlock} />
    </Shell>
  );
}

// The Wikipedia card's reader on the stored article (LearnWiki saved): its title, opening, source link and licence.
function WikiPreview({ preview, stage, appName }) {
  return (
    <Shell kind="wiki" width={Math.min(560, stage.w - 2)} height={Math.min(520, stage.h - 2)}>
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2 text-[11px] font-semibold tracking-wider text-ink-2 uppercase">
        <span className="h-1.5 w-1.5 rounded-full bg-ink" />Wikipedia
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-xl border-t border-line px-4 pt-2">
        <LearnWiki app={appName} compact article={{ title: preview.block.title, section: 0 }} saved={preview.saved} onSelect={() => {}} />
      </div>
    </Shell>
  );
}

// The webpage card on the /browser example's committed capture (WebpageCard readFile), read-only: no Refresh, highlight or Ask;
// scrolling and Copy work as on the canvas.
function WebpagePreview({ preview, stage, appName }) {
  const [block, setBlock] = useState(preview.block);
  const [read] = useState(() => capturedFile(preview));
  return (
    <Shell kind="webpage" width={Math.min(620, stage.w - 2)} height={Math.min(560, stage.h - 2)}>
      <WebpageCard block={block} appName={appName} selected readOnly readFile={read} onChange={setBlock} onChangeQuiet={setBlock} />
    </Shell>
  );
}
// Each capture file by its id: the manifest from the fixture, the text runs and tiles from their copies under /lesson-assets.
const capturedFile = preview => async (id, { as = 'json', signal } = {}) => {
  if (id === preview.block.fileRef.source.id) return structuredClone(preview.manifest);
  const name = preview.files[id];
  const response = name ? await fetch(`/lesson-assets/slash-webpage/${name}`, { signal }) : null;
  if (!response?.ok) throw Object.assign(new Error('This capture is not available.'), { status: response?.status ?? 404 });
  return as === 'blob' ? response.blob() : response.json();
};

// Progress's Learning Goals on state of its own: the example's words in New goal, unsaved. Add goal says nothing is saved here;
// no request is made (GoalManager saves only through the coaching it is given).
let goalScopes = 0;
const helpCoaching = () => ({ status: 'ready', state: { goals: [], activeGoalId: null }, retry() {},
  act: async () => { throw Object.assign(new Error('Example preview. Nothing is saved here.'), { code: 'local' }); } });
function GoalPreview({ draft, stage }) {
  const [scope] = useState(() => ({ app: 'slash-help', board: `slash-help-goal-${(goalScopes += 1)}` }));
  const [coaching] = useState(helpCoaching);
  const [seed] = useState(() => ({ seq: 1, draft }));
  const heading = useRef(null);
  return (
    <section data-slash-goal aria-label="Progress: Learning Goals" style={{ width: Math.min(400, stage.w - 2), maxHeight: stage.h - 2 }}
      className="flex shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-surface p-4 shadow-sm">
      <h4 ref={heading} tabIndex={-1} className="shrink-0 pb-2 text-sm font-semibold text-ink outline-none">Progress: Learning Goals</h4>
      <GoalManager scope={scope} coaching={coaching} seed={seed} titleRef={heading} onBack={() => {}} />
    </section>
  );
}

// The source finder's own presentation on fixture results: choosing a source or a result is local, Enter does not search, and
// Add to canvas says nothing was added.
function FinderPreview({ preview, stage }) {
  const [source, setSource] = useState(preview.source);
  const [query, setQuery] = useState(preview.query);
  const [active, setActive] = useState(0);
  const [added, setAdded] = useState(false);
  const results = source === preview.source && query.trim() === preview.query ? preview.results : null;
  return (
    <div data-slash-finder={preview.source} style={{ width: Math.min(640, stage.w - 2), maxHeight: stage.h - 2 }}
      className="flex shrink-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
      <FinderPanel source={source} query={query} results={results} active={active} current={!!results}
        onSource={setSource} onQuery={setQuery} onSubmit={() => {}} onRetry={() => {}} onSwitch={setSource} onActive={setActive}
        onAdd={() => setAdded(true)} />
      {added && <p role="status" data-slash-finder-added className="border-t border-line px-3 py-2 text-xs text-ink-2">Example preview. Nothing was added to the canvas.</p>}
    </div>
  );
}

// The command's brief in the shared confirmation card, with no action allowed: Generate is disabled, and there is no Edit, Save or
// Cancel. A setting it declares can be changed here; the change stays in this window.
function BriefPreview({ name, example, stage }) {
  const [view, setView] = useState(() => briefView(name, example));
  const brief = BRIEFS[name];
  return (
    <div data-slash-brief={name} style={{ width: Math.min(576, stage.w - 2), maxHeight: stage.h - 2 }} className="flex shrink-0 overflow-hidden">
      <GenerationProposalCard view={view} isolate settingsMode={name === 'cad' ? 'form' : 'live'} groups={brief.groups || null}
        onSettingsChange={settings => setView(current => ({ ...current, settings }))} />
    </div>
  );
}
