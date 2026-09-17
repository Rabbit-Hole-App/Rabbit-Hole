import { Md } from './ask.jsx';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, Clock, FileCode2, Image, Layers, Link2, ListChecks, MessageSquareText, Mic, Route, Type } from 'lucide-react';
import curriculum from '../../../docs/courses/nanogpt/quickstart-curriculum.md?raw';
import lessonOne from '../../../docs/courses/nanogpt/lesson-01-plan.md?raw';

const lessonOneRevision = lessonOne.match(/Plan revision: (\d+)/)?.[1] || '1';
const lessonOneTiming = lessonOne.split(/^## /m).find(section => /^Timing\r?\n/.test(section))?.split('\n').slice(1).join('\n').trim();

// Owner-supplied dev fixture. Content stays in the reviewable Markdown documents;
// neither rendering a lesson nor generating an asset is triggered by this view.
const lessons = curriculum.split(/^## Lesson /m).slice(1).map(section => {
  const [heading, ...body] = section.split('\n');
  return { title: `Lesson ${heading}`, body: body.join('\n').split('\n## Source and review notes')[0].trim() };
});

function PlanMarkdown({ text }) {
  // Reuse chat's safe Markdown and code highlighting, with semantic tables for
  // the asset manifest and flashcards. No raw HTML from lesson documents.
  return text.split(/(\n(?:\|[^\n]*\n)+)/).map((part, i) => {
    if (!part.trim().startsWith('|')) return <Md key={i} text={part} />;
    const rows = part.trim().split('\n').map(row => row.split('|').slice(1, -1).map(cell => cell.trim()));
    return <div key={i} className="my-4 overflow-x-auto"><table className="w-full border-collapse text-left text-sm"><thead><tr>{rows[0].map((cell, j) => <th key={j} className="border-b border-line p-2 font-medium"><Md text={cell} /></th>)}</tr></thead><tbody>{rows.slice(2).map((row, j) => <tr key={j}>{row.map((cell, k) => <td key={k} className="border-b border-line p-2 align-top"><Md text={cell} /></td>)}</tr>)}</tbody></table></div>;
  });
}

function CompletionBox({ label }) {
  return <span role="img" aria-label={`${label}: not completed`} className="mt-0.5 inline-block h-4 w-4 shrink-0 rounded border border-ink-3/50 bg-white" />;
}

function QuizPlanMarkdown({ text }) {
  const choices = [...text.matchAll(/^- ([A-Z])\. (.+)$/gm)];
  const answer = text.match(/^Correct:\s*\*\*([A-Z])\*\*\.?\s*$/m)?.[1];
  if (!choices.length || !choices.some(choice => choice[1] === answer)) return <PlanMarkdown text={text} />;
  const last = choices[choices.length - 1];
  return <>
    <PlanMarkdown text={text.slice(0, choices[0].index)} />
    <div className="my-4 space-y-2" aria-label="Quiz answer key">{choices.map(([, key, label]) => <div key={key} className={`flex items-start gap-3 rounded-lg border bg-transparent p-3 text-ink ${key === answer ? 'border-green-600/40' : 'border-line'}`}>
      <span role="img" aria-label={key === answer ? 'Correct answer' : 'Unchecked option'} className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${key === answer ? 'border-green-600 bg-green-600 text-white' : 'border-ink-3/50'}`}>{key === answer && <Check size={12} strokeWidth={3} aria-hidden="true" />}</span>
      <span className="min-w-0 flex-1"><PlanMarkdown text={`**${key}.** ${label}`} /></span>
    </div>)}</div>
    <PlanMarkdown text={text.slice(last.index + last[0].length).replace(/^Correct:[^\n]*(?:\n|$)/m, '')} />
  </>;
}

function MaterialBlock({ block, page, context, learnerView, selectedSection, onEdit }) {
  const Icon = { 'Canvas text': Type, Assets: Image, 'Drawing sequence': Route, 'Spoken or written explanation': Mic, 'Further explanations': BookOpen, 'References and further reading': Link2 }[block.title.trim()] || FileCode2;
  const isQuiz = block.id.includes('-quiz-');
  return <section aria-label={block.title} data-plan-section={block.id} className={`relative rounded-xl border p-4 pr-12 transition-colors ${selectedSection === block.id ? `border-accent ring-1 ring-accent ${isQuiz ? 'bg-white' : 'bg-accent/5'}` : 'border-line bg-white'}`}>
    <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Icon size={18} aria-hidden="true" className="shrink-0 text-ink" />{block.title}</h4>
    {isQuiz ? <QuizPlanMarkdown text={block.text} /> : <PlanMarkdown text={block.text} />}
    {!learnerView && onEdit && <button type="button" title="Edit this section in chat" aria-label={`Edit ${page}: ${block.title} in chat`} aria-pressed={selectedSection === block.id} onClick={() => onEdit({ ...block, page, context })} className="absolute right-3 top-3 rounded-md p-1.5 text-accent hover:bg-accent/10"><MessageSquareText size={16} /></button>}
  </section>;
}

function ActivityTabs({ item, index, edits, showSources = true, only, ...editing }) {
  const [active, setActive] = useState(only || null);
  const tabs = [
    { key: 'quiz', icon: ListChecks, match: /^(?:Mini|Final) quiz/, label: 'Quiz' },
    { key: 'cards', icon: Layers, match: /^Flashcards/, label: 'Flashcards' },
    { key: 'notebook', icon: FileCode2, match: /^(?:Final homework|Homework) notebook/, label: 'Notebook' },
    { key: 'sources', icon: BookOpen, match: /^Repo focus/, label: 'Repository focus' },
  ].filter(tab => (!only || tab.key === only) && (showSources || tab.key !== 'sources')).map(tab => {
    const content = item.body.split(/^### /m).find(part => tab.match.test(part)) || '';
    return { ...tab, content, label: tab.key === 'notebook' ? 'Notebook' : content.split('\n')[0] || tab.label };
  });
  const chosen = tabs.find(tab => tab.key === active);
  let blocks = [];
  if (chosen) {
    let content = chosen.content;
    if (index === 0 && active !== 'sources') {
      const heading = { quiz: 'Quiz', cards: 'Flashcards', notebook: 'Optional notebook' }[active];
      content = lessonOne.split(/^## /m).find(part => part.startsWith(heading)) || content;
    }
    if (active === 'cards' && index === 0) {
      blocks = content.split('\n').filter(line => line.startsWith('|')).slice(2).map((line, i) => {
        const [, front, back] = line.split('|');
        return { title: `Card ${i + 1}`, text: `**Front:** ${front.trim()}\n\n**Back:** ${back.trim()}` };
      });
    } else if (index === 0 && ['quiz', 'notebook'].includes(active)) {
      blocks = content.split(/^### /m).slice(1).map(part => { const [title, ...body] = part.split('\n'); return { title, text: body.join('\n').trim() }; });
    } else blocks = [{ title: chosen.label, text: content.split('\n').slice(1).join('\n').trim() }];
    blocks = blocks.map((block, n) => { const id = `lesson-${index + 1}-${index === 0 ? `r${lessonOneRevision}-` : ''}${active}-${n + 1}`; return { ...block, id, text: edits[id] || block.text }; });
  }
  return <>
    {!only && <div role="tablist" aria-label={`Lesson ${index + 1} activities`} className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">{tabs.map(({ key, icon: Icon, label }) => <button type="button" role="tab" key={key} aria-selected={active === key} onClick={() => setActive(key)} className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-2 text-xs transition-colors ${active === key ? 'border-accent bg-accent/5 text-ink' : 'border-line text-ink-2 hover:bg-hover'}`}>{editing.learnerView && key !== 'sources' ? <CompletionBox label={label} /> : <Icon size={13} />} {label}</button>)}</div>}
    {chosen && <div role={only ? 'region' : 'tabpanel'} aria-label={`Lesson ${index + 1}: ${chosen.label}`} className="mt-4 space-y-3">{blocks.map(block => <MaterialBlock key={block.id} block={block} page={`Lesson ${index + 1}: ${chosen.label}`} context={blocks.map(item => `${item.title}\n${item.text}`).join('\n\n')} {...editing} />)}</div>}
  </>;
}

export default function LessonPlanPreview({ view, selected, onSelect, course, editorPanel, learnerView, onBack, edits = {}, selectedSection, onEdit, onPreview }) {
  if (view === 'curriculum') return <section aria-label="Quickstart curriculum" className="min-h-0 flex-1 overflow-y-auto pr-2">
    <h2 className="text-xl font-semibold">Quickstart: karpathy/nanoGPT</h2>
    <div className="mt-2 mb-6 flex flex-wrap items-center gap-4 text-xs text-ink-2"><span className="inline-flex items-center gap-1.5"><BookOpen size={14} />8 lessons</span><span className="inline-flex items-center gap-1.5"><Clock size={14} />~50 min guided explanations</span><span>Self-paced review · Optional notebooks</span></div>
    <ol className="space-y-4">{(course?.curriculum?.lessons || lessons).map((saved, index) => {
      const item = lessons[index];
      const title = saved.topics ? saved.title : item.title.replace(/^Lesson \d+: /, '').replace(/ —.*$/, '');
      const topics = saved.topics || item.body.split('\n### ')[0].split('\n').filter(line => line.startsWith('- ')).map(line => line.slice(2));
      return <li key={index} className="rounded-xl border border-line bg-white p-5 transition-colors hover:border-ink-3/50">
      <button type="button" aria-label={`Lesson ${index + 1}: ${title}`} onClick={() => onSelect(index)} className="group flex w-full items-start gap-3 text-left text-ink">
        {learnerView ? <CompletionBox label={`Lesson ${index + 1}`} /> : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-hover text-xs font-medium tabular-nums">{String(index + 1).padStart(2, '0')}</span>}
        <span className="min-w-0 flex-1"><span className="block text-xs text-ink-2">Lesson {index + 1}{saved.minutes ? ` · ~${saved.minutes} min guided` : ''}</span><span className="mt-1 block text-base font-semibold group-hover:underline">{title}</span></span><ArrowRight size={17} className="mt-1 shrink-0 text-ink-3" />
      </button>
      <p className="mt-3 text-xs text-ink-2">{index === 0 ? 'Material plan ready for review' : 'Outline ready · material plan not written yet'}</p>
      <ul className="mt-3 space-y-2">{topics.map((topic, i) => <li key={i} className="flex items-start gap-2.5 text-sm text-ink-2">{learnerView ? <CompletionBox label={topic} /> : <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-3" />}<span>{topic}</span></li>)}</ul>
      <ActivityTabs item={item} index={index} edits={edits} learnerView={learnerView} selectedSection={selectedSection} onEdit={onEdit} />
    </li>; })}</ol>
    {editorPanel && <details className="mt-5 rounded-lg border border-line p-4"><summary className="cursor-pointer font-medium">Edit and approve curriculum</summary><div className="mt-4">{editorPanel}</div></details>}
  </section>;
  const item = lessons[selected];
  if (!item) return null;
  const pages = lessonOne.split(/^## /m).filter(section => /^Page \d+ —/.test(section)).map((section, index) => {
    const [intro, ...parts] = section.split(/^### /m);
    return { title: intro.trim(), blocks: parts.map((part, n) => {
      const [title, ...body] = part.split('\n');
      const id = `lesson-1-r${lessonOneRevision}-page-${index + 1}-section-${n + 1}`;
      return { id, title, text: edits[id] || body.join('\n').trim() };
    }) };
  });
  return <section key={selected} aria-label="Lesson material plan" className="min-h-0 flex-1 overflow-y-auto pr-2">
    <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs text-ink-2 hover:bg-hover"><ArrowLeft size={14} />Back to curriculum</button>
    <h2 className="text-xl font-semibold">{selected === 0 ? item.title.replace(/ —.*$/, '') : item.title}</h2>
    <p className="mt-2 mb-5 text-sm text-ink-2">{selected === 0 ? 'Draft material plan · review before rendering or generating assets' : 'Curriculum outline · the detailed material plan has not been written yet'}</p>
    {selected === 0 && <button type="button" disabled={!onPreview} onClick={onPreview} className="mb-5 inline-flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm text-white hover:opacity-90 disabled:opacity-40"><ArrowRight size={15} />Play Lesson 1</button>}
    {selected === 0 && Object.keys(edits).some(id => id.startsWith(`lesson-1-r${lessonOneRevision}-page-1-`) || id.startsWith(`lesson-1-r${lessonOneRevision}-page-2-`)) && <p className="mb-4 text-sm text-ink-2">This preview uses the saved Markdown plan. Your chat draft edits are retained here; rebuilding from those edits is not available yet.</p>}
    {selected === 0 && lessonOneTiming && <section aria-label="Lesson timing" className="mb-5 text-sm text-ink-2"><PlanMarkdown text={lessonOneTiming} /></section>}
    {selected === 0 && course?.revision > 1 && <p className="mb-4 rounded border border-line p-3 text-sm">This plan belongs to the original supplied curriculum. Review it against any curriculum changes before building.</p>}
    {selected !== 0 ? <Md text={item.body} /> : <div className="space-y-8">
      <p className="text-sm text-ink-2">All 6 pages · planned learner content, before rendering or generating assets.</p>
      {pages.map((page, index) => <details key={page.title} open={index === 0} data-plan-page className="group/page rounded-xl border border-line bg-white">
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl p-4 hover:bg-hover [&::-webkit-details-marker]:hidden">
          <ChevronDown size={18} aria-hidden="true" className="shrink-0 -rotate-90 text-ink-2 transition-transform group-open/page:rotate-0" />
          <h3 className="flex-1 text-base font-semibold">{page.title}</h3>
          <span className="shrink-0 text-xs text-ink-3">{page.blocks.length} sections</span>
        </summary>
        <div className="ml-6 mr-4 mb-5 space-y-4 border-l-2 border-line pl-5">{page.blocks.map(block => <div key={block.id} className="relative before:absolute before:-left-5 before:top-6 before:w-5 before:border-t-2 before:border-line"><MaterialBlock block={block} page={page.title} context={page.blocks.map(item => `${item.title}\n${item.text}`).join('\n\n')} learnerView={learnerView} selectedSection={selectedSection} onEdit={onEdit} /></div>)}</div>
      </details>)}
      {[{ key: 'quiz', label: 'Quiz', icon: ListChecks }, { key: 'cards', label: 'Flashcards', icon: Layers }, { key: 'notebook', label: 'Notebook', icon: FileCode2 }].map(({ key, label, icon: Icon }) => <details key={key} data-plan-activity={key} className="group/activity rounded-xl border border-line bg-white">
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl p-4 hover:bg-hover [&::-webkit-details-marker]:hidden">
          <ChevronDown size={18} aria-hidden="true" className="shrink-0 -rotate-90 text-ink-2 transition-transform group-open/activity:rotate-0" />
          <Icon size={18} aria-hidden="true" className="shrink-0" /><h3 className="text-base font-semibold">{label}</h3>
        </summary>
        <div className="px-4 pb-4"><ActivityTabs item={item} index={0} edits={edits} only={key} learnerView={learnerView} selectedSection={selectedSection} onEdit={onEdit} /></div>
      </details>)}
    </div>}
  </section>;
}
