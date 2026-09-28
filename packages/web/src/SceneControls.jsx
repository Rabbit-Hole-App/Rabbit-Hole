// Experiment controls for an interactive scene, rendered inside the lesson
// card, above the picture they change (spec §5.2: learning controls stay on
// the card; feedback stays near the task). One widget per declared input,
// dispatched by TYPE and presentation only - the registry never reads a scene
// id, a label's words, or which lesson this is.
//
// Native HTML controls in the card's existing chrome. These sit OUTSIDE the
// scene frame's fit-to-view scaling, so the completed legibility floors apply
// to them the way they apply to any card text.

import { useEffect, useRef } from 'react';

// The labels a positional input shows on its chips: the entries of its own
// declared domain list when those are strings (token words, patch names),
// one-based numbers otherwise - people count from 1, data from 0.
const positionLabels = (declaration, data) => {
  const list = data?.[declaration.of];
  if (Array.isArray(list) && list.every(entry => typeof entry === 'string')) return list;
  return Array.isArray(list) ? list.map((_, index) => String(index + 1)) : [];
};

const CHIP = 'flex h-8 items-center rounded-lg border px-3 text-sm';
const chipClass = (active, committed = false) => `${CHIP} ${committed && active
  ? 'border-ink bg-ink font-medium text-white' // a committed answer: solid, unmistakably locked in
  : active ? 'border-ink-3 bg-hover font-medium text-ink' : 'border-line text-ink-2 hover:bg-hover hover:text-ink'}`;

// The slider presentation of an index input: a labelled integer slider with
// Previous/Next steppers over the same declared domain. Ends are ends - the
// steppers disable at the bounds, and nothing wraps. Slider drags flow
// through the live (non-snapshotting) path so one sweep is not fifteen undo
// steps; steppers and keyboard arrows are discrete and commit normally.
// Sub-card navigation in the card header: "Deep dive · 2/4", the part's name,
// Previous / Next - the slider's steppers, without a slider for 2-4 parts.
export function CardPager({ declaration, value, data, onInput }) {
  const parts = data?.[declaration.of] || [];
  // aria-disabled, not disabled: a disabled button drops keyboard focus to the
  // page (and the canvas) the moment the last sub-card is reached.
  const stepButton = 'flex h-7 items-center rounded-lg border border-line px-2.5 text-xs text-ink hover:bg-hover aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent';
  const step = to => { if (to >= 0 && to < parts.length) onInput(declaration.name, to); };
  return (
    <div data-card-pager={declaration.name} role="group" aria-label={declaration.label} className="flex shrink-0 items-center gap-2">
      <span data-pager-readout aria-live="polite" className="text-sm font-semibold tabular-nums text-ink">{declaration.label} · {value + 1}/{parts.length}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{parts[value]}</span>
      <button type="button" data-pager-step="previous" aria-disabled={value <= 0} onClick={() => step(value - 1)} className={stepButton}>Previous</button>
      <button type="button" data-pager-step="next" aria-disabled={value >= parts.length - 1} onClick={() => step(value + 1)} className={stepButton}>Next</button>
    </div>
  );
}

function IndexSlider({ declaration, value, data, onInput }) {
  const length = (data?.[declaration.of] || []).length;
  const stepButton = 'flex h-8 items-center rounded-lg border border-line px-2.5 text-xs text-ink hover:bg-hover disabled:cursor-default disabled:opacity-40';
  return (
    <div role="group" aria-label={declaration.label} className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-ink-2">{declaration.label}:</span>
      <button type="button" data-input-step={`${declaration.name}:previous`} disabled={value <= 0}
        onClick={() => onInput(declaration.name, value - 1)} className={stepButton}>Previous</button>
      <input type="range" data-input-control={declaration.name} min={0} max={length - 1} step={1} value={value}
        aria-label={declaration.label} aria-valuetext={`${value + 1} of ${length}`}
        onChange={event => onInput(declaration.name, Number(event.target.value), { live: true })}
        className="h-8 w-44 accent-accent" />
      <button type="button" data-input-step={`${declaration.name}:next`} disabled={value >= length - 1}
        onClick={() => onInput(declaration.name, value + 1)} className={stepButton}>Next</button>
      <span data-input-readout={declaration.name} className="text-xs tabular-nums text-ink-2">{value + 1} of {length}</span>
    </div>
  );
}

function IndexPicker({ declaration, value, data, onInput, committed = false }) {
  const labels = positionLabels(declaration, data);
  return (
    <div role="group" aria-label={declaration.label} className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-ink-2">{declaration.label}:</span>
      {labels.map((text, index) => (
        <button key={index} type="button" data-input-control={declaration.name} data-input-value={index}
          aria-pressed={index === value} onClick={() => onInput(declaration.name, index)}
          className={chipClass(index === value, committed)}>{text}</button>
      ))}
    </div>
  );
}

function BoolToggle({ declaration, value, onInput }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-medium text-ink-2">{declaration.label}:</span>
      <button type="button" role="switch" aria-checked={value} data-input-control={declaration.name}
        onClick={() => onInput(declaration.name, !value)} className={chipClass(false)}>
        <span className={`mr-2 h-3.5 w-6 rounded-full p-0.5 transition-colors ${value ? 'bg-ink' : 'bg-line-strong'}`}>
          <span className={`block h-2.5 w-2.5 rounded-full bg-white transition-transform ${value ? 'translate-x-2.5' : ''}`} />
        </span>
        {value ? 'On' : 'Off'}
      </button>
    </div>
  );
}

// A set of positions: each chip toggles membership, so click order can never
// matter - the value IS the canonical set the coercion layer keeps sorted.
function IndicesMarks({ declaration, value, data, onInput, committed = false }) {
  const labels = positionLabels(declaration, data);
  const current = value || []; // null = "no answer yet", distinct from the empty set only in who set it
  const chosen = new Set(current);
  const toggle = index => onInput(declaration.name, chosen.has(index) ? current.filter(entry => entry !== index) : [...current, index]);
  return (
    <div role="group" aria-label={declaration.label} className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-ink-2">{declaration.label}:</span>
      {labels.map((text, index) => (
        <button key={index} type="button" data-input-control={declaration.name} data-input-value={index}
          aria-pressed={chosen.has(index)} onClick={() => toggle(index)}
          className={chipClass(chosen.has(index), committed)}>{text}</button>
      ))}
    </div>
  );
}

// One declared option per segment; identity is the option id, never its
// position, so a reordered spec keeps every saved choice meaning the same
// thing.
function ChoiceButtons({ declaration, value, onInput, committed = false }) {
  return (
    <div role="group" aria-label={declaration.label} className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-ink-2">{declaration.label}:</span>
      {declaration.options.map(option => (
        <button key={option.id} type="button" data-input-control={declaration.name} data-input-value={option.id}
          aria-pressed={option.id === value} onClick={() => onInput(declaration.name, option.id)}
          className={chipClass(option.id === value, committed)}>{option.label}</button>
      ))}
    </div>
  );
}

const WIDGETS = {
  index: IndexPicker,
  bool: BoolToggle,
  indices: IndicesMarks,
  choice: ChoiceButtons,
};

// One typed input, one widget - the same registry the experiment strip uses,
// exported so the practice section renders its answer input through the
// exact same code path (spec T09: no second widget family for answers).
export function InputWidget({ declaration, value, data, onInput, disabled = false }) {
  const Widget = declaration.type === 'index' && declaration.presentation === 'slider' ? IndexSlider : WIDGETS[declaration.type];
  if (!Widget) return null;
  return (
    <fieldset disabled={disabled} className="contents">
      <Widget declaration={declaration} value={value} data={data} onInput={onInput} committed={disabled} />
    </fieldset>
  );
}

export default function SceneControls({ declarations, inputs, data, onInput, onReset, locked = [], onHeight = null }) {
  // EVERY meaningful input gets an obvious control here, below the visual -
  // the primary way to operate the experiment. An input whose scene object
  // also offers direct manipulation ('visual' index, a dragged vec2) keeps
  // that as a synchronized SHORTCUT, but the learner never has to discover
  // that diagram text is secretly clickable: the control is always here too.
  // A pager is the card's sub-card navigation, drawn in its header (CardPager).
  const rows = declarations.filter(declaration => !declaration.hidden && declaration.presentation !== 'pager' && WIDGETS[declaration.type]);
  // The card grows by this row's real height (its wrapped widget rows, plus
  // the gap-2 above it) - an estimate short by one wrapped row squeezed the
  // frame and drew the scene below the type floors.
  const root = useRef(null);
  useEffect(() => {
    if (!onHeight || !root.current) return undefined;
    const observer = new ResizeObserver(() => onHeight(root.current ? root.current.offsetHeight + 8 : 0));
    observer.observe(root.current);
    return () => { observer.disconnect(); onHeight(0); };
  }, [onHeight, rows.length]);
  if (!rows.length) return null;
  return (
    <div ref={root} data-scene-controls className="shrink-0 rounded-lg border border-line bg-white px-3 pt-1.5 pb-2">
      <p className="mb-1.5 text-xs font-semibold tracking-wide text-ink-2 uppercase">Interact</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {rows.map(declaration => {
        const Widget = declaration.type === 'index' && declaration.presentation === 'slider' ? IndexSlider : WIDGETS[declaration.type];
        // An input the active practice task fixed: shown at the task's value,
        // read-only, and saying who locked it. The command path refuses
        // writes regardless - this is the honest face of that refusal.
        if (locked.includes(declaration.name)) {
          return (
            <fieldset key={declaration.name} disabled data-input-locked={declaration.name} className="contents">
              <Widget declaration={declaration} value={inputs[declaration.name]} data={data} onInput={onInput} />
              <span className="-ml-2 text-xs text-ink-2">· set by the task</span>
            </fieldset>
          );
        }
        return <Widget key={declaration.name} declaration={declaration} value={inputs[declaration.name]} data={data} onInput={onInput} />;
      })}
        {/* Reset flows with the controls (left), never pinned right - a wide
            card can run under the floating drawing toolbar, and a control
            hidden there is a control that does not exist. Asking the tutor
            lives only in the Ask-in-chat pill + bottom composer. */}
        <button type="button" data-scene-reset onClick={onReset}
          className="flex h-8 items-center rounded-lg px-2.5 text-xs text-ink-2 hover:bg-hover hover:text-ink">
          Reset experiment
        </button>
      </div>
    </div>
  );
}
