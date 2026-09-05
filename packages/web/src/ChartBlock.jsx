// Chart as a BlockNote block (flow.md §3a): /chart plots this app's runs or an
// output file with nivo. Config lives in block props, so it rides the runbook
// JSON autosave exactly like the Excalidraw block — no extra storage or routes.
import { lazy, Suspense, useEffect, useState } from 'react';
import { insertOrUpdateBlockForSlashMenu } from '@blocknote/core';
import { createReactBlockSpec } from '@blocknote/react';
import { BarChart3 } from 'lucide-react';
import { api, isDark } from './api.js';
import { Select } from './ui.jsx';
import { flattenRuns, parseOutput, columns, toNivo } from './chart-data.js';

// nivo is heavy — each chart type loads its chunk only when a chart of that type renders
const Line = lazy(() => import('@nivo/line').then((m) => ({ default: m.ResponsiveLine })));
const Bar = lazy(() => import('@nivo/bar').then((m) => ({ default: m.ResponsiveBar })));
const Pie = lazy(() => import('@nivo/pie').then((m) => ({ default: m.ResponsivePie })));

const MARGIN = { top: 10, right: 20, bottom: 45, left: 45 };
const TYPES = ['line', 'bar', 'pie'];

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

// nivo draws SVG text in its own theme, not CSS — dark mode needs explicit fills.
const nivoTheme = (dark) => ({
  text: { fill: dark ? '#d4d4d4' : '#37352f' },
  axis: { ticks: { text: { fill: dark ? '#9b9b9b' : '#787774' } } },
  grid: { line: { stroke: dark ? '#333' : '#e9e9e7' } },
  tooltip: { container: { background: dark ? '#252525' : '#fff', color: dark ? '#d4d4d4' : '#37352f' } },
});

function Chart({ type, data, x, y }) {
  const theme = nivoTheme(useDark());
  if (type === 'line') {
    return <Line data={data} theme={theme} margin={MARGIN} xScale={{ type: 'point' }} axisBottom={{ tickRotation: -30 }} pointSize={6} useMesh />;
  }
  if (type === 'bar') {
    return <Bar data={data} theme={theme} keys={[y || 'count']} indexBy={x} margin={MARGIN} padding={0.3} axisBottom={{ tickRotation: -30 }} />;
  }
  return <Pie data={data} theme={theme} margin={MARGIN} innerRadius={0.5} padAngle={1} arcLinkLabelsSkipAngle={10} />;
}

function ChartEmbed({ block, editor }) {
  const editable = editor.isEditable;
  const app = block.props.app;
  let saved = {};
  try { saved = JSON.parse(block.props.config || '{}'); } catch { /* stale props — start fresh */ }
  const cfg = { source: 'runs', file: '', type: 'line', x: '', y: '', ...saved };

  const [rows, setRows] = useState([]);
  const [files, setFiles] = useState([]);
  const [note, setNote] = useState('loading data…');

  const setCfg = (patch) => editor.updateBlock(block, { props: { config: JSON.stringify({ ...cfg, ...patch }) } });

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const { runs } = await api(`/api/runs?app=${encodeURIComponent(app)}`);
        if (cfg.source === 'runs') {
          if (dead) return;
          setRows(flattenRuns(runs));
          setNote(runs.length ? '' : 'no runs yet — run the job once and the chart fills in');
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
        const r = await fetch(`/api/runs/${encodeURIComponent(last.run_id)}/outputs/${encodeURIComponent(cfg.file)}`);
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
  const hint = cfg.type === 'line' && cfg.x && !cfg.y ? 'pick a numeric y field' : 'pick fields to plot';

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
          <div className="w-32"><Select value={cfg.x} options={cols.all} placeholder="x…" onChange={(v) => setCfg({ x: v })} /></div>
          <div className="w-32"><Select value={cfg.y} options={cols.numeric} placeholder={cfg.type === 'line' ? 'y…' : 'y (count)…'} onChange={(v) => setCfg({ y: v })} /></div>
        </div>
      )}
      <div className="h-[280px] w-full">
        {data ? (
          <Suspense fallback={<div className="p-3 text-xs text-ink-2">loading chart…</div>}>
            <Chart type={cfg.type} data={data} x={cfg.x} y={cfg.y} />
          </Suspense>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-ink-2">{note || hint}</div>
        )}
      </div>
    </div>
  );
}

// createReactBlockSpec returns a factory in 0.54 — call it to get the spec
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
  onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'chart', props: { app } }),
});
