import { useEffect, useRef, useState } from 'react';
import { BaseBoxShapeUtil, HTMLContainer, T, useValue } from 'tldraw';
import { getThreeDContext } from './three-d-context.js';
import { validateThreeD } from '../../control-plane/src/learn-three-d-schema.js';

export class ThreeDShapeUtil extends BaseBoxShapeUtil {
  static type = 'three-d-viewer';
  static props = { w: T.number, h: T.number, modelUrl: T.string, camera: T.jsonValue, autoRotate: T.boolean, animation: T.jsonValue, animationTime: T.number };
  getDefaultProps() { return { w: 600, h: 420, modelUrl: '', camera: {}, autoRotate: false, animation: { autoplay: false }, animationTime: 0 }; }
  component(shape) { return <ThreeDViewer shape={shape} editor={this.editor} />; }
  getIndicatorPath(shape) { const p = new Path2D(); p.rect(0, 0, shape.props.w, shape.props.h); return p; }
  getThreeDContext(id) { return getThreeDContext(this.editor, id); }
  onDoubleClick(shape) {
    this.editor.getContainer().dispatchEvent(new CustomEvent('learn-three-d-interact', { detail: { shapeId: shape.id } }));
    // A handled shape change prevents tldraw's fallback from creating a text shape.
    return { id: shape.id, type: shape.type };
  }
  toSvg(shape) { return <g><rect width={shape.props.w} height={shape.props.h} fill="#f4f5f7" stroke="#a3a3a3" /><text x={20} y={35} fontSize={18}>{shape.meta.concept || '3D model'}</text><text x={20} y={65} fontSize={14}>Open this note to explore the 3D model</text></g>; }
}

function ThreeDViewer({ shape, editor }) {
  const host = useRef(), root = useRef(), engine = useRef(), latest = useRef(shape); latest.current = shape;
  const [active, setActive] = useState(false), [ready, setReady] = useState(false), [clips, setClips] = useState([]), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const selected = useValue('3D selected', () => editor.getSelectedShapeIds().includes(shape.id), [editor, shape.id]);
  const patch = props => { if (editor.getShape(shape.id)) editor.updateShape({ id: shape.id, type: shape.type, props }); };
  useEffect(() => {
    let disposed = false, instance; setReady(false); setError('');
    import('./three-d-renderer.js').then(({ createThreeDRenderer }) => {
      if (disposed) return;
      const current = latest.current;
      validateThreeD({ op: 'interactive_3d', id: 'viewer', concept: current.meta.concept || '3D model', modelUrl: current.props.modelUrl, camera: current.props.camera, animation: current.props.animation, autoRotate: current.props.autoRotate });
      instance = createThreeDRenderer(host.current, current.props, patch, names => { setClips(names); setReady(true); }, setError); engine.current = instance;
    }).catch(e => { if (!disposed) setError(e.message); });
    return () => { disposed = true; instance?.destroy(); engine.current = null; };
  }, [shape.id, shape.props.modelUrl, attempt]);
  useEffect(() => { engine.current?.update(shape.props); }, [shape.props]);
  useEffect(() => { if (!selected) setActive(false); }, [selected]);
  useEffect(() => {
    const container = editor.getContainer();
    const enter = event => { if (ready && event.detail.shapeId === shape.id) { editor.select(shape.id); setActive(true); } };
    container.addEventListener('learn-three-d-interact', enter);
    return () => container.removeEventListener('learn-three-d-interact', enter);
  }, [editor, shape.id, ready]);
  useEffect(() => {
    engine.current?.interact(active);
    if (!active) return;
    const exit = event => { if (event.type === 'keydown' ? event.key === 'Escape' : !root.current?.contains(event.target)) { setActive(false); if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); } } };
    document.addEventListener('pointerdown', exit, true); document.addEventListener('keydown', exit, true);
    return () => { document.removeEventListener('pointerdown', exit, true); document.removeEventListener('keydown', exit, true); };
  }, [active, ready]);
  useEffect(() => {
    const element = host.current, wheel = e => { if (active) e.stopPropagation(); };
    element.addEventListener('wheel', wheel, { passive: true }); return () => element.removeEventListener('wheel', wheel);
  }, [active]);
  const enter = () => { if (ready) { editor.select(shape.id); setActive(true); } };
  const handled = e => { if (active) editor.markEventAsHandled(e); };
  const stop = e => e.stopPropagation();
  return <HTMLContainer style={{ width: shape.props.w, height: shape.props.h, pointerEvents: 'all', border: `1px solid ${active ? '#525252' : '#a3a3a3'}`, borderRadius: 8, overflow: 'hidden', background: '#f4f5f7', color: '#171717' }}>
    <div ref={root} style={{ width: '100%', height: '100%' }}>
      <div title="Drag the frame to move this 3D viewer" style={{ height: 34, display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px', background: '#f5f5f5', borderBottom: '1px solid #ddd', cursor: 'grab', fontSize: 13 }}>
        <span style={{ maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shape.meta.concept || '3D model'}</span>
        <button disabled={!ready} onPointerDown={stop} onClick={e => { stop(e); if (active) setActive(false); else enter(); }} style={{ border: '1px solid #bbb', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', color: 'inherit' }}>{active ? 'Done' : 'Interact'}</button>
      </div>
      <div aria-label="Interactive 3D viewer" onPointerDownCapture={handled} onPointerMoveCapture={handled} onPointerUpCapture={handled} onDoubleClick={e => { stop(e); enter(); }} onContextMenu={e => { if (active) e.preventDefault(); }} style={{ position: 'relative', width: '100%', height: 'calc(100% - 34px)' }}>
        <div ref={host} style={{ width: '100%', height: '100%', pointerEvents: active ? 'auto' : 'none' }} />
        {!active && <div style={{ position: 'absolute', inset: 0 }} />}
        {active && <div style={{ position: 'absolute', top: 8, left: 10, fontSize: 11, pointerEvents: 'none', background: '#ffffffd9', padding: '3px 6px', borderRadius: 4 }}>Drag to orbit · Scroll to zoom · Right-drag to pan · Esc to finish</div>}
        {ready && clips.length > 0 && <div onPointerDown={stop} onKeyDown={stop} style={{ position: 'absolute', top: active ? 40 : 10, left: 10, display: 'flex', gap: 8, background: 'white', padding: 6, borderRadius: 5, fontSize: 12 }}>
          <button style={{ color: 'inherit' }} onClick={() => patch({ animation: { ...shape.props.animation, autoplay: !shape.props.animation.autoplay } })}>{shape.props.animation.autoplay ? 'Pause animation' : 'Play animation'}</button>
          <select style={{ color: 'inherit' }} aria-label="Animation clip" value={clips.includes(shape.props.animation.clipName) ? shape.props.animation.clipName : clips[0]} onChange={e => patch({ animation: { ...shape.props.animation, clipName: e.target.value }, animationTime: 0 })}>{clips.map((name, i) => <option key={i} value={name}>{name || `Clip ${i + 1}`}</option>)}</select>
        </div>}
        {(!ready || error) && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', padding: 20, background: '#f4f5f7', fontSize: 13 }}>{error || 'Loading 3D model…'}{error && <button onPointerDown={stop} onClick={() => setAttempt(n => n + 1)}>Retry model</button>}</div>}
      </div>
    </div>
  </HTMLContainer>;
}
