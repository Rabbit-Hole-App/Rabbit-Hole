// A Learn section's brief and composition, in order (docs/features/learn-sections, CONTRACT.md server actions). Pure over `post` (TutorRehearsal.jsx sectionPost: the answer, or a
// refused request's body), so node tests read it. The server answers a stored brief or composition without a model call.

// from: 'brief' (brief, then compose) or 'compose'. onBrief(brief): the brief as it lands. -> { composition } | { failed: 'brief' | 'compose', out }
export async function briefAndCompose(post, sectionId, { from = 'brief', onBrief = null } = {}) {
  if (from === 'brief') {
    const out = await post({ action: 'learn_section_brief', sectionId });
    if (!out?.brief) return { failed: 'brief', out };
    onBrief?.(out.brief);
  }
  const out = await post({ action: 'learn_section_compose', sectionId });
  return out?.composition ? { composition: out.composition } : { failed: 'compose', out };
}

// The composition Build this section makes from when the page holds none (after a reload: the stored section opens as ready and a reload runs nothing). A section whose brief never
// landed (409 no_brief) gets its brief and composition first, then Build goes on into make (Reviewer 2026-11-17 19:40). onLoading(): the brief is being made.
export async function compositionForMake(post, sectionId, { onBrief = null, onLoading = null } = {}) {
  const out = await post({ action: 'learn_section_compose', sectionId });
  if (out?.composition) return { composition: out.composition };
  if (out?.error !== 'no_brief') return { failed: 'compose', out };
  onLoading?.();
  return briefAndCompose(post, sectionId, { onBrief });
}
