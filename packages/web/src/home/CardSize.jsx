import { CARD_SIZES, setCardSize, useCardSize } from './card-size.js';

// The compact "Size" slider on Home, Library and Explore (owner, 2026-10-22; relabelled and stripped of its Small and Large
// end labels by the owner brief of 2026-10-23): four steps, kept in this browser (card-size.js). Arrow keys, Home and End
// move it; assistive tech hears "Card size" and the current step as the value text.
export default function CardSize() {
  const size = useCardSize();
  return (
    <div data-card-size-control className="flex h-8 shrink-0 items-center gap-2 text-sm text-ink-2">
      <span aria-hidden="true" className="text-ink">Size</span>
      <input type="range" data-card-size-slider min={0} max={CARD_SIZES.length - 1} step={1} value={size} aria-label="Card size" aria-valuetext={CARD_SIZES[size]}
        onChange={(e) => setCardSize(Number(e.target.value))} className="w-24 cursor-pointer accent-[#2383e2]" />
    </div>
  );
}
