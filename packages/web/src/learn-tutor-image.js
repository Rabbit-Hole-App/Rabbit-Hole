// Resolve before planning: a saved image card is referenced by block, while captures/uploads retain their media id.
export async function prepareTutorImage({ canvas, targetId, image }) {
  const selected = targetId && canvas?.block?.(targetId);
  const ref = selected?.type === 'file' && selected.kind === 'image' ? { block_id: selected.id } : image;
  if (!ref?.block_id) return { image: ref || null };
  try {
    const saved = await canvas?.persist?.();
    if (saved?.ok && saved.remote === 'ok') return { image: { block_id: ref.block_id } };
  } catch { /* The text question can still be answered without claiming to see the image. */ }
  return { image: null, notice: 'The image could not be saved, so this question was sent without it. Retry after the canvas saves.' };
}

// A drawing submitted as an answer (Tutor Task 14): the exact version, frozen only after the canvas saved it. An image card
// names its stored revision (fileRef.source {id, rev}); a capture keeps its media id. Strokes alone, an unsaved card or a
// card without a stored revision are no submission, so autosaved work is never sent for assessment.
export async function submittedDrawing({ canvas, targetId, image }) {
  const selected = targetId && canvas?.block?.(targetId);
  if (!(selected?.type === 'file' && selected.kind === 'image')) return image?.id ? { image: { id: image.id } } : { image: null };
  try {
    const saved = await canvas.persist?.();
    const source = saved?.ok && saved.remote === 'ok' ? canvas.block(targetId)?.fileRef?.source : null;
    if (source?.id && /^[0-9a-f]{64}$/.test(source.rev || '')) return { image: { block_id: targetId, source: { id: source.id, rev: source.rev } } };
  } catch { /* the notice below */ }
  return { image: null, notice: 'This drawing could not be saved as a stored image yet, so it was not submitted. Retry after the canvas saves.' };
}

// A drawing answer (Task 14, T6): the selected image card, frozen only once the canvas saved it remotely (submittedDrawing),
// with the learner's optional explanation. Strokes alone or an unsaved card submit nothing and say why.
export async function drawingContent({ canvas, selection = [], explanation = '' }) {
  const drawn = await submittedDrawing({ canvas, targetId: selection[0] ?? null, image: null });
  if (!drawn.image) return { notice: drawn.notice || 'Select the image of your drawing on the canvas, then check it.' };
  return { content: { image: drawn.image, ...(explanation.trim() ? { explanation: explanation.trim() } : {}) } };
}
