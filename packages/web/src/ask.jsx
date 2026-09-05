// ─── Ask (phase 1 — read only): the chat panel behind the Agent tab, the run
// peek's ask box, and ⌘K's Ask tab. POST /api/ask streams SSE; org-scope
// ambiguity comes back as { choose } and renders candidate pills. ───
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, AtSign, Copy, History, Loader2, MoreHorizontal, Paperclip, Pencil, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { ago, api } from './api.js';
import { cn, CodeBlock, ConfirmDialog, KindIcon, Menu, MenuItem, SlidePanel, Toggle } from './ui.jsx';

// What the agent may read, per scope — the ⚙ picker mirrors Notion's "My sources".
const SOURCE_OPTIONS = {
  run: [['log', 'Log'], ['outputs', 'Outputs'], ['runbook', 'Runbook'], ['review', 'Review'], ['agent', 'AGENT.md']],
  app: [['runs', 'Runs'], ['requests', 'Request log'], ['runbook', 'Runbook'], ['review', 'Review'], ['agent', 'AGENT.md']],
};

// Model picker keys → labels (server holds the allowlist; auto = default).
const MODELS = [['auto', 'Auto'], ['opus-5', 'Opus 5'], ['sonnet-5', 'Sonnet 5'], ['haiku-4.5', 'Haiku 4.5']];

// Tiny safe markdown: **bold**, `code`, "- " bullets. Built as elements — no HTML injection.
function inline(s) {
  return s.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="rounded-xs bg-code px-1 font-mono text-[0.9em]">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    return part;
  });
}

// A source token like "job.py:15" or "small.toml" — clickable when onFile is wired.
const FILE_TOKEN = /^([\w./-]+\.(?:py|toml|txt|md|json|csv|cfg|ini|yaml|yml))(?::(\d+)(?:-(\d+))?)?$/;

function SourcesLine({ text, onFile }) {
  const [head, rest] = [text.slice(0, 9), text.slice(9)]; // "Sources: "
  const parts = rest.split(/([,;]\s*)/);
  return (
    <div className="pt-1 text-xs text-ink-3">
      {head}
      {parts.map((p, i) => {
        const m = onFile && p.trim().match(FILE_TOKEN);
        return m ? (
          <button
            key={i}
            type="button"
            onClick={() => onFile(m[1], m[2] ? Number(m[2]) : null, m[3] ? Number(m[3]) : null)}
            className="cursor-pointer text-ink-2 hover:text-ink hover:underline"
          >
            {p}
          </button>
        ) : (
          <span key={i}>{p}</span>
        );
      })}
    </div>
  );
}

export function Md({ text, onFile }) {
  const lines = String(text).split('\n');
  const out = [];
  let bullets = null;
  let fence = null; // collecting a ``` block
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
    if (/^\s*[-*] /.test(l)) {
      bullets = bullets || [];
      bullets.push(<li key={i}>{inline(l.replace(/^\s*[-*] /, ''))}</li>);
      return;
    }
    if (bullets) {
      out.push(<ul key={`ul${i}`} className="my-1 list-disc pl-5">{bullets}</ul>);
      bullets = null;
    }
    if (l.startsWith('Sources: ')) {
      out.push(<SourcesLine key={i} text={l} onFile={onFile} />);
    } else if (l.trim()) {
      out.push(<p key={i} className="my-1">{inline(l)}</p>);
    }
  });
  if (fence) out.push(<CodeBlock key="f-end" className="my-1.5 text-xs">{fence.map((fl, j) => <div key={j}>{colorLine(fl)}</div>)}</CodeBlock>);
  if (bullets) out.push(<ul key="ul-end" className="my-1 list-disc pl-5">{bullets}</ul>);
  return <div className="text-sm leading-normal">{out}</div>;
}

// Tiny per-line tokenizer for the file peek — comments, strings, keywords,
// numbers. React spans only, no HTML. ponytail: no multi-line strings, and
// python keywords double for toml well enough.
const PY_TOKEN = /(#.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(def|class|import|from|return|if|elif|else|for|while|try|except|finally|with|as|in|not|and|or|None|True|False|lambda|raise|pass|break|continue|global|yield|assert|del|is|print)\b|\b(\d+(?:\.\d+)?)\b/g;
const TOKEN_COLOR = { c: '#9B9A97', s: '#448361', k: '#9065B0', n: '#D9730D' };

function colorLine(line) {
  const out = [];
  let last = 0;
  for (const m of line.matchAll(PY_TOKEN)) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const kind = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'k' : 'n';
    out.push(<span key={m.index} style={{ color: TOKEN_COLOR[kind] }}>{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out.length ? out : ' ';
}

// The cited file in a side panel, scrolled to (and highlighting) the cited line.
function FilePeek({ appName, path, line, lineEnd, onClose }) {
  const hi = (n) => line && n >= line && n <= (lineEnd || line);
  const [content, setContent] = useState(null);
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
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        {err && <div className="text-sm text-ink-2">✗ {err}</div>}
        {content == null && !err && <Loader2 size={14} className="animate-spin text-ink-3" />}
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

// After an approved run: live result right in the chat — status, log tail,
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

// compact copy of the run peek's output renderer (kept local — run.jsx imports us)
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

// One chat, scoped: {app} | {run} | {} (org). Style per the Notion AI reference —
// user turns as a right-aligned bubble, answers as plain text, pill input at the bottom.
export function AskPanel({ scope, appName = null, placeholder = 'Ask anything…', compact = false, autoFocus = false }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState(null); // { message, candidates }
  const [file, setFile] = useState(null); // one attachment per question
  const [mentions, setMentions] = useState([]); // @app chips
  const [plusOpen, setPlusOpen] = useState(false);
  const [threads, setThreads] = useState([]); // past chats for this scope
  const [view, setView] = useState('chat'); // 'chat' | 'history' — history REPLACES the chat
  const [rowMenu, setRowMenu] = useState(null); // thread id with its ⋯ open
  const [renaming, setRenaming] = useState(null); // { id, value }
  const [confirmDel, setConfirmDel] = useState(null); // thread pending delete
  const [filePeek, setFilePeek] = useState(null); // { path, line } from a Sources click
  const fileApp = appName || scope.app || null; // /api/ask/file needs the app name
  const scopeKind = scope.run ? 'run' : scope.app ? 'app' : 'org';
  const scopeRef = scope.run || scope.app || null;
  const srcOpts = SOURCE_OPTIONS[scopeKind] || [];
  const [srcOn, setSrcOn] = useState(() => new Set(srcOpts.map(([k]) => k)));
  const [srcOpen, setSrcOpen] = useState(false);
  const [model, setModel] = useState('auto');
  const [modelOpen, setModelOpen] = useState(false);
  const [appNames, setAppNames] = useState(null); // lazy, for @-mentions
  const threadId = useRef(null);
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);

  // "@yol" at the end of the input → app-name suggestions
  const atMatch = input.match(/@([a-z0-9-]*)$/);
  useEffect(() => {
    if (atMatch && appNames === null) api('/api/apps').then((d) => setAppNames(d.apps.map((a) => ({ name: a.name, kind: a.kind, schedule: a.schedule })))).catch(() => setAppNames([]));
  }, [!!atMatch]);
  const atHits = atMatch && appNames ? appNames.filter((a) => a.name.includes(atMatch[1])) : [];

  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    window.addEventListener('small:ask-focus', focus);
    return () => window.removeEventListener('small:ask-focus', focus);
  }, []);

  // chats persist in D1 — resume the latest thread for this scope on mount
  const loadThread = async (id, toChat = true) => {
    try {
      const d = await api(`/api/ask/threads/${id}`);
      threadId.current = d.id;
      setMsgs(d.messages);
      setChoices(null);
      if (toChat) setView('chat'); // the silent resume-on-mount must not yank the user out of History
    } catch { /* stale id — stay on the empty chat */ }
  };
  useEffect(() => {
    api(`/api/ask/threads?scope=${scopeKind}${scopeRef ? `&ref=${encodeURIComponent(scopeRef)}` : ''}`)
      .then(async (d) => {
        setThreads(d.threads || []);
        if (d.threads?.[0]) await loadThread(d.threads[0].id, false);
      })
      .catch(() => {});
  }, [scopeKind, scopeRef]);
  const newChat = () => { threadId.current = null; setMsgs([]); setChoices(null); setView('chat'); };
  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [msgs]);

  const send = async (raw, scopeOverride) => {
    // @-chips ride at the front of the message text
    const message = [...mentions.map((m) => `@${m}`), raw.trim()].filter(Boolean).join(' ');
    if (!message || busy) return;
    setChoices(null);
    setBusy(true);
    setInput('');
    setMentions([]);
    const attached = file;
    setFile(null);
    setMsgs((m) => [...m, { role: 'user', content: attached ? `${message} 📎 ${attached.name}` : message }, { role: 'assistant', content: '' }]);
    const append = (t) => setMsgs((m) => {
      const next = m.slice();
      next[next.length - 1] = { ...next[next.length - 1], content: next[next.length - 1].content + t };
      return next;
    });
    try {
      const payload = {
        scope: scopeOverride || scope,
        message,
        thread_id: threadId.current,
        ...(srcOpts.length && srcOn.size < srcOpts.length ? { sources: [...srcOn] } : {}),
        ...(model !== 'auto' ? { model } : {}),
      };
      let r;
      if (attached) {
        const fd = new FormData();
        fd.append('body', JSON.stringify(payload));
        fd.append('file', attached);
        r = await fetch('/api/ask', { method: 'POST', body: fd });
      } else {
        r = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      if ((r.headers.get('Content-Type') || '').includes('json')) {
        const d = await r.json();
        if (d.choose) {
          setMsgs((m) => m.slice(0, -2)); // no turn happened yet — the pills replace it
          setChoices({ message, candidates: d.choose });
        } else {
          append(`✗ ${d.error || `HTTP ${r.status}`}`);
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
          if (type === 'chunk') append(d.text);
          else if (type === 'proposal') setMsgs((m) => [...m, { role: 'proposal', proposal: d }]);
          else if (type === 'done' && d.threadId) threadId.current = d.threadId;
          else if (type === 'error') append(`✗ ${d.error}`);
        }
      }
    } catch (e) {
      append(`✗ ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn('flex min-h-0 flex-col', compact ? 'max-h-[320px]' : 'flex-1')}>
      {!compact && (msgs.length > 0 || threads.length > 0) && (
        <div className="flex shrink-0 items-center justify-end gap-1 pb-1">
          {threads.length > 0 && (
            <button
              onClick={() => setView(view === 'history' ? 'chat' : 'history')}
              className={cn('flex h-6 cursor-pointer items-center gap-1 rounded-sm px-1.5 text-xs text-ink-2 hover:bg-hover hover:text-ink', view === 'history' && 'bg-active text-ink')}
            >
              <History size={12} strokeWidth={1.5} /> {view === 'history' ? 'Back to chat' : 'History'}
            </button>
          )}
          <button onClick={newChat} className="flex h-6 cursor-pointer items-center gap-1 rounded-sm px-1.5 text-xs text-ink-2 hover:bg-hover hover:text-ink">
            <Plus size={12} strokeWidth={1.5} /> New chat
          </button>
        </div>
      )}
      {compact && msgs.length > 0 && (
        <div className="flex shrink-0 justify-end pb-1">
          <button onClick={newChat} className="flex h-6 cursor-pointer items-center gap-1 rounded-sm px-1.5 text-xs text-ink-2 hover:bg-hover hover:text-ink">
            Clear chat
          </button>
        </div>
      )}
      {filePeek && <FilePeek appName={fileApp} path={filePeek.path} line={filePeek.line} lineEnd={filePeek.lineEnd} onClose={() => setFilePeek(null)} />}
      {confirmDel && (
        <ConfirmDialog
          title="Delete this chat?"
          body={`"${confirmDel.title.slice(0, 80)}" and its messages are removed for good. Approved actions stay in the log.`}
          onConfirm={async () => {
            const t = confirmDel;
            setConfirmDel(null);
            try {
              await api(`/api/ask/threads/${t.id}/delete`, { method: 'POST' });
              setThreads((ts) => ts.filter((x) => x.id !== t.id));
              if (threadId.current === t.id) newChat();
            } catch { /* row stays if the delete failed */ }
          }}
          onCancel={() => setConfirmDel(null)}
        />
      )}
      {view === 'history' && (
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
                      await api(`/api/ask/threads/${t.id}/rename`, { method: 'POST', body: JSON.stringify({ title }) });
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
                className="mr-0.5 inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-sm text-ink-2 opacity-0 group-hover/h:opacity-100 hover:bg-hover hover:text-ink"
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
      {view === 'chat' && (<>
      <div ref={boxRef} className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {msgs.length === 0 && !choices && (
          <div className="py-3 text-sm text-ink-2">
            Ask about {scope.run ? 'this run — what happened, why it failed, what changed.' : scope.app ? 'this app — runs, logs, schedule, who has access.' : 'your workspace — any app, run, or person.'}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cn('py-1.5', m.role === 'user' && 'flex justify-end')}>
            {m.role === 'user' ? (
              <span className="max-w-[85%] rounded-lg bg-hover px-3 py-1.5 text-sm">{m.content}</span>
            ) : m.role === 'proposal' ? (
              <ProposalCard
                proposal={m.proposal}
                onDone={(r) => setMsgs((ms) => ms.map((x, j) => (j === i ? (r?.runId ? { role: 'run', runId: r.runId } : { role: 'assistant', content: r }) : x)))}
                onChange={(text) => { setMsgs((ms) => ms.filter((_, j) => j !== i)); setInput(text); inputRef.current?.focus(); }}
              />
            ) : m.role === 'run' ? (
              <RunResultCard runId={m.runId} app={fileApp ? { name: fileApp } : null} />
            ) : m.content ? (
              <Md text={m.content} onFile={fileApp ? (path, ln, lnEnd) => setFilePeek({ path, line: ln, lineEnd: lnEnd }) : null} />
            ) : (
              <Loader2 size={14} className="animate-spin text-ink-3" />
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
      </div>
      <div className="relative mt-2 shrink-0">
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
        <form
          className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 focus-within:border-line-strong focus-within:shadow-[0_0_0_2px_rgba(35,131,226,0.2)]"
          onSubmit={(e) => { e.preventDefault(); send(input); }}
        >
          <div className="relative shrink-0">
            <button
              type="button"
              aria-label="Add"
              onMouseDown={(e) => { e.stopPropagation(); setPlusOpen(!plusOpen); }}
              className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-line text-ink-2 hover:bg-hover hover:text-ink"
            >
              <Plus size={14} strokeWidth={1.5} />
            </button>
            <Menu open={plusOpen} onClose={() => setPlusOpen(false)} className="bottom-8 left-0 w-64">
              <MenuItem icon={Paperclip} onClick={() => { setPlusOpen(false); fileRef.current?.click(); }}>
                Add images, PDFs, or CSVs
              </MenuItem>
              <MenuItem icon={AtSign} onClick={() => { setPlusOpen(false); setInput((v) => `${v}@`); inputRef.current?.focus(); }}>
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
          {srcOpts.length > 0 && (
            <div className="relative shrink-0">
              <button
                type="button"
                aria-label="Sources"
                title="What the agent reads"
                onMouseDown={(e) => { e.stopPropagation(); setSrcOpen(!srcOpen); }}
                className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-ink-2 hover:bg-hover hover:text-ink"
              >
                <SlidersHorizontal size={14} strokeWidth={1.5} />
              </button>
              <Menu open={srcOpen} onClose={() => setSrcOpen(false)} className="bottom-8 left-0 w-64 p-2">
                <div className="pb-1.5 text-xs font-medium text-ink-2">Sources</div>
                {srcOpts.map(([k, label]) => (
                  <div key={k} className="flex h-7 items-center justify-between text-sm">
                    {label}
                    <Toggle
                      on={srcOn.has(k)}
                      onChange={() => setSrcOn((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; })}
                    />
                  </div>
                ))}
                <div className="pt-1.5 text-xs text-ink-3">The agent only reads what's on here.</div>
              </Menu>
            </div>
          )}
          <input
            ref={inputRef}
            autoFocus={autoFocus}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholder}
            className="h-7 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
          />
          <div className="relative shrink-0">
            <button
              type="button"
              onMouseDown={(e) => { e.stopPropagation(); setModelOpen(!modelOpen); }}
              className="h-6 cursor-pointer rounded-sm px-1.5 text-xs text-ink-2 hover:bg-hover hover:text-ink"
            >
              {MODELS.find(([k]) => k === model)?.[1]}
            </button>
            <Menu open={modelOpen} onClose={() => setModelOpen(false)} className="right-0 bottom-8 w-40">
              {MODELS.map(([k, label]) => (
                <MenuItem key={k} type="button" onClick={() => { setModel(k); setModelOpen(false); }}>
                  <span className={cn(k === model && 'font-medium')}>{label}</span>
                </MenuItem>
              ))}
            </Menu>
          </div>
          <button
            type="submit"
            aria-label="Send"
            disabled={busy || !input.trim()}
            className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full bg-accent text-white disabled:opacity-30"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <ArrowUp size={13} strokeWidth={2} />}
          </button>
        </form>
      </div>
      </>)}
    </div>
  );
}
