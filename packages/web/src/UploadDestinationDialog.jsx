import { useEffect, useRef } from 'react';
import { Button } from './ui.jsx';
import { DESTINATIONS, destinationsFor } from './upload-destination.js';

// Where an uploaded file goes (owner brief 2026-10-22 item 3): Add to canvas, Use as AI context, or Both. A choice that does
// not fit these files stays, greyed. Escape or Cancel adds nothing.
export default function UploadDestinationDialog({ files, contextCanvas, onChoose, onCancel }) {
  const open = destinationsFor(files, { contextCanvas });
  const first = useRef(null);
  useEffect(() => {
    first.current?.focus();
    const escape = event => { if (event.key === 'Escape') { event.stopPropagation(); onCancel(); } };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const name = files.length === 1 ? files[0].name : `${files.length} files`;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20" onMouseDown={onCancel}>
      <div role="dialog" aria-modal="true" aria-label="Upload a file" data-upload-destination className="mt-[26vh] w-96 max-w-[90vw] rounded-2xl bg-white p-4 shadow-pop" onMouseDown={event => event.stopPropagation()}>
        <div className="pb-1 text-sm font-semibold">Upload a file</div>
        <div className="truncate pb-3 text-sm text-ink-2" title={name}>{name}</div>
        <div className="flex flex-col gap-1.5">
          {DESTINATIONS.map(([value, label], index) => (
            <Button key={value} ref={index === 0 ? first : undefined} variant="secondary" disabled={!open[value]} data-upload-choice={value} onClick={() => onChoose(value)}>{label}</Button>
          ))}
        </div>
        <div className="flex justify-end pt-3"><Button variant="secondary" onClick={onCancel}>Cancel</Button></div>
      </div>
    </div>
  );
}
