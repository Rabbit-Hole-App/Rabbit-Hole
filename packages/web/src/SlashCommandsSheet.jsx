import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { EXAMPLES, cardsFor, mayConfirmPaid, pickerSections } from './learn-slash.js';
import { BLOCK_TYPES, LearningBlockBody } from './LearningBlocks.jsx';
import NotebookBody from './NotebookCard.jsx';
import { newNotebookBlock } from './learn-notebook.js';

// Every Learn / command, opened from View > Slash commands. Left: the
// picker's own sections (learn-slash.js), so the sheet and the picker never
// disagree. Right: the real card the selected command puts on the canvas,
// drawn by the canvas's own card components from their + palette samples.
// Only the selected card renders, and the preview is inert - nothing in it
// can be pressed, so no Generate (paid or not) can start from here.
export default function SlashCommandsSheet({ appName, onClose }) {
  useEffect(() => {
    const key = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const sections = pickerSections('/');
  const [name, setName] = useState('graph');
  const [cardIndex, setCardIndex] = useState(0);
  const cards = cardsFor(name);
  const card = cards[Math.min(cardIndex, cards.length - 1)];
  const command = sections.flatMap(section => section.items).find(item => item.name === name);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[6vh]" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}
      style={{ background: 'color-mix(in srgb, var(--color-ink) 18%, transparent)' }}>
      <div role="dialog" aria-modal="true" aria-label="Slash commands" className="flex h-[86vh] w-[68rem] max-w-[94vw] flex-col rounded-2xl border border-line bg-white p-5 shadow-pop">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Slash commands</h2>
          <button type="button" aria-label="Close slash commands" title="Close (Esc)" onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-3 hover:bg-hover hover:text-ink"><X size={15} /></button>
        </div>
        <p className="mb-3 text-xs text-ink-2">Type <kbd className="rounded border border-line bg-hover px-1.5 py-0.5 font-sans text-[11px]">/</kbd> in the Learn composer, pick a command, then add what you want after it. Choose one here to see the card it makes.</p>
        <div className="flex min-h-0 flex-1 gap-4 max-md:flex-col">
          <nav aria-label="Commands" className="w-60 shrink-0 overflow-y-auto pr-1 max-md:max-h-48 max-md:w-full">
            {sections.map(section => (
              <section key={section.title} aria-label={section.title} className="mb-3">
                <h3 className="mb-1 px-2 text-[11px] font-semibold tracking-wider text-ink-3 uppercase">{section.title}</h3>
                {section.items.map(item => (
                  <button key={item.name} type="button" data-slash-help={item.name} aria-current={item.name === name}
                    onClick={() => { setName(item.name); setCardIndex(0); }}
                    className={`flex w-full items-baseline gap-2 rounded-lg px-2 py-1 text-left text-sm ${item.name === name ? 'bg-hover text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink'}`}>
                    <span className="shrink-0 font-medium">/{item.name}</span>
                    <span className="truncate text-xs text-ink-3">{item.desc}</span>
                  </button>
                ))}
              </section>
            ))}
          </nav>
          <section aria-label={`/${name} preview`} className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-line bg-hover/40 p-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-base font-semibold text-ink">/{name}</span>
              <span className="text-sm text-ink-2">{command?.desc}</span>
              {mayConfirmPaid(name) && <span className="rounded-full border border-line bg-white px-1.5 py-px text-[10px] text-ink-3">confirms paid</span>}
            </div>
            {EXAMPLES[name] && <code className="mt-1 block font-mono text-xs text-ink-3">e.g. {EXAMPLES[name]}</code>}
            {cards.length > 1 && (
              <div role="tablist" aria-label="Cards this command can make" className="mt-3 flex flex-wrap gap-1.5">
                {cards.map((entry, index) => (
                  <button key={entry.card} type="button" role="tab" aria-selected={entry === card} onClick={() => setCardIndex(index)}
                    className={`rounded-full border px-2.5 py-1 text-xs ${entry === card ? 'border-ink bg-white text-ink' : 'border-line text-ink-2 hover:bg-white'}`}>
                    {entry.card === 'notebook' ? 'Notebook' : BLOCK_TYPES[entry.card]?.label}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3 flex min-h-0 flex-1 items-start justify-center overflow-auto">
              {card
                ? <CardPreview key={card.card} type={card.card} appName={appName} />
                : <p className="mt-8 max-w-sm text-center text-sm text-ink-2">This command answers in the chat, about the card you selected or the current concept. It does not add a card of its own.</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// One card as the canvas draws it, from its sample, with the canvas node's
// frame and size. Inert: a preview to look at, never to use.
function CardPreview({ type, appName }) {
  const [block, setBlock] = useState(() => (type === 'notebook' ? { ...newNotebookBlock(), notebook_id: 'slash-commands-preview' } : BLOCK_TYPES[type].sample()));
  const size = useMemo(() => (type === 'notebook' ? { width: 640, height: 480 } : { width: BLOCK_TYPES[type].width || 380, height: BLOCK_TYPES[type].height || 420 }), [type]);
  return (
    <div inert data-slash-card={type} className="flex shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-white shadow-sm"
      style={{ width: `min(${size.width}px, 100%)`, height: size.height }}>
      {type === 'notebook'
        ? <NotebookBody block={block} onSelect={() => {}} onDocument={() => {}} onManifest={() => {}} />
        : <LearningBlockBody block={block} onChange={setBlock} onChangeQuiet={setBlock} appName={appName} selected={false} />}
    </div>
  );
}
