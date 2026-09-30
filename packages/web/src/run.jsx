// ─── The run surface: Run tab form (from [inputs]), run side peek / full page,
// and the runs database (Logs tab, jobs). Design: design/flow.md §3b/3c/§4. ───
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, ArrowUpDown, Calendar, ChevronsUpDown, Circle, Clock, Copy as CopyIcon, Download, ExternalLink, Eye,
  File as FileIcon, Filter as FilterIcon, Folder, Hash, Inbox, Info, Loader2, Maximize2, MessageCircle,
  Paperclip, Play, Plus, ScrollText, Search as SearchIcon, Share2, Type, User, X,
} from 'lucide-react';
import { ago, api, fmtTime, navigate, wsHeaders } from './api.js';
import { appApi } from './app-data.js';
import { AskPanel } from './ask.jsx';
import { aiFindAllowed, learnPreview } from './flags.js';
import {
  Avatar, Button, Chk, cn, CodeBlock, Dropzone, Field, fmtBytes, IconBtn, Input,
  Menu, MenuItem, Pill, Select, SkeletonRows, SlidePanel, Slider, StatusPill, SubMenu, Tip, toast, Toggle, useHeaderDrag, ValuePicker,
} from './ui.jsx';

const shortId = (id) => String(id || '').replace(/^r-/, '').slice(0, 7);
export const secs = (a, b) => (a && b ? Math.max(0, (new Date(b.replace(' ', 'T') + 'Z') - new Date(a.replace(' ', 'T') + 'Z')) / 1000) : null);
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
function S3Input({ app, value, onChange, onBlur, onPaste, error, label }) {
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
        onPaste={onPaste}
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
export function RunForm({ app, prefill, onStarted, onBatchStarted }) {
  const request = appApi(app);
  const schema = app.inputs || {};
  const entries = Object.entries(schema);
  const [values, setValues] = useState(() => Object.fromEntries(entries.map(([k, s]) => [k, defaultValue(s)])));
  const [files, setFiles] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  // Batch: + beside a text field adds another value row for that field; each
  // row becomes its own run (own status, logs and outputs), every other field
  // is shared. A multi-line paste into any row splits into rows automatically.
  const [extras, setExtras] = useState({}); // field -> extra value rows
  const batchField = Object.keys(extras).find((k) => (extras[k] || []).length > 0) || null;
  const cleanLine = (l) => String(l).trim().replace(/,$/, '').trim(); // trailing comma = CSV/JSON paste residue
  const batchValues = batchField
    ? [...new Set([values[batchField], ...extras[batchField]].map(cleanLine).filter(Boolean))]
    : [];
  const BATCH_MAX = 25; // ponytail: sequential client-side starts; server-side fan-out when someone needs hundreds
  const addExtra = (k) => setExtras((s) => ({ ...s, [k]: [...(s[k] || []), ''] }));
  const setExtraAt = (k, i, v) => setExtras((s) => { const a = [...s[k]]; a[i] = v; return { ...s, [k]: a }; });
  const removeExtra = (k, i) => setExtras((s) => { const a = s[k].filter((_, j) => j !== i); return a.length ? { ...s, [k]: a } : Object.fromEntries(Object.entries(s).filter(([kk]) => kk !== k)); });
  const pasteSplit = (k, i) => (e) => {
    const t = e.clipboardData?.getData('text') || '';
    if (!t.includes('\n')) return;
    e.preventDefault();
    const lines = t.split('\n').map(cleanLine).filter(Boolean);
    if (!lines.length) return;
    if (i == null) { set(k, lines[0]); if (lines.length > 1) setExtras((s) => ({ ...s, [k]: [...(s[k] || []), ...lines.slice(1)] })); }
    else setExtras((s) => { const a = [...s[k]]; a.splice(i, 1, ...lines); return { ...s, [k]: a }; });
  };
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
    if (learnPreview) return; // D7: the preview never starts a live run, from any caller (app page, Library panel)
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
      if (fileEntries.length && app.hosting === 'aws') {
        d = await request('/api/runs', { method: 'POST', body: JSON.stringify({ app: app.name, inputs: vals }), files: Object.fromEntries(fileEntries) });
      } else if (fileEntries.length) {
        const fd = new FormData();
        fd.append('body', JSON.stringify({ app: app.name, inputs: vals }));
        for (const [k, f] of fileEntries) fd.append(`input:${k}`, f);
        const r = await fetch('/api/runs', { method: 'POST', headers: wsHeaders(), body: fd });
        d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      } else {
        d = await request('/api/runs', { method: 'POST', body: JSON.stringify({ app: app.name, inputs: Object.keys(vals).length ? vals : undefined }) });
      }
      onStarted(d.runId);
    } catch (e) {
      toast(`✗ ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const submitBatch = async () => {
    if (learnPreview) return; // D7, as submit
    // shared fields validate as usual; the batch field validates per row
    const spec = schema[batchField];
    const errs = {};
    for (const [k, s] of entries) {
      if (k === batchField || s.type === 'file') continue;
      const e = validateOne(s, values[k], files[k]);
      if (e) errs[k] = e;
    }
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    for (const line of batchValues) {
      const e = validateOne(spec, line);
      if (e) return toast(`✗ ${batchField} "${line.slice(0, 40)}": ${e}`);
    }
    const shared = {};
    for (const [k, s] of entries) {
      if (k === batchField || s.type === 'file') continue;
      if (s.type === 'bool') { shared[k] = !!values[k]; continue; }
      const v = values[k];
      if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
      shared[k] = s.type === 'number' ? Number(v) : v;
    }
    setBusy(true);
    let started = 0;
    try {
      for (const line of batchValues.slice(0, BATCH_MAX)) {
        await request('/api/runs', { method: 'POST', body: JSON.stringify({ app: app.name, inputs: { ...shared, [batchField]: line } }) });
        started++;
      }
      toast(`Started ${started} run${started === 1 ? '' : 's'}`);
      setExtras({});
      (onBatchStarted || (() => {}))();
    } catch (e) {
      toast(`✗ after ${started} started: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const lr = app.lastRun;
  const lrDur = lr && fmtDur(secs(lr.startedAt, lr.finishedAt));
  if (app.hosting === 'aws' && app.deployment?.status !== 'ready') return <p className="text-sm text-ink-2">Deploy this job with <code>small deploy</code> before running it. Deployment: {app.deployment?.status || 'not deployed'}.</p>;
  return (
    <div>
      {entries.map(([k, spec]) => {
        const TypeIcon = TYPE_ICON[spec.type];
        return (
        <Field
          key={k}
          label={
            <span className="inline-flex items-center gap-1.5">
              {TypeIcon && <TypeIcon size={14} strokeWidth={1.5} className="shrink-0 text-ink-3" />}
              {k.replace(/_/g, ' ')}
              <span className="text-xs font-normal text-ink-3">({spec.type})</span>
              {spec.required && <span className="text-danger">*</span>}
              {typeof spec.tooltip === 'string' && spec.tooltip.trim() && <Tip label={k.replace(/_/g, ' ')} info={<span className="whitespace-pre-wrap break-words">{spec.tooltip}</span>}>
                <IconBtn type="button" aria-label={`${k} information`} aria-description={spec.tooltip}><Info size={14} strokeWidth={1.5} /></IconBtn>
              </Tip>}
            </span>
          }
          help={spec.help || (spec.required ? undefined : 'optional')}
          error={errors[k]}
        >
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
          {spec.type === 'text' && (() => {
            const s3 = app.hosting !== 'aws' && (spec.pattern || '').includes('s3://');
            // helper CALL (not a component): keeps S3Input/Input identity stable across renders
            const ctl = (value, onChange, onPaste, label) => (s3
              ? <S3Input app={app} value={value} onChange={onChange} onPaste={onPaste} onBlur={() => setErrors((er) => ({ ...er, [k]: validateOne(spec, values[k]) }))} error={errors[k]} label={label} />
              : <Input value={value} onChange={(e) => onChange(e.target.value)} onPaste={onPaste} onBlur={() => setErrors((er) => ({ ...er, [k]: validateOne(spec, values[k]) }))} className={errors[k] ? 'border-danger' : undefined} aria-label={label} />);
            return (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-start gap-1.5">
                  <div className="min-w-0 flex-1">{ctl(values[k], (v) => set(k, v), pasteSplit(k, null), k)}</div>
                  {(!batchField || batchField === k) && (
                    <Tip label={`Add another ${k}`} info="each value becomes its own run">
                      <IconBtn aria-label={`Add another ${k}`} onClick={() => addExtra(k)}><Plus size={14} strokeWidth={1.5} /></IconBtn>
                    </Tip>
                  )}
                </div>
                {(extras[k] || []).map((v, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <div className="min-w-0 flex-1">{ctl(v, (nv) => setExtraAt(k, i, nv), pasteSplit(k, i), `${k} ${i + 2}`)}</div>
                    <IconBtn aria-label={`Remove ${k} ${i + 2}`} onClick={() => removeExtra(k, i)}><X size={14} strokeWidth={1.5} /></IconBtn>
                  </div>
                ))}
              </div>
            );
          })()}
        </Field>
        );
      })}
      {Object.keys(app.constants || {}).length > 0 && <section aria-label="Constants" className="mt-5 border-t border-line pt-4">
        <h3 className="text-sm font-medium">Constants</h3>
        <p className="mt-1 text-xs text-ink-3">Fixed for this deployment. Redeploy to change.</p>
        <dl className="mt-2 divide-y divide-line">
          {Object.entries(app.constants).map(([name, declaration]) => {
            const { value, tooltip } = declaration && typeof declaration === 'object' ? declaration : { value: declaration };
            return <div key={name} className="grid grid-cols-[minmax(100px,1fr)_2fr] gap-4 py-2 text-sm">
            <dt className="flex items-center gap-1 break-words text-ink-2">{name}
              {typeof tooltip === 'string' && tooltip.trim() && <Tip label={name.replace(/_/g, ' ')} info={<span className="whitespace-pre-wrap break-words">{tooltip}</span>}>
                <IconBtn type="button" aria-label={`${name} information`} aria-description={tooltip}><Info size={14} strokeWidth={1.5} /></IconBtn>
              </Tip>}
            </dt>
            <dd className="min-w-0 whitespace-pre-wrap break-words">{String(value) || <span className="text-ink-3">Empty string</span>}</dd>
          </div>; })}
        </dl>
      </section>}
      <div className={cn('flex items-center gap-3', entries.length && 'pt-4')}>
        <Button variant="primary" disabled={learnPreview || busy || (batchField && !batchValues.length)} onClick={batchField ? submitBatch : submit}>
          {busy ? <Loader2 size={16} strokeWidth={1.5} className="animate-spin" /> : <Play size={16} strokeWidth={1.5} />}
          {batchField ? `Run batch (${Math.min(batchValues.length, BATCH_MAX)})` : 'Run'}
        </Button>
        {batchField && <span className="text-sm text-ink-2">one run per {batchField}, other fields shared</span>}
        {batchValues.length > BATCH_MAX && <span className="text-xs text-warn">first {BATCH_MAX} of {batchValues.length} - split larger batches</span>}
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
function useRun(runId, request) {
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
        const d = await request(`/api/runs/${runId}?after=${encodeURIComponent(cursor.current)}`);
        if (stop) return;
        loaded = true;
        cursor.current = d.cursor;
        setMeta(d);
        if (d.lines.length) setLines((l) => [...l, ...d.lines.map((t, i) => ({ t: String(t), ts: d.lineTs?.[i] || null }))]);
        if (d.status === 'running' || d.hasMore) setTimeout(() => !stop && tick(), 1000);
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
  }, [runId, request]);
  return { meta, lines };
}

// Keep outputs compact; the existing open and download controls expose the file.
function Output({ runId, name, size, label, url = `/api/runs/${runId}/outputs/${encodeURIComponent(name)}` }) {
  const opensInTab = /\.(html?|pdf|jpe?g|png|gif|webp|json|txt)$/i.test(name); // types the API serves with a real Content-Type
  return (
    <div className="pb-2">
      <div className="flex h-8 items-center gap-1.5 text-sm">
        <Paperclip size={16} strokeWidth={1.5} className="shrink-0 text-ink-3" />
        <span className="min-w-0 truncate">{label || name}</span>
        <span className="text-xs text-ink-2">{fmtBytes(size)}</span>
        {opensInTab && (
          <a href={url} target="_blank" rel="noopener" className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-ink-2 hover:bg-hover hover:text-ink" aria-label={`Open ${name} in a new tab`} title="Open in new tab">
            <ExternalLink size={16} strokeWidth={1.5} />
          </a>
        )}
        <a href={url} download={name} className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-ink-2 hover:bg-hover hover:text-ink" aria-label={`Download ${name}`}>
          <Download size={16} strokeWidth={1.5} />
        </a>
      </div>
    </div>
  );
}

// ─── Run page sections as cards (Inputs / Output / Log) + log line dressing. ───
const Card = ({ title, right, pad = true, children }) => (
  <div className="mt-5 overflow-hidden rounded-md border border-line">
    <div className="flex h-9 items-center gap-2 border-b border-line bg-side px-3">
      <span className="text-sm font-semibold">{title}</span>
      <span className="ml-auto flex items-center gap-1.5">{right}</span>
    </div>
    <div className={pad ? 'p-3' : undefined}>{children}</div>
  </div>
);

const ERR_RE = /\b(error|traceback|exception|fatal)\b|✗/i;
const WARN_RE = /\bwarn(ing)?\b/i;
const lineTone = (t) => (ERR_RE.test(t) ? 'text-danger' : WARN_RE.test(t) ? 'text-warn' : /^runner: /.test(t) ? 'text-ink-3' : '');
const linkify = (t) =>
  t.split(/(https?:\/\/\S+)/g).map((p, i) =>
    /^https?:\/\//.test(p)
      ? <a key={i} href={p} target="_blank" rel="noopener" className="underline decoration-ink-3 underline-offset-2 hover:text-accent">{p}</a>
      : p);
const parseT = (s) => new Date(/[zZ]$/.test(s) ? s : s.replace(' ', 'T') + 'Z');

// ─── The run page content (flow.md §4) - same body in the 480px peek and the full page. ───
export function RunView({ runId, app, onRunAgain }) {
  const request = appApi(app);
  const { meta, lines } = useRun(runId, request);
  const [outputs, setOutputs] = useState(null);
  const [logQ, setLogQ] = useState(''); // filter box in the Log card header
  const [openFolds, setOpenFolds] = useState(() => new Set()); // fold start indexes clicked open
  const logRef = useRef(null);
  const settled = meta && meta.status && meta.status !== 'running';

  useEffect(() => {
    if (settled) request(`/api/runs/${runId}/outputs`).then((d) => setOutputs(d.outputs)).catch(() => setOutputs([]));
    else setOutputs(null);
  }, [runId, settled, request]);
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

  // Log rows: filter beats folds; otherwise plain stretches > FOLD_MIN collapse to
  // first 2 + last 2 with an expander. Error/warn/runner lines break stretches, so
  // the interesting lines are never hidden.
  const FOLD_MIN = 25;
  const q = logQ.trim().toLowerCase();
  const rows = [];
  if (q) {
    lines.forEach((l, i) => l.t.toLowerCase().includes(q) && rows.push({ l, i }));
  } else {
    let i = 0;
    while (i < lines.length) {
      if (lineTone(lines[i].t)) { rows.push({ l: lines[i], i }); i++; continue; }
      let j = i;
      while (j < lines.length && !lineTone(lines[j].t)) j++;
      if (j - i > FOLD_MIN && !openFolds.has(i)) {
        rows.push({ l: lines[i], i }, { l: lines[i + 1], i: i + 1 });
        rows.push({ fold: i, count: j - i - 4 });
        rows.push({ l: lines[j - 2], i: j - 2 }, { l: lines[j - 1], i: j - 1 });
      } else {
        for (let k = i; k < j; k++) rows.push({ l: lines[k], i: k });
      }
      i = j;
    }
  }
  const hasErr = lines.some((l) => ERR_RE.test(l.t));
  const off = (ts) => (ts && meta.startedAt ? `+${Math.max(0, (parseT(ts) - parseT(meta.startedAt)) / 1000).toFixed(1)}s` : undefined);
  const jumpToError = () => {
    setLogQ('');
    setTimeout(() => logRef.current?.querySelector('[data-err]')?.scrollIntoView({ block: 'center' }), 0);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 pt-1 text-sm">
        <StatusPill status={meta.status} />
        <Person email={meta.startedBy} />
        <span className="text-ink-2" title={fmtTime(meta.startedAt)}>{ago(meta.startedAt)}</span>
        {settled && <span className="text-ink-2 tabular-nums">{dur}</span>}
        {meta.source && <span className="text-xs text-ink-3" title="The code this run executed">{meta.source}</span>}
      </div>
      {meta.diagnosis && (
        <div className="mt-2 rounded-sm bg-code px-3 py-2 text-sm text-ink-2">
          <span className="font-medium text-ink">Diagnosis</span> · {meta.diagnosis}
        </div>
      )}

      {inputEntries.length > 0 && (
        <Card title="Inputs">
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
        </Card>
      )}

      <Card title="Output">
        {!settled && <div className="flex items-center gap-1.5 text-sm text-ink-2"><Loader2 size={14} className="animate-spin" /> Waiting…</div>}
        {settled && outputs && !outputs.length && <div className="text-sm text-ink-2">No outputs.</div>}
        {settled && sorted.map((o) => <Output key={o.name} runId={runId} name={o.name} size={o.size} url={o.url} label={byPath(o.name)?.[1]?.label} />)}
      </Card>

      <Card
        title="Log"
        pad={false}
        right={
          <>
            {lines.length > 5 && (
              <input
                value={logQ}
                onChange={(e) => setLogQ(e.target.value)}
                placeholder="Filter…"
                aria-label="Filter log lines"
                className="h-6 w-32 rounded-sm bg-code px-2 text-xs outline-none placeholder:text-ink-3 focus:shadow-[0_0_0_2px_rgba(35,131,226,0.2)]"
              />
            )}
            {hasErr && (
              <button
                onClick={jumpToError}
                className="flex h-6 cursor-pointer items-center gap-1 rounded-sm px-1.5 text-xs text-danger hover:bg-hover"
                title="Jump to the first error line"
              >
                <AlertTriangle size={12} strokeWidth={1.5} /> error
              </button>
            )}
            {lines.length > 0 && (
              <IconBtn aria-label="Copy log" title="Copy log" onClick={() => { navigator.clipboard.writeText(lines.map((l) => l.t).join('\n')); toast('Copied'); }}>
                <CopyIcon size={13} strokeWidth={1.5} />
              </IconBtn>
            )}
          </>
        }
      >
        {lines.length === 0 ? (
          <div className="p-3 text-sm text-ink-2">{meta.status === 'running' ? 'Waiting for output…' : 'No log.'}</div>
        ) : (
          <div ref={logRef} className="no-scrollbar max-h-[360px] overflow-y-auto p-3 font-mono text-[13px] leading-normal whitespace-pre-wrap">
            {rows.length === 0 && <div className="text-ink-2">No lines match "{logQ}"</div>}
            {rows.map((r) =>
              r.fold != null ? (
                <button
                  key={`fold-${r.fold}`}
                  onClick={() => setOpenFolds((s) => new Set(s).add(r.fold))}
                  className="my-0.5 flex h-6 cursor-pointer items-center gap-1.5 rounded-sm px-1.5 font-sans text-xs text-ink-2 hover:bg-hover hover:text-ink"
                >
                  <ChevronsUpDown size={12} strokeWidth={1.5} /> show {r.count} more lines
                </button>
              ) : (
                <div key={r.i} data-err={ERR_RE.test(r.l.t) || undefined} title={off(r.l.ts)} className={lineTone(r.l.t) || undefined}>
                  {r.l.t ? linkify(r.l.t) : ' '}
                </div>
              ),
            )}
          </div>
        )}
      </Card>

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
  const [copied, setCopied] = useState(null);
  const feedbackTimer = useRef(null);
  useEffect(() => () => clearTimeout(feedbackTimer.current), []);
  const tabCls = (on) => cn('flex h-6 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-sm', on ? 'bg-active font-medium text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink');
  const runUrl = `${window.location.origin}/apps/${encodeURIComponent(app.name)}/runs/${encodeURIComponent(runId)}`;
  const copyWithFeedback = (value, kind) => {
    navigator.clipboard.writeText(value);
    setCopied(kind);
    clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setCopied(null), 3000);
  };
  return (
    <SlidePanel
      width={480}
      onClose={onClose}
      title={
        <>
          <span className={cn(tabCls(tab === 'run'), 'gap-0')} onClick={() => setTab('run')} title={`Run ${shortId(runId)}`} aria-label={`Run ${shortId(runId)}`}>
            <ScrollText size={16} strokeWidth={1.5} className="shrink-0" />
            <span className={cn('overflow-hidden whitespace-nowrap transition-[max-width] duration-200 ease-out', tab === 'run' ? 'max-w-[120px] pl-1.5' : 'max-w-0')}>Run {shortId(runId)}</span>
            <span className="relative ml-1 inline-flex">
              <IconBtn aria-label="Copy run ID" title="Copy run ID" className="h-5! w-5! rounded-full" onClick={(event) => { event.stopPropagation(); copyWithFeedback(runId, 'id'); }}>
                <CopyIcon size={13} strokeWidth={1.5} />
              </IconBtn>
              {copied === 'id' && <span role="status" className="absolute top-full left-1/2 z-50 mt-1.5 w-max -translate-x-1/2 rounded-md bg-ink px-2.5 py-1.5 text-xs font-normal text-white shadow-pop">Run ID copied</span>}
            </span>
          </span>
          {chatted && (
            <span className={cn(tabCls(tab === 'chat'), 'gap-0')} onClick={() => setTab('chat')} title="Chat" aria-label="Chat">
              <MessageCircle size={16} strokeWidth={1.5} className="shrink-0" />
              <span className={cn('overflow-hidden whitespace-nowrap transition-[max-width] duration-200 ease-out', tab === 'chat' ? 'max-w-[44px] pl-1.5' : 'max-w-0')}>Chat</span>
            </span>
          )}
          <IconBtn aria-label="Open as page" title="Open as page" onClick={() => navigate(`/apps/${app.name}/runs/${runId}`)}>
            <Maximize2 size={14} strokeWidth={1.5} />
          </IconBtn>
          <span className="relative inline-flex">
            <IconBtn aria-label="Share run log" title="Share run log" onClick={() => copyWithFeedback(runUrl, 'link')}>
              <Share2 size={14} strokeWidth={1.5} />
            </IconBtn>
            {copied === 'link' && <span role="status" className="absolute top-full right-0 z-50 mt-1.5 w-max rounded-md bg-ink px-2.5 py-1.5 text-xs font-normal text-white shadow-pop">Log link copied</span>}
          </span>
        </>
      }
    >
      <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 pb-2', tab !== 'run' && 'hidden')}>
        <RunView runId={runId} app={app} onRunAgain={onRunAgain} />
      </div>
      {/* once a conversation exists the chat lives ONLY in its tab: on the Run tab
          the box is hidden (not unmounted, a mid-stream reply keeps streaming) */}
      {!learnPreview && (app.hosting !== 'aws' || app.run_chat) && <div className={cn( // D7: run chat writes live /api/ask history
        'px-5',
        tab === 'chat' ? 'flex min-h-0 flex-1 flex-col pt-2 pb-4'
        : chatted ? 'hidden'
        : 'shrink-0 border-t border-line pt-1 pb-4',
      )}>
        <AskPanel
          key={app.run_chat ? `${app.name}:${runId}` : undefined}
          scope={{ run: runId }}
          appName={app?.name}
          chatConfig={app.run_chat}
          compact={tab !== 'chat'}
          placeholder="Ask about this run…"
          onHasChat={() => setChatted(true)}
          onSent={() => { setChatted(true); setTab('chat'); }}
        />
      </div>}
    </SlidePanel>
  );
}

// ─── The runs database (flow.md §3c): fixed columns + one column per declared input.
// Header cells carry the property-type icon, per the table reference. ───
const CORE_COLS = [
  { key: 'run', label: 'Run', w: 120, icon: Type, info: 'Run id. Click a row for details' },
  { key: 'status', label: 'Status', w: 110, icon: Circle, info: 'finished, failed, stopped or running' },
  { key: 'by', label: 'Started by', w: 140, icon: User, info: 'Who started the run' },
  { key: 'when', label: 'When', w: 120, icon: Calendar, info: 'Start time' },
  { key: 'dur', label: 'Duration', w: 90, right: true, icon: Hash, info: 'How long the run took' },
];

export function RunsDb({ app, onOpen, onNewRun, onRunAgain, openId = null }) {
  const request = appApi(app);
  const slug = app.name;
  const [runs, setRuns] = useState(null);
  const [filters, setFilters] = useState([]);
  const [sort, setSort] = useState({ field: 'when', dir: 'desc' });
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(null); // 'filter' | 'sort' | 'props'
  const [menuQ, setMenuQ] = useState(''); // search inside the filter menu
  const [hidden, setHidden] = useState(() => new Set(JSON.parse(localStorage.getItem(`small.cols.${slug}`) || '[]')));
  const [widths, setWidths] = useState(() => JSON.parse(localStorage.getItem(`small.tblw.${slug}`) || '{}'));
  const [order, setOrder] = useState(() => JSON.parse(localStorage.getItem(`small.tblorder.${slug}`) || 'null'));
  const saveOrder = (o) => { setOrder(o); localStorage.setItem(`small.tblorder.${slug}`, JSON.stringify(o)); };
  const [colMenu, setColMenu] = useState(null); // column key with its header menu open
  const [colSub, setColSub] = useState(null); // 'sort' | 'filter' flyout inside it

  useEffect(() => { request(`/api/runs?app=${encodeURIComponent(slug)}`).then((d) => setRuns(d.runs)).catch(() => setRuns([])); }, [slug, request, openId]);

  // sentence queries in the search box go to the model, which picks runs by
  // status/inputs/when; short strings stay instant substring matching
  const [aiRuns, setAiRuns] = useState(null); // null | 'loading' | { ids, note }
  useEffect(() => {
    if (app.hosting === 'aws' || !aiFindAllowed() || !q || q.trim().split(/\s+/).length < 4) { setAiRuns(null); return; }
    setAiRuns('loading');
    const t = setTimeout(() => {
      api('/api/runs/find', { method: 'POST', body: JSON.stringify({ app: slug, q }) })
        .then((d) => setAiRuns({ ids: d.runs || [], note: d.note || '' }))
        .catch(() => setAiRuns(null));
    }, 600);
    return () => clearTimeout(t);
  }, [q, slug, app.hosting]);

  const schema = app.inputs || {};
  const inputCols = Object.keys(schema).filter((k) => !hidden.has(k));
  const baseCols = [
    ...CORE_COLS.filter((c) => c.key === 'run' || !hidden.has(c.key)),
    ...inputCols.map((k) => ({
      key: `in:${k}`, label: k, w: schema[k].type === 'number' ? 100 : 150, right: schema[k].type === 'number', input: k,
      icon: TYPE_ICON[schema[k].type] || Type,
    })),
  ];
  // column order persists; unknown keys (new inputs) append in natural order
  const colKeys = baseCols.map((c) => c.key);
  const ordKeys = [...(order || []).filter((k) => colKeys.includes(k)), ...colKeys.filter((k) => !(order || []).includes(k))];
  const cols = ordKeys.map((k) => baseCols.find((c) => c.key === k));
  const moveCol = (from, to, after = false) => {
    const next = ordKeys.filter((k) => k !== from);
    next.splice(next.indexOf(to) + (after ? 1 : 0), 0, from);
    saveOrder(next);
  };
  const { down: hdrDown, dragCol, squelch } = useHeaderDrag(moveCol);

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
    if (spec.type === 'file') return <span className="flex min-w-0 items-center gap-1" title={String(v)}><Paperclip size={14} strokeWidth={1.5} className="shrink-0 text-ink-3" /><span className="truncate">{String(v)}</span></span>;
    if (spec.type === 'bool' || typeof v === 'boolean') return <Pill>{v ? 'on' : 'off'}</Pill>;
    if (spec.type === 'number') return <span className="tabular-nums">{String(v)}</span>;
    const s = Array.isArray(v) ? v.join(', ') : String(v);
    // s3 uris: one line, just the tail - the full uri sits on hover
    if (/^s3:\/\//.test(s)) {
      const tail = s.replace(/\/+$/, '').split('/').pop();
      return <span className="block truncate whitespace-nowrap" title={s}>…/{tail}</span>;
    }
    return <span className="block truncate" title={s}>{s}</span>;
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

  // nothing to filter, sort or search yet - no toolbar, one centered invitation
  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-ink-3">
        <Inbox size={20} strokeWidth={1.25} />
        <div className="text-sm">No runs yet</div>
        <Button variant="secondary" size="sm" onClick={onNewRun}><Plus size={14} strokeWidth={1.5} /> New run</Button>
      </div>
    );
  }

  const people = [...new Set(runs.map((r) => r.started_by).filter(Boolean))];
  const statuses = [...new Set(runs.map((r) => r.status))];
  const valuesOf = (k) => [...new Set(runs.map((r) => (r.inputs || {})[k]).filter((v) => v != null).map(String))].slice(0, 200);
  const settledDurs = filtered.map(durOf).filter((s) => s != null);
  const avg = settledDurs.length ? settledDurs.reduce((a, b) => a + b, 0) / settledDurs.length : null;

  return (
    <div>
      {/* toolbar sits right-aligned per the table reference; triggers toggle on
          mousedown so closing a menu doesn't race its outside-mousedown close */}
      <div className="flex items-center justify-end gap-1 pb-2">
        <div className="relative">
          <Button variant="secondary" size="sm" onMouseDown={(e) => { e.stopPropagation(); setMenuQ(''); setMenu(menu === 'filter' ? null : 'filter'); }}><FilterIcon size={14} strokeWidth={1.5} /> Filter</Button>
          <Menu open={menu === 'filter'} onClose={() => setMenu(null)} className="top-8 left-0 max-h-80 overflow-y-auto">
            <input
              autoFocus
              value={menuQ}
              onChange={(e) => setMenuQ(e.target.value)}
              placeholder="Search values…"
              onMouseDown={(e) => e.stopPropagation()}
              className="mb-1 h-7 w-full rounded-sm bg-code px-2 text-sm outline-none"
            />
            {(() => {
              const hit = (v) => String(v).toLowerCase().includes(menuQ.toLowerCase());
              const st = statuses.filter(hit);
              const ppl = people.filter((p) => hit(startedName(p)) || hit(p));
              return (
                <>
                  {st.length > 0 && <div className="px-2 pt-1 pb-0.5 text-xs text-ink-3">Status</div>}
                  {st.map((s) => <MenuItem key={s} onClick={() => { setFilters((f) => [...f, { field: 'status', value: s }]); setMenu(null); }}>{s}</MenuItem>)}
                  {ppl.length > 0 && <div className="px-2 pt-2 pb-0.5 text-xs text-ink-3">Started by</div>}
                  {ppl.map((p) => <MenuItem key={p} onClick={() => { setFilters((f) => [...f, { field: 'by', value: p }]); setMenu(null); }}>{startedName(p)}</MenuItem>)}
                  {Object.keys(schema).map((k) => {
                    const vals = valuesOf(k).filter(hit).slice(0, 8);
                    if (!vals.length) return null;
                    return (
                      <div key={k}>
                        <div className="px-2 pt-2 pb-0.5 text-xs text-ink-3">{k}</div>
                        {vals.map((v) => <MenuItem key={v} onClick={() => { setFilters((f) => [...f, { field: k, value: v }]); setMenu(null); }}>{v}</MenuItem>)}
                      </div>
                    );
                  })}
                </>
              );
            })()}
          </Menu>
        </div>
        <div className="relative">
          <Button variant="secondary" size="sm" onMouseDown={(e) => { e.stopPropagation(); setMenu(menu === 'sort' ? null : 'sort'); }}><ArrowUpDown size={14} strokeWidth={1.5} /> Sort</Button>
          <Menu open={menu === 'sort'} onClose={() => setMenu(null)} className="top-8 left-0">
            <MenuItem onClick={() => { setSort({ field: 'when', dir: 'desc' }); setMenu(null); }}>Newest first</MenuItem>
            <MenuItem onClick={() => { setSort({ field: 'when', dir: 'asc' }); setMenu(null); }}>Oldest first</MenuItem>
            <MenuItem onClick={() => { setSort({ field: 'dur', dir: 'desc' }); setMenu(null); }}>Longest duration</MenuItem>
            <MenuItem onClick={() => { setSort({ field: 'dur', dir: 'asc' }); setMenu(null); }}>Shortest duration</MenuItem>
          </Menu>
        </div>
        <div className="relative">
          <Button variant="secondary" size="sm" onMouseDown={(e) => { e.stopPropagation(); setMenuQ(''); setMenu(menu === 'props' ? null : 'props'); }}><Eye size={14} strokeWidth={1.5} /> Properties</Button>
          <Menu open={menu === 'props'} onClose={() => setMenu(null)} className="top-8 left-0 max-h-80 w-52 overflow-y-auto">
            <input
              autoFocus
              value={menuQ}
              onChange={(e) => setMenuQ(e.target.value)}
              placeholder="Search…"
              onMouseDown={(e) => e.stopPropagation()}
              className="mb-1 h-7 w-full rounded-sm bg-code px-2 text-sm outline-none"
            />
            {[...CORE_COLS.filter((c) => c.key !== 'run').map((c) => [c.key, c.label]), ...Object.keys(schema).map((k) => [k, k])].filter(([, label]) => label.toLowerCase().includes(menuQ.toLowerCase())).map(([k, label]) => (
              <MenuItem key={k} onClick={() => toggleCol(k)}>
                <span className="flex w-full items-center gap-2"><Chk on={!hidden.has(k)} /> {label}</span>
              </MenuItem>
            ))}
          </Menu>
        </div>
        {searchOpen ? (
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => !q && setSearchOpen(false)} placeholder="Describe what you are looking for" className="ml-1 w-72" />
        ) : (
          <IconBtn aria-label="Search runs" onClick={() => setSearchOpen(true)}><SearchIcon size={14} strokeWidth={1.5} /></IconBtn>
        )}
        <Button variant="secondary" size="sm" onClick={onNewRun}><Plus size={14} strokeWidth={1.5} /> New run</Button>
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
                    data-col={c.key}
                    style={{ width: widths[c.key] || c.w }}
                    onPointerDown={hdrDown(c.key)}
                    onClick={() => {
                      if (squelch.current) { squelch.current = false; return; }
                      setColSub(null);
                      setColMenu(colMenu === c.key ? null : c.key);
                    }}
                    className={cn('relative h-8 cursor-pointer touch-none border-b border-line px-2 text-left text-xs font-normal whitespace-nowrap text-ink-2 select-none hover:bg-hover', c.right && 'text-right', dragCol === c.key && 'bg-active opacity-60')}
                    title="Click for options · drag to reorder"
                  >
                    <Tip label={c.label} info={c.info || (c.input && (schema[c.input]?.help || `${schema[c.input]?.type || 'text'} input`))}>
                      <span className={cn('inline-flex items-center gap-1.5', c.right && 'flex-row-reverse')}>
                        {c.icon && <c.icon size={14} strokeWidth={1.5} className="shrink-0 text-ink-3" />}
                        {c.label}
                      </span>
                    </Tip>
                    <Menu open={colMenu === c.key} onClose={() => { setColMenu(null); setColSub(null); }} className="top-8 left-0 w-44 cursor-default text-left font-normal">
                      {(c.key === 'when' || c.key === 'dur') && (
                        <SubMenu icon={ArrowUpDown} label="Sort" open={colSub === 'sort'} onOpen={() => setColSub('sort')} width="w-44">
                          <MenuItem onClick={(e) => { e.stopPropagation(); setSort({ field: c.key, dir: 'asc' }); setColMenu(null); }}>Sort ascending</MenuItem>
                          <MenuItem onClick={(e) => { e.stopPropagation(); setSort({ field: c.key, dir: 'desc' }); setColMenu(null); }}>Sort descending</MenuItem>
                        </SubMenu>
                      )}
                      {(c.key === 'status' || c.key === 'by' || c.input) && (
                        <SubMenu icon={FilterIcon} label="Filter" open={colSub === 'filter'} onOpen={() => setColSub('filter')}>
                          <ValuePicker
                            values={c.key === 'status' ? statuses : c.key === 'by' ? people : valuesOf(c.input)}
                            label={(v) => (c.key === 'by' ? startedName(v) : String(v))}
                            onPick={(v) => { setFilters((f) => [...f, { field: c.input || c.key, value: v }]); setColMenu(null); setColSub(null); }}
                          />
                        </SubMenu>
                      )}
                      {c.key !== 'run' && (
                        <MenuItem icon={Eye} onClick={(e) => { e.stopPropagation(); toggleCol(c.input || c.key); setColMenu(null); }}>Hide column</MenuItem>
                      )}
                    </Menu>
                    <div onPointerDown={(e) => resize(e, c.key, widths[c.key] || c.w)} className="absolute top-0 -right-0.5 z-10 h-full w-1 cursor-col-resize hover:bg-accent/40" data-resize={c.key} />
                  </th>
                ))}
                <th className="w-8 border-b border-line" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.run_id} onClick={() => onOpen(r.run_id)} className={cn('group cursor-pointer hover:bg-hover', openId === r.run_id && 'bg-active hover:bg-active')}>
                  {cols.map((c) => (
                    <td key={c.key} className={cn('overflow-hidden whitespace-nowrap border-b border-line px-2 py-1.5 align-middle text-sm', c.right && 'text-right')}>{cell(r, c)}</td>
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
    </div>
  );
}
