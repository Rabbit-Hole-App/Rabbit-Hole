import { useEffect, useRef, useState } from 'react';
import { BaseBoxShapeUtil, HTMLContainer, T } from 'tldraw';
import { graphRenderers } from './graph-renderers.js';
import { emitGraphEvent, getGraphContext } from './graph-context.js';
import { validateGraph } from '../../control-plane/src/learn-graph-schema.js';

export class InteractiveGraphShapeUtil extends BaseBoxShapeUtil {
  static type = 'interactive-graph';
  static props = { w: T.number, h: T.number, spec: T.jsonValue, state: T.jsonValue, app: T.string };
  getDefaultProps() { return { w: 640, h: 420, spec: {}, state: {}, app: '' }; }
  component(shape) { return <InteractiveGraph shape={shape} editor={this.editor} />; }
  getIndicatorPath(shape) { const path = new Path2D(); path.rect(0, 0, shape.props.w, shape.props.h); return path; }
  getGraphContext(shapeId) { return getGraphContext(this.editor, shapeId); }
  toSvg(shape) { return <g><rect width={shape.props.w} height={shape.props.h} fill="white" stroke="#a3a3a3" /><text x={20} y={35} fontSize={18}>{shape.props.spec.title || shape.props.spec.concept}</text><text x={20} y={65} fontSize={14}>Interactive graph: open this note to explore</text></g>; }
}

function InteractiveGraph({ shape, editor }) {
  const host = useRef(null), engine = useRef(null), ownState = useRef('');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false, instance;
    setError(''); setLoaded(false);
    const change = (patch, event, detail) => {
      const current = editor.getShape(shape.id);
      if (disposed || !current) return;
      const state = { ...current.props.state, ...patch, ...(patch.parameters ? { parameters: { ...current.props.state.parameters, ...patch.parameters } } : {}) };
      const encoded = JSON.stringify(state);
      if (encoded === ownState.current) return;
      if (encoded.length > 300000) { setError('Graph state is too large to save. Reduce the number of expressions.'); return; }
      ownState.current = encoded;
      editor.updateShape({ id: shape.id, type: 'interactive-graph', props: { state } });
      if (event) emitGraphEvent(editor, shape.id, event, detail);
    };
    (async () => {
      validateGraph(shape.props.spec);
      instance = await graphRenderers[shape.props.spec.renderer](host.current, shape.props.spec, shape.props.state, shape.props.app, change);
      if (disposed) { instance.destroy(); return; }
      engine.current = instance; ownState.current = JSON.stringify(editor.getShape(shape.id)?.props.state || {}); setLoaded(true);
      instance.resize();
    })().catch(error => { if (!disposed) setError(error.message); });
    return () => { disposed = true; instance?.destroy(); engine.current = null; };
  }, [shape.id, shape.props.spec, shape.props.app, attempt, editor]);
  useEffect(() => {
    const encoded = JSON.stringify(shape.props.state);
    if (engine.current && encoded !== ownState.current) {
      ownState.current = encoded;
      Promise.resolve(engine.current.restore(shape.props.state)).catch(error => setError(error.message));
    }
  }, [shape.props.state]);
  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    // tldraw installs a native wheel listener below React's event delegation root.
    // Stop bubbling here, after the engine sees it, before the canvas also pans.
    const wheel = event => event.stopPropagation();
    element.addEventListener('wheel', wheel, { passive: true });
    const observer = new ResizeObserver(() => { if (engine.current) Promise.resolve(engine.current.resize()).catch(() => {}); });
    observer.observe(element); return () => { observer.disconnect(); element.removeEventListener('wheel', wheel); };
  }, []);
  const stop = event => event.stopPropagation();
  return <HTMLContainer style={{ width: shape.props.w, height: shape.props.h, background: 'white', color: '#171717', border: '1px solid #a3a3a3', borderRadius: 8, overflow: 'hidden', pointerEvents: 'all' }}>
    <div title="Drag this frame to move the graph" style={{ height: 32, padding: '6px 12px', fontSize: 13, background: '#f5f5f5', borderBottom: '1px solid #e5e5e5', cursor: 'grab', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shape.props.spec.title || shape.props.spec.concept || 'Interactive graph'}</div>
    <div aria-label={`${shape.props.spec.renderer} interactive graph`} onPointerDownCapture={editor.markEventAsHandled} onPointerMoveCapture={editor.markEventAsHandled} onPointerUpCapture={editor.markEventAsHandled} onDoubleClick={stop} onWheel={stop} onKeyDown={stop} onKeyUp={stop} style={{ width: '100%', height: 'calc(100% - 32px)', position: 'relative' }}>
      <div ref={host} style={{ width: '100%', height: '100%' }} />
      {(!loaded || error) && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', padding: 20, background: 'white', fontSize: 13 }}>
        {error || 'Loading interactive graph…'}
        {error && <button onClick={() => setAttempt(v => v + 1)} style={{ marginTop: 10, border: '1px solid #a3a3a3', padding: 6, borderRadius: 4 }}>Retry graph</button>}
      </div>}
    </div>
  </HTMLContainer>;
}
