import { useEffect, useState } from 'react';
import { AlignLeft, Braces, ChartLine, Check, ChevronDown, ChevronRight, Code, File, Film, Image, NotebookPen, Play, Save, Table, Volume2, X } from 'lucide-react';
import { Button, Pill } from './ui.jsx';
import { OutputPane, PRE, TONE } from './RunParts.jsx';
import RunOutputs, { MetricChart } from './RunOutputs.jsx';
import { FILTERS, chipsOf, compareCell, compareModel, filterHistory } from './run-card-history.js';
import { paneText, seconds } from './run-card-view.js';

// The History tab (Run card v1.1 Part 3c): every run this card made, newest first, the last 50. A row is the time, the source, the flags that differ from the defaults as chips, the exit
// mark, the duration, the kinds of output as icons and the session. Expanded it shows the run's outputs: re-fetched from the controller while the session lives (getStatus), else the
// stored tail with the produced files marked no longer available. Actions: Run again, Save as custom run, Compare with rehearsal. Read-only for a viewer.
// Reused: ui.jsx Button and Pill, lucide icons (as the app's other cards), RunParts.jsx's output pane, RunOutputs.jsx's chart and rows.
const KIND = { text: [AlignLeft, 'text'], chart: [ChartLine, 'chart'], json: [Braces, 'JSON'], image: [Image, 'image'], table: [Table, 'table'], html: [Code, 'page'], markdown: [AlignLeft, 'markdown'], notebook: [NotebookPen, 'notebook'], audio: [Volume2, 'audio'], video: [Film, 'video'], binary: [File, 'file'] };

function Detail({ entry, cells, readOnly, ready, getStatus, load, onRunAgain, onSavePreset }) {
  const [state, setState] = useState({ loading: true, status: null }), [compare, setCompare] = useState(false);
  useEffect(() => {
    let alive = true;
    getStatus(entry).then(status => { if (alive) setState({ loading: false, status }); }, () => { if (alive) setState({ loading: false, status: null }); });
    return () => { alive = false; };
  }, [entry.runId, ready]); // eslint-disable-line react-hooks/exhaustive-deps -- getStatus is the card's and changes every render
  const live = state.status, cell = compareCell(entry, cells), model = compare ? compareModel(entry, live, cell) : null;
  const stored = { producedFiles: (entry.files || []).map(f => ({ ...f, fetched: false })) };
  return (
    <div data-run-history-detail className="flex flex-col gap-2 pt-2">
      {state.loading ? <p className="text-xs text-ink-2">Loading the run</p> : (
        <>
          <OutputPane running={false} text={(live ? paneText(live) : entry.tail) || 'No output'} />
          {live ? <RunOutputs status={live} cell={cell} load={path => load(entry.runId, path)} /> : <RunOutputs status={stored} cell={cell} gone load={() => Promise.reject(new Error('gone'))} />}
        </>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" data-run-again disabled={readOnly} onClick={() => onRunAgain(entry)}><Play size={12} aria-hidden="true" />Run again</Button>
        <Button type="button" variant="ghost" size="sm" data-run-save-custom disabled={readOnly || !!(entry.cellId && !cell) || (entry.cellId && cell?.kind === 'install')} onClick={() => onSavePreset(entry)}><Save size={12} aria-hidden="true" />Save as custom run</Button>
        <Button type="button" variant="ghost" size="sm" data-run-compare aria-pressed={compare} disabled={!cell || cell.kind === 'install'} onClick={() => setCompare(v => !v)}>Compare with rehearsal</Button>
      </div>
      {model?.kind === 'chart' && <MetricChart series={model.series} reference={model.ref} />}
      {model?.kind === 'text' && (
        <div data-run-compare-text className="flex flex-col gap-1">
          {model.note && <p className="text-xs text-ink-2">{model.note}</p>}
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0"><p className="text-xs font-medium text-ink-2">This run</p><pre className={`${PRE} max-h-48 overflow-y-auto`}>{model.mine || 'No output'}</pre></div>
            <div className="min-w-0"><p className="text-xs font-medium text-ink-2">Rehearsal</p><pre className={`${PRE} max-h-48 overflow-y-auto`}>{model.rehearsal || 'No output'}</pre></div>
          </div>
        </div>
      )}
      {model?.kind === 'none' && <p className="text-xs text-ink-2">{model.reason}</p>}
    </div>
  );
}

export default function RunHistory({ history, cells, readOnly, ready, filter, setFilter, getStatus, load, onRunAgain, onSavePreset }) {
  const [open, setOpen] = useState(null), rows = filterHistory(history, filter);
  return (
    <div data-run-history-list className="flex flex-col gap-2 px-4 py-3">
      <div role="group" aria-label="Filter runs" className="flex flex-wrap gap-1.5">
        {FILTERS.map(name => <Button key={name} type="button" size="sm" variant={filter === name ? 'secondary' : 'ghost'} aria-pressed={filter === name} data-run-filter={name} onClick={() => setFilter(name)}>{name}</Button>)}
      </div>
      {rows.length === 0 && <p className="text-sm text-ink-2">{(history || []).length ? 'No runs match this filter.' : 'Runs from the Run and Custom run tabs are listed here.'}</p>}
      <ol className="m-0 flex list-none flex-col p-0">
        {rows.map(entry => {
          const key = `${entry.at}-${entry.runId || entry.source}`, on = open === key, tone = entry.ok ? 'success' : 'error';
          return (
            <li key={key} data-run-history-row={entry.source} data-run-ok={entry.ok} className="flex flex-col border-t border-line py-2 first:border-t-0">
              <button type="button" aria-expanded={on} onClick={() => setOpen(on ? null : key)} className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-left text-xs text-ink-2">
                {on ? <ChevronDown size={12} aria-hidden="true" className="shrink-0" /> : <ChevronRight size={12} aria-hidden="true" className="shrink-0" />}
                <span data-run-history-at>{new Date(entry.at).toLocaleString()}</span>
                <span className="font-medium text-ink">{entry.source}</span>
                {chipsOf(entry).map(chip => <Pill key={chip} color="grey" className="font-mono">{chip}</Pill>)}
                <span className={`flex items-center gap-0.5 font-medium ${TONE[tone]}`} data-run-history-rc>{entry.ok ? <Check size={12} aria-hidden="true" /> : <X size={12} aria-hidden="true" />}{entry.ok ? 'rc 0' : Number.isInteger(entry.rc) ? `rc ${entry.rc}` : 'failed'}</span>
                <span>{seconds(entry.sec)}</span>
                <span className="flex items-center gap-1">{(entry.kinds || []).map(kind => { const [Icon, label] = KIND[kind] || KIND.text; return <Icon key={kind} size={12} aria-label={label} role="img" />; })}</span>
                {entry.sessionLabel && <span>{entry.sessionLabel}</span>}
              </button>
              {!entry.ok && entry.error && <p data-run-history-error className="pl-5 text-xs text-fail">{entry.error}</p>}
              {on && <div className="pl-5"><Detail entry={entry} cells={cells} readOnly={readOnly} ready={ready} getStatus={getStatus} load={load} onRunAgain={onRunAgain} onSavePreset={onSavePreset} /></div>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
