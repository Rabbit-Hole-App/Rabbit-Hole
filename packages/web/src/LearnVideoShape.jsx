import { BaseBoxShapeUtil, HTMLContainer, T } from 'tldraw';

// Only the proposed, pending and error states are custom. Finished clips use
// tldraw's video shape. A generated clip or scene is paid, so it starts as a
// proposal: nothing is generated until the learner presses Generate
// (docs/features/learn-artifact-generation.md).
export class LearnVideoShapeUtil extends BaseBoxShapeUtil {
  static type = 'learn-video-pending';
  static props = { w: T.number, h: T.number, status: T.string, caption: T.string, error: T.string, retryable: T.boolean };
  getDefaultProps() { return { w: 480, h: 270, status: 'idle', caption: '', error: '', retryable: true }; }
  isAspectRatioLocked() { return true; }
  component(shape) {
    const scene = !!shape.meta.sceneOperation, status = shape.props.status;
    const button = { pointerEvents: 'all', border: '1px solid #737373', borderRadius: 6, padding: '6px 14px', background: 'white' };
    const stop = event => event.stopPropagation();
    return <HTMLContainer style={{ width: shape.props.w, height: shape.props.h, border: '1px solid #a3a3a3', borderRadius: 12, background: '#f5f5f5', color: '#171717', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: 24, gap: 12 }}>
      <strong>{status === 'proposed' ? (scene ? 'Proposed 3D scene' : 'Proposed video') : status === 'failed' ? 'Video unavailable' : 'Generating video…'}</strong>
      <span style={{ fontSize: 14, textAlign: 'center' }}>{shape.props.caption}</span>
      {status === 'proposed' ? <>
        <span style={{ fontSize: 12 }}>This uses paid generation.</span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button data-paid-cancel style={button} onPointerDown={stop} onClick={event => { stop(event); this.editor.deleteShapes([shape.id]); }}>Cancel</button>
          <button data-paid-generate style={{ ...button, background: '#171717', color: 'white', borderColor: '#171717' }} onPointerDown={stop} onClick={event => { stop(event); this.editor.getContainer().dispatchEvent(new CustomEvent('learn-video-generate', { detail: shape.id })); }}>Generate</button>
        </span>
      </> : status === 'failed' ? <><span style={{ fontSize: 12 }}>{shape.props.error}</span>{shape.props.retryable && <button style={button} onPointerDown={stop} onClick={event => { stop(event); this.editor.updateShape({ id: shape.id, type: shape.type, meta: { ...shape.meta, retry: true }, props: { status: 'proposed', error: '' } }); }}>{scene ? 'Retry scene' : 'Retry video'}</button>}</> : <span style={{ fontSize: 12 }}>You can continue the lesson while this finishes.</span>}
    </HTMLContainer>;
  }
  getIndicatorPath(shape) { const path = new Path2D(); path.rect(0, 0, shape.props.w, shape.props.h); return path; }
}
