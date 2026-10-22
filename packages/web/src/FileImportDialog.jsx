import { useState } from 'react';
import { createPortal } from 'react-dom';
import { IMPORT_CHOICES, importSummary } from './learn-file-import.js';
import { ConfirmDialog, cn } from './ui.jsx';

// "Add to canvas" (docs/features/canvas-file-drop.md): every dropped or uploaded .ipynb, .py or code file opens this first,
// wherever it lands - its file name and how to add it. Cancel or Escape adds nothing. `error` is the import's own line
// (invalid notebook, binary, over a limit); the dialog stays open on it so another choice can be made.
// Several files dropped at once (kind 'batch', `files`) are one dialog: each file and what it becomes, and the sum of it.
export default function FileImportDialog({ file, kind, files, error, busy, onCancel, onConfirm }) {
  if (kind === 'batch') return <BatchImport files={files} error={error} busy={busy} onCancel={onCancel} onConfirm={onConfirm} />;
  const choices = IMPORT_CHOICES[kind];
  const [choice, setChoice] = useState(choices[0][0]);
  return createPortal(
    <div data-file-import-dialog>
      <ConfirmDialog title="Add to canvas" confirmLabel={busy ? 'Adding' : 'Add to canvas'} confirmVariant="primary" onCancel={onCancel}
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

function BatchImport({ files, error, busy, onCancel, onConfirm }) {
  const [choices, setChoices] = useState(() => files.map(({ kind }) => IMPORT_CHOICES[kind][0][0]));
  return createPortal(
    <div data-file-import-dialog>
      <ConfirmDialog title="Add to canvas" confirmLabel={busy ? 'Adding' : 'Add to canvas'} confirmVariant="primary" onCancel={onCancel}
        onConfirm={() => { if (!busy) onConfirm(choices); }}
        body={<span className="block">
          <span className="block pb-1.5 text-xs">{files.length} files. How should each be added?</span>
          <span className="block max-h-64 overflow-y-auto">
            {files.map(({ file, kind }, index) => (
              <span key={index} data-import-row className="flex items-center gap-2 py-1">
                <span data-import-file className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink" title={file.name}>{file.name}</span>
                <select aria-label={`Add ${file.name} as`} value={choices[index]} onChange={event => setChoices(previous => previous.map((choice, at) => (at === index ? event.target.value : choice)))}
                  className="h-8 rounded-lg border border-line bg-white px-2 text-sm text-ink dark:bg-side">
                  {IMPORT_CHOICES[kind].map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </span>
            ))}
          </span>
          <span data-import-summary className="block pt-3 text-xs text-ink">Adds {importSummary(choices)}.</span>
          {error && <span role="alert" data-import-error className="block pt-3 text-xs text-danger">{error}</span>}
        </span>} />
    </div>,
    document.body,
  );
}
