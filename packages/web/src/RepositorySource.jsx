import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, X } from 'lucide-react';
import { api } from './api.js';
import { colorLine } from './code.jsx';
import { repositoryUrl } from './card-sources.js';

export const SourceSelectionContext = createContext(null);

// `repo` ("owner/name"), when the caller knows it, adds a link to the same file
// at the same revision on its host.
export default function RepositorySource({ appName, path, line = 1, lineEnd, commit, repo, onClose }) {
  const [data,setData]=useState(null),[error,setError]=useState('');const selected=useRef(null);
  const selection=useContext(SourceSelectionContext), root=useRef(null), anchor=useRef(null);
  const current=selection?.value;
  const range=current?.path===path&&current?.commit===commit?current:null;
  const select=(start,end)=>{
    if(!data||!selection)return;
    if(end-start>=120){setError('Select up to 120 lines at a time.');return;}
    setError('');selection.set({path,commit:data.commit,start,end,text:data.content.split('\n').slice(start-1,end).join('\n')});
  };
  const selectText=()=>{
    const text=window.getSelection();if(!text||text.isCollapsed||!root.current.contains(text.anchorNode)||!root.current.contains(text.focusNode))return;
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
  return <section ref={root} onPointerUp={selectText} onKeyUp={selectText} className="flex min-h-0 flex-1 flex-col" aria-label="Repository source">
    <div className="flex shrink-0 items-center gap-2 border-b border-line pb-2 text-xs"><span className="min-w-0 flex-1 truncate font-mono" title={path}>{path}{line ? `:${line}${lineEnd > line ? `-${lineEnd}` : ''}` : ''}</span>{data && <span data-source-commit={data.commit} className="text-ink-3">{data.commit.slice(0,7)}</span>}{repo && commit && <a data-source-open-repository href={repositoryUrl({repo,commit,path,line,lineEnd})} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 text-ink-2 hover:text-ink">Open in repository<ArrowUpRight size={12}/></a>}{onClose && <button aria-label="Close source" onClick={onClose}><X size={14}/></button>}</div>
    {/* Only the cited revision: the server reads exactly this commit, so a missing one is reported, never replaced by current code. */}
    {error && <p role="alert" className="py-3 text-sm text-danger">{commit ? `Not available at ${commit.slice(0,7)}: ` : ''}{error}</p>}{!data&&!error&&<p className="py-3 text-sm text-ink-2">Reading source…</p>}
    {data&&<div className="min-h-0 flex-1 overflow-auto py-3"><pre className="min-w-max font-mono text-xs leading-6">{data.content.split('\n').map((text,i)=>{const highlighted=i+1>=(range?.start||line)&&i+1<=(range?.end||lineEnd||line);return <div key={i} ref={i+1===line?selected:null} data-source-line={i+1} data-highlighted={highlighted?'true':undefined} className={`flex gap-3 pr-3 ${highlighted?'bg-accent/10':''}`}><button type="button" aria-label={`Select line ${i+1}`} title="Select line · Shift-click to select a range" className="w-9 shrink-0 text-right text-ink-3 select-none hover:text-ink" onClick={e=>{window.getSelection()?.removeAllRanges();const from=e.shiftKey&&anchor.current?anchor.current:i+1;anchor.current=from;select(Math.min(from,i+1),Math.max(from,i+1));}}>{i+1}</button><span data-source-text>{colorLine(text)}</span></div>;})}</pre></div>}
  </section>;
}
