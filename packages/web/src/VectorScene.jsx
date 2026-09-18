import { useRef, useState } from 'react';
import { project } from './scene-behaviors.js';

// Drag, arrow keys and the number fields all produce the same semantic action,
// so the input method never decides the domain logic. The preview follows the
// pointer locally; only the finished gesture is committed.
// ponytail: fixed -10..10 world; a spec-supplied range when a lesson needs one.

const SIZE = 260, RANGE = 5;
const toScreen = ([x, y]) => [SIZE / 2 + (x / RANGE) * (SIZE / 2 - 18), SIZE / 2 - (y / RANGE) * (SIZE / 2 - 18)];

export default function VectorScene({ state, run, selected, onSelect, reduced }) {
  const frame = useRef(null);
  const [preview, setPreview] = useState(null);
  const live = preview ? { ...state, ...preview } : state;
  const result = project(live.a, live.b);
  // Pointer positions convert through the live client rect, so resizing and
  // zooming the node keep the handle under the pointer.
  const toWorld = event => {
    const box = frame.current.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width * SIZE - SIZE / 2) / (SIZE / 2 - 18) * RANGE;
    const y = -((event.clientY - box.top) / box.height * SIZE - SIZE / 2) / (SIZE / 2 - 18) * RANGE;
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  };
  const startDrag = (event, target) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect(target);
    const move = pointer => setPreview({ [target]: toWorld(pointer) });
    const finish = pointer => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      setPreview(null);
      run({ type: 'set_vector', target, value: toWorld(pointer) }); // one committed change per gesture
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
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
      <svg ref={frame} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Vector projection" className="min-h-0 w-full flex-1 touch-none">
        <line x1={0} y1={SIZE / 2} x2={SIZE} y2={SIZE / 2} stroke="#e9e9e7" />
        <line x1={SIZE / 2} y1={0} x2={SIZE / 2} y2={SIZE} stroke="#e9e9e7" />
        {result.defined && (
          <>
            <line x1={SIZE / 2} y1={SIZE / 2} x2={px} y2={py} stroke="#1a7f37" strokeWidth="6" strokeOpacity=".25"
              style={reduced ? undefined : { transition: 'all .12s linear' }} />
            <line x1={toScreen(live.a)[0]} y1={toScreen(live.a)[1]} x2={px} y2={py} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" />
          </>
        )}
        {handle('b', '#b45309')}
        {handle('a', '#2383e2')}
      </svg>
      <div className="shrink-0 space-y-1.5 text-xs">
        {['a', 'b'].map(target => (
          <div key={target} className="flex items-center gap-2">
            <span className="w-3 font-mono text-ink-2">{target}</span>
            {['x', 'y'].map((axis, index) => (
              <input key={axis} type="number" step="0.5" aria-label={`${target} ${axis}`} value={live[target][index]}
                onChange={event => {
                  const value = [...state[target]];
                  value[index] = Number(event.target.value);
                  run({ type: 'set_vector', target, value });
                }}
                className="h-7 w-16 rounded border border-line px-2 text-xs outline-none focus:border-ink-3" />
            ))}
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
