import { useRef, useState } from 'react';
import { FileText, Paperclip, X } from 'lucide-react';

// Files on a comment (docs/features/canvas-comments.md section 15, owner decision D3): images and PDFs, at most `per_comment`
// of them and `file_bytes` each. The limits come from the server (GET about -> attachments) and are enforced there; the checks here
// only spare a doomed upload. A file uploads when it is picked, waits as a chip, and rides the post as its id.
export const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,application/pdf';
const mb = bytes => (bytes >= 1048576 ? `${Math.round(bytes / 104857.6) / 10} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
export const fileUrl = (client, file) => `${client.base}/attachments/${file.id}`;

// The composer's files. `upload(file)` answers { attachment }; a refusal's text is shown on the chip.
export function useAttachments({ upload, limits }) {
  const [files, setFiles] = useState([]);
  const [note, setNote] = useState(null);
  const max = limits?.per_comment ?? 5, cap = limits?.file_bytes ?? 10 * 1024 * 1024, types = limits?.types ?? [];
  const add = list => {
    const picked = [...list], room = Math.max(0, max - files.length), problems = [];
    for (const file of picked.slice(room)) problems.push(`${file.name}: a comment holds at most ${max} files.`);
    for (const file of picked.slice(0, room)) {
      if (types.length && !types.includes(file.type)) { problems.push(`${file.name}: attach an image or a PDF.`); continue; }
      if (file.size > cap) { problems.push(`${file.name}: files are at most ${mb(cap)}.`); continue; }
      const key = crypto.randomUUID();
      setFiles(current => [...current, { key, name: file.name, state: 'uploading' }]);
      upload(file).then(
        ({ attachment }) => setFiles(current => current.map(item => (item.key === key ? { ...item, ...attachment, state: 'ready' } : item))),
        error => setFiles(current => current.map(item => (item.key === key ? { ...item, state: 'failed', error: error.data?.error || error.message } : item))));
    }
    setNote(problems.length ? problems.join(' ') : null);
  };
  return { files, note, add, remove: key => setFiles(current => current.filter(item => item.key !== key)), clear: () => { setFiles([]); setNote(null); },
    ids: files.filter(item => item.state === 'ready').map(item => item.id), busy: files.some(item => item.state === 'uploading'), failed: files.some(item => item.state === 'failed') };
}

export function AttachButton({ attachments, full }) {
  const input = useRef(null);
  return (
    <>
      <input ref={input} type="file" multiple accept={ACCEPT} aria-label="Attach files" data-attach-input hidden onChange={event => { attachments.add(event.target.files); event.target.value = ''; }} />
      <button type="button" data-attach-button aria-label="Attach file" disabled={full} onClick={() => input.current?.click()}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink disabled:opacity-40"><Paperclip size={15} aria-hidden /></button>
    </>
  );
}

// What is waiting to be sent: a chip per file with its state, and the reason a refused one was refused.
export function AttachmentChips({ attachments }) {
  if (!attachments.files.length && !attachments.note) return null;
  return (
    <div data-attachment-chips className="mt-1 space-y-1">
      {attachments.files.map(file => (
        <div key={file.key} data-attachment-chip={file.state} className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs">
          <FileText size={13} className="shrink-0 text-ink-3" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-ink">{file.name}</span>
          <span className={file.state === 'failed' ? 'text-red-700' : 'text-ink-3'}>{file.state === 'uploading' ? 'Uploading' : file.state === 'failed' ? file.error : mb(file.bytes)}</span>
          <button type="button" aria-label={`Remove ${file.name}`} onClick={() => attachments.remove(file.key)} className="flex h-5 w-5 items-center justify-center rounded text-ink-3 hover:bg-hover hover:text-ink"><X size={12} aria-hidden /></button>
        </div>
      ))}
      {attachments.note && <p role="alert" className="text-xs text-red-700">{attachments.note}</p>}
    </div>
  );
}

// A posted comment's files: an image shows as itself and opens full size, a PDF is a link that downloads. Every one is served by the
// route that re-checks the reader's access, so a link that stops working says nothing more than that the file is not available.
export function MessageFiles({ files, client }) {
  if (!files?.length) return null;
  return (
    <ul data-message-files className="mt-1 flex flex-wrap gap-1.5">
      {files.map(file => (
        <li key={file.id} data-message-file={file.id}>
          {file.mime.startsWith('image/')
            ? <a href={fileUrl(client, file)} target="_blank" rel="noopener noreferrer" aria-label={`Open ${file.name}`}><img src={fileUrl(client, file)} alt={file.name} loading="lazy" className="max-h-40 max-w-full rounded-md border border-line object-contain" /></a>
            : <a href={fileUrl(client, file)} download={file.name} className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs text-ink hover:bg-hover"><FileText size={13} aria-hidden /><span className="max-w-48 truncate">{file.name}</span><span className="text-ink-3">{mb(file.bytes)}</span></a>}
        </li>
      ))}
    </ul>
  );
}
