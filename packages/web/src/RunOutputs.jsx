import { useEffect, useState } from 'react';
import { Copy, FileText } from 'lucide-react';
import { Button, fmtBytes, toast } from './ui.jsx';
import { chartShape, fileNote, imageFiles, jsonValue, referenceCurve, rowFiles, sanitizeSvg, shortHash } from './run-card-outputs.js';

// What a run shows under its log (Run card v1.1 Part 2, outputs A; rehearsal-runtime/schemas/run-status.json): a metric chart, a JSON tree, an inline image and rows for the
// other produced files. The log pane itself stays RunCard.jsx's. Colours are the app's tokens (text-accent, text-ink-2, text-ink-3, bg-code, border-line); nothing new is drawn
// that an existing component covers: Button for Copy, toast() for its notice, <details> for the tree as the app's other disclosures.
// load(path) -> Promise<{ bytes: ArrayBuffer, type: string }>: the produced file through GET /api/learn/run?action=file (RunCard.jsx); never called for a binary.

// A small line chart of one metric series, live while the run streams: the run's own curve, the rehearsal's as a faint straight reference when the cell recorded it, the first and last
// values labelled. ponytail: the app's chart renderers (nivo in the runbook, the graph card's d3) are heavier than this one polyline; revisit if a second chart kind is needed here.
export function MetricChart({ series, reference }) {
  const shape = chartShape(series, reference);
  if (!shape) return null;
  return (
    <figure data-run-metric={series.name} className="m-0 flex flex-col gap-1">
      <figcaption className="flex items-center gap-3 text-xs text-ink-2"><span className="font-medium text-ink">{series.name}</span>
        <span className="flex items-center gap-1"><span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-accent" />this run</span>
        {shape.ref && <span className="flex items-center gap-1"><span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-ink-3 opacity-50" />rehearsal</span>}</figcaption>
      <svg role="img" aria-label={`${series.name} over the run`} viewBox={`0 0 ${shape.w} ${shape.h}`} className="h-32 w-full rounded-sm bg-code">
        {shape.ref && <path d={shape.ref} fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" className="text-ink-3" opacity="0.5" />}
        <path d={shape.line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" className="text-accent" />
        {[shape.first, shape.last].filter(Boolean).map((p, i) => (
          <g key={i}><circle cx={p.x} cy={p.y} r="3" className="fill-accent" />
            <text x={p.x + 6} y={Math.min(shape.h - 4, Math.max(10, p.y + 3))} className="fill-ink-2 text-[10px]">{p.label}</text></g>
        ))}
      </svg>
    </figure>
  );
}

// A collapsible tree of a JSON value (stdoutKind json). Containers are <details>; the first level starts open.
function Node({ name, value, depth }) {
  const label = name === null ? null : <span className="text-ink-2">{name}: </span>;
  if (value === null || typeof value !== 'object') return <div className="pl-4">{label}<span className={typeof value === 'string' ? 'text-ink' : 'text-accent'}>{JSON.stringify(value)}</span></div>;
  const entries = Array.isArray(value) ? value.map((v, i) => [i, v]) : Object.entries(value), shown = entries.slice(0, 100);
  return (
    <details open={depth < 1} className="pl-4">
      <summary className="cursor-pointer select-none">{label}<span className="text-ink-3">{Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}</span></summary>
      {shown.map(([k, v]) => <Node key={k} name={String(k)} value={v} depth={depth + 1} />)}
      {entries.length > shown.length && <div className="pl-4 text-ink-3">{entries.length - shown.length} more</div>}
    </details>
  );
}
export function JsonOutput({ value }) {
  const copy = async () => { try { await navigator.clipboard.writeText(JSON.stringify(value, null, 2)); toast('Copied'); } catch { toast('Copy was blocked', { tone: 'error' }); } };
  return (
    <div data-run-json className="flex flex-col gap-1">
      <div className="flex items-center gap-2"><p className="flex-1 text-xs font-medium text-ink-2">JSON</p>
        <Button type="button" variant="ghost" size="sm" data-run-json-copy onClick={copy}><Copy size={12} aria-hidden="true" />Copy</Button></div>
      <div className="max-h-64 overflow-auto rounded-sm bg-code p-3 font-mono text-xs leading-relaxed"><Node name={null} value={value} depth={0} /></div>
    </div>
  );
}

const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
// An image the run produced, shown through <img> of a Blob URL: an SVG is cleaned first (sanitizeSvg) and typed image/svg+xml, so no script runs and nothing outside loads. Click to enlarge.
export function ImageOutput({ file, load }) {
  const [state, setState] = useState({ url: '', error: '' }), [big, setBig] = useState(false);
  useEffect(() => {
    let alive = true, url = '';
    (async () => {
      try {
        const ext = (/\.([A-Za-z0-9]+)$/.exec(file.path) || [])[1]?.toLowerCase(), type = IMAGE_TYPES[ext];
        if (!type) throw new Error('not a picture type');
        const { bytes } = await load(file.path);
        let blob;
        if (type === 'image/svg+xml') { const clean = sanitizeSvg(new TextDecoder().decode(bytes)); if (!clean) throw new Error('nothing safe to draw'); blob = new Blob([clean], { type }); }
        else blob = new Blob([bytes], { type });
        url = URL.createObjectURL(blob);
        if (alive) setState({ url, error: '' });
      } catch (error) { if (alive) setState({ url: '', error: error.message || 'could not be loaded' }); }
    })();
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [file.path, file.sha256]); // eslint-disable-line react-hooks/exhaustive-deps -- load is the card's and changes every render
  if (state.error) return <FileRow file={file} note={`could not be shown: ${state.error}`} />;
  if (!state.url) return <p className="text-xs text-ink-2">Loading {file.path}</p>;
  return (
    <figure data-run-image={file.path} className="m-0 flex flex-col gap-1">
      <button type="button" aria-label={big ? `Shrink ${file.path}` : `Enlarge ${file.path}`} aria-pressed={big} onClick={() => setBig(v => !v)} className="w-fit max-w-full rounded-sm bg-code p-1">
        <img src={state.url} alt={file.path} className={big ? 'max-w-full' : 'max-h-48 max-w-full'} />
      </button>
      <figcaption className="text-xs text-ink-2">{file.path} · {fmtBytes(file.bytes)}</figcaption>
    </figure>
  );
}

// A produced file that is not shown: name, size, short hash and what it is. Never a download control, never fetched.
export function FileRow({ file, note }) {
  return (
    <li data-run-file={file.path} data-run-file-kind={file.kind} className="flex flex-wrap items-center gap-x-2 text-xs text-ink-2">
      <FileText size={12} aria-hidden="true" className="shrink-0" />
      <span className="font-mono text-ink">{file.path}</span>
      <span>{fmtBytes(file.bytes)}</span>
      {file.sha256 && <span className="font-mono" title="sha256">{shortHash(file.sha256)}</span>}
      <span>{note ?? fileNote(file)}</span>
    </li>
  );
}

// All the blocks under one run's log. gone: the run's session has ended, so only what the card kept shows and bytes are marked no longer available.
export default function RunOutputs({ status, cell, load, gone = false }) {
  if (!status) return null;
  const json = gone ? undefined : jsonValue(status), series = gone ? [] : (status.metrics || []).filter(m => (m.points || []).length > 0);
  const images = gone ? [] : imageFiles(status), rows = gone ? status.producedFiles || [] : rowFiles(status);
  if (!series.length && json === undefined && !images.length && !rows.length) return null;
  return (
    <div data-run-outputs className="flex flex-col gap-2">
      {series.map(m => <MetricChart key={m.name} series={m} reference={referenceCurve(cell?.expected, m)} />)}
      {json !== undefined && <JsonOutput value={json} />}
      {images.map(file => <ImageOutput key={file.path} file={file} load={path => load(path)} />)}
      {rows.length > 0 && <ul data-run-files className="m-0 flex list-none flex-col gap-1 p-0">{rows.map(file => <FileRow key={file.path} file={file} note={gone ? 'produced earlier, no longer available' : undefined} />)}</ul>}
    </div>
  );
}
