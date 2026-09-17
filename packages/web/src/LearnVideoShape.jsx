import { BaseBoxShapeUtil, HTMLContainer, T } from 'tldraw';

// Only the pending/error state is custom. Finished clips use tldraw's video shape.
export class LearnVideoShapeUtil extends BaseBoxShapeUtil {
  static type = 'learn-video-pending';
  static props = { w: T.number, h: T.number, status: T.string, caption: T.string, error: T.string, retryable: T.boolean };
  getDefaultProps() { return { w: 480, h: 270, status: 'idle', caption: '', error: '', retryable: true }; }
  isAspectRatioLocked() { return true; }
  component(shape) {
    const scene = !!shape.meta.sceneOperation;
    return <HTMLContainer style={{ width: shape.props.w, height: shape.props.h, border: '1px solid #a3a3a3', borderRadius: 12, background: '#f5f5f5', color: '#171717', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: 24, gap: 12 }}>
      <strong>{shape.props.status === 'failed' ? 'Video unavailable' : 'Generating video…'}</strong>
      <span style={{ fontSize: 14, textAlign: 'center' }}>{shape.props.caption}</span>
      {shape.props.status === 'failed' ? <><span style={{ fontSize: 12 }}>{shape.props.error}</span>{shape.props.retryable && <button style={{ pointerEvents: 'all', border: '1px solid #737373', borderRadius: 6, padding: '6px 14px', background: 'white' }} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); this.editor.getContainer().dispatchEvent(new CustomEvent('learn-video-retry', { detail: shape.id })); }}>{scene ? 'Retry scene' : 'Retry video'}</button>}</> : <span style={{ fontSize: 12 }}>You can continue the lesson while this finishes.</span>}
    </HTMLContainer>;
  }
  getIndicatorPath(shape) { const path = new Path2D(); path.rect(0, 0, shape.props.w, shape.props.h); return path; }
}
