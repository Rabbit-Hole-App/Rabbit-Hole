import { useRef, useState } from 'react';
import { project } from './scene-behaviors.js';

// Drag, arrow keys and the number fields all produce the same semantic action,
// so the input method never decides the domain logic. The preview follows the
// pointer locally; only the finished gesture is committed - Escape or a
// pointer cancellation abandons the gesture and returns to the committed
// coordinates without spending anything.

const SIZE = 260;

export default function VectorScene({ state, run, selected, onSelect, reduced }) {
  const frame = useRef(null);
  const [preview, setPreview] = useState(null);
  // Half-typed text ("-", "1e", an emptied field) stays a local edit buffer:
  // it is not a number yet, so nothing reaches the vectors until it is one.
  const [buffers, setBuffers] = useState({});
  const live = preview ? { ...state, ...preview } : state;
  const range = state.range ?? 10;
  const toScreen = ([x, y]) => [SIZE / 2 + (x / range) * (SIZE / 2 - 18), SIZE / 2 - (y / range) * (SIZE / 2 - 18)];
  const result = project(live.a, live.b);
  // Pointer positions convert through the live client rect, so resizing,
  // zooming and panning the canvas keep the handle under the pointer.
  const toWorld = event => {
    const box = frame.current.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width * SIZE - SIZE / 2) / (SIZE / 2 - 18) * range;
    const y = -((event.clientY - box.top) / box.height * SIZE - SIZE / 2) / (SIZE / 2 - 18) * range;
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  };
  const startDrag = (event, target) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect(target);
    // Pointer capture keeps every later event on the handle itself, so a
    // release outside the element (or the card, or the window edge) still
    // finishes THIS gesture rather than leaking into the canvas.
    const element = event.currentTarget;
    const pointerId = event.pointerId;
    element.setPointerCapture(pointerId);
    const move = pointer => setPreview({ [target]: toWorld(pointer) });
    const cleanup = () => {
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', finish);
      element.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', escape, true);
      try { element.releasePointerCapture(pointerId); } catch { /* already released */ }
    };
    // Escape or a system cancellation restores the gesture-start snapshot:
    // the preview dies and nothing was ever committed.
    const cancel = () => { cleanup(); setPreview(null); };
    const escape = keyEvent => { if (keyEvent.key === 'Escape') { keyEvent.stopPropagation(); cancel(); } };
    const finish = pointer => { cleanup(); setPreview(null); run({ type: 'set_vector', target, value: toWorld(pointer) }); }; // one committed change per gesture
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', finish);
    element.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', escape, true);
  };
  const key = (event, target) => {
    const steps = { ArrowLeft: ['x', -0.5], ArrowRight: ['x', 0.5], ArrowUp: ['y', 0.5], ArrowDown: ['y', -0.5] };
    const move = steps[event.key];
    if (!move) return;
    event.preventDefault();
    run({ type: 'nudge_vector', target, axis: move[0], by: move[1] });
  };
  const handle = (target, colour) => {
    const [x, y] = toScreen(live[target]);
    const active = selected === target;
    return (
      <g key={target}>
        <line x1={SIZE / 2} y1={SIZE / 2} x2={x} y2={y} stroke={colour} strokeWidth={active ? 3 : 2} />
        <circle data-vector-handle={target} cx={x} cy={y} r={active ? 8 : 7} fill="white" stroke={colour} strokeWidth="2.5"
          role="slider" tabIndex={0} aria-label={`Vector ${target}`} aria-valuetext={`${target} is ${live[target][0]}, ${live[target][1]}`}
          className="cursor-grab focus:outline-none focus-visible:stroke-[3]"
          onPointerDown={event => startDrag(event, target)} onKeyDown={event => key(event, target)} onFocus={() => onSelect(target)} />
        <text x={x + 11} y={y - 9} fontSize="11" fill={colour} fontFamily="ui-monospace, monospace">{target} ({live[target][0]}, {live[target][1]})</text>
      </g>
    );
  };
  const [px, py] = result.defined ? toScreen(result.vector) : [SIZE / 2, SIZE / 2];
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* A hard square that FITS: sized by the shorter of the container's
          sides, never by width alone - an svg's intrinsic aspect otherwise
          inflates height past the card, parking the upper handles on canvas
          pixels no pointer event of ours ever reaches. The rect stays square,
          so the screen<->world mapping in toWorld stays exact. */}
      <svg ref={frame} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Vector projection"
        className="mx-auto block min-h-0 max-h-full max-w-full flex-1 touch-none" style={{ aspectRatio: '1 / 1' }}>
        <line x1={0} y1={SIZE / 2} x2={SIZE} y2={SIZE / 2} stroke="#e9e9e7" />
        <line x1={SIZE / 2} y1={0} x2={SIZE / 2} y2={SIZE} stroke="#e9e9e7" />
        {result.defined && (
          <>
            {/* The projection IS the lesson: a wide soft band plus a solid
                core line and a labelled endpoint marker, so proj_b(a) reads
                straight off the picture rather than only from the numbers. */}
            <line x1={SIZE / 2} y1={SIZE / 2} x2={px} y2={py} stroke="#1a7f37" strokeWidth="7" strokeOpacity=".22"
              style={reduced ? undefined : { transition: 'all .12s linear' }} />
            <line x1={SIZE / 2} y1={SIZE / 2} x2={px} y2={py} stroke="#1a7f37" strokeWidth="2.5"
              style={reduced ? undefined : { transition: 'all .12s linear' }} />
            {/* the perpendicular guide from a's endpoint down to the projection */}
            <line x1={toScreen(live.a)[0]} y1={toScreen(live.a)[1]} x2={px} y2={py} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" />
            <rect data-projection-marker x={px - 4} y={py - 4} width="8" height="8" fill="#1a7f37"
              style={reduced ? undefined : { transition: 'all .12s linear' }} />
            <text x={px + 10} y={py + 16} fontSize="11" fill="#1a7f37" fontFamily="ui-monospace, monospace">proj_b(a)</text>
          </>
        )}
        {handle('b', '#b45309')}
        {handle('a', '#2383e2')}
      </svg>
      <div className="shrink-0 space-y-1.5 text-xs">
        {/* column headers, so nobody has to guess which field is which axis */}
        <div className="flex items-center gap-2 text-ink-2">
          <span className="w-3" />
          <span className="w-16 text-center font-mono">x</span>
          <span className="w-16 text-center font-mono">y</span>
        </div>
        {['a', 'b'].map(target => (
          <div key={target} className="flex items-center gap-2">
            <span className="w-3 font-mono text-ink-2">{target}</span>
            {['x', 'y'].map((axis, index) => {
              const field = `${target}.${axis}`;
              return (
                <input key={axis} type="number" step="0.5" aria-label={`${target} ${axis}`}
                  value={buffers[field] ?? live[target][index]}
                  onChange={event => {
                    const text = event.target.value;
                    setBuffers(previous => ({ ...previous, [field]: text }));
                    // Only a finished, finite number becomes the experiment's
                    // value; "-" and "" stay in the buffer, never as NaN or a
                    // premature zero in geometry.
                    const numeric = Number(text);
                    if (text.trim() === '' || !Number.isFinite(numeric)) return;
                    const value = [...state[target]];
                    value[index] = numeric;
                    run({ type: 'set_vector', target, value });
                  }}
                  onBlur={() => setBuffers(previous => { const { [field]: _gone, ...rest } = previous; return rest; })}
                  className="h-7 w-16 rounded border border-line px-2 text-xs outline-none focus:border-ink-3" />
              );
            })}
          </div>
        ))}
        <p data-projection className={result.defined ? 'text-ink-2' : 'text-red-700'}>
          {result.defined
            ? `proj_b(a) = ${result.scale} · b = (${result.vector[0]}, ${result.vector[1]}) · a·b = ${result.dot}`
            : result.reason}
        </p>
      </div>
    </div>
  );
}
