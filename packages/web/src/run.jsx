// ─── The run surface: Run tab form (from [inputs]), run side peek / full page,
// and the runs database (Logs tab, jobs). Design: design/flow.md §3b/3c/§4. ───
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowUpDown, Calendar, Circle, Clock, Copy as CopyIcon, Download, Eye,
  File as FileIcon, Filter as FilterIcon, Folder, Hash, Inbox, Loader2, Maximize2, MessageCircle,
  Paperclip, Play, Plus, Search as SearchIcon, Type, User, X,
} from 'lucide-react';
import { ago, api, fmtTime, navigate } from './api.js';
import { AskPanel } from './ask.jsx';
import {
  Avatar, Button, Chk, cn, CodeBlock, Dropzone, Field, fmtBytes, IconBtn, Input,
  Menu, MenuItem, Pill, Select, SkeletonRows, SlidePanel, Slider, StatusPill, toast, Toggle,
} from './ui.jsx';

const shortId = (id) => String(id || '').replace(/^r-/, '').slice(0, 7);
const secs = (a, b) => (a && b ? Math.max(0, (new Date(b.replace(' ', 'T') + 'Z') - new Date(a.replace(' ', 'T') + 'Z')) / 1000) : null);
export const fmtDur = (s) => (s == null ? '-' : s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`);

// Type icons match the plist reference: 📎 file, # number, Aa text/select, date, bool.
const TYPE_ICON = { file: Paperclip, number: Hash, select: Type, text: Type, date: Calendar, bool: Circle };

// "7 days ago" beside a date input. Accepts YYYY-MM-DD or the CLI's relative -7d.
function relDate(v) {
  if (!v) return '';
  const m = String(v).match(/^-(\d+)d$/);
  if (m) return `${m[1]} day${m[1] === '1' ? '' : 's'} ago`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return '';
  const days = Math.round((Date.now() - new Date(v + 'T00:00:00').getTime()) / 86400000);
  if (days === 0) return 'today';
  return days > 0 ? `${days} day${days === 1 ? '' : 's'} ago` : `in ${-days} day${days === -1 ? '' : 's'}`;
}

const startedName = (email) => (email === 'cron' ? 'cron' : (email || '').split('@')[0]);
const Person = ({ email }) => (
  <span className="inline-flex items-center gap-1.5">
    {email === 'cron'
      ? <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-hover ring-1 ring-white"><Clock size={12} className="text-ink-2" /></span>
      : <Avatar email={email || '?'} />}
    {startedName(email)}
  </span>
);

// ─── Client-side validation, mirroring the CLI's inputs.js semantics. ───
function validateOne(spec, value, file) {
  const empty = value == null || value === '' || (Array.isArray(value) && !value.length);
  if (spec.type === 'file') {
    if (spec.required && !file) return 'required';
    if (file && spec.accept) {
      const ok = spec.accept.split(',').some((ext) => file.name.toLowerCase().endsWith(ext.trim().toLowerCase()));
      if (!ok) return `must be ${spec.accept}`;
    }
    return null;
  }
  if (spec.type === 'bool') return null;
  if (spec.required && empty) return 'required';
  if (empty) return null;
  if (spec.type === 'number') {
    const n = Number(value);
    if (Number.isNaN(n)) return 'must be a number';
    if (spec.min != null && n < spec.min) return `must be at least ${spec.min}`;
    if (spec.max != null && n > spec.max) return `must be at most ${spec.max}`;
  }
  if (spec.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value) && !/^-\d+d$/.test(value)) return 'use YYYY-MM-DD or -7d';
  if (spec.type === 'text' && spec.pattern && !new RegExp(`^(?:${spec.pattern})$`).test(value)) return `must match ${spec.pattern}`;
  if (spec.type === 'select' && !spec.multiple && spec.options && !spec.options.map(String).includes(String(value)))
    return `must be one of ${spec.options.join(', ')}`;
  return null;
}

const defaultValue = (spec) => {
  if (spec.type === 'bool') return spec.default ?? false;
  if (spec.type === 'select' && spec.multiple) return spec.default ?? [];
  return spec.default ?? '';
};

// ─── s3:// text input with autocomplete: the control plane lists one level under
// the typed uri via the app's [aws] role. Pasting a full uri works unchanged;
// no role / no access → no suggestions, still a plain text field. ───
function S3Input({ app, value, onChange, onBlur, error, label }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const timer = useRef(null);
  const focused = useRef(false); // a slow list response must not reopen after blur/Esc
  const look = (v) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        // browse from the very first click: empty/partial uris list buckets server-side
        const d = await api(`/api/apps/${app.name}/s3-list?uri=${encodeURIComponent(/^s3:\/\/[^/]+\//.test(v) ? v : '')}`);
        setItems(d.items || []);
        setOpen(focused.current);
        setHi(-1);
      } catch { setItems([]); setOpen(false); }
    }, 250);
  };
  const pick = (it) => {
    onChange(it.uri);
    if (it.dir) look(it.uri);
    else { setOpen(false); setItems([]); }
  };
  // ← one level up: s3://b/x/y/ → s3://b/x/ → s3://b/ → bucket list
  const atRoot = !/^s3:\/\/[^/]+\//.test(value);
  const up = () => {
    const parent = value.replace(/[^/]+\/?$/, '');
    onChange(/^s3:\/\/[^/]*\/?$/.test(parent) && !/^s3:\/\/[^/]+\/$/.test(parent) ? '' : parent);
    look(parent);
  };
  // while typing a bare bucket name, filter the browse list client-side
  const shown = /^s3:\/\/[^/]*$/.test(value) && value.length > 5
    ? items.filter((it) => it.uri.startsWith(value))
    : items;
  const ext = (value.match(/^s3:\/\/[^/]+\/.+\.(\w+)$/i) || [])[1]?.toLowerCase();
  const preview = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? 'image'
    : ext === 'pdf' ? 'pdf'
    : ['json', 'txt', 'csv'].includes(ext) ? 'text'
    : null;
  return (
    <div className="relative">
      <Input
        value={value}
        title={value || undefined}
        onChange={(e) => { onChange(e.target.value); look(e.target.value); }}
        onFocus={() => { focused.current = true; look(value); }}
        onBlur={() => { focused.current = false; setTimeout(() => setOpen(false), 150); onBlur?.(); }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, shown.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, -1)); }
          else if (e.key === 'Enter' && hi >= 0 && shown[hi]) { e.preventDefault(); pick(shown[hi]); }
          else if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="s3://bucket/key"
        className={error ? 'border-danger' : undefined}
        aria-label={label}
      />
      {open && (shown.length > 0 || !atRoot) && (
        // w-max: suggestions grow past the 320px control so full uris stay readable
        <div className="absolute left-0 z-20 mt-1 max-h-56 w-max min-w-full max-w-[600px] overflow-y-auto rounded-md bg-white p-1 shadow-pop">
          {!atRoot && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); up(); }}
              className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm text-ink-2 hover:bg-hover"
            >
              <ArrowLeft size={16} strokeWidth={1.5} className="shrink-0 text-ink-3" /> Back
            </button>
          )}
          {shown.map((it, i) => (
            <button
              key={it.uri}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(it); }}
              className={cn('flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-hover', i === hi && 'bg-hover')}
            >
              {it.dir
                ? <Folder size={16} strokeWidth={1.5} className="shrink-0 text-ink-3" />
                : <FileIcon size={16} strokeWidth={1.5} className="shrink-0 text-ink-3" />}
              <span className="min-w-0 flex-1 truncate" title={it.uri}>{it.uri}</span>
              {!it.dir && it.size != null && <span className="shrink-0 text-xs text-ink-2">{fmtBytes(it.size)}</span>}
            </button>
          ))}
        </div>
      )}
      {/* picked something previewable? render it under the field (proxied through the app's role);
          the open dropdown overlays it, so no need to gate on it */}
      {preview && <S3Preview app={app} uri={value} kind={preview} />}
    </div>
  );
}

// Inline preview by extension: images and pdf render, small json/txt/csv show as
// a code block. The proxy refuses anything else or oversized - we just go quiet.
function S3Preview({ app, uri, kind }) {
  const url = `/api/apps/${app.name}/s3-object?uri=${encodeURIComponent(uri)}`;
  const [text, setText] = useState(null);
  useEffect(() => {
    setText(null);
    if (kind !== 'text') return;
    let stop = false;
    fetch(url).then((r) => (r.ok ? r.text() : null)).then((t) => !stop && setText(t)).catch(() => {});
    return () => { stop = true; };
  }, [url, kind]);
  if (kind === 'image') {
    return (
      <img
        src={url}
        alt=""
        className="mt-2 max-h-[200px] max-w-full rounded-sm border border-line"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
        onLoad={(e) => { e.currentTarget.style.display = ''; }}
      />
    );
  }
  if (kind === 'pdf') return <embed src={url} type="application/pdf" className="mt-2 h-[280px] w-full rounded-sm border border-line" />;
  if (text == null) return null;
  return <CodeBlock className="mt-2 max-h-[200px] overflow-y-auto">{text}</CodeBlock>;
}

// ─── Run tab (flow.md §3b): the form generated from [inputs]. ───
export function RunForm({ app, prefill, onStarted }) {
  const schema = app.inputs || {};
  const entries = Object.entries(schema);
  const [values, setValues] = useState(() => Object.fromEntries(entries.map(([k, s]) => [k, defaultValue(s)])));
  const [files, setFiles] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k, v) => { setValues((s) => ({ ...s, [k]: v })); setErrors((e) => ({ ...e, [k]: null })); };

  // Prefill from "Run again": scalar values land; file fields must be re-picked.
  useEffect(() => {
    const from = prefill || JSON.parse(sessionStorage.getItem(`small.runPrefill.${app.name}`) || 'null');
    sessionStorage.removeItem(`small.runPrefill.${app.name}`);
    if (!from) return;
    setValues((s) => {
      const next = { ...s };
      for (const [k, v] of Object.entries(from)) if (schema[k] && schema[k].type !== 'file') next[k] = v;
      return next;
    });
  }, [prefill, app.name]);

  const submit = async () => {
    const errs = {};
    for (const [k, spec] of entries) {
      const e = validateOne(spec, values[k], files[k]);
      if (e) errs[k] = e;
    }
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    const vals = {};
    for (const [k, spec] of entries) {
      if (spec.type === 'file') { if (files[k]) vals[k] = files[k].name; continue; }
      if (spec.type === 'bool') { vals[k] = !!values[k]; continue; }
      const v = values[k];
      if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
      vals[k] = spec.type === 'number' ? Number(v) : v;
    }
    setBusy(true);
    try {
      let d;
      const fileEntries = Object.entries(files).filter(([, f]) => f);
      if (fileEntries.length) {
        const fd = new FormData();
        fd.append('body', JSON.stringify({ app: app.name, inputs: vals }));
        for (const [k, f] of fileEntries) fd.append(`input:${k}`, f);
        const r = await fetch('/api/runs', { method: 'POST', body: fd });
        d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      } else {
        d = await api('/api/runs', { method: 'POST', body: JSON.stringify({ app: app.name, inputs: Object.keys(vals).length ? vals : undefined }) });
      }
      onStarted(d.runId);
    } catch (e) {
      toast(`✗ ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const lr = app.lastRun;
  const lrDur = lr && fmtDur(secs(lr.startedAt, lr.finishedAt));
  return (
    <div>
      {entries.map(([k, spec]) => (
        <Field key={k} label={k.replace(/_/g, ' ')} help={spec.help || (spec.required ? undefined : 'optional')} error={errors[k]}>
          {spec.type === 'file' && <Dropzone accept={spec.accept} file={files[k]} onFile={(f) => { setFiles((s) => ({ ...s, [k]: f })); setErrors((e) => ({ ...e, [k]: null })); }} />}
          {spec.type === 'number' && (spec.min != null && spec.max != null
            ? <Slider min={spec.min} max={spec.max} value={values[k]} onChange={(v) => set(k, v)} inputProps={{ 'aria-label': k, className: errors[k] ? 'border-danger' : undefined }} />
            : <Input inputMode="decimal" value={values[k]} onChange={(e) => set(k, e.target.value)} aria-label={k} className={errors[k] ? 'border-danger' : undefined} />)}
          {spec.type === 'select' && !spec.multiple && <Select value={values[k]} options={spec.options || []} onChange={(v) => set(k, v)} />}
          {spec.type === 'select' && spec.multiple && (
            <div className="flex flex-col gap-1 pt-1.5">
              {(spec.options || []).map((o) => {
                const on = (values[k] || []).includes(o);
                return (
                  <label key={String(o)} className="flex h-6 cursor-pointer items-center gap-2 text-sm" onClick={() => set(k, on ? values[k].filter((x) => x !== o) : [...(values[k] || []), o])}>
                    <Chk on={on} /> {String(o)}
                  </label>
                );
              })}
            </div>
          )}
          {spec.type === 'date' && (
            <div className="flex items-center gap-2">
              <Input type="date" className={cn('w-[140px]', errors[k] && 'border-danger')} value={/^\d{4}-\d{2}-\d{2}$/.test(values[k]) ? values[k] : ''} onChange={(e) => set(k, e.target.value)} aria-label={k} />
              <span className="text-xs text-ink-2">{relDate(values[k])}</span>
            </div>
          )}
          {spec.type === 'bool' && <div className="pt-2"><Toggle on={!!values[k]} onChange={(v) => set(k, v)} aria-label={k} /></div>}
          {spec.type === 'text' && (spec.pattern || '').includes('s3://') && (
            <S3Input
              app={app}
              value={values[k]}
              onChange={(v) => set(k, v)}
              onBlur={() => setErrors((er) => ({ ...er, [k]: validateOne(spec, values[k]) }))}
              error={errors[k]}
              label={k}
            />
          )}
          {spec.type === 'text' && !(spec.pattern || '').includes('s3://') && (
            <Input
              value={values[k]}
              onChange={(e) => set(k, e.target.value)}
              onBlur={() => setErrors((er) => ({ ...er, [k]: validateOne(spec, values[k]) }))}
              className={errors[k] ? 'border-danger' : undefined}
              aria-label={k}
            />
          )}
        </Field>
      ))}
      <div className={cn('flex items-center gap-3', entries.length && 'pt-4')}>
        <Button variant="primary" disabled={busy} onClick={submit}>
          {busy ? <Loader2 size={16} strokeWidth={1.5} className="animate-spin" /> : <Play size={16} strokeWidth={1.5} />} Run
        </Button>
      </div>
      {lr && (
        <div className="flex flex-wrap items-center gap-1 pt-3 text-sm text-ink-2">
          Last run {ago(lr.startedAt)}{lr.startedBy ? ` by ${startedName(lr.startedBy)}` : ''}
          {lr.status === 'running' ? <> · <StatusPill status="running" /></> : ` · ${lr.status}${lrDur !== '-' ? ` in ${lrDur}` : ''}`}
        </div>
      )}
    </div>
  );
}

// ─── Poll a run: status + appended log lines every second while running. ───
function useRun(runId) {
  const [meta, setMeta] = useState(null);
  const [lines, setLines] = useState([]);
  const cursor = useRef(-1);
  useEffect(() => {
    cursor.current = -1;
    setMeta(null);
    setLines([]);
    let stop = false;
    let loaded = false;
    const tick = async () => {
      try {
        const d = await api(`/api/runs/${runId}?after=${cursor.current}`);
        if (stop) return;
        loaded = true;
        cursor.current = d.cursor;
        setMeta(d);
        if (d.lines.length) setLines((l) => [...l, ...d.lines]);
        if (d.status === 'running') setTimeout(() => !stop && tick(), 1000);
      } catch (e) {
        if (stop) return;
        // a transient blip mid-run keeps the last good view and retries; only a
        // failed FIRST fetch (bad id, no access) surfaces as an error
        if (loaded) setTimeout(() => !stop && tick(), 2000);
        else setMeta({ error: e.message });
      }
    };
    tick();
    return () => { stop = true; };
  }, [runId]);
  return { meta, lines };
}

// One output: <2MB images inline at 200px, small .json/.csv/.txt in a code block,
// everything else a download row.
function Output({ runId, name, size, label }) {
  const url = `/api/runs/${runId}/outputs/${encodeURIComponent(name)}`;
  const isImg = /\.(jpe?g|png|gif|webp)$/i.test(name) && size < 2 * 1024 * 1024; // no svg - served nosniff, won't render
  const isText = /\.(json|csv|txt)$/i.test(name) && size < 4096;
  const [text, setText] = useState(null);
  useEffect(() => {
    if (isText) fetch(url).then((r) => r.text()).then(setText).catch(() => {});
  }, [url, isText]);
  return (
    <div className="pb-2">
      <div className="flex h-8 items-center gap-1.5 text-sm">
        <Paperclip size={16} strokeWidth={1.5} className="shrink-0 text-ink-3" />
        <span className="min-w-0 truncate">{label || name}</span>
        <span className="text-xs text-ink-2">{fmtBytes(size)}</span>
        <a href={url} download={name} className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-ink-2 hover:bg-hover hover:text-ink" aria-label={`Download ${name}`}>
          <Download size={16} strokeWidth={1.5} />
        </a>
      </div>
      {isImg && <a href={url} target="_blank" rel="noopener"><img src={url} alt={name} className="max-h-[200px] max-w-full rounded-sm border border-line" /></a>}
      {isText && text != null && <CodeBlock className="mt-1 max-w-[560px]">{text}</CodeBlock>}
    </div>
  );
}

const H3 = ({ children }) => <h3 className="pt-5 pb-1.5 text-sm font-semibold">{children}</h3>;

// ─── The run page content (flow.md §4) - same body in the 480px peek and the full page. ───
export function RunView({ runId, app, onRunAgain }) {
  const { meta, lines } = useRun(runId);
  const [outputs, setOutputs] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const logRef = useRef(null);
  const settled = meta && meta.status && meta.status !== 'running';

  useEffect(() => {
    if (settled) api(`/api/runs/${runId}/outputs`).then((d) => setOutputs(d.outputs)).catch(() => setOutputs([]));
    else setOutputs(null);
  }, [runId, settled]);
  useEffect(() => {
    if (meta?.status === 'running' && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines, meta?.status]);

  if (!meta) return <SkeletonRows />;
  if (meta.error) return <div className="pt-4 text-sm text-danger">{meta.error}</div>;

  const schema = app?.inputs || {};
  const declared = Object.entries(app?.outputs || {});
  const byPath = (n) => declared.find(([, o]) => o.path === n);
  const sorted = (outputs || []).slice().sort((a, b) => (byPath(b.name) ? 1 : 0) - (byPath(a.name) ? 1 : 0));
  const dur = fmtDur(secs(meta.startedAt, meta.finishedAt));
  const inputEntries = Object.entries(meta.inputs || {});
  const fileFor = (k) => (meta.inputFiles || []).find((f) => f.name.replace(/\.[^.]+$/, '') === k);
  const visible = showAll ? lines : lines.slice(-20);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 pt-1 text-sm">
        <StatusPill status={meta.status} />
        <Person email={meta.startedBy} />
        <span className="text-ink-2" title={fmtTime(meta.startedAt)}>{ago(meta.startedAt)}</span>
        {settled && <span className="text-ink-2 tabular-nums">{dur}</span>}
      </div>
      {meta.diagnosis && (
        <div className="mt-2 rounded-sm bg-code px-3 py-2 text-sm text-ink-2">
          <span className="font-medium text-ink">Diagnosis</span> · {meta.diagnosis}
        </div>
      )}

      {inputEntries.length > 0 && (
        <>
          <H3>Inputs</H3>
          {/* no width cap - the peek's 480px clamps it there; the full page gets the room */}
          <div className="grid grid-cols-[160px_1fr] text-sm">
            {inputEntries.map(([k, v]) => {
              const spec = schema[k] || {};
              const I = TYPE_ICON[spec.type] || Type;
              const f = spec.type === 'file' ? fileFor(k) : null;
              return (
                <div key={k} className="contents">
                  <div className="flex min-h-8 items-center gap-1.5 self-start text-ink-2"><I size={16} strokeWidth={1.5} className="text-ink-3" />{k}</div>
                  <div className="flex min-h-8 min-w-0 items-center gap-1.5 py-1">
                    {spec.type === 'bool' || typeof v === 'boolean' ? (
                      <Pill>{v ? 'on' : 'off'}</Pill>
                    ) : f ? (
                      <>
                        <span className="break-all">{String(v)}</span>
                        <span className="shrink-0 text-xs text-ink-2">{fmtBytes(f.size)}</span>
                        <a href={`/api/runs/${runId}/inputs/${encodeURIComponent(f.name)}`} download={String(v)} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-ink-2 hover:bg-hover hover:text-ink" aria-label={`Download ${k}`}>
                          <Download size={16} strokeWidth={1.5} />
                        </a>
                      </>
                    ) : (
                      <>
                        {/* long values (s3 URIs) wrap instead of clipping, and copy in one click */}
                        <span className="break-all tabular-nums">{Array.isArray(v) ? v.join(', ') : String(v)}</span>
                        <IconBtn
                          aria-label={`Copy ${k}`}
                          title="Copy"
                          className="shrink-0"
                          onClick={() => { navigator.clipboard.writeText(Array.isArray(v) ? v.join(', ') : String(v)); toast('Copied'); }}
                        >
                          <CopyIcon size={14} strokeWidth={1.5} />
                        </IconBtn>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <H3>Output</H3>
      {!settled && <div className="flex items-center gap-1.5 text-sm text-ink-2"><Loader2 size={14} className="animate-spin" /> Waiting…</div>}
      {settled && outputs && !outputs.length && <div className="text-sm text-ink-2">No outputs.</div>}
      {settled && sorted.map((o) => <Output key={o.name} runId={runId} name={o.name} size={o.size} label={byPath(o.name)?.[1]?.label} />)}

      <H3>Log</H3>
      {lines.length === 0 ? (
        <div className="text-sm text-ink-2">{meta.status === 'running' ? 'Waiting for output…' : 'No log.'}</div>
      ) : (
        <>
          <CodeBlock scrollRef={logRef} className="no-scrollbar max-h-[360px] overflow-y-auto">{visible.join('\n')}</CodeBlock>
          {!showAll && lines.length > 20 && (
            <button className="mt-1 cursor-pointer text-sm text-ink-2 hover:text-ink" onClick={() => setShowAll(true)}>Show all {lines.length} lines</button>
          )}
        </>
      )}

      <div className="pt-5 pb-2">
        <Button variant="secondary" onClick={() => onRunAgain(meta.inputs || {})}><Play size={16} strokeWidth={1.5} /> Run again</Button>
      </div>
    </div>
  );
}

// ─── The 480px side peek. ⤢ opens /apps/<slug>/runs/<id>; the page behind stays live. ───
// Once a conversation exists it gets its own Chat tab in the header; the panel is
// never remounted on switch (a mid-stream reply must survive), only re-styled.
export function RunPeek({ runId, app, onClose, onRunAgain }) {
  const [tab, setTab] = useState('run');
  const [chatted, setChatted] = useState(false);
  const tabCls = (on) => cn('flex h-6 cursor-pointer items-center gap-1.5 truncate rounded-sm px-1.5 text-sm', on ? 'bg-active font-medium text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink');
  return (
    <SlidePanel
      width={480}
      onClose={onClose}
      title={
        <>
          <span className={tabCls(tab === 'run')} onClick={() => setTab('run')}>Run {shortId(runId)}</span>
          {chatted && (
            <span className={tabCls(tab === 'chat')} onClick={() => setTab('chat')} title="Chat" aria-label="Chat">
              <MessageCircle size={16} strokeWidth={1.5} />
              {tab === 'chat' && 'Chat'}
            </span>
          )}
          <IconBtn aria-label="Open as page" title="Open as page" onClick={() => navigate(`/apps/${app.name}/runs/${runId}`)}>
            <Maximize2 size={14} strokeWidth={1.5} />
          </IconBtn>
        </>
      }
    >
      <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 pb-2', tab !== 'run' && 'hidden')}>
        <RunView runId={runId} app={app} onRunAgain={onRunAgain} />
      </div>
      {/* once a conversation exists the chat lives ONLY in its tab: on the Run tab
          the box is hidden (not unmounted, a mid-stream reply keeps streaming) */}
      <div className={cn(
        'px-5',
        tab === 'chat' ? 'flex min-h-0 flex-1 flex-col pt-2 pb-4'
        : chatted ? 'hidden'
        : 'shrink-0 border-t border-line pt-1 pb-4',
      )}>
        <AskPanel
          scope={{ run: runId }}
          appName={app?.name}
          compact={tab !== 'chat'}
          placeholder="Ask about this run…"
          onHasChat={() => setChatted(true)}
          onSent={() => { setChatted(true); setTab('chat'); }}
        />
      </div>
    </SlidePanel>
  );
}

// ─── The runs database (flow.md §3c): fixed columns + one column per declared input.
// Header cells carry the property-type icon, per the table reference. ───
const CORE_COLS = [
  { key: 'run', label: 'Run', w: 120, icon: Type },
  { key: 'status', label: 'Status', w: 110, icon: Circle },
  { key: 'by', label: 'Started by', w: 140, icon: User },
  { key: 'when', label: 'When', w: 120, icon: Calendar },
  { key: 'dur', label: 'Duration', w: 90, right: true, icon: Hash },
];

export function RunsDb({ app, onOpen, onNewRun, onRunAgain }) {
  const slug = app.name;
  const [runs, setRuns] = useState(null);
  const [filters, setFilters] = useState([]);
  const [sort, setSort] = useState({ field: 'when', dir: 'desc' });
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(null); // 'filter' | 'sort' | 'props'
  const [hidden, setHidden] = useState(() => new Set(JSON.parse(localStorage.getItem(`small.cols.${slug}`) || '[]')));
  const [widths, setWidths] = useState(() => JSON.parse(localStorage.getItem(`small.tblw.${slug}`) || '{}'));

  useEffect(() => { api(`/api/runs?app=${encodeURIComponent(slug)}`).then((d) => setRuns(d.runs)).catch(() => setRuns([])); }, [slug]);

  // sentence queries in the search box go to the model, which picks runs by
  // status/inputs/when; short strings stay instant substring matching
  const [aiRuns, setAiRuns] = useState(null); // null | 'loading' | { ids, note }
  useEffect(() => {
    if (!q || q.trim().split(/\s+/).length < 4) { setAiRuns(null); return; }
    setAiRuns('loading');
    const t = setTimeout(() => {
      api('/api/runs/find', { method: 'POST', body: JSON.stringify({ app: slug, q }) })
        .then((d) => setAiRuns({ ids: d.runs || [], note: d.note || '' }))
        .catch(() => setAiRuns(null));
    }, 600);
    return () => clearTimeout(t);
  }, [q, slug]);

  const schema = app.inputs || {};
  const inputCols = Object.keys(schema).filter((k) => !hidden.has(k));
  const cols = [...CORE_COLS, ...inputCols.map((k) => ({
    key: `in:${k}`, label: k, w: schema[k].type === 'number' ? 100 : 150, right: schema[k].type === 'number', input: k,
    icon: TYPE_ICON[schema[k].type] || Type,
  }))];

  const durOf = (r) => secs(r.started_at, r.finished_at);
  const cell = (r, c) => {
    if (c.key === 'run') return <span className="font-medium">{shortId(r.run_id)}</span>;
    if (c.key === 'status') return <StatusPill status={r.status} />;
    if (c.key === 'by') return <Person email={r.started_by} />;
    if (c.key === 'when') return <span title={fmtTime(r.started_at)}>{ago(r.started_at)}</span>;
    if (c.key === 'dur') return <span className="tabular-nums">{r.status === 'running' ? '-' : fmtDur(durOf(r))}</span>;
    const v = (r.inputs || {})[c.input];
    if (v == null) return <span className="text-ink-3">-</span>;
    const spec = schema[c.input] || {};
    if (spec.type === 'file') return <span className="inline-flex min-w-0 items-center gap-1"><Paperclip size={14} strokeWidth={1.5} className="shrink-0 text-ink-3" /><span className="break-all">{String(v)}</span></span>;
    if (spec.type === 'bool' || typeof v === 'boolean') return <Pill>{v ? 'on' : 'off'}</Pill>;
    if (spec.type === 'number') return <span className="tabular-nums">{String(v)}</span>;
    const s = Array.isArray(v) ? v.join(', ') : String(v);
    // s3 uris: one line, just the tail - the full uri sits on hover
    if (/^s3:\/\//.test(s)) {
      const tail = s.replace(/\/+$/, '').split('/').pop();
      return <span className="block truncate whitespace-nowrap" title={s}>…/{tail}</span>;
    }
    return <span className="break-all">{s}</span>;
  };

  const filtered = useMemo(() => {
    if (!runs) return null;
    let out = runs.filter((r) =>
      filters.every((f) =>
        f.field === 'status' ? r.status === f.value
        : f.field === 'by' ? r.started_by === f.value
        : String((r.inputs || {})[f.field] ?? '') === String(f.value)));
    if (q.trim()) {
      if (aiRuns && aiRuns !== 'loading') {
        out = aiRuns.ids.map((id) => out.find((r) => r.run_id === id)).filter(Boolean);
      } else {
        const qq = q.trim().toLowerCase();
        out = out.filter((r) =>
          r.run_id.includes(qq) || (r.started_by || '').toLowerCase().includes(qq) || r.status.includes(qq) ||
          Object.values(r.inputs || {}).some((v) => String(v).toLowerCase().includes(qq)));
      }
    }
    out = out.slice().sort((a, b) => {
      const va = sort.field === 'dur' ? (durOf(a) ?? -1) : a.started_at || '';
      const vb = sort.field === 'dur' ? (durOf(b) ?? -1) : b.started_at || '';
      return (va < vb ? -1 : va > vb ? 1 : 0) * (sort.dir === 'asc' ? 1 : -1);
    });
    return out;
  }, [runs, filters, q, sort, aiRuns]);

  const saveWidth = (key, w) => setWidths((s) => {
    const next = { ...s, [key]: w };
    localStorage.setItem(`small.tblw.${slug}`, JSON.stringify(next));
    return next;
  });
  const resize = (e, key, startW) => {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const move = (ev) => saveWidth(key, Math.max(60, startW + ev.clientX - x0));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const toggleCol = (k) => setHidden((s) => {
    const next = new Set(s);
    next.has(k) ? next.delete(k) : next.add(k);
    localStorage.setItem(`small.cols.${slug}`, JSON.stringify([...next]));
    return next;
  });

  if (!runs) return <SkeletonRows />;

  const people = [...new Set(runs.map((r) => r.started_by).filter(Boolean))];
  const statuses = [...new Set(runs.map((r) => r.status))];
  const valuesOf = (k) => [...new Set(runs.map((r) => (r.inputs || {})[k]).filter((v) => v != null).map(String))].slice(0, 8);
  const settledDurs = filtered.map(durOf).filter((s) => s != null);
  const avg = settledDurs.length ? settledDurs.reduce((a, b) => a + b, 0) / settledDurs.length : null;

  return (
    <div>
      {/* toolbar sits right-aligned per the table reference; triggers toggle on
          mousedown so closing a menu doesn't race its outside-mousedown close */}
      <div className="flex items-center justify-end gap-1 pb-2">
        <div className="relative">
          <Button size="sm" onMouseDown={(e) => { e.stopPropagation(); setMenu(menu === 'filter' ? null : 'filter'); }}><FilterIcon size={14} strokeWidth={1.5} /> Filter</Button>
          <Menu open={menu === 'filter'} onClose={() => setMenu(null)} className="top-8 left-0 max-h-80 overflow-y-auto">
            <div className="px-2 pt-1 pb-0.5 text-xs text-ink-3">Status</div>
            {statuses.map((s) => <MenuItem key={s} onClick={() => { setFilters((f) => [...f, { field: 'status', value: s }]); setMenu(null); }}>{s}</MenuItem>)}
            <div className="px-2 pt-2 pb-0.5 text-xs text-ink-3">Started by</div>
            {people.map((p) => <MenuItem key={p} onClick={() => { setFilters((f) => [...f, { field: 'by', value: p }]); setMenu(null); }}>{startedName(p)}</MenuItem>)}
            {Object.keys(schema).map((k) => (
              <div key={k}>
                <div className="px-2 pt-2 pb-0.5 text-xs text-ink-3">{k}</div>
                {valuesOf(k).map((v) => <MenuItem key={v} onClick={() => { setFilters((f) => [...f, { field: k, value: v }]); setMenu(null); }}>{v}</MenuItem>)}
              </div>
            ))}
          </Menu>
        </div>
        <div className="relative">
          <Button size="sm" onMouseDown={(e) => { e.stopPropagation(); setMenu(menu === 'sort' ? null : 'sort'); }}><ArrowUpDown size={14} strokeWidth={1.5} /> Sort</Button>
          <Menu open={menu === 'sort'} onClose={() => setMenu(null)} className="top-8 left-0">
            <MenuItem onClick={() => { setSort({ field: 'when', dir: 'desc' }); setMenu(null); }}>Newest first</MenuItem>
            <MenuItem onClick={() => { setSort({ field: 'when', dir: 'asc' }); setMenu(null); }}>Oldest first</MenuItem>
            <MenuItem onClick={() => { setSort({ field: 'dur', dir: 'desc' }); setMenu(null); }}>Longest duration</MenuItem>
            <MenuItem onClick={() => { setSort({ field: 'dur', dir: 'asc' }); setMenu(null); }}>Shortest duration</MenuItem>
          </Menu>
        </div>
        <div className="relative">
          <Button size="sm" onMouseDown={(e) => { e.stopPropagation(); setMenu(menu === 'props' ? null : 'props'); }}><Eye size={14} strokeWidth={1.5} /> Properties</Button>
          <Menu open={menu === 'props'} onClose={() => setMenu(null)} className="top-8 left-0">
            {Object.keys(schema).length === 0 && <div className="px-2 py-1 text-sm text-ink-2">No input columns.</div>}
            {Object.keys(schema).map((k) => (
              <MenuItem key={k} onClick={() => toggleCol(k)}>
                <span className="flex w-full items-center gap-2"><Chk on={!hidden.has(k)} /> {k}</span>
              </MenuItem>
            ))}
          </Menu>
        </div>
        {searchOpen ? (
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => !q && setSearchOpen(false)} placeholder="Describe what you are looking for" className="ml-1 w-72" />
        ) : (
          <IconBtn aria-label="Search runs" onClick={() => setSearchOpen(true)}><SearchIcon size={14} strokeWidth={1.5} /></IconBtn>
        )}
        <Button size="sm" onClick={onNewRun}><Plus size={14} strokeWidth={1.5} /> New run</Button>
      </div>
      {filters.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pb-2">
          {filters.map((f, i) => (
            <Pill key={i}>
              {(f.field === 'by' ? 'Started by' : f.field === 'status' ? 'Status' : f.field)} is {f.field === 'by' ? startedName(f.value) : String(f.value)}
              <button className="cursor-pointer" aria-label="Remove filter" onClick={() => setFilters((s) => s.filter((_, j) => j !== i))}><X size={12} /></button>
            </Pill>
          ))}
        </div>
      )}

      {runs.length === 0 ? (
        // the table empty state is a quiet 48px inline row, not a centered hero
        <div className="flex h-12 items-center gap-3 text-sm text-ink-3">
          <Inbox size={16} strokeWidth={1.5} />
          No runs yet
          <Button size="sm" onClick={onNewRun}><Plus size={14} strokeWidth={1.5} /> New run</Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          {aiRuns === 'loading' && <div className="px-2 py-1 text-xs text-ink-3">Thinking…</div>}
          {aiRuns?.ids?.length === 0 && <div className="px-2 py-1 text-sm text-ink-2">{aiRuns.note || 'No runs match that.'}</div>}
          {/* fixed layout + explicit total width: columns keep their exact px (resize persists);
              the wrapper scrolls horizontally when the columns outgrow the page */}
          <table className="border-collapse" style={{ tableLayout: 'fixed', width: 32 + cols.reduce((s, c) => s + (widths[c.key] || c.w), 0) }}>
            <thead>
              <tr>
                {cols.map((c) => (
                  <th
                    key={c.key}
                    style={{ width: widths[c.key] || c.w }}
                    className={cn('relative h-8 border-b border-line px-2 text-left text-xs font-normal whitespace-nowrap text-ink-2 select-none', c.right && 'text-right')}
                  >
                    <span className={cn('inline-flex items-center gap-1.5', c.right && 'flex-row-reverse')}>
                      {c.icon && <c.icon size={14} strokeWidth={1.5} className="shrink-0 text-ink-3" />}
                      {c.label}
                    </span>
                    <div onPointerDown={(e) => resize(e, c.key, widths[c.key] || c.w)} className="absolute top-0 -right-0.5 z-10 h-full w-1 cursor-col-resize hover:bg-accent/40" data-resize={c.key} />
                  </th>
                ))}
                <th className="w-8 border-b border-line" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.run_id} onClick={() => onOpen(r.run_id)} className="group cursor-pointer hover:bg-hover">
                  {cols.map((c) => (
                    // input columns wrap (s3 URIs must stay readable); core columns keep one line
                    <td key={c.key} className={cn('overflow-hidden border-b border-line px-2 py-1.5 align-middle text-sm', c.input ? 'break-words' : 'whitespace-nowrap', c.right && 'text-right')}>{cell(r, c)}</td>
                  ))}
                  <td className="border-b border-line text-right" onClick={(e) => e.stopPropagation()}>
                    {r.status !== 'running' && (
                      <IconBtn aria-label="Run again" title="Run again with these inputs" className="opacity-0 group-hover:opacity-100" onClick={() => onRunAgain(r.inputs || {})}>
                        <Play size={14} strokeWidth={1.5} />
                      </IconBtn>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Calculate footer: count under Run, avg right-aligned under Duration.
                ponytail: fixed picks - click-to-choose count/sum/avg when someone asks */}
            <tfoot>
              <tr>
                <td className="h-7 px-2 text-xs text-ink-3">Count {filtered.length}</td>
                <td colSpan={3} />
                <td className="h-7 px-2 text-right text-xs whitespace-nowrap text-ink-3">{avg != null && `Avg ${fmtDur(avg)}`}</td>
                <td colSpan={cols.length - 4} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
