import { useEffect, useState } from 'react';
import { FileCode2 } from 'lucide-react';
import { Button, cn } from '../ui.jsx';
import { colorLine } from '../code.jsx';

export default function SourcePreview({ item }) {
  const [file, setFile] = useState(item.file || Object.keys(item.files)[0]);
  useEffect(() => { if (item.line) document.getElementById('sample-code-' + item.line)?.scrollIntoView({ block: 'center' }); }, [item.line, file]);
  return <>
    <nav aria-label="Source files" className="mb-4 flex flex-wrap gap-1 border-b border-line pb-3">
      {Object.keys(item.files).map(path => <Button key={path} size="sm" aria-pressed={file === path} className={cn('font-mono text-xs', file === path && 'bg-hover text-ink')} onClick={() => setFile(path)}><FileCode2 size={13} />{path}</Button>)}
    </nav>
    <div className="mb-3 flex justify-between gap-3 text-xs text-ink-2"><span>{file}</span><span>Complete sample file</span></div>
    <pre className="rounded-sm bg-code py-3 font-mono text-xs leading-6">{item.files[file].split('\n').map((line, i) => <div id={'sample-code-' + (i + 1)} key={i} className={cn('flex gap-4 px-3', file === item.file && i + 1 === item.line && 'bg-accent/10')}><span className="w-6 shrink-0 text-right text-ink-2 select-none">{i + 1}</span><span className="min-w-0 whitespace-pre-wrap break-words">{colorLine(line)}</span></div>)}</pre>
  </>;
}
