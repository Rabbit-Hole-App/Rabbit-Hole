import { useEffect, useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, Handle, Position } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// Structured lesson diagrams: the agent supplies nodes and edges, ELK decides
// the layout, React Flow draws it. Nothing positions anything by hand.
// ponytail: layered layout only; other ELK algorithms when a lesson needs one.

const TONES = {
  input: 'border-line bg-white text-ink',
  step: 'border-accent/40 bg-accent/5 text-ink',
  repeat: 'border-[#7c3aed]/40 bg-[#7c3aed]/5 text-ink',
  output: 'border-green-700/40 bg-green-700/5 text-ink',
  note: 'border-dashed border-line bg-hover text-ink-2',
};

function LessonNode({ data }) {
  return (
    <div className={`min-w-28 rounded-lg border px-3 py-2 text-center text-xs leading-snug shadow-sm ${TONES[data.tone] || TONES.step}`}>
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !border-0 !bg-ink-3" />
      <div className="font-medium">{data.label}</div>
      {data.detail && <div className="mt-0.5 font-mono text-[10px] text-ink-2">{data.detail}</div>}
      <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !border-0 !bg-ink-3" />
    </div>
  );
}

const nodeTypes = { lesson: LessonNode };

export default function FlowDiagram({ spec }) {
  const [layout, setLayout] = useState(null);
  const [error, setError] = useState('');
  const source = useMemo(() => spec, [JSON.stringify(spec)]);
  useEffect(() => {
    let live = true;
    (async () => {
      const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
      const elk = new ELK();
      const measured = source.nodes.map(node => ({ id: node.id, width: Math.max(120, (node.label?.length || 8) * 8), height: node.detail ? 54 : 40 }));
      const graph = await elk.layout({
        id: 'root',
        layoutOptions: {
          'elk.algorithm': 'layered',
          'elk.direction': source.direction || 'DOWN',
          'elk.spacing.nodeNode': '28',
          'elk.layered.spacing.nodeNodeBetweenLayers': '46',
        },
        children: measured,
        edges: source.edges.map((edge, index) => ({ id: `e${index}`, sources: [edge.source], targets: [edge.target] })),
      });
      if (!live) return;
      const placed = new Map(graph.children.map(child => [child.id, child]));
      setLayout({
        nodes: source.nodes.map(node => ({
          id: node.id,
          type: 'lesson',
          position: { x: placed.get(node.id)?.x || 0, y: placed.get(node.id)?.y || 0 },
          data: { label: node.label, detail: node.detail, tone: node.tone },
        })),
        edges: source.edges.map((edge, index) => ({
          id: `e${index}`, source: edge.source, target: edge.target, label: edge.label,
          animated: !!edge.animated, style: { stroke: '#94a3b8' }, labelStyle: { fontSize: 10, fill: '#787774' },
        })),
      });
    })().catch(problem => { if (live) setError(problem.message); });
    return () => { live = false; };
  }, [source]);
  if (error) return <div className="grid h-full place-content-center p-4 text-center text-xs text-ink-2">{error}</div>;
  if (!layout) return <div className="grid h-full place-content-center p-4 text-center text-xs text-ink-2">Laying out the diagram…</div>;
  return (
    <ReactFlow nodes={layout.nodes} edges={layout.edges} nodeTypes={nodeTypes} fitView proOptions={{ hideAttribution: true }}
      nodesDraggable nodesConnectable={false} elementsSelectable={false} minZoom={0.3} maxZoom={2}>
      <Background gap={18} size={1} color="#e9e9e7" />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
  );
}
