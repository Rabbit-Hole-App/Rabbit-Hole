// ─── Ask (phase 1 — read only): the chat panel behind the Agent tab, the run
// peek's ask box, and ⌘K's Ask tab. POST /api/ask streams SSE; org-scope
// ambiguity comes back as { choose } and renders candidate pills. ───
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';
import { Avatar, cn } from './ui.jsx';

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

export function Md({ text }) {
  const lines = String(text).split('\n');
  const out = [];
  let bullets = null;
  lines.forEach((l, i) => {
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
      out.push(<div key={i} className="pt-1 text-xs text-ink-3">{l}</div>);
    } else if (l.trim()) {
      out.push(<p key={i} className="my-1">{inline(l)}</p>);
    }
  });
  if (bullets) out.push(<ul key="ul-end" className="my-1 list-disc pl-5">{bullets}</ul>);
  return <div className="text-sm leading-normal">{out}</div>;
}

// One chat, scoped: {app} | {run} | {} (org). Style per the Notion AI reference —
// user turns as a right-aligned bubble, answers as plain text, pill input at the bottom.
export function AskPanel({ scope, email, placeholder = 'Ask anything…', compact = false, autoFocus = false }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState(null); // { message, candidates }
  const threadId = useRef(null);
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    window.addEventListener('small:ask-focus', focus);
    return () => window.removeEventListener('small:ask-focus', focus);
  }, []);
  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [msgs]);

  const send = async (message, scopeOverride) => {
    if (!message.trim() || busy) return;
    setChoices(null);
    setBusy(true);
    setInput('');
    setMsgs((m) => [...m, { role: 'user', content: message }, { role: 'assistant', content: '' }]);
    const append = (t) => setMsgs((m) => {
      const next = m.slice();
      next[next.length - 1] = { ...next[next.length - 1], content: next[next.length - 1].content + t };
      return next;
    });
    try {
      const r = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: scopeOverride || scope, message, thread_id: threadId.current }),
      });
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
      <div ref={boxRef} className="min-h-0 flex-1 overflow-y-auto">
        {msgs.length === 0 && !choices && (
          <div className="py-3 text-sm text-ink-2">
            Ask about {scope.run ? 'this run — what happened, why it failed, what changed.' : scope.app ? 'this app — runs, logs, schedule, who has access.' : 'your workspace — any app, run, or person.'}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cn('py-1.5', m.role === 'user' && 'flex justify-end')}>
            {m.role === 'user' ? (
              <span className="max-w-[85%] rounded-lg bg-hover px-3 py-1.5 text-sm">{m.content}</span>
            ) : m.content ? (
              <Md text={m.content} />
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
      <form
        className="mt-2 flex shrink-0 items-center gap-2 rounded-lg border border-line px-3 py-1.5 focus-within:border-line-strong focus-within:shadow-[0_0_0_2px_rgba(35,131,226,0.2)]"
        onSubmit={(e) => { e.preventDefault(); send(input); }}
      >
        {email && <Avatar email={email} />}
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          className="h-7 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
        />
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
  );
}
