import { createContext, useContext } from 'react';
import { cardIconOf } from './card-icons.js';
import { headerTitleOf, fullTitleOf, placeholderTitle, renamable, TITLE_TWO_LINES } from './card-rename.js';

// The shared card header (owner 2026-11-07, modelled on the Explanation card's pinned header): the card type's icon, the card's TITLE (the learner's
// name, else the card's own title, else a muted type placeholder such as "Untitled note", never stored: card-rename.js headerTitleOf), and under it one
// meta line (the file name and kind, or the card's type label). The title is double-click renamable through the same editor the right-click Rename opens
// (CardRename, provided by the canvas; null on a read-only board or a copy). Pinned means the header sits outside the card's scroll region, or sticky
// (`sticky`) inside one. `trailing` carries the card's own actions, Prompt control and badge; `className` sets the padding each card already had.
// `icon`: a lucide icon in place of the type's; false draws none, and the meta line then starts under the title (no gap).
export const CardRename = createContext(null);

const SIZE = { sm: 'text-sm leading-5 font-semibold', lg: 'text-xl leading-tight font-semibold', xs: 'text-sm leading-5 font-medium' };

export default function CardHeader({ block, meta = null, trailing = null, size = 'sm', sticky = false, className = 'px-4 pt-3 pb-2', icon = null, titleProps = {}, metaProps = {}, headerProps = {} }) {
  const start = useContext(CardRename);
  const Icon = icon === false ? null : icon || cardIconOf(block), placeholder = placeholderTitle(block), canRename = !!start && renamable(block);
  // Owner 2026-11-08 (final): the title WRAPS: two lines, three on a narrow card or tile (the header's content width under NARROW_CARD_PX less 35, a container query), and an ellipsis only when it still does not
  // fit at that count; the whole text is then the tooltip. The header grows with the title, the icon and the trailing controls sit on its first line.
  const shown = headerTitleOf(block), first = size === 'lg' ? 'h-[25px]' : 'h-5', full = placeholder ? '' : fullTitleOf(block);
  return (
    <header data-card-header {...headerProps} data-card-type={block?.type} className={`@container shrink-0 ${sticky ? 'sticky top-0 z-10 bg-white' : ''} ${className}`}>
      <div data-drag-zone className="flex min-w-0 cursor-grab items-start gap-2 active:cursor-grabbing">
        {Icon && <Icon data-card-icon size={size === 'lg' ? 18 : 16} strokeWidth={1.75} aria-hidden className={`shrink-0 text-ink-2 ${size === 'lg' ? 'mt-[3.5px]' : 'mt-0.5'}`} />}
        <h3 data-card-title {...titleProps} {...(placeholder ? { 'data-card-title-placeholder': '' } : {})} title={full.length > TITLE_TWO_LINES ? full : canRename ? 'Double-click to rename' : undefined}
          onDoubleClick={canRename ? event => { event.stopPropagation(); start(block.id); } : undefined}
          className={`min-w-0 flex-1 line-clamp-2 break-words @max-[405px]:line-clamp-3 ${SIZE[size] || SIZE.sm} ${placeholder ? 'text-ink-3 italic' : 'text-ink'}`}>{shown}</h3>
        {trailing && <span className={`flex min-w-0 shrink-0 items-center gap-1 ${first}`}>{trailing}</span>}
      </div>
      {meta && <p data-card-meta {...metaProps} className={`mt-0.5 truncate text-xs text-ink-3 ${!Icon ? '' : size === 'lg' ? 'pl-[26px]' : 'pl-6'}`}>{meta}</p>}
    </header>
  );
}
