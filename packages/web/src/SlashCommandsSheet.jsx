import { useState } from 'react';
import { X } from 'lucide-react';
import { EXAMPLES, mayConfirmPaid, parseSlash, pickerSections } from './learn-slash.js';
import { descFor, learnRequest, toolOf } from './agent/slash.js';
import { BLOCK_TYPES, LearningBlockBody } from './LearningBlocks.jsx';
import NotebookBody from './NotebookCard.jsx';
import { newNotebookBlock } from './learn-notebook.js';
import { Md } from './ask.jsx';
import { CommandMark } from './CommandTone.jsx';
import SourcesDisclosure from './SourcesDisclosure.jsx';
import CommandList from './CommandList.jsx';
import { CadViewerTools } from './CadCard.jsx';
import { CHAT_EXAMPLES, FINDER_NOTES, MEDIA, SAMPLES, demoOf, effectOf, illustrationFor, sheetCards } from './slash-sheet.js';

// Every Learn / command, opened from View > Slash commands. Left: a search over the
// picker's own sections (learn-slash.js, CommandList.jsx), so the sheet and the
// picker never disagree, More learning tools included. Right: what the command does (its label, whether it creates a card,
// opens a Rabbit Hole or searches, and what it needs selected), its example - Use example puts it in the composer as an
// editable draft and never sends it (owner, 2026-10-20) - and its demo (slash-sheet.js): a sample of the card it puts on
// the canvas, drawn by the canvas's own card components, what a search opens, or what /dive does. Only the selected card renders.
// The card works as on the canvas, except that Generate for paid media is
// disabled here: paid media shows a committed finished clip or a labelled picture.
// The card the command's example makes, when its words narrow the family
// (/practice explain it back -> Explain back); otherwise the first.
const exampleCard = name => {
  const narrowed = learnRequest(name, { args: parseSlash(EXAMPLES[name] || '')?.args || '' }).allowedPrimitives;
  return narrowed?.length === 1 ? Math.max(0, sheetCards(name).findIndex(entry => entry.primitive === narrowed[0])) : 0;
};

// onUseExample({ command, text }): the composer's draft becomes the example's command pill and words, to edit before sending.
export default function SlashCommandsSheet({ appName, onClose, onUseExample = null }) {
  const sections = pickerSections('/');
  const [name, setName] = useState('graph');
  const [cardIndex, setCardIndex] = useState(0);
  const choose = next => { setName(next); setCardIndex(exampleCard(next)); };
  const demo = demoOf(name);
  const cards = demo === 'cards' ? sheetCards(name) : [];
  const card = cards[Math.min(cardIndex, cards.length - 1)];
  const command = toolOf(name);
  const example = parseSlash(EXAMPLES[name] || '');
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[6vh]" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}
      style={{ background: 'color-mix(in srgb, var(--color-ink) 18%, transparent)' }}>
      <div role="dialog" aria-modal="true" aria-label="Slash commands" className="flex h-[86vh] w-[68rem] max-w-[94vw] flex-col rounded-2xl border border-line bg-white p-5 shadow-pop">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Slash commands</h2>
          <button type="button" aria-label="Close slash commands" title="Close (Esc)" onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-3 hover:bg-hover hover:text-ink"><X size={15} /></button>
        </div>
        <p className="mb-3 text-xs text-ink-2">Type <kbd className="rounded border border-line bg-hover px-1.5 py-0.5 font-sans text-[11px]">/</kbd> in the Learn composer, pick a command, then add what you want after it. Search or choose one here to see what it does. To ask, compare or simplify, just write it in your own words.</p>
        <div className="flex min-h-0 flex-1 gap-4 max-md:flex-col">
          <CommandList sections={sections} current={name} onChoose={choose} onClose={onClose} row="data-slash-help" className="w-60 max-md:max-h-56 max-md:w-full" />
          <section aria-label={`/${name} preview`} className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-line bg-hover/40 p-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <CommandMark name={name} className="text-base font-semibold text-ink" />
              <span data-slash-label className="text-sm font-medium text-ink">{command && descFor(command, 'learn')}</span>
              <span data-slash-effect className="rounded-full border border-line bg-white px-1.5 py-px text-[10px] text-ink-2">{effectOf(name)}</span>
              {MEDIA[name] && <span data-slash-media={MEDIA[name]} className="rounded-full border border-line bg-white px-1.5 py-px text-[10px] text-ink-2">{MEDIA[name]}</span>}
              {mayConfirmPaid(name) && <span className="rounded-full border border-line bg-white px-1.5 py-px text-[10px] text-ink-3" title="On the canvas it asks before generating. Here, Generate is off.">confirms paid</span>}
            </div>
            {command?.about && <p data-slash-about className="mt-1 text-sm text-ink-2">{command.about}</p>}
            {example && <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <code className="font-mono text-xs text-ink-3">e.g. {EXAMPLES[name]}</code>
              {onUseExample && <button type="button" data-slash-use-example={name} title="Put this example in the composer to edit; it is not sent"
                onClick={() => onUseExample({ command: example.name, text: example.args })}
                className="rounded-lg border border-line bg-white px-2 py-0.5 text-xs text-ink hover:bg-hover">Use example</button>}
            </div>}
            {cards.length > 1 && (
              <div role="tablist" aria-label="Cards this command can make" className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-ink-3">Can make:</span>
                {cards.map((entry, index) => (
                  <button key={entry.card} type="button" role="tab" aria-selected={entry === card} onClick={() => setCardIndex(index)}
                    className={`rounded-full border px-2.5 py-1 text-xs ${entry === card ? 'border-ink bg-white text-ink' : 'border-line text-ink-2 hover:bg-white'}`}>
                    {entry.card === 'notebook' ? 'Notebook' : BLOCK_TYPES[entry.card]?.label}
                  </button>
                ))}
              </div>
            )}
            {/* The card at the size it has on the canvas: the pane scrolls rather than shrink it. */}
            <div className="mt-3 flex min-h-0 flex-1 items-start justify-center overflow-auto py-1">
              {name === 'cad' ? <p data-slash-cad className="max-w-md text-sm text-ink-2">Describe the part, its purpose and any required dimensions. CAD creates a saved background job, asks about important missing dimensions, and returns an interactive model with checked downloads. Selecting CAD does not start generation.</p> : demo === 'cards'
                ? <div className="flex flex-col items-center gap-2"><p data-slash-sample className="text-[11px] text-ink-3">A sample card. Yours is made from what you type.</p><CardPreview key={`${name}:${card.card}`} type={card.card} command={name} appName={appName} /></div>
                : demo === 'finder'
                  ? <p data-slash-finder={name} className="w-[440px] max-w-full text-xs text-ink-2">{FINDER_NOTES[name]}</p>
                  : <ChatPreview name={name} />}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// One card exactly as the canvas draws it at 100%: the canvas node's width,
// its fixed height or its auto height up to autoMax, its ghost or bordered
// frame, its drag strip and its Sources & evidence row (AdaptiveCanvas's
// CanvasNode), and the card fully working. The one exception: Generate for
// paid media is disabled here, so a help sheet can never start a paid job.
function CardPreview({ type, command, appName }) {
  const [block, setBlock] = useState(() => {
    if (type === 'notebook') return { ...newNotebookBlock(), notebook_id: 'slash-commands-preview' };
    const sample = { ...BLOCK_TYPES[type].sample(), ...structuredClone(SAMPLES[command]?.[type] || {}) };
    // A generated code sample never carries an output line (nobody ran it); the + sample's is hand-written.
    if (type === 'snippet') delete sample.output;
    // The viewer fetches an absolute URL, as a real scene's asset URL is; the committed model is served by this origin.
    if (sample.modelUrl) sample.modelUrl = new URL(sample.modelUrl, window.location.origin).href;
    return sample;
  });
  const spec = BLOCK_TYPES[type] || {};
  const width = type === 'notebook' ? 640 : spec.sizeFor?.(block)?.width ?? spec.width ?? 380;
  const height = type === 'notebook' ? 540 : spec.sizeFor?.(block)?.height ?? spec.height;
  const ghost = !!spec.ghost;
  const picture = illustrationFor(type, block);
  // A 3D model (/3d's scene) shows at once; Interact and Fit view sit outside the card, above its top right corner as on the
  // canvas's selected-card toolbar (CadViewerTools), and the viewer waits for Interact before it takes the wheel.
  const viewKey = block.type === 'scene' && block.modelUrl ? `slash-sheet:${block.id}` : null;
  // The canvas grows a card by its Sources & evidence row, so a card with sources is not capped here.
  const card = (
    <div data-slash-card={type} style={{ width, height, maxHeight: height || block.sources ? undefined : spec.autoMax ?? 420 }}
      className={`group relative flex shrink-0 cursor-default flex-col rounded-xl border select-text [&_[data-paid-generate]]:pointer-events-none [&_[data-paid-generate]]:opacity-40 ${ghost ? 'border-transparent bg-transparent hover:border-line hover:shadow-sm' : 'border-line bg-white shadow-sm'}`}>
      <div aria-hidden className={`flex h-6 shrink-0 items-center justify-center rounded-t-xl ${ghost ? 'opacity-0 group-hover:opacity-100' : ''}`}><span className="h-1 w-12 rounded-full bg-line" /></div>
      {type === 'notebook'
        ? <NotebookBody block={block} onSelect={() => {}} onDocument={() => {}} onManifest={() => {}} />
        // A sample with a finished clip or model of its own (/motion's, /3d's) shows it; otherwise the picture.
        : picture
          ? <Illustration block={block} {...picture} />
          : <LearningBlockBody block={block} onChange={setBlock} onChangeQuiet={setBlock} appName={appName} selected viewKey={viewKey} />}
      {block.sources && <SourcesDisclosure sources={block.sources} />}
    </div>
  );
  return viewKey
    ? <div data-slash-viewer-preview className="flex shrink-0 flex-col items-end gap-2"><CadViewerTools viewKey={viewKey} cardId={block.id} ruler={false} />{card}</div>
    : card;
}

// Paid media with no committed finished file: a picture of the finished card, labelled as one.
function Illustration({ block, kicker, src, alt, note }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <span className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-ink-2 uppercase"><span className="h-1.5 w-1.5 rounded-full bg-ink" />{kicker}</span>
      <p className="text-sm font-medium">{block.title}</p>
      <img data-slash-illustration src={src} alt={alt} className="mt-2 w-full rounded-lg border border-line" />
      <p className="mt-1.5 text-xs text-ink-2">{block.operation?.caption || block.caption}</p>
      <p className="mt-1 text-[11px] text-ink-3">{note}</p>
    </div>
  );
}

// A chat command adds no card of its own: its answer arrives as a chat card
// next to what the learner asked about. This shows one such exchange, asking
// exactly the command's e.g. line.
function ChatPreview({ name }) {
  const example = CHAT_EXAMPLES[name];
  return (
    <div data-slash-chat={name} className="flex w-[380px] max-w-full shrink-0 flex-col gap-2">
      <p className="text-xs text-ink-2">{example.note || 'Answers in the chat, about the card you select (or the current concept). It adds no card of its own.'}</p>
      <div className="rounded-xl border border-line bg-white shadow-sm">
        <div aria-hidden className="flex h-6 items-center justify-center"><span className="h-1 w-12 rounded-full bg-line" /></div>
        <p className="px-4 text-[11px] text-ink-3">About: {example.about}</p>
        <div className="flex justify-end px-4 pt-2 pb-3"><span className="max-w-[85%] rounded-2xl bg-accent px-3 py-2 text-sm text-white">{EXAMPLES[name]}</span></div>
        <div className="border-t border-line px-4 py-3 text-sm text-ink"><Md text={example.answer} /></div>
        <p className="px-4 pb-3 text-[11px] text-ink-3">{example.footer || 'Example answer - the tutor writes the real one for what you selected.'}</p>
      </div>
    </div>
  );
}
