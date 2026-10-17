// The body of a media card: an SVG drawing, an audio player or a video player (Lane 3; owner spec sections 3 and 7).
// Loaded with the first such card, never with the canvas. The card frame, header and drag stay AdaptiveCanvas's FileCard.
// Every state says what is true: a preview that cannot be shown says why, and the original stays downloadable.
import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, RotateCcw, TriangleAlert, X } from 'lucide-react';
import { loadAsset } from './learn-board-assets.js';
import { wsHeaders } from './api.js';
import { SvgRefused, sanitizeSvg } from './svg-sanitize.js';
import { derivativeState, probeMedia, requestPlayback, retryPlayback, watchPlayback } from './media-playback.js';

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
  useEffect(() => {
    let live = true, download = null;
    loadAsset(block.assetKey).then(value => {
      if (!live) return;
      if (!value || typeof value === 'string') { setState({ blob: null, download: null, missing: true }); return; }
      const type = block.meta?.type || value.type;
      const blob = value.type === type ? value : new Blob([value], { type });
      download = URL.createObjectURL(new Blob([value], { type: 'application/octet-stream' }));
      setState({ blob, download, missing: false });
    }).catch(() => live && setState({ blob: null, download: null, missing: true }));
    return () => { live = false; if (download) URL.revokeObjectURL(download); };
  }, [block.assetKey, block.meta?.type]);
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
const Missing = () => <p className="p-2 text-sm text-ink-2">This file is not in this browser or saved with the board yet.</p>;

// ---- SVG --------------------------------------------------------------------------------------------------------------

function SvgBody({ block, original }) {
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
  const w = block.meta?.width || view.width, h = block.meta?.height || view.height;
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
  const [job, setJob] = useState(null);
  const [problem, setProblem] = useState(null);
  const blockRef = useRef(block); blockRef.current = block;
  const fileRef = block.fileRef;
  const shown = problem ? { state: 'failed', error: problem } : derivativeState({ fileRef, job });
  const rev = fileRef?.source?.rev;
  // A result lands only on a card that still shows the same source revision (contract 5.4): a removed, undone or
  // replaced card is never recreated or overwritten by a late job.
  const still = () => blockRef.current.fileRef?.source?.rev === rev;
  useEffect(() => {
    if (!fileRef?.source?.id || fileRef.derivatives?.playback) return undefined;
    const abort = new AbortController();
    (async () => {
      try {
        let id = fileRef.job;
        if (!id) {
          ({ id } = await requestPlayback({ fileRef, cardId: block.id, headers: wsHeaders() }));
          if (abort.signal.aborted || !still()) return;
          onChange({ ...blockRef.current, fileRef: { ...blockRef.current.fileRef, job: id } });
        }
        const settled = await watchPlayback({ jobId: id, headers: wsHeaders(), signal: abort.signal, onUpdate: next => !abort.signal.aborted && setJob(next) });
        const done = settled && derivativeState({ fileRef, job: settled });
        if (done?.state === 'ready' && done.derivative && still()) {
          const current = blockRef.current.fileRef;
          onChange({ ...blockRef.current, fileRef: { ...current, derivatives: { ...(current.derivatives || {}), playback: done.derivative } } });
        }
      } catch (error) { if (!abort.signal.aborted) setProblem(error.message); }
    })();
    return () => abort.abort();
  }, [fileRef?.source?.id, rev, fileRef?.job, fileRef?.derivatives?.playback]); // eslint-disable-line react-hooks/exhaustive-deps
  const codec = codecName(block.meta?.codec) || 'this encoding';
  if (shown.state === 'ready') return (
    <>
      <audio controls preload="metadata" src={shown.url} aria-label={`Play ${block.label || 'audio'} (converted copy)`} className="w-full" />
      <p data-media-state="derivative-ready" className="pt-1 text-[11px] text-ink-3">Playing a converted copy (AAC). The original is unchanged.</p>
    </>
  );
  if (shown.state === 'failed') return (
    <Notice state="failed" action={fileRef?.job ? <button type="button" onPointerDown={event => event.stopPropagation()} onClick={async () => { setProblem(null); try { setJob(await retryPlayback({ jobId: fileRef.job, headers: wsHeaders() })); } catch (error) { setProblem(error.message); } }}
      className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-medium text-ink-2 hover:bg-hover hover:text-ink"><RotateCcw size={12} />Retry</button> : null}>
      This browser cannot play {codec} audio, and a playable copy could not be made: {shown.error}
    </Notice>
  );
  if (shown.state === 'awaiting-converter') return (
    <Notice state="awaiting-converter">This browser cannot play {codec} audio. A playable copy needs the file converter, which is not connected to this canvas yet. Download the original to play it in another app.</Notice>
  );
  return (
    <Notice state="working" action={fileRef?.job ? <button type="button" aria-label="Cancel the playable copy" onPointerDown={event => event.stopPropagation()}
      onClick={() => fetch(`/api/learn/files/jobs/${encodeURIComponent(fileRef.job)}/cancel`, { method: 'POST', headers: wsHeaders() }).catch(() => {})}
      className="flex shrink-0 items-center rounded-md p-1 text-ink-2 hover:bg-hover hover:text-ink"><X size={12} /></button> : null}>
      This browser cannot play {codec} audio; making a playable copy{shown.stage ? ` (${shown.stage.replace(/_/g, ' ')})` : ''}…
    </Notice>
  );
}

function AudioBody({ block, original, onChange }) {
  const url = useObjectUrl(original.blob);
  const [check, setCheck] = useState({ plan: null });
  useEffect(() => {
    if (!original.blob) return undefined;
    let live = true;
    const type = block.meta?.codec && block.meta.container !== 'wav' && block.meta.codec !== 'mp3' ? `${block.meta.type}; codecs="${block.meta.codec}"` : block.meta?.type || original.blob.type;
    probeMedia(original.blob, { kind: 'audio', type }).then(result => live && setCheck(result));
    return () => { live = false; };
  }, [original.blob]); // eslint-disable-line react-hooks/exhaustive-deps
  const [failed, setFailed] = useState(false);
  const plan = failed ? 'derivative' : check.plan;
  const duration = check.duration ?? block.meta?.duration;
  return (
    <>
      {plan === 'native'
        // No autoplay, ever: playback starts only from the user's press on these controls.
        ? <audio controls preload="metadata" src={url} onError={() => setFailed(true)} aria-label={`Play ${block.label || 'audio'}`} className="w-full" />
        : plan === 'derivative' ? <PlaybackCopy block={block} onChange={onChange} />
          : <Notice state="checking">Checking this browser can play it…</Notice>}
      <p data-media-facts className="pt-1 text-[11px] text-ink-3">{[clock(duration), codecName(block.meta?.codec), block.meta?.container === 'wav' ? 'WAV' : null].filter(Boolean).join(' · ')}</p>
    </>
  );
}

// ---- video ------------------------------------------------------------------------------------------------------------

function VideoBody({ block, original }) {
  const url = useObjectUrl(original.blob);
  const [facts, setFacts] = useState(null);
  const [failed, setFailed] = useState(false);
  if (failed) return (
    <Notice state="unsupported">This browser cannot play this video{block.meta?.codec ? ` (${codecName(block.meta.codec)})` : ''}. The original file is kept: download it to play it in another app or browser.</Notice>
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
      {facts && <p data-media-facts className="pt-1 text-[11px] text-ink-3">{[clock(facts.duration), facts.width && `${facts.width} x ${facts.height}`, codecName(block.meta?.codec)].filter(Boolean).join(' · ')}</p>}
    </>
  );
}

export default function MediaBody({ block, onChange }) {
  const original = useOriginal(block);
  if (original.missing) return <Missing />;
  const Body = block.kind === 'svg' ? SvgBody : block.kind === 'audio' ? AudioBody : VideoBody;
  return (
    <div data-media-card={block.kind}>
      <Body block={block} original={original} onChange={onChange} />
      <div className="flex justify-end pt-1"><DownloadOriginal href={original.download} name={block.label} /></div>
    </div>
  );
}
