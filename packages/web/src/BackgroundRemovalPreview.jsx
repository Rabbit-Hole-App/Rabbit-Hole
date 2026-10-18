import { useEffect, useRef, useState } from 'react';
import PaidConfirm from './PaidConfirm.jsx';

// Inline seam only. Parent creates an owner/canvas-scoped controller and applies
// accepted transactions through the existing canvas edit/Undo mechanism.
export default function BackgroundRemovalPreview({ controller, savedEnvelope = null, onApply, onClose, regional = false }) {
  const [quote, setQuote] = useState(null), [phase, setPhase] = useState(savedEnvelope ? 'saved' : 'quote');
  const [error, setError] = useState(''), [revision, setRevision] = useState(null);
  const [busy, setBusy] = useState(false), [applyAttempted, setApplyAttempted] = useState(false);
  const live = useRef(true), running = useRef(false), activeController = useRef(controller);
  activeController.current = controller;
  const isCurrent = () => live.current && activeController.current === controller;
  useEffect(() => {
    live.current = true;
    controller.quote().then(value => { if (isCurrent()) setQuote(value); }).catch(() => { if (isCurrent()) setError('Image generation availability could not be loaded.'); });
    return () => { live.current = false; queueMicrotask(() => { if (!live.current || activeController.current !== controller) controller.dispose(); }); };
  }, [controller]);
  const close = () => { controller.dispose(); onClose?.(); };
  const perform = async action => {
    if (running.current) return;
    running.current = true; setBusy(true); setError('');
    try {
      const result = await action();
      if (!isCurrent()) return;
      setPhase(result.job.phase); setRevision(result.revision);
    } catch (failure) {
      if (isCurrent()) { setError(failure.message || 'The image job could not be completed.'); setPhase('uncertain'); }
    } finally { running.current = false; if (isCurrent()) setBusy(false); }
  };
  const progress = job => { if (isCurrent()) setPhase(job.phase); };
  const start = () => perform(() => controller.start({ consent: { approved: true, maxReservedUsd: quote.maximumReservedUsd }, idempotencyKey: crypto.randomUUID(), onProgress: progress }));
  const resume = () => perform(() => controller.resume(savedEnvelope, { onProgress: progress }));
  const cancel = async () => {
    setError('');
    try { const result = await controller.cancel(); if (isCurrent()) { setPhase(result.phase); setRevision(null); } }
    catch { if (isCurrent()) setError('Cancellation was not confirmed. The job may still be running.'); }
  };
  const apply = async () => {
    if (busy || applyAttempted) return;
    setBusy(true); setApplyAttempted(true); setError('');
    try {
      const change = await controller.accept();
      const result = await onApply(change);
      if (result?.ok !== true) throw Error(result?.error || 'The image changed. Prepare a new preview before applying.');
      if (isCurrent()) { setPhase('applied'); onClose?.(); }
    } catch (failure) { if (isCurrent()) setError(failure.message || 'The image revision could not be applied.'); }
    finally { if (isCurrent()) setBusy(false); }
  };
  return <section data-background-removal aria-label={regional ? 'Edit image region' : 'Remove image background'} className="space-y-3 text-xs text-ink-2"
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <p>{regional ? 'Edit the selected rectangle of this saved PNG image.' : 'Remove the background of this saved PNG image.'} Your original image and its canvas position stay available until you apply the preview.</p>
    <p>Generation can cost money before Apply. Closing or requesting cancellation does not guarantee a refund. The actual charge is not yet known.</p>
    {quote?.available && <p data-image-reservation>Maximum reserved for this request: ${String(quote.maximumReservedUsd)}. This is a reservation, not a confirmed charge.</p>}
    {!quote && !error && <p role="status">Checking availability...</p>}
    {quote && !quote.available && <p role="status">{regional ? 'Regional editing' : 'Background removal'} is not configured. No request will be started.</p>}
    {phase === 'quote' && quote?.available && !busy && <PaidConfirm message={regional ? 'Approve the displayed reservation to upload the mask and start regional editing.' : 'Approve the displayed reservation to start background removal.'} onGenerate={start} onCancel={close}/>}
    {phase === 'saved' && <div>
      <p>A saved image job was found for this owner and canvas. Resume checks its status without starting another request.</p>
      {savedEnvelope?.ticket ? <button type="button" onClick={resume} disabled={busy} className="h-7 rounded-lg border border-line px-2.5">Resume image job</button> : <p role="status">The earlier submission was not confirmed. It will not be automatically resubmitted.</p>}
    </div>}
    {!['quote','saved','applied'].includes(phase) && <p role="status">Image job: {phase}. {phase === 'unknown' || phase === 'uncertain' ? 'The reservation may remain held. No automatic retry will run.' : ''}</p>}
    {busy && !applyAttempted && <button type="button" onClick={cancel} className="h-7 rounded-lg border border-line px-2.5">Request cancellation</button>}
    {revision && <div data-background-removal-preview><img src={revision.previewURL} alt={regional ? 'Regional image edit preview' : 'Background removal preview'} className="max-h-48 w-full object-contain"/>
      <p>Review the subject and edges. Generated pixels may differ from the original.</p>
      <button type="button" onClick={apply} disabled={busy || applyAttempted} className="h-7 rounded-lg bg-ink px-2.5 text-white">Apply image revision</button>
    </div>}
    {error && <p role="alert">{error}</p>}
    <button type="button" onClick={close} className="h-7 rounded-lg border border-line px-2.5">Close preview</button>
  </section>;
}
