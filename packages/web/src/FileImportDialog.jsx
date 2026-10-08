import { useState } from 'react';
import { createPortal } from 'react-dom';
import { IMPORT_CHOICES } from './learn-file-import.js';
import { ConfirmDialog, cn } from './ui.jsx';

// "Add to canvas" (docs/features/canvas-file-drop.md): every dropped or uploaded .ipynb or .py opens this first, wherever
// it lands - its file name and how to add it. Cancel or Escape adds nothing. `error` is the import's own line (invalid
// notebook, over a limit); the dialog stays open on it so another choice can be made.
export default function FileImportDialog({ file, kind, error, busy, onCancel, onConfirm }) {
  const choices = IMPORT_CHOICES[kind];
  const [choice, setChoice] = useState(choices[0][0]);
  return createPortal(
    <div data-file-import-dialog>
      <ConfirmDialog title="Add to canvas" confirmLabel={busy ? 'Adding…' : 'Add to canvas'} confirmVariant="primary" onCancel={onCancel}
        onConfirm={() => { if (!busy) onConfirm(choice); }}
        body={<span className="block">
          <span data-import-file className="block truncate pb-3 font-mono text-[13px] text-ink" title={file.name}>{file.name}</span>
          <span className="block pb-1.5 text-xs">How should it be added?</span>
          <span role="radiogroup" aria-label="Add as" className="flex flex-wrap gap-2">
            {choices.map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={choice === id} data-import-choice={id} onClick={() => setChoice(id)}
                className={cn('h-8 rounded-lg border px-3 text-sm', choice === id ? 'border-ink bg-hover font-medium text-ink' : 'border-line text-ink-2 hover:bg-hover hover:text-ink')}>{label}</button>
            ))}
          </span>
          {error && <span role="alert" data-import-error className="block pt-3 text-xs text-danger">{error}</span>}
        </span>} />
    </div>,
    document.body,
  );
}
