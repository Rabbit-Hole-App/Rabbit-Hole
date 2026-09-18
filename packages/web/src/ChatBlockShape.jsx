import { useEffect, useRef } from 'react';
import { BaseBoxShapeUtil, HTMLContainer, T } from 'tldraw';
import { Md } from './ask.jsx';

// One chat exchange on the lesson canvas: the learner's question (blue bubble)
// and the agent's streamed answer inside the same movable card.
export class ChatBlockShapeUtil extends BaseBoxShapeUtil {
  static type = 'chat-block';
  static props = { w: T.number, h: T.number, question: T.string, answer: T.string, status: T.string };
  getDefaultProps() { return { w: 480, h: 88, question: '', answer: '', status: 'thinking' }; }
  canResize() { return false; }
  component(shape) { return <ChatBlock shape={shape} editor={this.editor} />; }
  getIndicatorPath(shape) { const path = new Path2D(); path.rect(0, 0, shape.props.w, shape.props.h); return path; }
  toSvg(shape) { return <g><rect width={shape.props.w} height={shape.props.h} rx={10} fill="white" stroke="#e9e9e7" /><text x={16} y={30} fontSize={13} fill="#37352f">{shape.props.question.slice(0, 60)}</text></g>; }
}

function ChatBlock({ shape, editor }) {
  const body = useRef(null);
  // The card's height follows its content; the shape frame catches up so
  // selection, indicators and stacking placement stay correct.
  useEffect(() => {
    const element = body.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const h = Math.ceil(element.offsetHeight);
      const current = editor.getShape(shape.id);
      if (current && h > 0 && Math.abs(current.props.h - h) > 1) editor.updateShape({ id: shape.id, type: 'chat-block', props: { h } });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [shape.id, editor]);
  const { question, answer, status } = shape.props;
  return (
    <HTMLContainer style={{ width: shape.props.w, height: shape.props.h, pointerEvents: 'all', cursor: 'grab' }}>
      <div ref={body} style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', background: 'white', border: '1px solid #e9e9e7', borderRadius: 10, padding: '12px 14px', boxShadow: '0 1px 2px rgba(0,0,0,.04)' }}>
        <div style={{ alignSelf: 'flex-end', maxWidth: '85%', background: '#2383e2', color: 'white', borderRadius: 12, padding: '6px 12px', fontSize: 14, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{question}</div>
        {answer
          ? <div className="text-sm"><Md text={answer} /></div>
          : <div style={{ fontSize: 13, color: '#787774', fontStyle: 'italic' }}>{status === 'thinking' ? 'Thinking…' : `${status}…`}</div>}
      </div>
    </HTMLContainer>
  );
}
