// The shared answer renderer (moved out of ask.jsx): tiny safe markdown, math, code and the neutral source pills.
import { Fragment, memo, useContext, useEffect, useRef, useState } from 'react';
import { Check, Copy, FileText, Play, Shield } from 'lucide-react';
import { CodeRefs } from './code-refs.js';
import { colorLine } from './code.jsx';
import { MathText, tokenizeMath } from './MathText.jsx';
import { FILE_TOKEN, INLINE_PARTS, citedSources, linkable, referenceLabel, sourceReference, singleSourcePath } from './source-references.js';
import { cn } from './ui.jsx';

export { CodeRefs };

export function EvidencePill({ icon: Icon = FileText, children, ...props }) {
  const Tag = props.href ? 'a' : props.onClick ? 'button' : 'span';
  return <Tag {...props} className={cn('inline-flex max-w-full items-center gap-1.5 rounded-sm border border-line px-2 py-1 text-left text-xs text-ink-2 no-underline', (props.href || props.onClick) && 'cursor-pointer hover:bg-hover hover:text-ink')}><Icon size={12} strokeWidth={1.5} className="shrink-0" /><span className="break-words min-w-0">{children}</span></Tag>;
}


// Tiny safe markdown: **bold**, *italic*, `code`, lists, quotes, tables, code and math. Built as elements - no HTML injection.
// *italic* and _italic_ are found before the reference split (which cuts plain text at every number). Code spans, links and
// bold pass through whole, so nothing inside them reads as emphasis; snake_case, 2 * 3, *args and paths (src/_x_/, src/*.py) stay literal.
const EMPHASIS = /(`[^`\n]+`|\*\*[^*]+\*\*|\[[^\]\n]+\]\([^\s)]+\)|(?<![\w*/])\*(?![\s*])[^*\n]*?[^\s*]\*(?![\w*])|(?<![\w/.])_(?![\s_])[^_\n]*?[^\s_]_(?![\w/.]))/;
function inline(s, math = [], onFile, sourcePath, has = null) {
  const parts = s.split(EMPHASIS);
  const italic = (part, i) => i % 2 === 1 && !part.startsWith('**') && /^[*_]/.test(part);
  if (!parts.some(italic)) return plain(s, math, onFile, sourcePath, has);
  const out = [];
  let rest = '';
  parts.forEach((part, i) => {
    if (!italic(part, i)) { rest += part; return; }
    if (rest) out.push(<Fragment key={`p${i}`}>{plain(rest, math, onFile, sourcePath, has)}</Fragment>);
    out.push(<em key={`e${i}`}>{inline(part.slice(1, -1), math, onFile, sourcePath, has)}</em>);
    rest = '';
  });
  if (rest) out.push(<Fragment key="p-end">{plain(rest, math, onFile, sourcePath, has)}</Fragment>);
  return out;
}

// has: the snapshot test inside a repository context (CodeRefs), else null - every reference with an onFile is a link.
function plain(s, math = [], onFile, sourcePath, has = null) {
  return s.split(INLINE_PARTS).map((part, i) => {
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) return <EvidencePill key={i} href={link[2]} target="_blank" rel="noreferrer">{inline(link[1], math)}</EvidencePill>;
    const token = part.match(/^(\d+)$/);
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

// Answers stream: the text is cut into blocks at blank lines (never inside a code fence or display math), and each block is
// memoized on its source, so a new token reparses only the last block and finished blocks keep their DOM.
export function splitBlocks(text) {
  const blocks = [];
  let cur = [], fence = false, close = null;
  for (const l of text.split('\n')) {
    if (fence || close) {
      cur.push(l);
      if (fence ? /^\s*```/.test(l) : l.includes(close)) { fence = false; close = null; }
      continue;
    }
    if (!l.trim()) { if (cur.length) blocks.push(cur.join('\n')); cur = []; continue; }
    cur.push(l);
    // ponytail: a $$ inside inline code also opens display math here; that block then runs to the next $$ line.
    if (/^\s*```/.test(l)) fence = true;
    else if ((l.match(/\$\$/g) || []).length % 2) close = '$$';
    else if (l.lastIndexOf('\\[') > l.lastIndexOf('\\]')) close = '\\]';
  }
  if (cur.length) blocks.push(cur.join('\n'));
  return blocks;
}

// colorLine reads # as a comment, so languages where # means something else stay untinted.
// ponytail: one Python-flavoured tokenizer for every language; a per-language grammar when answers need one.
const UNTINTED = /^(css|scss|less|html|xml|svg|md|markdown|text|txt|plain|plaintext)$/i;
export function Code({ lang, lines }) {
  const [copied, setCopied] = useState(null);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = async () => { try { await navigator.clipboard.writeText(lines.join('\n')); setCopied('Copied'); } catch { setCopied('Copy failed'); } };
  return (
    <div data-code-block className="my-1.5 min-w-0 rounded-sm bg-code">
      <div className="flex items-center gap-2 px-3 pt-1.5 text-xs text-ink-3">
        <span data-code-lang className="min-w-0 flex-1 truncate font-mono">{lang}</span>
        <button type="button" data-code-copy aria-label="Copy code" title="Copy code" onClick={copy} className={cn('flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-sm px-1.5 hover:bg-hover hover:text-ink', copied === 'Copy failed' && 'text-danger')}>
          {copied === 'Copied' ? <Check size={12} /> : <Copy size={12} />}<span role="status">{copied || 'Copy'}</span>
        </button>
      </div>
      <pre className="overflow-x-auto px-3 pt-1 pb-3 font-mono text-xs leading-normal whitespace-pre text-ink">{lines.map((l, j) => <div key={j}>{UNTINTED.test(lang) ? l || ' ' : colorLine(l)}</div>)}</pre>
    </div>
  );
}

// Nested lists: an item more indented than the one before belongs to it. A run of one kind is one list; an ol keeps its start
// so a list cut by a paragraph keeps counting.
function listOf(items, key, md) {
  const out = [];
  for (let i = 0; i < items.length;) {
    const head = items[i], lis = [];
    while (i < items.length && items[i].ordered === head.ordered) {
      const item = items[i++], kids = [];
      while (i < items.length && items[i].indent > item.indent) kids.push(items[i++]);
      lis.push(<li key={lis.length}>{md(item.text)}{kids.length > 0 && listOf(kids, `${key}-${lis.length}`, md)}</li>);
    }
    const Tag = head.ordered ? 'ol' : 'ul';
    out.push(<Tag key={`l${key}-${out.length}`} start={head.ordered && head.n !== 1 ? head.n : undefined} className={head.ordered ? 'my-1 list-decimal pl-5' : 'my-1 list-disc pl-5'}>{lis}</Tag>);
  }
  return out;
}

const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
// The CSS reset draws every heading as body text, so a chat answer (Md doc) needs sizes for its hierarchy. Md is shared with
// canvas cards, lesson readers and sheets, which keep their body-sized headings: a 20px title in a small card overwhelms it.
const HEADING_SIZE = { 1: 'text-xl', 2: 'text-lg', 3: 'text-base' };

// One block's lines (a blockquote's lines recurse). first: nothing is drawn above, so a heading gets no section rule.
function lines(ls, ctx, first) {
  const { math, onFile, onRun, has, sourcePath, doc } = ctx;
  const md = s => inline(s, math, onFile, sourcePath, has);
  const out = [];
  let fence = null; // collecting a ``` block
  let table = null; // collecting consecutive | … | rows
  let list = null, quote = null;
  const flush = key => {
    if (table) {
      const [head, ...rows] = table;
      out.push(<div key={`t${key}`} className="my-2 overflow-x-auto"><table className="min-w-full border-collapse text-xs"><thead><tr>{head.map((c, j) => <th key={j} className="border border-line px-2 py-1 text-left font-semibold">{md(c)}</th>)}</tr></thead><tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j} className="border border-line px-2 py-1 align-top">{md(c)}</td>)}</tr>)}</tbody></table></div>);
    }
    if (list) out.push(...listOf(list, key, md));
    if (quote) out.push(<blockquote key={`q${key}`} className="my-2 border-l-2 border-line pl-3 text-ink-2">{lines(quote, ctx, false)}</blockquote>);
    table = list = quote = null;
  };
  ls.forEach((l, i) => {
    if (fence) {
      if (/^\s*```/.test(l)) { out.push(<Code key={`f${i}`} {...fence} />); fence = null; }
      else fence.lines.push(l);
      return;
    }
    const open = l.match(/^\s*```\s*([\w+#.-]*)/), row = /^\s*\|.*\|\s*$/.test(l), item = l.match(LIST_ITEM), quoted = l.match(/^\s*>\s?(.*)$/);
    // An indented line under an item continues it.
    if (list && !item && !open && /^\s+\S/.test(l)) { list[list.length - 1].text += ' ' + l.trim(); return; }
    if (!(row && table) && !(item && list) && !(quoted && quote)) flush(i);
    if (open) { fence = { lang: open[1], lines: [] }; return; }
    if (row) {
      const cells = l.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
      if (!cells.every(cell => /^:?-{3,}:?$/.test(cell))) (table = table || []).push(cells);
      return;
    }
    if (item) { (list = list || []).push({ indent: item[1].length, ordered: /\d/.test(item[2]), n: parseInt(item[2], 10), text: item[3] }); return; }
    if (quoted) { (quote = quote || []).push(quoted[1]); return; }
    const token = l.trim().match(/^(\d+)$/);
    const heading = l.match(/^(#{1,6})\s+(\S.*?)\s*#*$/);
    // A line that is nothing but bold text is a section title in all but syntax.
    const boldTitle = !heading && l.trim().match(/^\*\*([^*]{3,90})\*\*:?$/);
    if (token && math[Number(token[1])]?.display) {
      out.push(<MathText key={i} {...math[Number(token[1])]} />);
    } else if (heading || boldTitle) {
      const level = heading ? heading[1].length : 3, Heading = `h${level}`;
      // A long answer reads as one wall without a break before each section.
      const rule = first && !out.length ? 'mt-1' : 'mt-4 border-t border-line pt-3';
      out.push(<Heading key={i} className={cn(rule, 'mb-1 font-semibold text-ink', doc && (HEADING_SIZE[level] || 'text-sm'))}>{md(heading ? heading[2] : boldTitle[1])}</Heading>);
    } else if (l.startsWith('Sources: ')) {
      out.push(<SourcesLine key={i} text={l} onRun={onRun} onFile={onFile} has={has} />);
    } else if (l.trim()) {
      out.push(<p key={i} className="my-1">{md(l)}</p>);
    }
  });
  // An unclosed fence (a reply still streaming) is a code block that is still growing.
  if (fence) out.push(<Code key="f-end" {...fence} />);
  flush('end');
  return out;
}

// Unclosed $$ or \[ makes no math token (tokenizeMath), so it stays plain text until it closes.
const Block = memo(function Block({ src, first, ...ctx }) {
  const { source, math } = tokenizeMath(src);
  return lines(source.split('\n'), { ...ctx, math }, first);
});

// doc: the text is a document in its own pane (a Chat answer), so headings get sizes; everywhere else they stay body-sized.
export function Md({ text, onRun, onFile: given, sourcePath = singleSourcePath(text), doc = false }) {
  const refs = useContext(CodeRefs);
  // Where the caller links files at all (an onFile), a repository context's own reader takes the click and its snapshot decides.
  const onFile = given && refs ? refs.open : given, has = given && refs ? refs.has : null;
  // Callers pass fresh arrows every render; a memoized block gets stable openers that call the latest ones.
  const latest = useRef(null);
  latest.current = { onFile, onRun };
  const [open] = useState(() => ({ file: (...a) => latest.current.onFile(...a), run: (...a) => latest.current.onRun(...a) }));
  const blocks = splitBlocks(text.replace(/^Papers read:\s*/gm, ''));
  // Every file the answer cites, in one Sources dropdown, each opening its file (owner, 2026-10-04).
  const cited = onFile ? citedSources(text).filter(c => linkable(c, has)) : [];
  return (
    <div className="min-w-0 text-sm leading-normal">
      {blocks.map((src, i) => <Block key={i} src={src} first={i === 0} onFile={onFile ? open.file : null} onRun={onRun ? open.run : null} has={has} sourcePath={sourcePath} doc={doc} />)}
      {cited.length > 0 && <details key="cited" data-cited-sources className="mt-2 text-xs"><summary className="cursor-pointer text-ink-2 hover:text-ink">Sources ({cited.length})</summary>
        <div className="mt-1.5 flex flex-wrap gap-1">{cited.map(c => <EvidencePill key={`${c.path}:${c.start}-${c.end}`} type="button" data-cited-source aria-label={referenceLabel(c)} title={referenceLabel(c)} onClick={() => onFile(c.path, c.start, c.end)}>{c.path}:{c.start}{c.end > c.start ? `-${c.end}` : ''}</EvidencePill>)}</div></details>}
    </div>
  );
}
