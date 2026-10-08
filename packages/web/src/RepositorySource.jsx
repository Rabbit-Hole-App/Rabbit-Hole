import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, X } from 'lucide-react';
import { api } from './api.js';
import { colorLine } from './code.jsx';
import { repositoryUrl } from './card-sources.js';
import { rememberCodeCopy } from './map-files.js';

export const SourceSelectionContext = createContext(null);

// `repo` ("owner/name"), when the caller knows it, adds a link to the same file
// at the same revision on its host. The Files view's reader (repository-browser.md) passes `title`, its breadcrumb in place
// of the path, and `actions`, a compact bar drawn under the selected range's last line.
export default function RepositorySource({ appName, path, line = 1, lineEnd, commit, repo, onClose, title, actions, pick = null }) {
  const [data,setData]=useState(null),[error,setError]=useState('');const selected=useRef(null);
  const selection=useContext(SourceSelectionContext), root=useRef(null), anchor=useRef(null);
  const current=selection?.value;
  const range=current?.path===path&&current?.commit===commit?current:null;
  const select=(start,end)=>{
    // Any length: a large range keeps its identity, and the server bounds what it reads (repositories.js selectedRange).
    if(!data||!selection)return;
    selection.set({path,commit:data.commit,start,end,text:data.content.split('\n').slice(start-1,end).join('\n')});
  };
  const selectText=()=>{
    const text=window.getSelection();if(!text||text.isCollapsed||!/\S/.test(text.toString())||!root.current.contains(text.anchorNode)||!root.current.contains(text.focusNode))return;
    const bounds=text.getRangeAt(0),row=node=>(node.nodeType===1?node:node.parentElement)?.closest('[data-source-line]');
    const a=Number(row(bounds.startContainer)?.dataset.sourceLine),b=Number(row(bounds.endContainer)?.dataset.sourceLine);
    if(a&&b){anchor.current=a;select(a,b>a&&bounds.endOffset===0?b-1:b);}
  };
  useEffect(()=>{
    let active=true;setData(null);setError('');
    api(`/api/repositories/${appName}/file`,{method:'POST',body:JSON.stringify({path,commit})}).then(d=>{if(active)setData(d);}).catch(e=>{if(active)setError(e.message);});
    return()=>{active=false;};
  },[appName,path,commit]);
  useEffect(()=>{selected.current?.scrollIntoView({block:'center'});},[data,line]);
  // A code reference opened here (CodeReader pick; repository-browser.md "Code references"): its range becomes the selection,
  // as a drag makes one, and scrolls into view. A range past the file's end keeps to the file; one past it selects nothing.
  useEffect(()=>{
    if(!pick||!data||data.path!==path)return;
    const last=data.content.split('\n').length;if(pick.start>last)return;
    select(pick.start,Math.min(pick.end,last));
    requestAnimationFrame(()=>root.current?.querySelector(`[data-source-line="${pick.start}"]`)?.scrollIntoView({block:'center'}));
  },[pick?.at,data]); // eslint-disable-line react-hooks/exhaustive-deps
  // Text copied from source (Ctrl+C) is code from this file: a paste onto the canvas keeps its name (repository-browser.md "Files in Learn").
  const markCopy=()=>{const text=window.getSelection()?.toString();if(text?.trim())rememberCodeCopy(()=>sessionStorage,{text,path});};
  return <section ref={root} onPointerUp={selectText} onKeyUp={selectText} onCopy={markCopy} className="flex min-h-0 flex-1 flex-col" aria-label="Repository source">
    <div className="flex shrink-0 items-center gap-2 border-b border-line pb-2 text-xs"><span data-source-title className="min-w-0 flex-1 truncate font-mono" title={title||path}>{title||<>{path}{line ? `:${line}${lineEnd > line ? `-${lineEnd}` : ''}` : ''}</>}</span>{data && <span data-source-commit={data.commit} className="text-ink-3">{data.commit.slice(0,7)}</span>}{repo && commit && <a data-source-open-repository href={repositoryUrl({repo,commit,path,line,lineEnd})} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 text-ink-2 hover:text-ink">Open in repository<ArrowUpRight size={12}/></a>}{onClose && <button aria-label="Close source" onClick={onClose}><X size={14}/></button>}</div>
    {/* Only the cited revision: the server reads exactly this commit, so a missing one is reported, never replaced by current code. */}
    {error && <p role="alert" className="py-3 text-sm text-danger">{commit ? `Not available at ${commit.slice(0,7)}: ` : ''}{error}</p>}{!data&&!error&&<p className="py-3 text-sm text-ink-2">Reading source…</p>}
    {data&&<div className="min-h-0 flex-1 overflow-auto py-3"><pre className="min-w-max font-mono text-xs leading-6">{data.content.split('\n').map((text,i)=>{const highlighted=i+1>=(range?.start||line)&&i+1<=(range?.end||lineEnd||line);const last=actions&&range&&i+1===range.end;return <div key={i} ref={i+1===line?selected:null} data-source-line={i+1} data-highlighted={highlighted?'true':undefined} className={`flex gap-3 pr-3 ${highlighted?'bg-accent/10':''} ${last?'relative':''}`}><button type="button" aria-label={`Select line ${i+1}`} title="Select line · Shift-click to select a range" className="w-9 shrink-0 text-right text-ink-3 select-none hover:text-ink" onClick={e=>{window.getSelection()?.removeAllRanges();const from=e.shiftKey&&anchor.current?anchor.current:i+1;anchor.current=from;select(Math.min(from,i+1),Math.max(from,i+1));}}>{i+1}</button><span data-source-text>{colorLine(text)}</span>{last&&actions(range)}</div>;})}</pre></div>}
  </section>;
}
