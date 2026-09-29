import { useEffect, useState } from 'react';
import { sceneAssetUrl, sceneList, videoAssetUrl, videoList } from './learn-scene-client.js';
import { X } from 'lucide-react';
import { EXAMPLES, cardsFor, mayConfirmPaid, parseSlash, pickerSections } from './learn-slash.js';
import { learnRequest } from './agent/slash.js';
import { BLOCK_TYPES, LearningBlockBody } from './LearningBlocks.jsx';
import NotebookBody from './NotebookCard.jsx';
import { newNotebookBlock } from './learn-notebook.js';
import { Md } from './ask.jsx';

// What a chat command's answer looks like, for the sheet only: the command as
// typed about a card on the canvas, and an illustrative tutor answer. The
// real answer is written by the tutor for whatever the learner selected.
const CHAT_EXAMPLES = {
  deeper: { about: 'An id is an index, not a meaning', ask: '/deeper into the maths',
    answer: 'The lookup is a matrix product with a one-hot vector: if $x$ is the one-hot vector for id 42, then $x^\\top W_{te}$ is row 42 of $W_{te}$ ($65 \\times 384$). Training only updates rows whose ids appeared in the batch, which is why rare tokens learn slowly.' },
  simplify: { about: 'Softmax over the vocabulary', ask: '/simplify',
    answer: 'Softmax turns a list of scores into chances that add up to 1. A bigger score gets a bigger share, and every option keeps at least a little.' },
  example: { about: 'Softmax over the vocabulary', ask: '/example with real numbers',
    answer: 'Scores $[2, 1, 0.1]$. Exponentiate: $[7.39, 2.72, 1.11]$, which sum to $11.21$. Divide by the sum: $[0.66, 0.24, 0.10]$. The largest score gets about two thirds of the probability.' },
  ask: { about: 'karpathy/nanoGPT', ask: '/ask what does wte do?',
    answer: '`wte` is the token embedding table (`model.py`): one learned row of 384 numbers per vocabulary id. Each input id is looked up there before anything else runs.' },
  teach: { about: 'karpathy/nanoGPT', ask: '/teach causal masking',
    answer: 'Causal masking stops a position from looking ahead: attention scores for later positions are set to $-\\infty$ before softmax, so each token mixes information only from itself and earlier tokens. Next, the mask drawn as a triangle.' },
  research: { about: 'Attention', ask: '/research attention mechanisms',
    answer: 'Two places to start: "Attention Is All You Need" (Vaswani et al., arXiv:1706.03762), and "Neural Machine Translation by Jointly Learning to Align and Translate" (Bahdanau et al., arXiv:1409.0473), where attention first appears.' },
  do: { about: 'this canvas', ask: '/do add a section on attention', answer: 'Added a section heading, **Attention**, below the current card.' },
  source: { about: 'a card', ask: '/source', answer: 'Opens the Source inspector for the selected card. (Not reachable from a command yet.)' },
};

// Every Learn / command, opened from View > Slash commands. Left: the
// picker's own sections (learn-slash.js), so the sheet and the picker never
// disagree. Right: the real card the selected command puts on the canvas,
// drawn by the canvas's own card components from their + palette samples.
// Only the selected card renders. The card works as on the canvas, except
// that Generate for paid media is disabled here.
// The card the command's example makes, when its words narrow the family
// (/practice explain it back -> Explain back); otherwise the first.
const exampleCard = name => {
  const narrowed = learnRequest(name, { args: parseSlash(EXAMPLES[name] || '')?.args || '' }).allowedPrimitives;
  return narrowed?.length === 1 ? Math.max(0, cardsFor(name).findIndex(entry => entry.primitive === narrowed[0])) : 0;
};

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
                    onClick={() => { setName(item.name); setCardIndex(exampleCard(item.name)); }}
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
              {mayConfirmPaid(name) && <span className="rounded-full border border-line bg-white px-1.5 py-px text-[10px] text-ink-3" title="On the canvas it asks before generating. Here, Generate is off.">confirms paid</span>}
            </div>
            {EXAMPLES[name] && <code className="mt-1 block font-mono text-xs text-ink-3">e.g. {EXAMPLES[name]}</code>}
            {cards.length > 1 && (
              <div role="tablist" aria-label="Cards this command can make" className="mt-3 flex flex-wrap items-center gap-1.5">
                {/* /compare's family is several representations; the tutor picks whichever compares best. */}
                <span className="text-xs text-ink-3">{name === 'compare' ? 'The tutor picks one:' : 'Can make:'}</span>
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
              {card
                ? <CardPreview key={`${name}:${card.card}`} type={card.card} command={name} appName={appName} />
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
// frame and its drag strip (AdaptiveCanvas's CanvasNode), and the card fully
// working. The one exception: Generate for paid media is disabled here, so a
// help sheet can never start a paid job (it works on the canvas).
// /compare's own example: a comparison, not the generic + sample.
const COMPARE_SAMPLES = {
  table: () => ({ id: crypto.randomUUID(), type: 'table', dx: 0, dy: 0, title: 'Sigmoid vs tanh', caption: 'Two squashing functions side by side.',
    // String.raw: in a plain string '\s' is 's' and '\t' is a tab.
    columns: ['', String.raw`Sigmoid $\sigma(x)$`, String.raw`Tanh $\tanh(x)$`],
    rows: [['Output range', '$(0, 1)$', '$(-1, 1)$'], ['Value at 0', '$0.5$', '$0$'], ['Largest slope', '$0.25$ at $x = 0$', '$1$ at $x = 0$'],
      ['Relation', String.raw`$\sigma(x) = \tfrac{1}{2}(1 + \tanh(x/2))$`, String.raw`$\tanh(x) = 2\sigma(2x) - 1$`]] }),
};
// Generated media shows a finished example, never a Generate card: the job
// the clone already rendered for this sample, found by its operation id.
const FINISHED = {
  // #t=3 opens the clip on its first equation rather than a black first frame.
  mathAnimation: { list: videoList, key: 'videos', url: (app, key) => `${videoAssetUrl(app, key)}#t=3`, ready: (block, url) => ({ ...block, status: 'ready', src: url, variants: [{ src: url }], variant: 0 }) },
  videoGenerate: { list: videoList, key: 'videos', url: videoAssetUrl, ready: (block, url) => ({ ...block, status: 'ready', src: url, variants: [{ src: url }], variant: 0 }) },
  scene: { list: sceneList, key: 'scenes', url: sceneAssetUrl, ready: (block, url) => ({ ...block, status: 'ready', modelUrl: url }) },
};

function CardPreview({ type, command, appName }) {
  const [block, setBlock] = useState(() => {
    if (type === 'notebook') return { ...newNotebookBlock(), notebook_id: 'slash-commands-preview' };
    if (command === 'compare' && COMPARE_SAMPLES[type]) return COMPARE_SAMPLES[type]();
    const sample = BLOCK_TYPES[type].sample();
    // A generated code sample never carries an output line (nobody ran it); the + sample's is hand-written.
    if (type === 'snippet') delete sample.output;
    return sample;
  });
  // null: looking for the finished example; false: there is none yet.
  const [finished, setFinished] = useState(FINISHED[type] ? null : true);
  useEffect(() => {
    const source = FINISHED[type];
    if (!source) return;
    let live = true;
    source.list(appName).then(list => {
      const done = (list[source.key] || []).find(job => job.status === 'ready' && job.operation?.id === block.operation?.id);
      if (!live) return;
      if (done) setBlock(current => source.ready(current, source.url(appName, done.key)));
      setFinished(!!done);
    }).catch(() => { if (live) setFinished(false); });
    return () => { live = false; };
  }, [type, appName]);
  if (finished === null) return <p className="mt-8 text-sm text-ink-2">Finding a finished example…</p>;
  if (finished === false) return <p data-slash-unfinished={type} className="mt-8 max-w-sm text-center text-sm text-ink-2">No finished example of this one yet: its generator has not produced one here. On the canvas it asks before generating (paid).</p>;
  const spec = BLOCK_TYPES[type] || {};
  const width = type === 'notebook' ? 640 : spec.sizeFor?.(block)?.width ?? spec.width ?? 380;
  const height = type === 'notebook' ? 540 : spec.sizeFor?.(block)?.height ?? spec.height;
  const ghost = !!spec.ghost;
  return (
    <div data-slash-card={type} style={{ width, height, maxHeight: height ? undefined : spec.autoMax ?? 420 }}
      className={`group relative flex shrink-0 cursor-default flex-col rounded-xl border select-text [&_[data-paid-generate]]:pointer-events-none [&_[data-paid-generate]]:opacity-40 ${ghost ? 'border-transparent bg-transparent hover:border-line hover:shadow-sm' : 'border-line bg-white shadow-sm'}`}>
      <div aria-hidden className={`flex h-6 shrink-0 items-center justify-center rounded-t-xl ${ghost ? 'opacity-0 group-hover:opacity-100' : ''}`}><span className="h-1 w-12 rounded-full bg-line" /></div>
      {type === 'notebook'
        ? <NotebookBody block={block} onSelect={() => {}} onDocument={() => {}} onManifest={() => {}} />
        : <LearningBlockBody block={block} onChange={setBlock} onChangeQuiet={setBlock} appName={appName} selected />}
    </div>
  );
}

// A chat command adds no card of its own: its answer arrives as a chat card
// next to what the learner asked about. This shows one such exchange.
function ChatPreview({ name }) {
  const example = CHAT_EXAMPLES[name];
  return (
    <div data-slash-chat={name} className="flex w-[380px] max-w-full shrink-0 flex-col gap-2">
      <p className="text-xs text-ink-2">Answers in the chat, about the card you select (or the current concept). It adds no card of its own.</p>
      {example && (
        <div className="rounded-xl border border-line bg-white shadow-sm">
          <div aria-hidden className="flex h-6 items-center justify-center"><span className="h-1 w-12 rounded-full bg-line" /></div>
          <p className="px-4 text-[11px] text-ink-3">About: {example.about}</p>
          <div className="flex justify-end px-4 pt-2 pb-3"><span className="max-w-[85%] rounded-2xl bg-accent px-3 py-2 text-sm text-white">{example.ask}</span></div>
          <div className="border-t border-line px-4 py-3 text-sm text-ink"><Md text={example.answer} /></div>
          <p className="px-4 pb-3 text-[11px] text-ink-3">Example answer - the tutor writes the real one for what you selected.</p>
        </div>
      )}
    </div>
  );
}
