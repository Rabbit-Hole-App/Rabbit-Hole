import { CARD_SIZES, setCardSize, useCardSize } from './card-size.js';

// The "Card size" slider beside Filters and Sort on Home, Library and Explore (owner, 2026-10-22): Small to Large, kept
// in this browser (card-size.js). Arrow keys, Home and End move it; on a phone it takes its own row.
export default function CardSize() {
  const size = useCardSize();
  return (
    <div data-card-size-control className="flex h-8 shrink-0 items-center gap-2 text-xs text-ink-2 max-md:w-full">
      <span className="text-ink">Card size</span>
      <span aria-hidden="true">Small</span>
      <input type="range" data-card-size-slider min={0} max={CARD_SIZES.length - 1} step={1} value={size} aria-label="Card size" aria-valuetext={CARD_SIZES[size]}
        onChange={(e) => setCardSize(Number(e.target.value))} className="w-24 cursor-pointer accent-[#2383e2] max-md:min-w-0 max-md:flex-1" />
      <span aria-hidden="true">Large</span>
    </div>
  );
}
