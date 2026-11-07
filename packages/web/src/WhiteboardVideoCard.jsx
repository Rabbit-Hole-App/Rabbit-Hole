// The /whiteboard video card (block type whiteboardVideo; roadmap rabbit-hole-whiteboard-roadmap-v1.md W1.6). Pending: the job's stage word
// (roadmap 1.3), read every 10 s while it runs and again whenever Chat moves the job (Generate, Edit). Ready: the narrated video with its
// captions track, the "AI-narrated whiteboard video" line and Download. Only the canvas owner's page (AnimationBoard context: LearnPage) reads
// the job or the video; anywhere else (a share link, a fork before W5) the card says the video is not available, never a broken player.
import { useContext, useEffect, useMemo, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import CardHeader from './CardHeader.jsx';
import { api } from './api.js';
import { AnimationBoard } from './animation3d/board-context.js';
import { EXPLAIN_BRIEF_EVENT } from './explain-client.js';
import { WHITEBOARD_JOB_EVENT, whiteboardAssetUrl, whiteboardClient, whiteboardPollDelay, whiteboardRunning } from './whiteboard/client.js';
import { downloadName, jobOf, settleWhiteboard, stageWord, videoOf } from './whiteboard/card.js';

export const WHITEBOARD_CAPTION = 'AI-narrated whiteboard video';
export const WHITEBOARD_UNAVAILABLE = 'This video is not available to you.';
export const WHITEBOARD_DOWNLOAD = 'Download';

function Pending({ block, onChange, onChangeQuiet, readOnly, fetchJson }) {
  const waiting = jobOf(block);
  const latest = useRef(block); latest.current = block;
  const client = useMemo(() => whiteboardClient(fetchJson, waiting.boardId), [fetchJson, waiting.boardId]);
  const ended = ['failed', 'cancelled'].includes(waiting.stage);
  useEffect(() => {
    if (readOnly || ended) return undefined;
    let live = true, timer, failures = 0;
    const poll = async () => {
      try {
        const job = (await client.get(waiting.id))?.job ?? null;
        if (!live) return;
        failures = 0;
        const out = settleWhiteboard(latest.current, job);
        // A plan ready for review, or the job's failure, was written in Chat by the server: the Chat showing its thread reads it again.
        if (out.action === 'progress' && ['awaiting_approval', 'failed'].includes(job.stage)) {
          const threadId = waiting.threadId;
          if (threadId) window.dispatchEvent(new CustomEvent(EXPLAIN_BRIEF_EVENT, { detail: { threadId, jobId: waiting.id } }));
        }
        if (out.action === 'apply') { latest.current = out.block; onChange(out.block); return; }
        if (out.action === 'progress') { latest.current = out.block; (onChangeQuiet || onChange)(out.block); }
        if (whiteboardRunning(job) || out.action === 'unreadable') timer = setTimeout(poll, whiteboardPollDelay());
      } catch (error) {
        if (!live) return;
        const delay = whiteboardPollDelay(error, ++failures);
        if (delay !== null) timer = setTimeout(poll, delay);
      }
    };
    poll();
    // Generate or an Edit moved the job on from Chat: read it again (a GET; it never advances the job).
    const again = event => { if (event.detail?.jobId === waiting.id) { clearTimeout(timer); poll(); } };
    window.addEventListener(WHITEBOARD_JOB_EVENT, again);
    return () => { live = false; clearTimeout(timer); window.removeEventListener(WHITEBOARD_JOB_EVENT, again); };
  }, [waiting.id, ended, client, readOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  const word = waiting.stage === 'failed' ? waiting.message || null : stageWord(waiting.stage);
  const running = !ended && waiting.stage !== 'awaiting_approval';
  return (
    <p role="status" data-whiteboard-pending={waiting.stage} className={`flex items-center gap-2 text-sm ${waiting.stage === 'failed' ? 'text-fail' : 'text-ink-2'}`}>
      {running && <Loader2 aria-hidden size={16} className="shrink-0 text-ink-3 motion-safe:animate-spin" />}
      {word}
    </p>
  );
}

function Video({ block, appName }) {
  const video = videoOf(block);
  const url = (kind, options) => whiteboardAssetUrl(appName, video.artifactId, kind, options);
  return (
    <>
      {/* data-player: keys pressed in the player are the player's; Ctrl+K never opens from inside it (AdaptiveCanvas inlineTarget). */}
      <div data-player className="aspect-video w-full overflow-hidden rounded-md bg-black">
        <video data-whiteboard-player controls preload="metadata" poster={url('poster')} src={url('final')} className="h-full w-full">
          <track kind="captions" srcLang="en" src={url('captions')} />
        </video>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-ink-2">
        <span data-whiteboard-caption>{WHITEBOARD_CAPTION}</span>
        <a data-whiteboard-download href={url('final', { download: true })} download={downloadName(block.title)} className="rounded border border-line px-2 py-0.5 text-ink hover:bg-hover">{WHITEBOARD_DOWNLOAD}</a>
      </div>
    </>
  );
}

// A committed sample video (the Slash Commands window's /whiteboard example): the block carries its own `src` and `poster` and plays as a plain
// video, with no job, no asset route and no owner check. A real card never has `src` (its video is read by artifact id).
function Sample({ block }) {
  return (
    <div data-whiteboard-video-card data-whiteboard-phase="sample" className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-3">
      <CardHeader block={block} meta="Whiteboard video" className="-mx-4 -mt-3 px-4 pt-3 pb-1" />
      <div data-player className="aspect-video w-full overflow-hidden rounded-md bg-black">
        <video data-whiteboard-player controls preload="metadata" poster={block.poster} src={block.src} className="h-full w-full" />
      </div>
      <div className="text-xs text-ink-2"><span data-whiteboard-caption>{WHITEBOARD_CAPTION}</span></div>
    </div>
  );
}

export default function WhiteboardVideoCard({ block, onChange, onChangeQuiet, readOnly = false, appName = '', fetchJson = api }) {
  const owner = useContext(AnimationBoard)?.kind === 'owner';
  if (typeof block.src === 'string' && (block.src.startsWith('/lesson-assets/') || block.src.startsWith('blob:'))) return <Sample block={block} />;
  const ready = !!videoOf(block), waiting = !ready && !!jobOf(block);
  return (
    <div data-whiteboard-video-card data-whiteboard-phase={ready ? 'ready' : waiting ? jobOf(block).stage : 'none'} className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-3">
      <CardHeader block={block} meta="Whiteboard video" className="-mx-4 -mt-3 px-4 pt-3 pb-1" />
      {!ready && !waiting ? null : !owner ? <p data-whiteboard-unavailable className="text-sm text-ink-2">{WHITEBOARD_UNAVAILABLE}</p>
        : ready ? <Video block={block} appName={appName} />
          : waiting ? <Pending block={block} onChange={onChange} onChangeQuiet={onChangeQuiet} readOnly={readOnly} fetchJson={fetchJson} /> : null}
    </div>
  );
}
