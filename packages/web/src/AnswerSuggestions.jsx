// Suggested actions and Explore next under a chat answer (chat-workspace-CONTRACT.md B3, B4; owner brief sections 11, 12).
// The records were validated by the server (control-plane chat-answer-meta.js); this only draws them. A click prepares the
// composer (Lane A's composer.prepare, contract A6) or inserts the answer's own notebook code: rendering never sends, never
// generates and never fetches. Actions make artifacts, questions continue the talk, so the two are drawn apart.
import { useState } from 'react';
import { ChartLine, ChevronDown, CircleHelp, Clapperboard, Code, Columns2, CornerDownRight, Film, Image, NotebookPen, PencilLine, Video, Workflow } from 'lucide-react';

const ICON = { diagram: Workflow, graph: ChartLine, animate: Clapperboard, video: Video, image: Image, notebook: NotebookPen, code: Code, compare: Columns2, practice: PencilLine, quiz: CircleHelp, motion: Film };

export default function AnswerSuggestions({ message, latest, threadId, prepare, insertNotebook }) {
  // Opened on an older answer by key, so a reused instance never carries it to another chat or message.
  const key = `${threadId}:${message?.messageId}`;
  const [openKey, setOpenKey] = useState(null);
  if (message?.role !== 'assistant' || message.status !== 'done' || !message.meta) return null;
  const actions = message.meta.actions || [], followUps = message.meta.followUps || [];
  if (!actions.length && !followUps.length) return null;
  const open = latest || openKey === key;
  if (!open) return (
    <button type="button" data-answer-suggestions-toggle aria-expanded="false" onClick={() => setOpenKey(key)}
      className="mt-1 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-ink-3 hover:bg-hover hover:text-ink-2">
      Suggestions<ChevronDown size={12} aria-hidden="true" />
    </button>
  );
  // A generation action only prepares /<capability> <subject> with its refs: the user's Send runs the established slash
  // path, so a paid primitive keeps its Generate confirmation and motion its proposal card.
  const run = a => (a.generationRequired ? prepare({ command: a.capabilityId, text: a.args.subject, contextRefs: a.contextRefs }) : insertNotebook(a.args.code.cells, a.args.code.language));
  return (
    <div data-answer-suggestions={key} className="mt-2 flex flex-col gap-2">
      {actions.length > 0 && (
        <div role="group" aria-label="Suggested actions" className="flex flex-wrap gap-1.5">
          {actions.map(a => {
            const Icon = ICON[a.capabilityId] || Code;
            return (
              <button key={a.id} type="button" data-answer-action={a.capabilityId} onClick={() => run(a)}
                title={a.generationRequired ? `Generates: ${a.args.subject}` : 'Opens the code from this answer'}
                className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-2 py-1 text-xs font-medium text-ink hover:bg-hover">
                <Icon size={14} aria-hidden="true" className="shrink-0 text-ink-2" />
                <span>{a.label}</span>
                {a.generationRequired && <span className="text-[11px] font-normal text-ink-3">Generates</span>}
              </button>
            );
          })}
        </div>
      )}
      {followUps.length > 0 && (
        <section aria-label="Explore next" className="flex flex-col gap-0.5">
          <h3 className="text-xs font-medium text-ink-3">Explore next</h3>
          {followUps.map(f => (
            <button key={f.id} type="button" data-answer-followup={f.kind} onClick={() => prepare({ text: f.text })}
              className="flex items-start gap-1.5 rounded-md px-1.5 py-1 text-left text-sm text-ink-2 hover:bg-hover hover:text-ink">
              <CornerDownRight size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3" />
              <span className="min-w-0">{f.text}</span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
