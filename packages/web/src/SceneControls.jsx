// Experiment controls for an interactive scene, rendered inside the lesson
// card, above the picture they change (spec §5.2: learning controls stay on
// the card; feedback stays near the task). One widget per declared input,
// dispatched by TYPE and presentation only - the registry never reads a scene
// id, a label's words, or which lesson this is.
//
// Native HTML controls in the card's existing chrome. These sit OUTSIDE the
// scene frame's fit-to-view scaling, so the completed legibility floors apply
// to them the way they apply to any card text.

// The labels a positional input shows on its chips: the entries of its own
// declared domain list when those are strings (token words, patch names),
// one-based numbers otherwise - people count from 1, data from 0.
const positionLabels = (declaration, data) => {
  const list = data?.[declaration.of];
  if (Array.isArray(list) && list.every(entry => typeof entry === 'string')) return list;
  return Array.isArray(list) ? list.map((_, index) => String(index + 1)) : [];
};

const CHIP = 'flex h-8 items-center rounded-lg border px-3 text-sm';
const chipClass = active => `${CHIP} ${active ? 'border-ink-3 bg-hover font-medium text-ink' : 'border-line text-ink-2 hover:bg-hover hover:text-ink'}`;

function IndexPicker({ declaration, value, data, onInput }) {
  const labels = positionLabels(declaration, data);
  return (
    <div role="group" aria-label={declaration.label} className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-ink-2">{declaration.label}:</span>
      {labels.map((text, index) => (
        <button key={index} type="button" data-input-control={declaration.name} data-input-value={index}
          aria-pressed={index === value} onClick={() => onInput(declaration.name, index)}
          className={chipClass(index === value)}>{text}</button>
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
function IndicesMarks({ declaration, value, data, onInput }) {
  const labels = positionLabels(declaration, data);
  const chosen = new Set(value);
  const toggle = index => onInput(declaration.name, chosen.has(index) ? value.filter(entry => entry !== index) : [...value, index]);
  return (
    <div role="group" aria-label={declaration.label} className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-ink-2">{declaration.label}:</span>
      {labels.map((text, index) => (
        <button key={index} type="button" data-input-control={declaration.name} data-input-value={index}
          aria-pressed={chosen.has(index)} onClick={() => toggle(index)}
          className={chipClass(chosen.has(index))}>{text}</button>
      ))}
    </div>
  );
}

const WIDGETS = {
  index: IndexPicker,
  bool: BoolToggle,
  indices: IndicesMarks,
};

export default function SceneControls({ declarations, inputs, data, onInput, onReset, onAsk = null }) {
  const rows = declarations.filter(declaration => WIDGETS[declaration.type]);
  if (!rows.length) return null;
  return (
    <div data-scene-controls className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-white px-3 py-2">
      {rows.map(declaration => {
        const Widget = WIDGETS[declaration.type];
        return <Widget key={declaration.name} declaration={declaration} value={inputs[declaration.name]} data={data} onInput={onInput} />;
      })}
      {/* Left flow, never pinned to the card's right edge - a wide card can
          run under the floating drawing toolbar, and a control hidden there
          is a control that does not exist. */}
      <div className="flex items-center gap-1">
        <button type="button" data-scene-reset onClick={onReset}
          className="flex h-8 items-center rounded-lg px-2.5 text-xs text-ink-2 hover:bg-hover hover:text-ink">
          Reset experiment
        </button>
        {/* Attaches this card's current state to the existing bottom composer
            and focuses it. Nothing is sent - the learner types and presses
            the composer's own Send. */}
        {onAsk && (
          <button type="button" data-scene-ask onClick={onAsk}
            className="flex h-8 items-center rounded-lg border border-line px-2.5 text-xs text-ink hover:bg-hover">
            Ask about this
          </button>
        )}
      </div>
    </div>
  );
}
