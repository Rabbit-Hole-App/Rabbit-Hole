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
