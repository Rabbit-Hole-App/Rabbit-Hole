import { BookOpen, Crosshair, FileText, FolderGit2, Image as ImageIcon, PlaySquare, Trash2 } from 'lucide-react';

// The Files menu: bring something in from this computer, and see everything
// the canvas was built from - with one switch per item for whether the tutor
// reads it. Switching off removes nothing; the trash does.
const KIND = {
  repository: { Icon: FolderGit2, noun: 'Repository' },
  wiki: { Icon: BookOpen, noun: 'Wikipedia' },
  video: { Icon: PlaySquare, noun: 'YouTube' },
  image: { Icon: ImageIcon, noun: 'Image' },
  pdf: { Icon: FileText, noun: 'PDF' },
  paper: { Icon: FileText, noun: 'arXiv' },
};

export default function FilesPanel({ sources, onToggle, onLocate, onRemove, close }) {
  return (
    <div className="w-[22rem] max-w-[92vw]">
      <p className="flex items-center justify-between px-2 pt-1.5 pb-1 text-[11px] font-semibold tracking-wider text-ink-3 uppercase">
        <span>On this canvas</span>
        {!!sources.length && <span className="font-normal normal-case tracking-normal">Tutor reads</span>}
      </p>
      {sources.length ? (
        <ul className="max-h-72 overflow-y-auto">
          {sources.map(source => {
            const { Icon, noun } = KIND[source.kind] || KIND.pdf;
            return (
              <li key={source.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-hover">
                <Icon size={15} className="shrink-0 text-ink-3" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink" title={source.label}>{source.label}</span>
                  <span className="block text-[11px] text-ink-3">{noun}{source.attached ? '' : ' - the tutor ignores it'}</span>
                </span>
                {source.locatable && (
                  <button type="button" aria-label={`Show ${source.label}`} title="Show it"
                    onClick={() => { close(); onLocate(source); }}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-3 opacity-0 group-hover:opacity-100 hover:bg-white hover:text-ink focus-visible:opacity-100"><Crosshair size={14} /></button>
                )}
                {source.removable && (
                  <button type="button" aria-label={`Remove ${source.label}`} title="Remove from the canvas"
                    onClick={() => onRemove(source)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-3 opacity-0 group-hover:opacity-100 hover:bg-white hover:text-red-700 focus-visible:opacity-100"><Trash2 size={14} /></button>
                )}
                <button type="button" role="switch" aria-checked={!!source.attached} aria-label={`Tutor reads ${source.label}`}
                  onClick={() => onToggle(source.id)}
                  className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${source.attached ? 'bg-accent' : 'bg-line-strong'}`}>
                  <span className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${source.attached ? 'translate-x-4' : ''}`} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-2 pb-2 text-xs text-ink-3">Nothing yet. Upload a file from Insert or drop it on the canvas, or use Search to add a video, paper, or article.</p>
      )}
    </div>
  );
}
