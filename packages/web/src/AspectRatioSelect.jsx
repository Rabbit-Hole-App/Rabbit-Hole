// The shared aspect ratio dropdown: presentational only (value in, onChange out). Motion's proposal card uses it now; the
// image generation form imports this same component. `options` is a list of ratio ids the consumer supports (all when
// omitted); labels and meanings come from aspect-ratios.js.
import { ratiosFor } from './aspect-ratios.js';

const control = 'h-7 rounded-md border border-line bg-surface px-2 text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50';

export default function AspectRatioSelect({ value, onChange, options, label = 'Aspect ratio', disabled = false, id, ...rest }) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-ink-2">
      {label}
      <select id={id} data-aspect-ratio-select value={value ?? ''} disabled={disabled} onChange={event => onChange?.(event.target.value)} className={control} {...rest}>
        {ratiosFor(options).map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
      </select>
    </label>
  );
}
