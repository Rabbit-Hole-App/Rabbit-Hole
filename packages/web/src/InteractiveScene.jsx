import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { applyAction, prepareScene, sceneContext } from './scene-engine.js';
import VectorScene, { VectorControls } from './VectorScene.jsx';
import PipelineScene from './PipelineScene.jsx';
import './scene-behaviors.js';

// One block for every registered activity: the spec picks a behaviour and a
// renderer, learner input becomes a named action, and only committed state is
// handed back to the canvas for persistence. Nothing lesson-supplied executes.

const MODE_LABEL = {
  illustration: 'Illustration — an authored walkthrough, not a measurement',
  local_calculation: 'Calculated here from the values you set',
  recorded_run: 'Recorded run — saved results, not a live execution',
  live_run: 'Live run',
};

function StepsSvg({ spec, state, behavior, onSelect, selected }) {
  const steps = state.steps;
  const width = 300, gap = 58;
  return (
    <svg role="img" aria-label={spec.buildGoal || 'Process walkthrough'} viewBox={`0 0 ${width} ${steps.length * gap + 12}`} className="h-full w-full">
      {steps.map((step, index) => {
        const y = index * gap + 10;
        const active = index === state.step;
        const seen = state.visited.includes(index);
        return (
          <g key={step.id || index} data-scene-step={index} transform={`translate(8 ${y})`} className="cursor-pointer"
            onClick={() => onSelect(step.id || `step-${index}`)}>
            {index > 0 && <line x1={width / 2 - 8} y1={-16} x2={width / 2 - 8} y2={-4} stroke="#cbd5e1" strokeWidth="1.5" />}
            <rect width={width - 16} height={38} rx={8}
              fill={active ? '#2383e2' : seen ? '#f7f7f5' : '#ffffff'}
              stroke={selected === (step.id || `step-${index}`) ? '#2383e2' : active ? '#2383e2' : '#e9e9e7'}
              strokeWidth={selected === (step.id || `step-${index}`) ? 2 : 1} />
            <text x={14} y={17} fontSize="12" fontWeight={active ? 600 : 400} fill={active ? '#ffffff' : '#37352f'}>{step.label}</text>
            {/* A light-only island (its fills are fixed hex), so its secondary ink is
                --color-ink-2's light value, not the flipping token. */}
            {step.detail && <text x={14} y={30} fontSize="10" fill={active ? '#dbeafe' : '#63615d'} fontFamily="ui-monospace, monospace">{step.detail}</text>}
          </g>
        );
      })}
    </svg>
  );
}

// One renderer per behaviour shape; a behaviour declares which it supports.
const RENDERERS = { walkthrough_v1: StepsSvg, vector_projection_v1: VectorScene, pipeline_assembly_v1: PipelineScene };
// Optional per-behaviour control panel rendered in the INTERACT zone below the
// visualization (keeps the card grammar: explanation above, controls below).
const CONTROLS = { vector_projection_v1: VectorControls };

// What the tutor is told when the learner asks about this block.
export function sceneSummary(block) {
  try {
    const { spec, behavior, state } = prepareScene(block.spec);
    return sceneContext(spec, block.state || state, behavior, block.selectedObject);
  } catch { return { error: 'unsupported activity' }; }
}

export default function InteractiveScene({ block, onChange }) {
  const [error, setError] = useState('');
  const selected = block.selectedObject || null;
  const setSelected = value => onChange({ ...block, selectedObject: value });
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const prepared = useMemo(() => {
    try { setError(''); return prepareScene(block.spec); }
    catch (problem) { setError(problem.message); return null; }
  }, [block.spec]);
  // Committed state lives on the block; the starter stays in the spec so a
  // reset restores it without losing the attempt history.
  const state = block.state && prepared ? block.state : prepared?.state;
  const liveRef = useRef(state);
  liveRef.current = state;
  useEffect(() => { if (prepared && !block.state) onChange({ ...block, state: prepared.state, attempts: block.attempts || 0 }); }, [prepared]);
  if (error) return <div className="grid min-h-24 place-content-center p-4 text-center text-xs text-red-700">{error}</div>;
  if (!prepared || !state) return null;
  const { spec, behavior } = prepared;
  const Renderer = RENDERERS[spec.behaviorId];
  const run = action => {
    const result = applyAction(behavior, spec, liveRef.current, action);
    if (result.error) { setError(result.error); return; }
    setError('');
    const attempts = action.type === 'reset_attempt' ? (block.attempts || 0) + 1 : block.attempts || 0;
    onChange({ ...block, state: result.state, attempts });
  };
  const progress = behavior.progress ? behavior.progress(state) : null;
  const buttons = spec.interactions.filter(interaction => interaction.input === 'button');
  const Controls = CONTROLS[spec.behaviorId];
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" onPointerDown={event => event.stopPropagation()}>
      {/* A flex column, not plain block flow: renderers size against the
          card's real height (a square vector frame stays inside the card
          instead of growing to its own width and scrolling the handles out
          of reach); a renderer taller than the card still scrolls. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-auto rounded-lg border border-line bg-white p-2">
        {Renderer
          ? <Renderer spec={spec} state={state} behavior={behavior} selected={selected} onSelect={setSelected} run={run} reduced={reduced} />
          : <p className="text-xs text-ink-2">No renderer for {spec.behaviorId}.</p>}
      </div>
      {/* INTERACT zone: a behaviour's control panel (e.g. the vec2 coordinate
          fields, via CONTROLS) plus the transport-independent action buttons
          like Reset, all below the visualization under one label - the card
          grammar (explanation above, controls below the divider). Asking the
          tutor lives only in the Ask-in-chat pill + bottom composer. */}
      <div className="shrink-0 rounded-lg border border-line bg-white px-3 pt-1.5 pb-2">
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-xs font-semibold tracking-wide text-ink-2 uppercase">Interact</p>
          {progress && <span className="text-xs tabular-nums text-ink-2">{progress.seen} / {progress.total} {behavior.progressNoun || 'steps'}{progress.complete ? ' · done' : ''}</span>}
        </div>
        {Controls && <div className="mb-2"><Controls state={state} run={run} /></div>}
        <div className="flex flex-wrap items-center gap-1.5">
          {buttons.map((interaction, index) => (
            <button key={index} type="button" data-scene-action={interaction.action}
              onClick={() => run({ type: interaction.action })}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:bg-hover">
              {interaction.action === 'previous_step' && <ChevronLeft size={14} />}
              {interaction.action === 'reset_attempt' && <RotateCcw size={13} />}
              {interaction.label || interaction.action.replace('_', ' ')}
              {interaction.action === 'advance_step' && <ChevronRight size={14} />}
            </button>
          ))}
        </div>
      </div>
      <p className="shrink-0 text-xs text-ink-2">{MODE_LABEL[spec.execution.mode]}</p>
    </div>
  );
}
