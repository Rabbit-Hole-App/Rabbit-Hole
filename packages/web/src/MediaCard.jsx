// The body of a media card: an SVG drawing, an audio player or a video player (Lane 3; owner spec sections 3 and 7).
// Loaded with the first such card, never with the canvas. The card frame, header and drag stay AdaptiveCanvas's FileCard.
// Every state says what is true: a preview that cannot be shown says why, and the original stays downloadable.
import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, RotateCcw, TriangleAlert, X } from 'lucide-react';
import { loadMediaOriginal, mediaMeta } from './media-storage.js';
import { SvgRefused, sanitizeSvg } from './svg-sanitize.js';
import { canWrite, cancelPlayback, derivativeState, derivativeUrl, findPlayback, probeMedia, requestPlayback, retryPlayback, watchPlayback } from './media-playback.js';
import { FORK_PENDING_LABEL } from './file-jobs-client.js';
import { startUpload, uploadState, watchUpload } from './file-source-client.js';

const clock = seconds => {
  if (!Number.isFinite(seconds)) return '';
  const s = Math.round(seconds), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
};
const CODEC = { 'mp4a.40.2': 'AAC', alac: 'ALAC', 'ac-3': 'AC-3', 'ec-3': 'E-AC-3', opus: 'Opus', vorbis: 'Vorbis', flac: 'FLAC', mp3: 'MP3', pcm: 'PCM', float: 'float PCM', 'ima-adpcm': 'IMA ADPCM', 'ms-adpcm': 'MS ADPCM', alaw: 'A-law', mulaw: 'µ-law', 'avc1.42E01E': 'H.264', 'hvc1.1.6.L93.B0': 'HEVC', 'av01.0.04M.08': 'AV1', 'vp09.00.10.08': 'VP9', vp8: 'VP8', vp9: 'VP9', av1: 'AV1', 'mp4v.20.9': 'MPEG-4 Part 2' };
const codecName = codec => (codec || '').split(',').map(c => CODEC[c.trim()] || c.trim()).filter(Boolean).join(' + ');

// The original's bytes from this browser or the board, typed by what the import read (the server serves unknown types
// as application/octet-stream), plus a download URL that can never render in the page.
function useOriginal(block) {
  const [state, setState] = useState({ blob: null, download: null, missing: false });
  const meta = mediaMeta(block);
  useEffect(() => {
    let live = true, download = null;
    loadMediaOriginal(block).then(value => {
      if (!live) return;
      if (!value || typeof value === 'string') { setState({ blob: null, download: null, missing: true }); return; }
      const type = meta.type || value.type;
      const blob = value.type === type ? value : new Blob([value], { type });
      download = URL.createObjectURL(new Blob([value], { type: 'application/octet-stream' }));
      setState({ blob, download, missing: false });
    }).catch(() => live && setState({ blob: null, download: null, missing: true }));
    return () => { live = false; if (download) URL.revokeObjectURL(download); };
  }, [block.assetKey, block.fileRef?.source?.id, block.fileRef?.source?.rev, meta.type]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}
const useObjectUrl = blob => {
  const [url, setUrl] = useState(null);
  useEffect(() => { if (!blob) { setUrl(null); return undefined; } const next = URL.createObjectURL(blob); setUrl(next); return () => URL.revokeObjectURL(next); }, [blob]);
  return url;
};

const DownloadOriginal = ({ href, name }) => (href
  ? <a href={href} download={name || 'file'} data-download-original aria-label="Download original" title="Download original" onPointerDown={event => event.stopPropagation()}
    className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-2 hover:bg-hover hover:text-ink"><Download size={12} />Original</a>
  : null);

function Notice({ state, children, action }) {
  return (
    <div data-media-state={state} role="status" className="flex items-start gap-2 rounded-lg border border-line bg-side p-3 text-xs text-ink-2">
      {state === 'working' || state === 'checking' ? <Loader2 size={14} className="mt-px shrink-0 animate-spin" /> : <TriangleAlert size={14} className="mt-px shrink-0" />}
      <p className="min-w-0 flex-1">{children}</p>{action}
    </div>
  );
}
const Missing = ({ stored }) => <p data-media-state="missing" className="p-2 text-sm text-ink-2">{stored ? 'This stored file could not be read here.' : 'This file is not in this browser or saved with the board yet.'}</p>;

// ---- SVG --------------------------------------------------------------------------------------------------------------

function SvgBody({ block, original }) {
  const meta = mediaMeta(block);
  const [view, setView] = useState({ state: 'checking' });
  useEffect(() => {
    if (!original.blob) return undefined;
    let live = true, url = null;
    original.blob.text().then(text => {
      if (!live) return;
      try {
        const clean = sanitizeSvg(text);
        url = URL.createObjectURL(new Blob([clean.svg], { type: 'image/svg+xml' }));
        setView({ state: 'ready', url, ...clean });
      } catch (problem) {
        setView({ state: 'failed', error: problem instanceof SvgRefused ? problem.message : 'The drawing could not be read.' });
      }
    });
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [original.blob]);
  const w = meta.width || view.width, h = meta.height || view.height;
  return (
    <>
      {view.state === 'ready'
        // An <img>: the browser runs no script and fetches nothing for an SVG shown this way; the markup never enters the page.
        ? <img src={view.url} alt={block.label || 'SVG drawing'} draggable={false} data-svg-preview style={w && h ? { aspectRatio: `${w} / ${h}` } : undefined}
          className="w-full rounded-lg border border-line bg-white object-contain" />
        : view.state === 'failed'
          ? <Notice state="failed">Preview unavailable: {view.error} The original file is kept.</Notice>
          : <div style={w && h ? { aspectRatio: `${w} / ${h}` } : undefined} className="w-full rounded-lg border border-line bg-white" />}
      {view.removed?.length > 0 && <p data-svg-removed className="pt-1 text-[11px] text-ink-3">Not shown for safety: {view.removed.join(', ')}.</p>}
    </>
  );
}

// ---- audio ------------------------------------------------------------------------------------------------------------

function PlaybackCopy({ block, onChange }) {
  const meta = mediaMeta(block);
  const [job, setJob] = useState(null);
  const [checked, setChecked] = useState(false);
  const [problem, setProblem] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const blockRef = useRef(block); blockRef.current = block;
  const fileRef = block.fileRef, rev = fileRef?.source?.rev, writable = canWrite();
  const shown = problem ? { state: 'failed', error: problem } : derivativeState({ fileRef, job, checked, writable });
  // A result lands only on a card that still shows the same source revision (contract 5.4): a removed, undone or replaced
  // card is never recreated or overwritten by a late job.
  const still = () => blockRef.current.fileRef?.source?.rev === rev;
  const record = patch => { if (still()) onChange({ ...blockRef.current, fileRef: { ...blockRef.current.fileRef, ...patch(blockRef.current.fileRef) } }); };
  useEffect(() => {
    if (!fileRef?.source?.id || fileRef.derivatives?.playback) return undefined;
    const abort = new AbortController();
    (async () => {
      try {
        // A copy made for this source revision already (another card, a fork's original) is used as it is.
        const found = await findPlayback(fileRef);
        if (abort.signal.aborted) return;
        setChecked(true);
        if (found) { if (writable) record(ref => ({ derivatives: { ...(ref.derivatives || {}), playback: found } })); else setJob({ state: 'ready', found }); return; }
        if (!writable) return; // a viewer or a fork never starts a conversion
        let id = fileRef.job;
        if (!id) {
          const submitted = await requestPlayback({ fileRef, cardId: block.id });
          if (abort.signal.aborted || !still()) return;
          id = submitted.id; setJob(submitted);
          record(() => ({ job: id }));
        }
        const settled = await watchPlayback({ jobId: id, signal: abort.signal, onUpdate: next => !abort.signal.aborted && setJob(next) });
        if (settled && (settled.state === 'ready' || settled.state === 'ready_with_limitations')) {
          const playback = await findPlayback(fileRef);
          if (!playback) setProblem('The playable copy finished without a playback file.');
          else record(ref => ({ derivatives: { ...(ref.derivatives || {}), playback } }));
        }
      } catch (error) { if (!abort.signal.aborted) setProblem(error.message); }
    })();
    return () => abort.abort();
  }, [fileRef?.source?.id, rev, fileRef?.job, fileRef?.derivatives?.playback, attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  const what = codecName(meta.codec) ? `${codecName(meta.codec)} audio` : 'this audio';
  const readyUrl = shown.state === 'ready' ? shown.url : job?.found ? derivativeUrl(fileRef, job.found) : null;
  if (readyUrl) return (
    <>
      <audio controls preload="metadata" src={readyUrl} aria-label={`Play ${block.label || 'audio'} (converted copy)`} className="w-full" />
      <p data-media-state="derivative-ready" className="pt-1 text-[11px] text-ink-3">Playing a converted copy (AAC). The original is unchanged.</p>
    </>
  );
  if (shown.state === 'failed') return (
    <Notice state="failed" action={writable && fileRef?.job ? <button type="button" onPointerDown={event => event.stopPropagation()} onClick={async () => { setProblem(null); try { setJob(await retryPlayback({ jobId: fileRef.job })); setAttempt(n => n + 1); } catch (error) { setProblem(error.message); } }}
      className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-medium text-ink-2 hover:bg-hover hover:text-ink"><RotateCcw size={12} />Retry</button> : null}>
      This browser cannot play {what}, and a playable copy could not be made: {shown.error}
    </Notice>
  );
  if (shown.state === 'saving') return (
    <Notice state="awaiting-converter">This browser cannot play {what}. A playable copy is made once the file is saved to your account; download the original to play it in another app meanwhile.</Notice>
  );
  if (shown.state === 'elsewhere') return (
    <Notice state="elsewhere">This browser cannot play {what}, and no playable copy has been made yet. {FORK_PENDING_LABEL}; download the original to play it in another app.</Notice>
  );
  return (
    <Notice state="working" action={writable && fileRef?.job ? <button type="button" aria-label="Cancel the playable copy" onPointerDown={event => event.stopPropagation()}
      onClick={() => cancelPlayback({ jobId: fileRef.job })}
      className="flex shrink-0 items-center rounded-md p-1 text-ink-2 hover:bg-hover hover:text-ink"><X size={12} /></button> : null}>
      This browser cannot play {what}; {shown.state === 'checking' ? 'looking for a playable copy' : `making a playable copy (${shown.stage || 'Queued'})`}
    </Notice>
  );
}

function AudioBody({ block, original, onChange }) {
  const meta = mediaMeta(block);
  const url = useObjectUrl(original.blob);
  const [check, setCheck] = useState({ plan: null });
  useEffect(() => {
    if (!original.blob) return undefined;
    let live = true;
    const type = meta.codec && meta.container !== 'wav' && meta.codec !== 'mp3' ? `${meta.type}; codecs="${meta.codec}"` : meta.type || original.blob.type;
    probeMedia(original.blob, { kind: 'audio', type }).then(result => live && setCheck(result));
    return () => { live = false; };
  }, [original.blob]); // eslint-disable-line react-hooks/exhaustive-deps
  const [failed, setFailed] = useState(false);
  const plan = failed ? 'derivative' : check.plan;
  const duration = check.duration ?? meta.duration;
  return (
    <>
      {plan === 'native'
        // No autoplay, ever: playback starts only from the user's press on these controls.
        ? <audio controls preload="metadata" src={url} onError={() => setFailed(true)} aria-label={`Play ${block.label || 'audio'}`} className="w-full" />
        : plan === 'derivative' ? <PlaybackCopy block={block} onChange={onChange} />
          : <Notice state="checking">Checking this browser can play it</Notice>}
      <p data-media-facts className="pt-1 text-[11px] text-ink-3">{[clock(duration), codecName(meta.codec), meta.container === 'wav' ? 'WAV' : null].filter(Boolean).join(' · ')}</p>
    </>
  );
}

// ---- video ------------------------------------------------------------------------------------------------------------

function VideoBody({ block, original }) {
  const meta = mediaMeta(block);
  const url = useObjectUrl(original.blob);
  const [facts, setFacts] = useState(null);
  const [failed, setFailed] = useState(false);
  if (failed) return (
    <Notice state="unsupported">This browser cannot play this video{meta.codec ? ` (${codecName(meta.codec)})` : ''}. The original file is kept: download it to play it in another app or browser.</Notice>
  );
  return (
    <>
      {/* preload=metadata paints the first frame as the poster (Chrome and Firefox, measured) and reads the duration; no
          autoplay, so nothing plays or sounds until the user presses play. Native controls: play/pause, seek, volume,
          time and fullscreen, all keyboard-reachable. */}
      <video src={url || undefined} controls preload="metadata" playsInline data-video-player
        onLoadedMetadata={event => setFacts({ duration: event.currentTarget.duration, width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })}
        onError={() => url && setFailed(true)}
        style={{ aspectRatio: facts?.width && facts?.height ? `${facts.width} / ${facts.height}` : '16 / 9' }}
        aria-label={`Play ${block.label || 'video'}`} className="w-full rounded-lg border border-line bg-black" />
      {facts && <p data-media-facts className="pt-1 text-[11px] text-ink-3">{[clock(facts.duration), facts.width && `${facts.width} x ${facts.height}`, codecName(meta.codec)].filter(Boolean).join(' · ')}</p>}
    </>
  );
}

// ---- image (a stored-source image or GIF card; dropped ones keep AdaptiveCanvas's own <img>) -----------------------------

function ImageBody({ block, original }) {
  const meta = mediaMeta(block);
  const url = useObjectUrl(original.blob);
  const [size, setSize] = useState(meta.width && meta.height ? [meta.width, meta.height] : null);
  return url
    ? <img src={url} alt={block.label || meta.name || 'Image'} draggable={false} data-image-preview data-excerpt-crop={block.excerpt ? '' : undefined} onLoad={event => !size && setSize([event.currentTarget.naturalWidth, event.currentTarget.naturalHeight])}
      style={size ? { aspectRatio: `${size[0]} / ${size[1]}` } : undefined} className="w-full rounded-lg border border-line bg-white object-contain" />
    : <div style={size ? { aspectRatio: `${size[0]} / ${size[1]}` } : undefined} className="w-full rounded-lg border border-line bg-white" />;
}

const BODY = { svg: SvgBody, audio: AudioBody, clip: VideoBody, image: ImageBody };

// ---- saving a new fileRef card (file-source-client.js) -------------------------------------------------------------------

// The upload of a fileRef card not stored yet: started from this browser's copy (fileRef.local; shared per key, so it
// resumes after a reload), watched, and the stored source written into the card, so the next board save names it.
function useUpload(block, onChange) {
  const ref = block.fileRef, key = ref && !ref.source?.id ? ref.local : null;
  const [state, setState] = useState(() => (key ? uploadState(key) : null));
  const blockRef = useRef(block); blockRef.current = block;
  const start = () => startUpload(key, { family: ref.family, name: mediaMeta(blockRef.current).name || blockRef.current.label });
  useEffect(() => {
    if (!key) { setState(null); return undefined; }
    const take = next => {
      setState(next);
      const current = blockRef.current;
      if (next?.stage === 'stored' && !current.fileRef?.source?.id) {
        const { local, ...rest } = current.fileRef; // eslint-disable-line no-unused-vars
        onChange({ ...current, fileRef: { ...rest, source: { id: next.source.id, rev: next.source.rev } } });
      }
    };
    const unwatch = watchUpload(key, take);
    if (canWrite()) start();
    take(uploadState(key)); // an upload that finished before this card mounted
    return unwatch;
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { state, retry: () => key && start() };
}

// Never "saved" before the server says so.
function SaveState({ state, onRetry }) {
  if (state?.stage === 'failed') return (
    <div role="alert" data-media-save="failed" className="mb-1 flex items-start gap-1.5 text-xs text-ink-2">
      <TriangleAlert size={13} className="mt-px shrink-0" /><span className="min-w-0 flex-1">Not saved: {state.error}</span>
      {state.retryable && <button type="button" data-media-retry onPointerDown={event => event.stopPropagation()} onClick={onRetry} className="flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 font-medium hover:bg-hover hover:text-ink"><RotateCcw size={12} />Retry</button>}
    </div>
  );
  const percent = state?.total ? Math.floor((100 * (state.sent || 0)) / state.total) : 0;
  const line = !state ? (canWrite() ? 'Saving to your account' : 'Not saved yet: the upload from the browser that added this file has not finished.')
    : state.stage === 'uploading' ? `Saving to your account, ${percent}%` : state.stage === 'hashing' ? 'Preparing to save' : 'Saving to your account';
  return <p role="status" data-media-save={state?.stage || 'waiting'} className="mb-1 text-[11px] text-ink-3">{line}</p>;
}

export default function MediaBody({ block, onChange }) {
  const original = useOriginal(block);
  const upload = useUpload(block, onChange);
  const pending = block.fileRef && !block.fileRef.source?.id;
  if (original.missing) return <>{pending && <SaveState state={upload.state} onRetry={upload.retry} />}<Missing stored={!!block.fileRef?.source?.id} /></>;
  const Body = BODY[block.kind] || ImageBody;
  return (
    <div data-media-card={block.kind} data-saved={block.fileRef ? (pending ? 'pending' : 'stored') : 'board-file'}>
      {pending && <SaveState state={upload.state} onRetry={upload.retry} />}
      <Body block={block} original={original} onChange={onChange} />
      <div className="flex justify-end pt-1"><DownloadOriginal href={original.download} name={block.label} /></div>
    </div>
  );
}
