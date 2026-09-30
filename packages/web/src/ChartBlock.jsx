// Chart as a BlockNote block (flow.md §3a): /chart plots this app's runs or an
// output file with nivo. Config lives in block props, so it rides the runbook
// JSON autosave exactly like the Excalidraw block - no extra storage or routes.
import { lazy, Suspense, useEffect, useState } from 'react';
import { insertOrUpdateBlockForSlashMenu } from '@blocknote/core';
import { createReactBlockSpec } from '@blocknote/react';
import { BarChart3, Settings2 } from 'lucide-react';
import { api, isDark, wsHeaders } from './api.js';
import { IconBtn, Select } from './ui.jsx';
import { flattenRuns, parseOutput, columns, toNivo } from './chart-data.js';

// nivo is heavy - each chart type loads its chunk only when a chart of that type renders
const Line = lazy(() => import('@nivo/line').then((m) => ({ default: m.ResponsiveLine })));
const Bar = lazy(() => import('@nivo/bar').then((m) => ({ default: m.ResponsiveBar })));
const Pie = lazy(() => import('@nivo/pie').then((m) => ({ default: m.ResponsivePie })));
const Scatter = lazy(() => import('@nivo/scatterplot').then((m) => ({ default: m.ResponsiveScatterPlot })));
const Calendar = lazy(() => import('@nivo/calendar').then((m) => ({ default: m.ResponsiveCalendar })));

const MARGIN = { top: 10, right: 20, bottom: 45, left: 45 };
const TYPES = ['line', 'bar', 'pie', 'scatter', 'calendar'];
const SCHEMES = ['nivo', 'category10', 'accent', 'paired', 'set2', 'dark2'];
const DECIMALS = ['auto', '0', '1', '2', '3'];

// Follow Settings → Appearance live, same event the Excalidraw block listens to.
function useDark() {
  const [dark, setDark] = useState(isDark);
  useEffect(() => {
    const on = (e) => setDark(e.detail);
    window.addEventListener('small:theme', on);
    return () => window.removeEventListener('small:theme', on);
  }, []);
  return dark;
}

// nivo draws SVG text in its own theme, not CSS - dark mode needs explicit fills.
const nivoTheme = (dark) => ({
  text: { fill: dark ? '#d4d4d4' : '#37352f' },
  axis: { ticks: { text: { fill: dark ? '#9b9b9b' : '#63615d' } } }, // light: --color-ink-2
  grid: { line: { stroke: dark ? '#333' : '#e9e9e7' } },
  tooltip: { container: { background: dark ? '#252525' : '#fff', color: dark ? '#d4d4d4' : '#37352f' } },
});

function Chart({ type, data, x, y, cfg }) {
  const dark = useDark();
  const theme = nivoTheme(dark);
  const colors = { scheme: cfg.scheme || 'nivo' };
  const fmt = cfg.decimals === '' || cfg.decimals == null ? undefined : `>-.${cfg.decimals}f`;
  const axisLeft = fmt ? { format: fmt } : undefined;
  if (type === 'line') {
    return <Line data={data} theme={theme} colors={colors} yFormat={fmt} axisLeft={axisLeft} margin={MARGIN} xScale={{ type: 'point' }} axisBottom={{ tickRotation: -30 }} pointSize={6} useMesh />;
  }
  if (type === 'bar') {
    return <Bar data={data} theme={theme} colors={colors} valueFormat={fmt} axisLeft={axisLeft} groupMode={cfg.group || 'stacked'} keys={[y || 'count']} indexBy={x} margin={MARGIN} padding={0.3} axisBottom={{ tickRotation: -30 }} />;
  }
  if (type === 'scatter') {
    return <Scatter data={data} theme={theme} colors={colors} yFormat={fmt} axisLeft={axisLeft} margin={MARGIN} xScale={{ type: 'linear', min: 'auto', max: 'auto' }} yScale={{ type: 'linear', min: 'auto', max: 'auto' }} axisBottom={{ tickRotation: -30 }} nodeSize={8} />;
  }
  if (type === 'calendar') {
    const days = data.map((d) => d.day).sort();
    return <Calendar data={data} theme={theme} valueFormat={fmt} from={days[0]} to={days[days.length - 1]} margin={MARGIN} emptyColor={dark ? '#2a2a2a' : '#eeeeee'} dayBorderColor={dark ? '#191919' : '#ffffff'} monthBorderColor={dark ? '#191919' : '#ffffff'} />;
  }
  return <Pie data={data} theme={theme} colors={colors} valueFormat={fmt} margin={MARGIN} innerRadius={0.5} padAngle={1} arcLinkLabelsSkipAngle={10} />;
}

function ChartEmbed({ block, editor }) {
  const editable = editor.isEditable;
  const app = block.props.app;
  let saved = {};
  try { saved = JSON.parse(block.props.config || '{}'); } catch { /* stale props - start fresh */ }
  const cfg = { source: 'runs', file: '', type: 'line', x: '', y: '', scheme: 'nivo', decimals: '', group: 'stacked', ...saved };

  const [rows, setRows] = useState([]);
  const [files, setFiles] = useState([]);
  const [note, setNote] = useState('loading data…');
  const [more, setMore] = useState(false);

  const setCfg = (patch) => editor.updateBlock(block, { props: { config: JSON.stringify({ ...cfg, ...patch }) } });

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const { runs } = await api(`/api/runs?app=${encodeURIComponent(app)}`);
        if (cfg.source === 'runs') {
          if (dead) return;
          setRows(flattenRuns(runs));
          setNote(runs.length ? '' : 'no runs yet - run the job once and the chart fills in');
          return;
        }
        const last = (runs || []).find((r) => r.status === 'finished');
        if (!last) { if (!dead) setNote('no finished run to read outputs from'); return; }
        const { outputs } = await api(`/api/runs/${encodeURIComponent(last.run_id)}/outputs`);
        const usable = (outputs || []).map((o) => o.name).filter((n) => n.endsWith('.json') || n.endsWith('.csv'));
        if (dead) return;
        setFiles(usable);
        if (!usable.length) { setNote('latest run has no .json or .csv output'); return; }
        if (!cfg.file || !usable.includes(cfg.file)) { setRows([]); setNote(''); return; }
        const r = await fetch(`/api/runs/${encodeURIComponent(last.run_id)}/outputs/${encodeURIComponent(cfg.file)}`, { headers: wsHeaders() });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const parsed = parseOutput(cfg.file, await r.text());
        if (dead) return;
        setRows(parsed);
        setNote(parsed.length ? '' : `${cfg.file} has no rows to plot`);
      } catch (e) {
        if (!dead) setNote(`✗ ${e.message}`);
      }
    })();
    return () => { dead = true; };
  }, [cfg.source, cfg.file]);

  const cols = columns(rows);
  const data = toNivo(cfg.type, rows, cfg.x, cfg.y);
  const hint = {
    line: 'pick x and a numeric y',
    scatter: 'pick two numeric fields',
    calendar: 'pick a date field for x',
  }[cfg.type] || 'pick fields to plot';

  return (
    <div
      className="my-1 w-full rounded-sm border border-line"
      contentEditable={false}
      // ProseMirror listens at the editor root; without these it hijacks the config selects
      onKeyDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {editable && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line p-1.5 text-sm">
          <div className="w-28"><Select value={cfg.source} options={['runs', 'output file']} onChange={(v) => setCfg({ source: v === 'runs' ? 'runs' : 'output', file: '', x: '', y: '' })} /></div>
          {cfg.source === 'output' && <div className="w-40"><Select value={cfg.file} options={files} placeholder="file…" onChange={(v) => setCfg({ file: v, x: '', y: '' })} /></div>}
          <div className="w-24"><Select value={cfg.type} options={TYPES} onChange={(v) => setCfg({ type: v })} /></div>
          <div className="w-32"><Select value={cfg.x} options={cfg.type === 'scatter' ? cols.numeric : cols.all} placeholder="x…" onChange={(v) => setCfg({ x: v })} /></div>
          <div className="w-32"><Select value={cfg.y} options={cols.numeric} placeholder={cfg.type === 'line' ? 'y…' : 'y (count)…'} onChange={(v) => setCfg({ y: v })} /></div>
          <IconBtn aria-label="Chart options" title="Colors, decimals…" className="ml-auto" onClick={() => setMore(!more)}><Settings2 size={16} strokeWidth={1.5} /></IconBtn>
        </div>
      )}
      {editable && more && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line p-1.5 text-sm">
          <span className="pl-1 text-xs text-ink-2">colors</span>
          <div className="w-28"><Select value={cfg.scheme} options={SCHEMES} onChange={(v) => setCfg({ scheme: v })} /></div>
          <span className="pl-1 text-xs text-ink-2">decimals</span>
          <div className="w-20"><Select value={cfg.decimals === '' ? 'auto' : cfg.decimals} options={DECIMALS} onChange={(v) => setCfg({ decimals: v === 'auto' ? '' : v })} /></div>
          {cfg.type === 'bar' && (
            <>
              <span className="pl-1 text-xs text-ink-2">bars</span>
              <div className="w-28"><Select value={cfg.group} options={['stacked', 'grouped']} onChange={(v) => setCfg({ group: v })} /></div>
            </>
          )}
        </div>
      )}
      <div className="h-[280px] w-full">
        {data ? (
          <Suspense fallback={<div className="p-3 text-xs text-ink-2">loading chart…</div>}>
            <Chart type={cfg.type} data={data} x={cfg.x} y={cfg.y} cfg={cfg} />
          </Suspense>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-ink-2">{note || hint}</div>
        )}
      </div>
    </div>
  );
}

// createReactBlockSpec returns a factory in 0.54 - call it to get the spec
export const chartBlock = createReactBlockSpec(
  { type: 'chart', propSchema: { app: { default: '' }, config: { default: '' } }, content: 'none' },
  { render: (props) => <ChartEmbed block={props.block} editor={props.editor} /> },
)();

export const insertChart = (editor, app) => ({
  title: 'Chart',
  subtext: 'Plot runs or an output file',
  aliases: ['chart', 'graph', 'plot', 'nivo'],
  group: 'Media',
  icon: <BarChart3 size={18} />,
  onItemClick: () => {
    insertOrUpdateBlockForSlashMenu(editor, { type: 'chart', props: { app } });
    // the block is configured by mouse - drop the text cursor so BlockNote's
    // "type / for commands" placeholder doesn't hang glued under the fresh chart
    setTimeout(() => document.activeElement?.blur(), 50);
  },
});
