import ChatComposer, { COMPOSER_ADD, COMPOSER_PILL } from './ChatComposer.jsx';
import { VoiceField, VoiceToggle } from './VoiceMode.jsx';
import ContextDocs from './ContextDocs.jsx';
import { useContextDocs } from './context-docs.js';
import RepositorySource, { SourceSelectionContext } from './RepositorySource.jsx';
import { FILE_TOKEN, INLINE_PARTS, citedSources, sourceReference, singleSourcePath } from './source-references.js';
// ─── Ask (phase 1 - read only): the chat panel behind the Agent tab, the run
// peek's ask box, and ⌘K's Ask tab. POST /api/ask streams SSE; org-scope
// ambiguity comes back as { choose } and renders candidate pills. ───
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, AtSign, BookOpen, Check, Copy, Crown, Feather, FileText, Files, Globe, History, Loader2, MoreHorizontal, Minus, Network, Package, Paperclip, Pencil, Play, Plus, ScrollText, Shield, SlidersHorizontal, Trash2, X, Zap } from 'lucide-react';
import { ago, api, navigate, wsHeaders } from './api.js';
import { colorLine } from './code.jsx';
import { MathText, tokenizeMath } from './MathText.jsx';
import { MODEL_CHOICES } from './model-choices.js';
import { canvasTargetField } from './learn-ask-target.js';
import { cn, CodeBlock, ConfirmDialog, KindIcon, Menu, MenuItem, SlidePanel, Toggle } from './ui.jsx';

// What the agent may read, per scope - the ⚙ picker mirrors Notion's "My sources".
// Mentioned apps a chat reads at most (MENTION_LIMIT in control-plane learn-models.js).
const MENTION_CHIPS = 3;
const SOURCE_OPTIONS = {
  run: [['log', 'Log'], ['outputs', 'Outputs'], ['runbook', 'Runbook'], ['review', 'Review'], ['agent', 'AGENT.md']],
  app: [['runs', 'Runs'], ['requests', 'Request log'], ['runbook', 'Runbook'], ['review', 'Review'], ['agent', 'AGENT.md']],
};
const PRIVATE_SOURCE_OPTIONS = {
  run: [['log', 'Log'], ['outputs', 'Outputs']],
  app: [['runs', 'Recent runs'], ['log', 'Latest run log'], ['outputs', 'Latest run outputs']],
};
const SOURCE_ICON = { log: ScrollText, outputs: Package, runs: Play, requests: Globe, runbook: BookOpen, review: Shield, agent: FileText };
// model rows carry a strength icon + one-word hint (Opus strongest, Haiku fastest)
const MODEL_ICON = { auto: SlidersHorizontal, 'opus-5': Crown, 'sonnet-5': Zap, 'haiku-4.5': Feather };
const MODEL_META = Object.fromEntries(MODEL_CHOICES.map(({ key, hint }) => [key, [MODEL_ICON[key], hint]]));

// Model picker keys → labels (server holds the allowlist; auto = default).
const MODELS = MODEL_CHOICES.map(({ key, label }) => [key, label]);

function EvidencePill({ icon: Icon = FileText, children, ...props }) {
  const Tag = props.href ? 'a' : props.onClick ? 'button' : 'span';
  return <Tag {...props} className={cn('inline-flex max-w-full items-center gap-1.5 rounded-sm border border-line px-2 py-1 text-left text-xs text-ink-2 no-underline', (props.href || props.onClick) && 'cursor-pointer hover:bg-hover hover:text-ink')}><Icon size={12} strokeWidth={1.5} className="shrink-0" /><span className="break-words min-w-0">{children}</span></Tag>;
}

// Tiny safe markdown: **bold**, `code`, "- " bullets. Built as elements - no HTML injection.
function inline(s, math = [], onFile, sourcePath) {
  return s.split(INLINE_PARTS).map((part, i) => {
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) return <EvidencePill key={i} href={link[2]} target="_blank" rel="noreferrer">{inline(link[1], math)}</EvidencePill>;
    const token = part.match(/^\uE000(\d+)\uE001$/);
    if (token && math[Number(token[1])]) return <MathText key={i} {...math[Number(token[1])]} />;
    const reference=onFile&&sourceReference(part,sourcePath);
    if(reference)return <EvidencePill key={i} type="button" title={`Open ${reference.path}:${reference.start}-${reference.end}`} onClick={()=>onFile(reference.path,reference.start,reference.end)}>{part.replace(/^`(.*)`$/,'$1')}</EvidencePill>;
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="rounded-xs bg-code px-1 font-mono text-[0.9em]">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{inline(part.slice(2, -2), math, onFile, sourcePath)}</strong>;
    return part;
  });
}

// A source token like "job.py:15" or "small.toml" - clickable when onFile is wired.

function SourcesLine({ text, onFile, onRun, onDecision }) {
  const parts = text.slice(9).split(/[,;]/).map(part => part.trim().replace(/^\x60(.*)\x60$/, '$1')).filter(Boolean);
  return (
    <div aria-label="Answer evidence" className="flex flex-col items-start gap-2 pt-2">
      {parts.map((part, i) => {
        const file = part.replace(/[–—]/g, '-').match(FILE_TOKEN);
        const run = part.match(/^(?:run\s+)?(r-[\w-]+)$/i);
        const decision = part.match(/^decision:([a-f0-9-]{36})$/);
        const open = file && onFile ? () => onFile(file[1], file[2] ? Number(file[2]) : null, file[3] ? Number(file[3]) : null)
          : run && onRun ? () => onRun(run[1])
          : decision && onDecision ? () => onDecision(decision[1]) : null;
        const label = run ? 'Run · ' + run[1] : decision ? 'Approved decision' : part;
        const Icon = run ? Play : decision ? Shield : FileText;
        return <EvidencePill key={i} icon={Icon} {...(open ? { type: 'button', onClick: open, title: 'Open ' + label } : {})}>{label}</EvidencePill>;
      })}
    </div>
  );
}

export function Md({ text, onRun, onFile, sourcePath = singleSourcePath(text) }) {
  const { source, math } = tokenizeMath(text.replace(/^Papers read:\s*/gm, ''));
  const lines = source.split('\n');
  const out = [];
  let bullets = null;
  let fence = null; // collecting a ``` block
  let table = null; // collecting consecutive | … | rows
  const flushTable = key => {
    const [head, ...rows] = table;
    out.push(<div key={key} className="my-2 overflow-x-auto"><table className="min-w-full border-collapse text-xs"><thead><tr>{head.map((c, j) => <th key={j} className="border border-line px-2 py-1 text-left font-semibold">{inline(c, math, onFile, sourcePath)}</th>)}</tr></thead><tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j} className="border border-line px-2 py-1 align-top">{inline(c, math, onFile, sourcePath)}</td>)}</tr>)}</tbody></table></div>);
    table = null;
  };
  lines.forEach((l, i) => {
    if (fence !== null) {
      if (/^\s*```/.test(l)) {
        out.push(<CodeBlock key={`f${i}`} className="my-1.5 text-xs">{fence.map((fl, j) => <div key={j}>{colorLine(fl)}</div>)}</CodeBlock>);
        fence = null;
      } else {
        fence.push(l);
      }
      return;
    }
    if (/^\s*```/.test(l)) {
      fence = [];
      return;
    }
    if (/^\s*\|.*\|\s*$/.test(l)) {
      const cells = l.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
      if (!cells.every(cell => /^:?-{3,}:?$/.test(cell))) (table = table || []).push(cells);
      return;
    }
    if (table) flushTable(`t${i}`);
    if (/^\s*[-*] /.test(l)) {
      bullets = bullets || [];
      bullets.push(<li key={i}>{inline(l.replace(/^\s*[-*] /, ''), math, onFile, sourcePath)}</li>);
      return;
    }
    if (bullets) {
      out.push(<ul key={`ul${i}`} className="my-1 list-disc pl-5">{bullets}</ul>);
      bullets = null;
    }
    const token = l.trim().match(/^\uE000(\d+)\uE001$/);
    const heading = l.match(/^(#{1,6})\s+(\S.*?)\s*#*$/);
    // A line that is nothing but bold text is a section title in all but syntax.
    const boldTitle = !heading && l.trim().match(/^\*\*([^*]{3,90})\*\*:?$/);
    if (token && math[Number(token[1])]?.display) {
      out.push(<MathText key={i} {...math[Number(token[1])]} />);
    } else if (heading || boldTitle) {
      const Heading = heading ? `h${heading[1].length}` : 'h3';
      // A long answer reads as one wall without a break before each section.
      const rule = out.length ? 'mt-4 border-t border-line pt-3' : 'mt-1';
      out.push(<Heading key={i} className={`${rule} mb-1 font-semibold text-ink`}>{inline(heading ? heading[2] : boldTitle[1], math, onFile, sourcePath)}</Heading>);
    } else if (l.startsWith('Sources: ')) {
      out.push(<SourcesLine key={i} text={l} onRun={onRun} onFile={onFile} />);
    } else if (l.trim()) {
      out.push(<p key={i} className="my-1">{inline(l, math, onFile, sourcePath)}</p>);
    }
  });
  if (fence) out.push(<CodeBlock key="f-end" className="my-1.5 text-xs">{fence.map((fl, j) => <div key={j}>{colorLine(fl)}</div>)}</CodeBlock>);
  if (table) flushTable('t-end');
  if (bullets) out.push(<ul key="ul-end" className="my-1 list-disc pl-5">{bullets}</ul>);
  // Every file the answer cites, in one Sources dropdown, each opening its file (owner, 2026-10-04).
  const cited = onFile ? citedSources(text) : [];
  if (cited.length) out.push(<details key="cited" data-cited-sources className="mt-2 text-xs"><summary className="cursor-pointer text-ink-2 hover:text-ink">Sources ({cited.length})</summary>
    <div className="mt-1.5 flex flex-wrap gap-1">{cited.map(c => <EvidencePill key={`${c.path}:${c.start}-${c.end}`} type="button" data-cited-source title={`Open ${c.path}:${c.start}${c.end > c.start ? `-${c.end}` : ''}`} onClick={() => onFile(c.path, c.start, c.end)}>{c.path}:{c.start}{c.end > c.start ? `-${c.end}` : ''}</EvidencePill>)}</div></details>);
  return <div className="min-w-0 text-sm leading-normal">{out}</div>;
}

// The cited file in a side panel, scrolled to (and highlighting) the cited line.
const evidenceCrumbs = (appName, label, onBack) => [
  { label: 'Apps', onClick: () => navigate('/apps') },
  ...(appName ? [{ label: appName, onClick: () => navigate('/apps/' + encodeURIComponent(appName)) }, { label: 'Agent' }] : []),
  { label: 'Chat', onClick: onBack }, { label },
];

export function FilePeek({ appName, path, line, lineEnd, onClose }) {
  const [content, setContent] = useState(null);
  // a citation spanning the whole file highlights nothing: all-green is no signal
  const total = content ? content.split('\n').length : 0;
  const whole = line === 1 && lineEnd && total && lineEnd >= total - 1;
  const hi = (n) => !whole && line && n >= line && n <= (lineEnd || line);
  const [err, setErr] = useState(null);
  const lineRef = useRef(null);
  useEffect(() => {
    api('/api/ask/file', { method: 'POST', body: JSON.stringify({ app: appName, path }) })
      .then((d) => setContent(d.content))
      .catch((e) => setErr(e.message));
  }, [appName, path]);
  useEffect(() => {
    if (content && lineRef.current) lineRef.current.scrollIntoView({ block: 'center' });
  }, [content]);
  return (
    <SlidePanel
      width={560}
      expandable
      breadcrumbs={evidenceCrumbs(appName, path, onClose)}
      z={40}
      onClose={onClose}
      title={
        <>
          <span className="truncate font-mono text-sm">{path}{line ? `:${line}${lineEnd ? `-${lineEnd}` : ''}` : ''}</span>
          <button
            aria-label="Copy file"
            title="Copy"
            onClick={() => { navigator.clipboard.writeText(content || ''); }}
            className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-sm text-ink-2 hover:bg-hover hover:text-ink"
          >
            <Copy size={13} strokeWidth={1.5} />
          </button>
        </>
      }
    >
      <div data-panel-content className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        {err && <div role="alert" className="flex items-start gap-2 text-sm text-danger"><span className="min-w-0 flex-1">✗ {err}</span><button type="button" aria-label="Copy error" title="Copy error" onClick={() => navigator.clipboard.writeText(String(err))} className="shrink-0 rounded p-1 hover:bg-danger/10"><Copy size={14} /></button></div>}
        {content == null && !err && <span className="flex items-center gap-2 text-xs text-ink-2"><Loader2 size={14} className="animate-spin text-ink-3" />Reading source?</span>}
        {content != null && (
          <pre className="rounded-sm bg-code p-3 font-mono text-xs leading-relaxed text-ink">
            {content.split('\n').map((l, i) => (
              <div key={i} ref={i + 1 === line ? lineRef : null} className={cn('flex gap-3 px-1', hi(i + 1) && 'rounded-xs bg-[#DBEDDB] dark:bg-[#1C3829]')}>
                <span className="w-7 shrink-0 text-right text-ink-3 select-none">{i + 1}</span>
                <span className="whitespace-pre-wrap">{colorLine(l)}</span>
              </div>
            ))}
          </pre>
        )}
      </div>
    </SlidePanel>
  );
}

// Phase 2 proposal card: what will happen with the exact inputs; nothing runs
// until Run posts the approval. Change hands the args back to the input box.
const TOOL_LABEL = {
  run: 'Run', run_again: 'Run again', pause_schedule: 'Pause schedule',
  resume_schedule: 'Resume schedule', share: 'Share', unshare: 'Unshare',
};

function ProposalCard({ proposal, onDone, onChange }) {
  const [busy, setBusy] = useState(false);
  const approve = async () => {
    setBusy(true);
    try {
      const d = await api('/api/ask/approve', { method: 'POST', body: JSON.stringify({ proposal_id: proposal.id }) });
      // a started run becomes a live result card in the chat
      onDone(d.runId ? { runId: d.runId } : `✓ ${TOOL_LABEL[proposal.tool] || proposal.tool} executed`);
    } catch (e) {
      onDone(`✗ ${e.message}`);
    }
  };
  return (
    <div className="max-w-[440px] rounded-md border border-line p-3">
      <div className="pb-1 text-sm font-medium">{TOOL_LABEL[proposal.tool] || proposal.tool}?</div>
      <pre className="overflow-x-auto rounded-sm bg-code p-2 font-mono text-xs whitespace-pre-wrap text-ink-2">{JSON.stringify(proposal.args, null, 2)}</pre>
      <div className="flex gap-2 pt-2">
        <button
          disabled={busy}
          onClick={approve}
          className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-sm bg-accent px-2.5 text-[13px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {busy && <Loader2 size={12} className="animate-spin" />} Run
        </button>
        <button
          onClick={() => onChange(`${TOOL_LABEL[proposal.tool] || proposal.tool} with ${JSON.stringify(proposal.args)} but `)}
          className="h-7 cursor-pointer rounded-sm px-2.5 text-[13px] text-ink-2 hover:bg-hover hover:text-ink"
        >
          Change
        </button>
        <button onClick={() => onDone('(proposal dismissed)')} className="h-7 cursor-pointer rounded-sm px-2.5 text-[13px] text-ink-2 hover:bg-hover hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}

// After an approved run: live result right in the chat - status, log tail,
// outputs with the same inline previews as the run peek.
function RunResultCard({ runId, app }) {
  const [meta, setMeta] = useState(null);
  const [lines, setLines] = useState([]);
  const [outs, setOuts] = useState(null);
  const cursor = useRef(-1);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const d = await api(`/api/runs/${runId}?after=${cursor.current}`);
        if (stop) return;
        cursor.current = d.cursor;
        setMeta(d);
        if (d.lines.length) setLines((l) => [...l, ...d.lines]);
        if (d.status === 'running') setTimeout(() => !stop && tick(), 1500);
        else api(`/api/runs/${runId}/outputs`).then((o) => !stop && setOuts(o.outputs)).catch(() => setOuts([]));
      } catch { if (!stop) setTimeout(() => !stop && tick(), 3000); }
    };
    tick();
    return () => { stop = true; };
  }, [runId]);
  const runUrl = app?.name ? `/apps/${app.name}/runs/${runId}` : null;
  return (
    <div className="max-w-[520px] rounded-md border border-line p-3 text-sm">
      <div className="flex items-center gap-2 pb-1.5">
        {meta?.status === 'running' && <Loader2 size={13} className="animate-spin text-ink-3" />}
        <span className="font-medium">Run {runId.replace(/^r-/, '').slice(0, 7)}</span>
        <span className="text-ink-2">{meta?.status || 'starting…'}</span>
        {runUrl && (
          <button className="ml-auto cursor-pointer text-xs text-accent hover:underline" onClick={() => window.history.pushState(null, '', runUrl) || window.dispatchEvent(new PopStateEvent('popstate'))}>
            open
          </button>
        )}
      </div>
      {lines.length > 0 && (
        <pre className="no-scrollbar max-h-40 overflow-y-auto rounded-sm bg-code p-2 font-mono text-xs whitespace-pre-wrap text-ink-2">{lines.slice(-15).join('\n')}</pre>
      )}
      {outs && outs.length > 0 && (
        <div className="pt-2">
          {outs.map((o) => <OutputRow key={o.name} runId={runId} name={o.name} size={o.size} />)}
        </div>
      )}
      {outs && !outs.length && meta?.status !== 'running' && <div className="pt-1 text-xs text-ink-3">no outputs</div>}
    </div>
  );
}

// compact copy of the run peek's output renderer (kept local - run.jsx imports us)
function OutputRow({ runId, name, size }) {
  const url = `/api/runs/${runId}/outputs/${encodeURIComponent(name)}`;
  const isImg = /\.(jpe?g|png|gif|webp)$/i.test(name) && size < 2 * 1024 * 1024;
  const isText = /\.(json|csv|txt)$/i.test(name) && size < 4096;
  const [text, setText] = useState(null);
  useEffect(() => { if (isText) fetch(url).then((r) => r.text()).then(setText).catch(() => {}); }, [url, isText]);
  return (
    <div className="pb-1.5">
      <a href={url} download={name} className="text-xs text-ink-2 hover:text-ink">{name}</a>
      {isImg && <img src={url} alt={name} className="mt-1 max-h-[180px] max-w-full rounded-sm border border-line" />}
      {isText && text != null && <pre className="no-scrollbar mt-1 max-h-32 overflow-y-auto rounded-sm bg-code p-2 font-mono text-xs whitespace-pre-wrap text-ink-2">{text}</pre>}
    </div>
  );
}

// One chat, scoped: {app} | {run} | {} (org). Style per the Notion AI reference -
// user turns as a right-aligned bubble, answers as plain text, pill input at the bottom.
// The Learn chat sheet's History lists only chats started in the sheet: card
// questions and grading also make learn threads, and the server does not say
// which is which.
// ponytail: remembered per browser; a thread source column when History must follow the learner across devices.
const sheetThreadsKey = app => `small.learn-sheet-threads:${app || ''}`;
const sheetThreadIds = app => { try { return JSON.parse(localStorage.getItem(sheetThreadsKey(app)) || '[]'); } catch { return []; } };
const rememberSheetThread = (app, id) => {
  try { localStorage.setItem(sheetThreadsKey(app), JSON.stringify([String(id), ...sheetThreadIds(app).filter(entry => entry !== String(id))].slice(0, 50))); }
  catch { /* storage off: History stays empty */ }
};

export function AskPanel({ scope, appName = null, placeholder = 'Ask anything…', compact = false, composerOnly = false, autoFocus = false, onSent = null, onHasChat = null, headerExtra = null, headerTitle = null, conversation = 'agent', chatConfig = null, demo = null, boardContext = null, contentPanel = null, onCloseContentPanel = null, repositoryContext = null, onClearRepository = null, onGraph = null, onExchange = null, canvasSeed = null, canvasTarget = null, onClearCanvasTarget = null, slash = null, tutor = null, dock = false, sheet = false, onAddToCanvas = null, voice = null }) {
  const repository = appName?.startsWith('repo-');
  const [repositoryCommit, setRepositoryCommit] = useState(repositoryContext?.commit || null);
  const [codeSelection, setCodeSelection] = useState(null);
  const chatApi = (path, options) => {
    if (!repository) return api(path, options);
    const tail = path.replace('/api/ask/threads', '').split('?')[0];
    const action = tail.endsWith('/delete') ? 'DELETE' : tail.endsWith('/rename') ? 'PATCH' : null;
    return api(`/api/repositories/${appName}/threads${tail.replace(/\/(delete|rename)$/, '')}`, action ? { ...options, method: action } : options);
  };
  const privateChat = chatConfig?.provider === 'bedrock';
  // A standalone canvas chat (canvases.js): no + attachments, and no app context to filter.
  const canvasChat = /^canvas-[a-f0-9]{8}$/.test(scope.app || '');
  const learnChat = conversation === 'learn';
  // Voice Mode (VoiceMode.jsx, the dock only): while on, the field is the voice state, the side controls rest, and
  // tutor.extras move to the left caption.
  const voiceOn = !!(dock && voice && voice.state !== 'off');
  const guardedHistory = privateChat || learnChat;
  const [msgs, setMsgs] = useState([]);
  // The Learn canvas dock (sheet): plain questions answer in a panel above the
  // composer, in one thread, and make no card; Add to canvas turns an answer
  // into a card. Asking about a selected card still answers as a linked card.
  const sheetMode = sheet && composerOnly;
  const [sheetOpen, setSheetOpen] = useState(true);
  const [sheetHistory, setSheetHistory] = useState(false);
  const sheetThread = useRef(null);
  const [input, setInput] = useState('');
  // Learn's command slot (owner 2026-09-30): Auto, or the chosen command as a removable pill. The command
  // is structured state beside the text, never parsed back out of it. `stash` keeps the typed text while
  // the palette is open over it, so choosing or closing gives it back.
  const [command, setCommand] = useState(null);
  const stash = useRef(null);
  const setComposerInput = (value) => {
    const chosen = slash && value.match(/^\/([\w-]+) $/);
    if (chosen && slash.isCommand?.(chosen[1])) { setCommand(chosen[1]); setInput(stash.current ?? ''); stash.current = null; return; }
    if (value === '' && stash.current !== null) { setInput(stash.current); stash.current = null; return; }
    setInput(value);
  };
  const openPalette = () => { if (!input.startsWith('/')) { stash.current = input; setInput('/'); } inputRef.current?.focus(); };
  // A click outside the composer closes the command palette the way Escape does (LearnSlash.jsx):
  // the command search is dropped and what was typed before it comes back.
  const composerBox = useRef(null);
  const paletteOpen = !!slash && input.startsWith('/');
  useEffect(() => {
    if (!paletteOpen) return;
    const away = event => { if (!composerBox.current?.contains(event.target)) setComposerInput(''); };
    document.addEventListener('pointerdown', away, true); // capture: the canvas stops its own pointer events
    return () => document.removeEventListener('pointerdown', away, true);
  }, [paletteOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false);
  const [blockCopy, setBlockCopy] = useState(null);
  useEffect(() => {
    if (!blockCopy) return;
    const timer = setTimeout(() => setBlockCopy(null), 1800);
    return () => clearTimeout(timer);
  }, [blockCopy]);
  const [choices, setChoices] = useState(null); // { message, candidates }
  const [file, setFile] = useState(null); // one attachment per question
  const [mentions, setMentions] = useState([]); // @app chips
  const [plusOpen, setPlusOpen] = useState(false);
  // Canvas context documents (canvas-context-docs.md): the composer's Context button and list.
  const contextDocs = useContextDocs(scope?.app);
  const [ctxOpen, setCtxOpen] = useState(false);
  const [threads, setThreads] = useState([]); // past chats for this scope
  const [view, setView] = useState('chat'); // 'chat' | 'history' - history REPLACES the chat
  const [rowMenu, setRowMenu] = useState(null); // thread id with its ⋯ open
  const [renaming, setRenaming] = useState(null); // { id, value }
  const [confirmDel, setConfirmDel] = useState(null); // thread pending delete
  const [runPeek, setRunPeek] = useState(null);
  const [filePeek, setFilePeek] = useState(null); // { path, line } from a Sources click
  const fileApp = appName || scope.app || null; // /api/ask/file needs the app name
  const scopeKind = scope.run ? 'run' : scope.app ? 'app' : 'org';
  const scopeRef = scope.run || scope.app || null;
  const historyScope = learnChat ? 'learn' : scopeKind;
  const askPath = learnChat ? '/api/learn/ask' : '/api/ask';
  const srcOpts = repository || canvasChat ? [] : (privateChat ? PRIVATE_SOURCE_OPTIONS : SOURCE_OPTIONS)[scopeKind] || [];
  const [srcOn, setSrcOn] = useState(() => new Set(srcOpts.map(([k]) => k)));
  const [srcOpen, setSrcOpen] = useState(false);
  // Learn never shows a model: users choose intent, Rabbit Hole chooses the model (the server's auto routing).
  const [model, setModel] = useState(() => privateChat || learnChat ? 'auto' : localStorage.getItem('small.askModel') || 'auto'); // Settings > Small AI sets the default
  const modelOptions = privateChat ? [['auto', 'Bedrock']] : MODELS;
  const [modelOpen, setModelOpen] = useState(false);
  const [appNames, setAppNames] = useState(null); // lazy, for @-mentions
  const threadId = useRef(null);
  const historyRequest = useRef(0);
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  useEffect(() => {
    if (!demo?.startRef) return;
    demo.startRef.current = () => send(demo.prompt);
    return () => { demo.startRef.current = null; };
  });

  // "@yol" at the end of the input → app-name suggestions
  // The server reads at most three mentions, so the composer offers no fourth chip.
  const atMatch = privateChat || mentions.length >= MENTION_CHIPS ? null : input.match(/@([a-z0-9-]*)$/);
  useEffect(() => {
    if (atMatch && appNames === null) api('/api/apps').then((d) => setAppNames(d.apps.map((a) => ({ name: a.name, kind: a.kind, schedule: a.schedule })))).catch(() => setAppNames([]));
  }, [!!atMatch]);
  // Only apps this chat can resolve: a repository chat reads other repositories,
  // any other chat reads deployed apps (never canvases); never the chat's own app.
  const atHits = atMatch && appNames ? appNames.filter((a) => a.name.includes(atMatch[1]) && a.name !== appName && (repository ? a.name.startsWith('repo-') : !a.name.startsWith('repo-') && !a.name.startsWith('canvas-'))) : [];

  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    if (canvasSeed) return;
    window.addEventListener('small:ask-focus', focus);
    return () => window.removeEventListener('small:ask-focus', focus);
  }, []);

  // Resume the latest saved thread for this scope on mount.
  const loadThread = async (id, toChat = true, request = ++historyRequest.current) => {
    try {
      const d = await chatApi(`/api/ask/threads/${id}`);
      if (repository) { setRepositoryCommit(d.commit); setCodeSelection(null); }
      if (guardedHistory && request !== historyRequest.current) return;
      threadId.current = d.id;
      sheetThread.current = d.id;
      setMsgs(d.messages);
      setChoices(null);
      if (d.messages?.length) onHasChat?.(); // the parent may surface a Chat tab
      if (toChat) setView('chat'); // the silent resume-on-mount must not yank the user out of History
    } catch { /* stale id - stay on the empty chat */ }
  };
  const threadsPath = `/api/ask/threads?scope=${historyScope}${scopeRef ? `&ref=${encodeURIComponent(scopeRef)}` : ''}${privateChat ? `&app=${encodeURIComponent(fileApp)}` : ''}`;
  useEffect(() => {
    if (composerOnly || canvasSeed) return; // Canvas conversations never resume an unrelated thread.
    const request = ++historyRequest.current;
    chatApi(threadsPath)
      .then(async (d) => {
        if (guardedHistory && request !== historyRequest.current) return;
        setThreads(d.threads || []);
        if (d.threads?.[0]) await loadThread(d.threads[0].id, false, request);
      })
      .catch(() => {});
    return () => { if (guardedHistory) historyRequest.current++; };
  }, [historyScope, scopeRef, privateChat, appName]);
  const newChat = () => { setCodeSelection(null); setFilePeek(null); setRepositoryCommit(repositoryContext?.commit || null); boardContext?.clearPaper?.(); onCloseContentPanel?.(); historyRequest.current++; threadId.current = null; sheetThread.current = null; setSheetHistory(false); boardContext?.removeImage(); setMsgs([]); setSelectedPassage(null); setChoices(null); setView('chat'); };
  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [msgs]);

  // Learn / commands (LearnSlash.jsx): a line starting with / runs as a
  // command, never as a chat message.
  const slashRef = useRef(null);
  // Stop (the docked shell): aborts the answer being streamed.
  const answerFlight = useRef(null);
  const send = async (raw, scopeOverride, { opening = false } = {}) => {
    // A chosen command pill sends exactly "/command text" (LearnSlash runs it); the pill goes back to Auto.
    // A typed /command replaces the pill rather than nesting inside it.
    if (slash && command && !raw.trim().startsWith('/')) { const line = `/${command} ${raw.trim()}`.trim(); setCommand(null); setInput(''); slashRef.current?.intercept(line); return; }
    if (slash && raw.trim().startsWith('/')) { setCommand(null); if (slashRef.current?.intercept(raw)) return; }
    // @-chips ride at the front of the message text
    const message = [...mentions.map((m) => `@${m}`), raw.trim()].filter(Boolean).join(' ');
    if (!message || busy) return;
    // The main composer starts a new block; the sheet keeps its own thread.
    const panelAsk = sheetMode && !canvasTarget;
    if (composerOnly && !canvasSeed) threadId.current = panelAsk ? sheetThread.current : null;
    const exchange = panelAsk ? null : onExchange;
    if (panelAsk) { setSheetOpen(true); setSheetHistory(false); }
    const isDemo = demo && message.toLowerCase().replace(/[.!?]+$/, '') === demo.prompt.toLowerCase() && !file;
    if (isDemo && demo.disabled) return;
    if (!isDemo) { boardContext?.pause(); boardContext?.setAnswering(true); }
    if (guardedHistory) historyRequest.current++;
    onSent?.();
    if (contentPanel) { setFilePeek(null); onCloseContentPanel?.(); setView('chat'); }
    setChoices(null);
    setBusy(true);
    const flight = new AbortController();
    answerFlight.current = flight;
    setInput('');
    setMentions([]);
    const sourceRange = codeSelection;
    setCodeSelection(null);
    const attached = file;
    setFile(null);
    const canvasImage = !isDemo ? boardContext?.preview || (canvasTarget?.id?.startsWith?.('area:') ? canvasTarget.preview : null) : null;
    const questionPaper = boardContext?.paper;
    const questionWiki = boardContext?.wiki;
    const questionVideo = boardContext?.video;
    const questionImage = boardContext?.image;
    const questionOutline = boardContext?.outline?.();
    if (!isDemo) boardContext?.removeImage();
    const target = canvasTarget; // selected lesson block riding as context
    // The attachment follows its card until this exact moment: a function-
    // valued text resolves the card's CURRENT visible state now, and the
    // string it returns is frozen into this one request. A later input
    // change can never rewrite an in-flight question's evidence.
    const targetText = target ? (typeof target.text === 'function' ? target.text() : target.text) : null;
    if (target) onClearCanvasTarget?.();
    const imageId = !target?.paper && !questionPaper ? target?.image || questionImage?.id : null;
    const replyId = crypto.randomUUID();
    const card = sheetMode && !panelAsk ? { card: true } : {}; // answered as a card, kept out of the sheet
    setMsgs((m) => [...m, { role: 'user', content: attached ? `${message} 📎 ${attached.name}` : message, ...card, ...(canvasImage ? { canvasImage } : {}), ...(sourceRange ? { passage: `${sourceRange.path}:${sourceRange.start}-${sourceRange.end}` } : {}) }, { role: 'assistant', content: '', id: replyId, demo: !!isDemo, ...card }]);
    if (!isDemo) exchange?.({ id: replyId, question: message, ...(target ? { linkFrom: target.id } : {}) });
    const append = (t) => setMsgs((m) => {
      const next = m.slice();
      next[next.length - 1] = { ...next[next.length - 1], content: next[next.length - 1].content + t };
      return next;
    });
    const mirror = (t) => { exchange?.({ id: replyId, delta: t }); append(t); };
    let responseGraph = null;
    try {
      if (isDemo) {
        // Demo replies are temporary and never written into a saved conversation.
        setView('chat');
        await demo.run(text => setMsgs(m => m.map(item => item.id === replyId ? { ...item, content: text } : item)));
        return;
      }
      // Tutor v1 (LearnTutor.jsx): on the NanoGPT Attention slice the Tutor answers instead of the
      // Learn chat - the learner's own words, and the card they armed or selected.
      if (tutor) { mirror(await tutor.ask({ raw: raw.trim(), targetId: target?.id || null, opening, signal: flight.signal }).catch(e => { if (e.name === 'AbortError') return 'Stopped.'; if (e.name === 'TimeoutError') throw new Error('The Tutor took too long to answer. Try again.'); throw e; })); return; }
      const payload = {
        // The lesson's table of contents. Separate from lesson_snapshot, which
        // is tldraw-shaped and would reject it.
        ...(questionOutline?.length ? { outline: questionOutline } : {}),
        ...(target?.paper ? { paper_context: target.paper } : questionPaper ? { paper_context: { id: questionPaper.id, page: questionPaper.page, ...(questionPaper.selection ? { selection: questionPaper.selection } : {}) } } : {}),
        // One reader holds one thing, so an open paper is what rides; a detached
        // wiki source arrives here as null and the key is simply absent.
        // A dropped image outranks the article and video cards - it is the
        // thing most recently put in front of the tutor - but a paper wins.
        // A group's own snapshot rides only with the question about that group.
        ...(imageId ? { image_context: { id: imageId } } : {}),
        ...(!target?.paper && !questionPaper && !imageId && questionWiki?.title ? { wiki_context: { title: questionWiki.title, section: questionWiki.section || 0, ...(questionWiki.selection ? { selection: questionWiki.selection } : {}) } } : {}),
        // A video card is the quietest context: any open reader outranks it.
        ...(!target?.paper && !questionPaper && !imageId && !questionWiki?.title && questionVideo?.videoId ? { video_context: { videoId: questionVideo.videoId, start: questionVideo.start || 0, ...(questionVideo.end != null ? { end: questionVideo.end } : {}), ...(questionVideo.title ? { title: questionVideo.title } : {}) } } : {}),
        scope: scopeOverride || scope,
        ...(repository && repositoryContext ? { repository_context: { ...repositoryContext, commit: sourceRange?.commit || repositoryCommit || repositoryContext?.commit, ...(sourceRange ? {range:{path:sourceRange.path,start:sourceRange.start,end:sourceRange.end}} : {}) } } : {}),
        // @-mentioned apps: the server adds each one's context to this chat.
        ...(mentions.length ? { mentions: [...mentions] } : {}),
        // The learner's own words; the card, group or region they asked about rides beside them,
        // its text resolved at send (targetText) so a live card sends the state the learner sees.
        message,
        ...(target ? { canvas_target: canvasTargetField({ ...target, text: targetText }) } : {}),
        thread_id: threadId.current,
        // A Continue convo's first request also carries the card its answer was linked from.
        ...(canvasSeed && !threadId.current ? { canvas_seed: { question: canvasSeed.question, answer: canvasSeed.answer }, ...(!target && canvasSeed.target ? { canvas_target: canvasTargetField(canvasSeed.target) } : {}) } : {}),
        ...(srcOpts.length && srcOn.size < srcOpts.length ? { sources: [...srcOn] } : {}),
        ...(model !== 'auto' ? { model } : {}),
      };
      if (privateChat) {
        const d = await api(askPath, { method: 'POST', body: JSON.stringify({ ...payload,
          scope: { app: fileApp, ...(scope.run ? { run: scope.run } : {}) } }) });
        mirror(d.answer);
        threadId.current = d.threadId;
        setThreads((ts) => [d.thread, ...ts.filter((t) => t.id !== d.threadId)]);
        return;
      }
      let r;
      if (attached) {
        const fd = new FormData();
        fd.append('body', JSON.stringify(payload));
        fd.append('file', attached);
        r = await fetch(askPath, { method: 'POST', headers: wsHeaders(), body: fd, signal: flight.signal });
      } else {
        r = await fetch(askPath, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...wsHeaders() },
          body: JSON.stringify(payload),
          signal: flight.signal,
        });
      }
      if ((r.headers.get('Content-Type') || '').includes('json')) {
        const d = await r.json();
        if (d.choose) {
          setMsgs((m) => m.slice(0, -2)); // no turn happened yet - the pills replace it
          setChoices({ message, candidates: d.choose });
        } else {
          mirror(`✗ ${d.error || `HTTP ${r.status}`}`);
        }
        return;
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const events = buf.split('\n\n');
        buf = events.pop();
        for (const ev of events) {
          const type = (ev.match(/^event: (.+)$/m) || [])[1];
          const data = (ev.match(/^data: (.+)$/m) || [])[1];
          if (!type || !data) continue;
          const d = JSON.parse(data);
          if (type === 'chunk') mirror(d.text);
          else if (type === 'progress') { exchange?.({ id: replyId, stage: d.stage }); setMsgs(messages => messages.map(item => item.id === replyId ? { ...item, status: d.stage } : item)); }
          else if (type === 'graph') { responseGraph=d; setMsgs(messages=>messages.map(item=>item.id===replyId?{...item,graph:d}:item)); }
          else if (type === 'outline') { boardContext?.onOutlineProposal?.(d.ops); }
          else if (type === 'paper') { boardContext?.onShowPaper?.(d); }
          else if (type === 'wiki') { boardContext?.onShowWiki?.(d); }
          else if (type === 'video') { boardContext?.onShowVideo?.(d); }
          else if (type === 'papers') setMsgs(messages => messages.map(item => item.id === replyId ? { ...item, papers: d.papers } : item));
          else if (type === 'proposal') setMsgs((m) => [...m, { role: 'proposal', proposal: d }]);
          else if (type === 'done' && d.threadId) {
            threadId.current = d.threadId;
            if (panelAsk) { sheetThread.current = d.threadId; rememberSheetThread(appName, d.threadId); }
            if (repository && d.commit) setRepositoryCommit(d.commit);
            if (responseGraph && onGraph) onGraph(responseGraph);
            if (learnChat) setThreads(ts => ts.some(t => t.id === d.threadId) ? ts : [{ id: d.threadId, title: message.slice(0, 120) }, ...ts]);
          }
          else if (type === 'error') mirror(`✗ ${d.error}`);
        }
      }
    } catch (e) {
      // A stopped answer keeps what arrived; it is not an error.
      if (e.name !== 'AbortError') mirror(`✗ ${e.message}`);
    } finally {
      if (answerFlight.current === flight) answerFlight.current = null;
      if (!isDemo) exchange?.({ id: replyId, done: true });
      if (!isDemo) boardContext?.setAnswering(false);
      setBusy(false);
    }
  };

  // Tutor v1: a hole's opening turn goes through send once, as the learner's carried-down question.
  const openedHole = useRef(null);
  useEffect(() => {
    if (!tutor?.opening || openedHole.current === tutor.opening.key || busy) return;
    openedHole.current = tutor.opening.key;
    // Voice Mode: the opening is a voice turn - spoken, in the Tutor caption only, never a chat bubble.
    if (dock && voice?.on && voice.say(tutor.opening.question, { opening: true })) return;
    send(tutor.opening.question, undefined, { opening: true });
  }, [tutor?.opening?.key, busy, voice?.on]); // eslint-disable-line react-hooks/exhaustive-deps

  const modelControl = (
          <div className="relative shrink-0">
            <button
              type="button"
              title={privateChat ? chatConfig.model : undefined}
              onMouseDown={(e) => { e.stopPropagation(); setModelOpen(!modelOpen); }}
              className={cn(dock ? COMPOSER_PILL : 'h-6 cursor-pointer rounded-full px-1.5 text-xs text-ink-2 hover:bg-hover hover:text-ink', modelOpen && 'bg-active text-ink')}
            >
              {modelOptions.find(([k]) => k === model)?.[1]}
            </button>
            <Menu open={modelOpen} onClose={() => setModelOpen(false)} className={dock ? 'bottom-11 left-0 w-52' : 'right-0 bottom-8 w-52'}>
              {modelOptions.map(([k, label]) => (
                <MenuItem key={k} type="button" icon={MODEL_META[k]?.[0]} onClick={() => { setModel(k); setModelOpen(false); }}>
                  <span className="flex w-full items-center justify-between">
                    <span className={cn(k === model && 'font-medium')}>{label}</span>
                    <span className="text-xs text-ink-3">{privateChat ? 'AWS model' : MODEL_META[k]?.[1]}</span>
                  </span>
                </MenuItem>
              ))}
            </Menu>
          </div>
  );
  // Learn's command slot: Auto (Rabbit Hole picks the action and the model) opens the same palette typing / does;
  // a chosen command sits here as a pill (its name, no slash) - the name reopens the palette to swap it, × goes back to Auto and keeps the text.
  const slashControl = slash && (command
    ? <span data-command-pill className={cn(dock ? 'h-9 rounded-lg pl-2.5 text-sm max-md:pl-1.5' : 'h-6 rounded-full pl-2 text-xs', 'inline-flex shrink-0 items-center border border-line bg-hover text-ink', voiceOn && 'opacity-45')}>
        <button type="button" title="Change the command" disabled={voiceOn} onMouseDown={event => event.preventDefault()} onClick={openPalette} className="cursor-pointer font-medium">{command}</button>
        <button type="button" aria-label={`Remove ${command}`} title="Back to Auto" onMouseDown={event => event.preventDefault()} onClick={() => { setCommand(null); inputRef.current?.focus(); }} disabled={voiceOn}
          className={cn(dock ? 'mx-1 h-7 w-7' : 'mx-0.5 h-5 w-5', 'flex cursor-pointer items-center justify-center rounded-md text-ink-3 hover:bg-white hover:text-ink')}><X size={13} /></button>
      </span>
    : <button type="button" aria-label="Auto" title="Auto: Rabbit Hole picks the action. Choose a command" aria-expanded={input.startsWith('/')} disabled={voiceOn}
        onMouseDown={event => event.preventDefault()} onClick={() => (input.startsWith('/') ? setComposerInput('') : openPalette())}
        className={cn(dock ? COMPOSER_PILL : 'h-6 cursor-pointer rounded-full px-1.5 text-xs text-ink-2 hover:bg-hover hover:text-ink', input.startsWith('/') && 'bg-active text-ink', voiceOn && 'cursor-default opacity-45')}>Auto</button>);
  const chatControl = learnChat ? slashControl : modelControl;
  if (repository && filePeek) contentPanel = <RepositorySource appName={fileApp} {...filePeek} commit={repositoryCommit || repositoryContext?.commit} onClose={() => setFilePeek(null)} />;
  return (
    <div className={cn('flex min-h-0 flex-col', compact ? 'max-h-[320px]' : 'flex-1', sheetMode && 'relative')}>
      {!compact && (msgs.length > 0 || threads.length > 0 || headerExtra || headerTitle) && (
        <div className="flex shrink-0 items-center justify-end gap-1 pb-1">
          {headerTitle && <h2 className="mr-auto text-sm font-semibold">{headerTitle}</h2>}
          {(threads.length > 0 || headerTitle) && (
            <button
              disabled={guardedHistory && busy}
              onClick={() => { setFilePeek(null); onCloseContentPanel?.(); setView(view === 'history' ? 'chat' : 'history'); }}
              className={cn('flex h-6 cursor-pointer items-center gap-1 rounded-sm px-1.5 text-xs text-ink-2 hover:bg-hover hover:text-ink', view === 'history' && 'bg-active text-ink')}
            >
              <History size={12} strokeWidth={1.5} /> {view === 'history' ? 'Back to chat' : 'History'}
            </button>
          )}
          <button disabled={guardedHistory && busy} onClick={newChat} className="flex h-6 cursor-pointer items-center gap-1 rounded-sm px-1.5 text-xs text-ink-2 hover:bg-hover hover:text-ink">
            <Plus size={12} strokeWidth={1.5} /> New chat
          </button>
          {headerExtra}
        </div>
      )}
      {compact && !composerOnly && msgs.length > 0 && (
        <div className="flex shrink-0 justify-end pb-1">
          <button disabled={privateChat && busy} onClick={newChat} className="flex h-6 cursor-pointer items-center gap-1 rounded-sm px-1.5 text-xs text-ink-2 hover:bg-hover hover:text-ink">
            Clear chat
          </button>
        </div>
      )}
      {runPeek && (
        <SlidePanel key={runPeek} width={560} expandable breadcrumbs={evidenceCrumbs(fileApp, 'Run ' + runPeek, () => setRunPeek(null))} title={'Run ' + runPeek} onClose={() => setRunPeek(null)}>
          <div data-panel-content className="min-h-0 flex-1 overflow-y-auto px-5 pb-5"><RunResultCard runId={runPeek} app={fileApp ? { name: fileApp } : null} /></div>
        </SlidePanel>
      )}
      {filePeek && !repository && <FilePeek appName={fileApp} path={filePeek.path} line={filePeek.line} lineEnd={filePeek.lineEnd} onClose={() => setFilePeek(null)} />}
      {confirmDel && (
        <ConfirmDialog
          title="Delete this chat?"
          body={`"${confirmDel.title.slice(0, 80)}" and its messages are removed for good. Approved actions stay in the log.`}
          onConfirm={async () => {
            const t = confirmDel;
            setConfirmDel(null);
            try {
              await chatApi(`/api/ask/threads/${t.id}/delete`, { method: 'POST' });
              setThreads((ts) => ts.filter((x) => x.id !== t.id));
              if (threadId.current === t.id) newChat();
            } catch { /* row stays if the delete failed */ }
          }}
          onCancel={() => setConfirmDel(null)}
        />
      )}
      {view === 'history' && !contentPanel && (
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
          {threads.map((t) => (
            <div key={t.id} className="group/h relative flex items-center border-b border-line">
              {renaming?.id === t.id ? (
                <form
                  className="flex-1 py-1"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const title = renaming.value.trim();
                    setRenaming(null);
                    if (!title) return;
                    try {
                      await chatApi(`/api/ask/threads/${t.id}/rename`, { method: 'POST', body: JSON.stringify({ title }) });
                      setThreads((ts) => ts.map((x) => (x.id === t.id ? { ...x, title } : x)));
                    } catch { /* row keeps its old title */ }
                  }}
                >
                  <input
                    autoFocus
                    value={renaming.value}
                    onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                    onBlur={() => setRenaming(null)}
                    className="h-7 w-full rounded-sm bg-hover px-2 text-sm outline-none"
                  />
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => loadThread(t.id)}
                  className="flex h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-hover"
                >
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="shrink-0 text-xs text-ink-3">{ago(t.created_at)}</span>
                </button>
              )}
              <button
                type="button"
                aria-label="Thread options"
                onMouseDown={(e) => { e.stopPropagation(); setRowMenu(rowMenu === t.id ? null : t.id); }}
                className={cn('mr-0.5 inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-sm text-ink-2 opacity-0 group-hover/h:opacity-100 hover:bg-hover hover:text-ink', rowMenu === t.id && 'bg-active text-ink opacity-100')}
              >
                <MoreHorizontal size={15} strokeWidth={1.5} />
              </button>
              <Menu open={rowMenu === t.id} onClose={() => setRowMenu(null)} className="top-8 right-0 w-36">
                <MenuItem icon={Pencil} type="button" onClick={() => { setRowMenu(null); setRenaming({ id: t.id, value: t.title }); }}>Rename</MenuItem>
                <MenuItem icon={Trash2} type="button" className="text-danger" onClick={() => { setRowMenu(null); setConfirmDel(t); }}>Delete</MenuItem>
              </Menu>
            </div>
          ))}
          {threads.length === 0 && <div className="py-3 text-sm text-ink-3">No past chats.</div>}
        </div>
      )}
      {(view === 'chat' || contentPanel) && (<>
      {contentPanel && <div className="flex min-h-0 flex-1 flex-col overflow-hidden"><SourceSelectionContext.Provider value={{value:codeSelection,set:setCodeSelection}}>{contentPanel}</SourceSelectionContext.Provider></div>}
      <div ref={boxRef} data-chat-sheet={sheetMode || undefined} className={cn('no-scrollbar min-h-0 flex-1 overflow-y-auto', (contentPanel || (composerOnly && !sheetMode)) && 'hidden',
        sheetMode && 'absolute right-0 bottom-full left-0 z-30 mb-2 max-h-[45vh] rounded-xl border border-line bg-white px-3 pb-3 shadow-pop',
        sheetMode && !(sheetOpen && (sheetHistory || msgs.some(m => !m.card))) && 'hidden')}>
        {sheetMode && (
          <div className="sticky top-0 z-10 -mx-3 flex items-center gap-1 bg-white px-3 pt-2 pb-1">
            <span className="mr-auto text-xs text-ink-2">Rabbit Hole</span>
            <button type="button" disabled={busy} onClick={() => { if (sheetHistory) return setSheetHistory(false); setSheetHistory(true); chatApi(threadsPath).then(d => { const mine = new Set(sheetThreadIds(appName)); setThreads((d.threads || []).filter(t => mine.has(String(t.id)))); }).catch(() => {}); }}
              className={cn('flex h-6 cursor-pointer items-center gap-1 rounded-sm px-1.5 text-xs text-ink-2 hover:bg-hover hover:text-ink disabled:cursor-default disabled:opacity-50', sheetHistory && 'bg-active text-ink')}>
              <History size={12} strokeWidth={1.5} />{sheetHistory ? 'Back to chat' : 'History'}
            </button>
            <button type="button" disabled={busy} onClick={newChat} className="flex h-6 cursor-pointer items-center gap-1 rounded-sm px-1.5 text-xs text-ink-2 hover:bg-hover hover:text-ink disabled:cursor-default disabled:opacity-50">
              <Plus size={12} strokeWidth={1.5} />New chat
            </button>
            <button type="button" aria-label="Collapse chat" title="Collapse" onClick={() => setSheetOpen(false)} className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-sm text-ink-2 hover:bg-hover hover:text-ink">
              <Minus size={14} />
            </button>
          </div>
        )}
        {sheetMode && sheetHistory && (threads.length ? threads.map(t => (
          <button key={t.id} type="button" onClick={async () => { await loadThread(t.id); setSheetHistory(false); }} className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-hover">
            <span className="min-w-0 flex-1 truncate">{t.title}</span>
            {t.created_at && <span className="shrink-0 text-xs text-ink-3">{ago(t.created_at)}</span>}
          </button>
        )) : <p className="py-2 text-sm text-ink-3">No past chats.</p>)}
        {!sheetMode && msgs.length === 0 && !choices && (
          <div className="flex flex-col items-start gap-1.5 py-3">
            {(repository
              ? ['What are the main concepts in this repository?', 'How does the code fit together?', 'Where should I start reading?']
              : scope.run
              ? ['What happened in this run?', 'Why did it fail?', 'What changed since the last successful run?']
              : scope.app
                ? ['When did this last run, and how did it go?', 'What does the code actually do?', 'Who has access to this app?']
                : ['What apps do we have and what do they do?', 'Any failed runs recently?', 'What did Watch find this week?']
            ).map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => send(q)}
                className="cursor-pointer rounded-full border border-line bg-white px-3 py-1 text-left text-[13px] text-ink-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-line-strong hover:text-ink"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        {!(sheetMode && sheetHistory) && msgs.map((m, i) => (sheetMode && m.card) ? null : (
          <div key={i} className={cn('py-1.5', m.role === 'user' && 'flex justify-end')}>
            {m.role === 'user' ? (
              <div className="max-w-[85%] rounded-lg bg-hover px-3 py-1.5 text-sm">
                {m.canvasImage && <img src={m.canvasImage} alt="Canvas with the question’s target marked" className="mb-2 max-h-32 w-44 rounded border border-line bg-white object-contain" />}
                {m.passage && <blockquote className="mb-2 max-h-24 overflow-auto border-l-2 border-accent/40 pl-2 text-xs text-ink-2">{m.passage}</blockquote>}
                {m.content}
              </div>
            ) : m.role === 'proposal' ? (
              <ProposalCard
                proposal={m.proposal}
                onDone={(r) => setMsgs((ms) => ms.map((x, j) => (j === i ? (r?.runId ? { role: 'run', runId: r.runId } : { role: 'assistant', content: r }) : x)))}
                onChange={(text) => { setMsgs((ms) => ms.filter((_, j) => j !== i)); setInput(text); inputRef.current?.focus(); }}
              />
            ) : m.role === 'run' ? (
              <RunResultCard runId={m.runId} app={fileApp ? { name: fileApp } : null} />
            ) : m.content?.startsWith('✗ ') ? (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
                <span className="min-w-0 flex-1 break-words">{m.content}</span>
                <button type="button" aria-label="Copy error" title="Copy error" onClick={() => navigator.clipboard.writeText(m.content)} className="shrink-0 rounded p-1 hover:bg-danger/10"><Copy size={14} /></button>
              </div>
            ) : m.content ? (
              <>{learnChat ? <div className="relative min-w-0 rounded-lg border border-accent/30 p-3 pr-10">
                <Md text={m.content} onRun={id => { setFilePeek(null); setRunPeek(id); }} onFile={fileApp ? (path, line, lineEnd) => { setRunPeek(null); setFilePeek({ path, line, lineEnd }); } : null} />
                <button type="button" title="Copy" aria-label="Copy answer" className="absolute top-2 right-2 rounded p-1 text-accent hover:bg-accent/10" onClick={async () => {
                  try { await navigator.clipboard.writeText(m.content); setBlockCopy({ reply: m.id || i, text: 'Copied' }); }
                  catch { setBlockCopy({ reply: m.id || i, text: 'Copy failed' }); }
                }}><Copy size={14} /></button>
                {blockCopy?.reply === (m.id || i) && <span role="status" className="absolute right-2 top-9 z-10 rounded border border-accent/30 bg-accent/10 px-2 py-1 text-xs text-black shadow-sm">{blockCopy.text}</span>}
              </div> : <Md text={m.content} onRun={id => { if (privateChat) navigate(`/apps/${encodeURIComponent(appName)}/runs/${encodeURIComponent(id)}`); else { setFilePeek(null); setRunPeek(id); } }} onFile={!privateChat && fileApp ? (path, ln, lnEnd) => { setRunPeek(null); setFilePeek({ path, line: ln, lineEnd: lnEnd }); } : null} />}
              {m.graph&&onGraph&&<div className="mt-2"><EvidencePill icon={Network} type="button" onClick={()=>onGraph(m.graph)} title={m.graph.title}>Show on graph</EvidencePill></div>}
              {sheetMode && onAddToCanvas && !m.demo && !m.content.startsWith('\u2717') && !(busy && i === msgs.length - 1) && (
                <button type="button" data-add-to-canvas disabled={m.added} onClick={() => {
                  onAddToCanvas({ question: [...msgs.slice(0, i)].reverse().find(item => item.role === 'user')?.content || '', answer: m.content });
                  setMsgs(ms => ms.map((x, j) => (j === i ? { ...x, added: true } : x)));
                }} className="mt-2 flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-line px-2 text-xs text-ink-2 hover:bg-hover hover:text-ink disabled:cursor-default disabled:text-green-700 disabled:hover:bg-transparent">
                  {m.added ? <><Check size={13} />On the canvas</> : <><Plus size={13} />Add to canvas</>}
                </button>
              )}</>
            ) : (
              <span className="flex items-center gap-2 text-xs text-ink-2"><Loader2 size={14} className="animate-spin text-ink-3" /><span className="shimmer">{m.status || 'Thinking…'}</span></span>
            )}
          </div>
        ))}
        {choices && (
          <div className="py-2">
            <div className="pb-1.5 text-sm text-ink-2">Which one do you mean?</div>
            <div className="flex flex-col gap-1">
              {choices.candidates.map((c) => (
                <button
                  key={c.app}
                  onClick={() => send(choices.message, { app: c.app })}
                  className="cursor-pointer rounded-sm border border-line px-3 py-1.5 text-left text-sm hover:bg-hover"
                >
                  <span className="font-medium">{c.app}</span>
                  {c.hint && <span className="block truncate text-xs text-ink-2">{c.hint}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* Tutor v1: its suggestion chips and the dive suggestion sit under its reply, never over it. */}
        {tutor?.extras && !voiceOn && <div data-tutor-extras className="flex flex-col items-start gap-2 py-2">{tutor.extras}</div>}
      </div>
      {/* non-compact: the box sticks to the viewport bottom - the page can scroll, the input never leaves */}
      <div ref={composerBox} className={cn('relative mt-2 shrink-0', !compact && 'sticky bottom-0 bg-white pt-1 pb-2')}>
        {/* @-mention suggestions above the input */}
        {atHits.length > 0 && (
          <div className="absolute bottom-full left-0 z-20 mb-1 max-h-56 w-64 overflow-y-auto rounded-md bg-white p-1 shadow-pop">
            {atHits.map((a) => (
              <button
                key={a.name}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setMentions((m) => (m.includes(a.name) ? m : [...m, a.name]));
                  setInput(input.replace(/@[a-z0-9-]*$/, ''));
                  inputRef.current?.focus();
                }}
                className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-hover"
              >
                <KindIcon kind={a.kind} schedule={a.schedule} />
                {a.name}
              </button>
            ))}
          </div>
        )}
        {(file || mentions.length > 0) && (
          <div className="mb-1 flex flex-wrap gap-1.5">
            {mentions.map((m) => (
              <span key={m} className="inline-flex items-center gap-1 rounded-full bg-hover px-2 py-0.5 text-xs">
                @{m}
                <button aria-label={`Remove ${m}`} className="cursor-pointer text-ink-2 hover:text-ink" onClick={() => setMentions((ms) => ms.filter((x) => x !== m))}><X size={11} /></button>
              </span>
            ))}
            {file && (
              <span className="inline-flex items-center gap-1.5 rounded-sm border border-line px-2 py-1 text-xs text-ink-2">
                <Paperclip size={12} strokeWidth={1.5} /> {file.name}
                <button aria-label="Remove attachment" className="cursor-pointer hover:text-ink" onClick={() => setFile(null)}><X size={12} /></button>
              </span>
            )}
          </div>
        )}
        {!contentPanel && demo && <button type="button" disabled={busy || demo.disabled} onClick={() => send(demo.prompt)} className="mb-2 self-start rounded-full border border-line px-3 py-1.5 text-xs text-ink-2 hover:bg-hover disabled:opacity-50">
          {demo.prompt} <span className="ml-1 text-ink-3">· Demo</span>
        </button>}
        {repository && repositoryContext?.label && <div className="mb-2 inline-flex max-w-full self-start items-center gap-1.5 rounded-md border border-green-600/45 bg-green-50 px-2 py-1.5 text-xs text-green-800"><span className="min-w-0 truncate">Asking about: {repositoryContext.label} · {(repositoryCommit || repositoryContext?.commit || '').slice(0,7)}</span>{onClearRepository && <button type="button" className="shrink-0 rounded p-0.5 hover:bg-green-100" aria-label="Clear repository selection" onClick={onClearRepository}><X size={12}/></button>}</div>}
        {canvasTarget && <div data-canvas-target className="mb-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-hover py-1 pr-1.5 pl-2.5 text-xs text-ink-2">
          {canvasTarget.preview && <img src={canvasTarget.preview} alt="Selected region" className="h-7 w-10 shrink-0 rounded border border-line bg-white object-contain" />}
          {canvasTarget.preview && !canvasTarget.paper && !canvasTarget.image && !canvasTarget.id?.startsWith?.('area:') && <span data-text-only title="The tutor gets the shapes' text, not this picture" className="shrink-0 text-ink-3">text only</span>}
          {/* A title that already names its kind (a group called Group 2) is shown once. */}
          {!String(canvasTarget.title ?? '').toLowerCase().startsWith(String(canvasTarget.kind).toLowerCase()) && <span className="shrink-0 font-medium text-ink">{canvasTarget.kind}</span>}
          <span className="max-w-[260px] truncate">{String(canvasTarget.title).replace(/\$([^$]*)\$/g, '$1')}</span>
          <button type="button" aria-label="Clear block selection" title="Clear block selection" onClick={onClearCanvasTarget} className="shrink-0 rounded-full p-0.5 hover:bg-active hover:text-ink"><X size={12} /></button>
        </div>}
        {codeSelection&&<div aria-label="Selected code attachment" className="mb-2 rounded-lg border border-accent/40 bg-accent/5 p-2 text-xs text-ink"><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="text-ink-2">Asking about selected code</div><div className="mt-1 truncate font-mono font-medium">{codeSelection.path}:{codeSelection.start}–{codeSelection.end}</div></div><button type="button" aria-label="Clear code selection" onClick={()=>setCodeSelection(null)}><X size={13}/></button></div><pre className="mt-2 max-h-20 overflow-auto rounded border border-line bg-white p-2 font-mono text-[10px] leading-4">{codeSelection.text.split('\n').slice(0,4).map((line,i)=><div key={i}><span className="mr-2 text-ink-3">{codeSelection.start+i}</span>{colorLine(line)}</div>)}{codeSelection.end-codeSelection.start>=4&&<span className="text-ink-3">… {codeSelection.end-codeSelection.start+1} selected lines</span>}</pre></div>}
        {boardContext?.paper && <div className="mb-2 flex items-center gap-2 rounded border border-line p-2 text-xs"><span className="min-w-0 flex-1">Asking about: {boardContext.paper.title} / Page {boardContext.paper.page}</span><button type="button" aria-label="Clear paper context" onClick={boardContext.clearPaper}><X size={12} /></button></div>}
        {boardContext?.preview && <div className="relative mb-2 w-28" data-canvas-attachment>
          <img src={boardContext.preview} alt={boardContext.previewKind === 'paper' ? 'Selected paper region' : 'Selected canvas preview'} className="h-20 w-28 rounded-lg border border-line bg-white object-contain" />
          <button type="button" aria-label={boardContext.previewKind === 'paper' ? 'Remove paper selection' : 'Remove canvas image'} title="Remove image preview" onClick={boardContext.removeImage} className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-line bg-white text-ink-2 shadow-sm hover:bg-hover"><X size={12} /></button>
        </div>}
        {slash && <div className="relative"><slash.Picker apiRef={slashRef} input={input} setInput={setComposerInput} target={canvasTarget} run={slash.run} onFocusBlock={slash.focusBlock} onPrompt={prompt => send(prompt)} onHelp={slash.onHelp && (() => { setComposerInput(''); slash.onHelp(); })} /></div>}
        {dock && voice?.state === 'off' && voice.caption?.error && <div role="alert" data-voice-error className="mb-1.5 truncate text-xs text-fail">{voice.caption.error}</div>}
        <ChatComposer value={input} onChange={value => { boardContext?.pause(); setComposerInput(value); }} onSubmit={send} ready={!!command}
          onKeyDown={slash ? event => { if (command && event.key === 'Backspace' && !input) { event.preventDefault(); setCommand(null); return; } slashRef.current?.onKeyDown(event); } : undefined} inputRef={inputRef} autoFocus={autoFocus} placeholder={command ? 'Add details, or press Enter' : placeholder} busy={busy}
          dock={dock} onStop={dock ? () => answerFlight.current?.abort() : undefined}
          leading={<>
          <div className="relative shrink-0">
            <button
              type="button"
              aria-label="Add"
              disabled={voiceOn}
              onMouseDown={(e) => { e.stopPropagation(); setPlusOpen(!plusOpen); }}
              className={cn(dock ? COMPOSER_ADD : 'inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-line text-ink-2 hover:bg-hover hover:text-ink', plusOpen && 'bg-active text-ink', voiceOn && 'cursor-default opacity-45')}
            >
              <Plus size={14} strokeWidth={1.5} />
            </button>
            <Menu open={plusOpen} onClose={() => setPlusOpen(false)} className={dock ? 'bottom-11 left-0 w-64' : 'bottom-8 left-0 w-64'}>
              <MenuItem icon={Paperclip} disabled={privateChat || canvasChat} title={privateChat ? 'Attachments are not connected for private chat yet.' : canvasChat ? 'Attachments are not available on canvases yet. Upload a PDF from the canvas menu.' : undefined} onClick={() => { setPlusOpen(false); fileRef.current?.click(); }}>
                Add images, PDFs, or CSVs
              </MenuItem>
              <MenuItem icon={AtSign} disabled={privateChat || mentions.length >= MENTION_CHIPS} title={privateChat ? `This chat uses only the selected ${scope.run ? 'run' : 'app'}.` : mentions.length >= MENTION_CHIPS ? 'A question reads at most three mentioned apps.' : undefined} onClick={() => { setPlusOpen(false); setInput((v) => `${v}@`); inputRef.current?.focus(); }}>
                Mention an app
              </MenuItem>
            </Menu>
            <input
              ref={fileRef}
              type="file"
              accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.csv,.txt"
              className="hidden"
              onChange={(e) => { if (e.target.files[0]) setFile(e.target.files[0]); e.target.value = ''; }}
            />
          </div>
          {contextDocs.enabled && (
            <div className="relative shrink-0">
              <button type="button" aria-label="Context documents" title="Documents the agent reads" data-context-button disabled={voiceOn}
                onMouseDown={(e) => { e.stopPropagation(); setCtxOpen(!ctxOpen); }}
                className={cn(dock ? COMPOSER_ADD.replace(' w-9 ', ' min-w-9 ') : 'inline-flex h-6 min-w-6 cursor-pointer items-center justify-center rounded-full border border-line text-ink-2 hover:bg-hover hover:text-ink', 'gap-1 px-2', ctxOpen && 'bg-active text-ink', voiceOn && 'cursor-default opacity-45')}>
                <Files size={dock ? 16 : 14} strokeWidth={1.5} />
                {contextDocs.on > 0 && <span className="text-xs font-medium">{contextDocs.on}</span>}
              </button>
              <Menu open={ctxOpen} onClose={() => setCtxOpen(false)} className={dock ? 'bottom-11 left-0 w-[22rem] max-w-[92vw] p-1' : 'bottom-8 left-0 w-[22rem] max-w-[92vw] p-1'}>
                <ContextDocs context={contextDocs} />
              </Menu>
            </div>
          )}
          {srcOpts.length > 0 && (
            <div className="relative shrink-0">
              <button
                type="button"
                aria-label="Sources"
                title="What the agent reads"
                onMouseDown={(e) => { e.stopPropagation(); setSrcOpen(!srcOpen); }}
                className={cn('inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-ink-2 hover:bg-hover hover:text-ink', srcOpen && 'bg-active text-ink')}
              >
                <SlidersHorizontal size={14} strokeWidth={1.5} />
              </button>
              <Menu open={srcOpen} onClose={() => setSrcOpen(false)} className="bottom-8 left-0 w-64 p-2">
                <div className="pb-1.5 text-xs font-medium text-ink-2">Sources</div>
                {srcOpts.map(([k, label]) => {
                  const SI = SOURCE_ICON[k];
                  return (
                  <div key={k} className="flex h-7 items-center justify-between text-sm">
                    <span className="flex items-center gap-2">{SI && <SI size={14} strokeWidth={1.5} className="text-ink-2" />}{label}</span>
                    <Toggle
                      aria-label={label}
                      on={srcOn.has(k)}
                      onChange={() => setSrcOn((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; })}
                    />
                  </div>
                  );
                })}
                <div className="pt-1.5 text-xs text-ink-3">{privateChat
                  ? `${scope.run ? 'Run details' : 'Job definition'} always included. Choose additional evidence above.`
                  : "The agent only reads what's on here."}</div>
              </Menu>
            </div>
          )}
          {dock && chatControl}
          {dock && voice && voice.state === 'off' && <VoiceToggle voice={voice} disabled={busy} />}
          </>}
          voice={voiceOn ? <VoiceField voice={voice} /> : null}
          trailing={dock ? null : chatControl}
        />
      </div>
      </>)}
    </div>
  );
}
