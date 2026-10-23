import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Copy } from 'lucide-react';
import { DEFAULT_HEIGHT, clampHeight, clampWidth, embedHref, embedSnippet, emailSnippet, linkSnippet, thumbnailUrl } from './embed-api.js';

// Embed a public canvas in a website or an email (SHARE-04; C:/s/spec/embed/contract.md "Share -> Embed"). Standalone: the Share
// dialog mounts it and passes what it already knows. Opening it, switching sources and changing a setting only read: nothing is
// saved, no link is created or changed, and no paid call starts (the preview is the public embed page, which makes none).
// canvasTitle: for the snippet's title. onChangeAccess(): opens the dialog's link settings (nothing here changes access).
// sources: [{ kind: 'shared' | 'explore', url, token, available, reason? }]; only an available source can be chosen.
const KIND = { shared: { letter: 'b', label: 'Public shared canvas' }, explore: { letter: 'e', label: 'Explore publication' } };
const fieldClass = 'rounded-md border border-line bg-white px-2 py-1 text-xs text-ink';

function Disclosure({ label, open, onToggle, children }) {
  return (
    <div className="mt-3 border-t border-line pt-2" data-embed-code-box>
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full items-center gap-1.5 text-left text-sm text-ink">
        <ChevronDown size={13} className={`shrink-0 text-ink-3 transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden />{label}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

// A read-only value with a Copy button. Copied shows only after the clipboard accepted it; if copying fails the text is selected.
function CopyField({ label, value, rows = 0, fieldProps = {}, buttonProps = {} }) {
  const [copied, setCopied] = useState(false);
  const field = useRef(null);
  const copy = () => {
    const select = () => { field.current?.focus(); field.current?.select(); };
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1400); };
    if (!navigator.clipboard?.writeText) return select();
    navigator.clipboard.writeText(value).then(done, select);
  };
  const style = 'min-w-0 flex-1 rounded-md border border-line bg-hover/50 px-2 py-1 text-xs text-ink-2';
  return (
    <div className="mt-1.5 flex items-start gap-1.5">
      {rows ? <textarea ref={field} readOnly rows={rows} value={value} aria-label={label} onFocus={event => event.target.select()} className={`${style} resize-none font-mono`} {...fieldProps} />
        : <input ref={field} readOnly value={value} aria-label={label} onFocus={event => event.target.select()} className={style} {...fieldProps} />}
      <button type="button" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`} {...buttonProps}
        className={`flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs ${copied ? 'text-green-700' : 'text-ink-2 hover:bg-hover hover:text-ink'}`}>
        {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

// The linked preview image when the thumbnail route has one for this link, else a text link: checked only once the email section opens.
function useThumbnail(url, enabled) {
  const [state, setState] = useState('checking'); // checking | image | none
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    setState('checking');
    fetch(url, { method: 'HEAD', cache: 'no-store' })
      .then(response => { if (live) setState(response.ok && (response.headers.get('Content-Type') || '').startsWith('image/') ? 'image' : 'none'); }, () => { if (live) setState('none'); });
    return () => { live = false; };
  }, [url, enabled]);
  return state;
}

function NewsletterSection({ origin, source, title }) {
  const [open, setOpen] = useState(false);
  const image = thumbnailUrl(origin, KIND[source.kind].letter, source.token);
  const state = useThumbnail(image, open);
  const withImage = state === 'image';
  return (
    <div className="mt-3 border-t border-line pt-2" data-embed-email>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-1.5 text-left text-sm text-ink">
        <ChevronDown size={13} className={`shrink-0 text-ink-3 transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden />Sending an email newsletter?
      </button>
      {open && (
        <div className="mt-2">
          <p className="text-xs text-ink-3">An email cannot run an interactive embed. {withImage ? 'Use the preview image with the link.' : 'Use a text link.'} Turning off the link stops the image from being served, but cannot recall images an email provider already saved.</p>
          {withImage && <CopyField label="Preview image URL" value={image} fieldProps={{ 'data-embed-email-image': '' }} />}
          <CopyField label="Link" value={source.url} />
          {state !== 'checking' && <CopyField label="Email HTML" rows={3} value={withImage ? emailSnippet({ href: source.url, image, title }) : linkSnippet({ href: source.url, title })} />}
        </div>
      )}
    </div>
  );
}

export default function EmbedPanel({ canvasTitle = '', sources = [], onChangeAccess = null }) {
  const usable = sources.filter(source => source.available);
  const [kind, setKind] = useState(() => usable[0]?.kind || null);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [fixedWidth, setFixedWidth] = useState(false); // false: 100%, responsive
  const [width, setWidth] = useState(640);
  const [chat, setChat] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [selectCode, setSelectCode] = useState(false); // a failed copy opens the code selected, ready for Ctrl+C
  const codeBox = useRef(null);
  useEffect(() => { if (selectCode && codeOpen && codeBox.current) { codeBox.current.focus(); codeBox.current.select(); setSelectCode(false); } }, [selectCode, codeOpen]);
  const source = usable.find(entry => entry.kind === kind) || usable[0] || null;
  if (!source) {
    return (
      <div data-embed-section className="rounded-lg border border-line p-2.5">
        <p className="text-sm text-ink">This canvas has no public link to embed.</p>
        <p className="mt-1 text-xs text-ink-3">{sources.find(entry => entry.reason)?.reason || 'Turn on a public link or publish it to Explore, then come back.'}</p>
        <button type="button" data-embed-change-access onClick={() => onChangeAccess?.()} className="mt-2 h-7 rounded-md border border-line px-2.5 text-xs text-ink hover:bg-hover">Change link access</button>
      </div>
    );
  }
  const origin = window.location.origin;
  const src = embedHref(origin, KIND[source.kind].letter, source.token, { chat });
  const sizeWidth = fixedWidth ? clampWidth(width) : '100%';
  const code = embedSnippet({ src, title: canvasTitle, height, width: sizeWidth });
  return (
    <div data-embed-section>
      <p className="text-xs text-ink-3">Works on websites that accept an iframe or custom HTML. The embed is read-only, and anyone can still open the full canvas from it.</p>
      <label className="mt-2 flex items-center gap-2 text-xs text-ink-2">Canvas to embed
        <select data-embed-source value={source.kind} onChange={event => setKind(event.target.value)} className={`${fieldClass} min-w-0 flex-1`}>
          {sources.map(entry => <option key={entry.kind} value={entry.kind} disabled={!entry.available}>{KIND[entry.kind]?.label || entry.kind}</option>)}
        </select>
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-2">
        <label className="flex items-center gap-2">Width
          <select data-embed-width-mode value={fixedWidth ? 'px' : 'full'} onChange={event => setFixedWidth(event.target.value === 'px')} className={fieldClass}>
            <option value="full">100%</option><option value="px">Pixels</option>
          </select>
          {fixedWidth && <><input data-embed-width type="number" min={200} max={2000} step={10} value={width} onChange={event => setWidth(event.target.value)} onBlur={() => setWidth(clampWidth(width))} aria-label="Width in pixels" className={`${fieldClass} w-20`} />px</>}
        </label>
        <label className="flex items-center gap-2">Height
          <input data-embed-height type="number" min={200} max={2000} step={10} value={height} onChange={event => setHeight(event.target.value)} onBlur={() => setHeight(clampHeight(height))} className={`${fieldClass} w-20`} />px
        </label>
        <span className="ml-auto flex items-center gap-2">Show Chat
          <button type="button" role="switch" aria-checked={chat} aria-label="Show Chat" data-embed-show-chat onClick={() => setChat(!chat)}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${chat ? 'bg-[#2383e2]' : 'bg-line-strong'}`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${chat ? 'left-[18px]' : 'left-0.5'}`} />
          </button>
        </span>
      </div>
      <div data-embed-preview-box className="mt-2 max-h-56 overflow-auto rounded-md border border-line">
        <iframe data-embed-preview src={src} title="Embed preview" loading="lazy" width={sizeWidth} height={clampHeight(height)} style={{ border: 0, maxWidth: '100%', display: 'block' }} />
      </div>
      <CopyButton code={code} onFail={() => { setCodeOpen(true); setSelectCode(true); }} />
      <Disclosure label="View embed code" open={codeOpen} onToggle={() => setCodeOpen(!codeOpen)}>
        <textarea ref={codeBox} data-embed-code readOnly rows={4} value={code} aria-label="Embed code" onFocus={event => event.target.select()} className="w-full resize-none rounded-md border border-line bg-hover/50 px-2 py-1 font-mono text-xs text-ink-2" />
      </Disclosure>
      <NewsletterSection origin={origin} source={source} title={canvasTitle} />
    </div>
  );
}

// The primary action, outside the collapsed code: Copied only after the clipboard accepted the text; otherwise onFail.
function CopyButton({ code, onFail }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!navigator.clipboard?.writeText) return onFail();
    navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }, onFail);
  };
  return (
    <button type="button" data-embed-copy onClick={copy} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-md bg-primary-fill px-3 text-sm font-medium text-white hover:bg-primary-fill-hover">
      {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy embed code'}
    </button>
  );
}
