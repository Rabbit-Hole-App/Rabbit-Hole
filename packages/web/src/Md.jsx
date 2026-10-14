// The shared answer renderer (moved out of ask.jsx): tiny safe markdown, math, code and the neutral source pills.
import { useContext } from 'react';
import { FileText, Play, Shield } from 'lucide-react';
import { CodeRefs } from './code-refs.js';
import { colorLine } from './code.jsx';
import { MathText, tokenizeMath } from './MathText.jsx';
import { FILE_TOKEN, INLINE_PARTS, citedSources, linkable, referenceLabel, sourceReference, singleSourcePath } from './source-references.js';
import { cn, CodeBlock } from './ui.jsx';

export { CodeRefs };

export function EvidencePill({ icon: Icon = FileText, children, ...props }) {
  const Tag = props.href ? 'a' : props.onClick ? 'button' : 'span';
  return <Tag {...props} className={cn('inline-flex max-w-full items-center gap-1.5 rounded-sm border border-line px-2 py-1 text-left text-xs text-ink-2 no-underline', (props.href || props.onClick) && 'cursor-pointer hover:bg-hover hover:text-ink')}><Icon size={12} strokeWidth={1.5} className="shrink-0" /><span className="break-words min-w-0">{children}</span></Tag>;
}


// Tiny safe markdown: **bold**, `code`, "- " bullets. Built as elements - no HTML injection.
// has: the snapshot test inside a repository context (CodeRefs), else null - every reference with an onFile is a link.
function inline(s, math = [], onFile, sourcePath, has = null) {
  return s.split(INLINE_PARTS).map((part, i) => {
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) return <EvidencePill key={i} href={link[2]} target="_blank" rel="noreferrer">{inline(link[1], math)}</EvidencePill>;
    const token = part.match(/^\uE000(\d+)\uE001$/);
    if (token && math[Number(token[1])]) return <MathText key={i} {...math[Number(token[1])]} />;
    const reference=onFile&&sourceReference(part,sourcePath);
    if(linkable(reference,has))return <EvidencePill key={i} type="button" data-code-ref={`${reference.path}:${reference.start}-${reference.end}`} aria-label={referenceLabel(reference)} title={referenceLabel(reference)} onClick={()=>onFile(reference.path,reference.start,reference.end)}>{part.replace(/^`(.*)`$/,'$1')}</EvidencePill>;
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="rounded-xs bg-code px-1 font-mono text-[0.9em]">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{inline(part.slice(2, -2), math, onFile, sourcePath, has)}</strong>;
    return part;
  });
}

// A source token like "job.py:15" or "small.toml" - clickable when onFile is wired.

function SourcesLine({ text, onFile, onRun, onDecision, has = null }) {
  const parts = text.slice(9).split(/[,;]/).map(part => part.trim().replace(/^\x60(.*)\x60$/, '$1')).filter(Boolean);
  return (
    <div aria-label="Answer evidence" className="flex flex-col items-start gap-2 pt-2">
      {parts.map((part, i) => {
        const found = part.replace(/[–—]/g, '-').match(FILE_TOKEN), file = found && (!has || has(found[1])) ? found : null;
        const run = part.match(/^(?:run\s+)?(r-[\w-]+)$/i);
        const decision = part.match(/^decision:([a-f0-9-]{36})$/);
        const open = file && onFile ? () => onFile(file[1], file[2] ? Number(file[2]) : null, file[3] ? Number(file[3]) : null)
          : run && onRun ? () => onRun(run[1])
          : decision && onDecision ? () => onDecision(decision[1]) : null;
        const label = run ? 'Run · ' + run[1] : decision ? 'Approved decision' : part;
        const Icon = run ? Play : decision ? Shield : FileText;
        const name = file && file[2] ? referenceLabel({ path: file[1], start: Number(file[2]), end: Number(file[3] || file[2]) }) : 'Open ' + label;
        return <EvidencePill key={i} icon={Icon} {...(open ? { type: 'button', onClick: open, title: name, 'aria-label': name } : {})}>{label}</EvidencePill>;
      })}
    </div>
  );
}

export function Md({ text, onRun, onFile: given, sourcePath = singleSourcePath(text) }) {
  const refs = useContext(CodeRefs);
  // Where the caller links files at all (an onFile), a repository context's own reader takes the click and its snapshot decides.
  const onFile = given && refs ? refs.open : given, has = given && refs ? refs.has : null;
  const { source, math } = tokenizeMath(text.replace(/^Papers read:\s*/gm, ''));
  const lines = source.split('\n');
  const out = [];
  let bullets = null;
  let fence = null; // collecting a ``` block
  let table = null; // collecting consecutive | … | rows
  const flushTable = key => {
    const [head, ...rows] = table;
    out.push(<div key={key} className="my-2 overflow-x-auto"><table className="min-w-full border-collapse text-xs"><thead><tr>{head.map((c, j) => <th key={j} className="border border-line px-2 py-1 text-left font-semibold">{inline(c, math, onFile, sourcePath, has)}</th>)}</tr></thead><tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j} className="border border-line px-2 py-1 align-top">{inline(c, math, onFile, sourcePath, has)}</td>)}</tr>)}</tbody></table></div>);
    table = null;
  };
  lines.forEach((l, i) => {
    if (fence !== null) {
      if (/^\s*```/.test(l)) {
        out.push(<CodeBlock key={`f${i}`} className="my-1.5 text-xs">{fence.map((fl, j) => <div key={j}>{colorLine(fl)}</div>)}</CodeBlock>);
        fence = null;
      } else {
        fence.push(l);
      }
      return;
    }
    if (/^\s*```/.test(l)) {
      fence = [];
      return;
    }
    if (/^\s*\|.*\|\s*$/.test(l)) {
      const cells = l.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
      if (!cells.every(cell => /^:?-{3,}:?$/.test(cell))) (table = table || []).push(cells);
      return;
    }
    if (table) flushTable(`t${i}`);
    if (/^\s*[-*] /.test(l)) {
      bullets = bullets || [];
      bullets.push(<li key={i}>{inline(l.replace(/^\s*[-*] /, ''), math, onFile, sourcePath, has)}</li>);
      return;
    }
    if (bullets) {
      out.push(<ul key={`ul${i}`} className="my-1 list-disc pl-5">{bullets}</ul>);
      bullets = null;
    }
    const token = l.trim().match(/^\uE000(\d+)\uE001$/);
    const heading = l.match(/^(#{1,6})\s+(\S.*?)\s*#*$/);
    // A line that is nothing but bold text is a section title in all but syntax.
    const boldTitle = !heading && l.trim().match(/^\*\*([^*]{3,90})\*\*:?$/);
    if (token && math[Number(token[1])]?.display) {
      out.push(<MathText key={i} {...math[Number(token[1])]} />);
    } else if (heading || boldTitle) {
      const Heading = heading ? `h${heading[1].length}` : 'h3';
      // A long answer reads as one wall without a break before each section.
      const rule = out.length ? 'mt-4 border-t border-line pt-3' : 'mt-1';
      out.push(<Heading key={i} className={`${rule} mb-1 font-semibold text-ink`}>{inline(heading ? heading[2] : boldTitle[1], math, onFile, sourcePath, has)}</Heading>);
    } else if (l.startsWith('Sources: ')) {
      out.push(<SourcesLine key={i} text={l} onRun={onRun} onFile={onFile} has={has} />);
    } else if (l.trim()) {
      out.push(<p key={i} className="my-1">{inline(l, math, onFile, sourcePath, has)}</p>);
    }
  });
  if (fence) out.push(<CodeBlock key="f-end" className="my-1.5 text-xs">{fence.map((fl, j) => <div key={j}>{colorLine(fl)}</div>)}</CodeBlock>);
  if (table) flushTable('t-end');
  if (bullets) out.push(<ul key="ul-end" className="my-1 list-disc pl-5">{bullets}</ul>);
  // Every file the answer cites, in one Sources dropdown, each opening its file (owner, 2026-10-04).
  const cited = onFile ? citedSources(text).filter(c => linkable(c, has)) : [];
  if (cited.length) out.push(<details key="cited" data-cited-sources className="mt-2 text-xs"><summary className="cursor-pointer text-ink-2 hover:text-ink">Sources ({cited.length})</summary>
    <div className="mt-1.5 flex flex-wrap gap-1">{cited.map(c => <EvidencePill key={`${c.path}:${c.start}-${c.end}`} type="button" data-cited-source aria-label={referenceLabel(c)} title={referenceLabel(c)} onClick={() => onFile(c.path, c.start, c.end)}>{c.path}:{c.start}{c.end > c.start ? `-${c.end}` : ''}</EvidencePill>)}</div></details>);
  return <div className="min-w-0 text-sm leading-normal">{out}</div>;
}
