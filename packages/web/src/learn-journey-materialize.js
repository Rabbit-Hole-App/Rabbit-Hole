// The current section's materializer (docs/features/adaptive-learning-path-v1-architecture.md §6.5, R5; LP1 Task 9).
// After acceptance only the current section has a SectionPlan, and only it becomes canvas content: a level-1 heading
// stamped journey_section_id in a reserved slot (docs/features/canvas-skeleton-cards.md), then each teaching step in
// order, right under the one before it, stamped journey: { section_id, step_id, claims }. A make.text step is an
// explanation card (no network); a make.command step is the request a / command makes (/api/learn/artifact,
// learn-slash.js). A paid primitive comes back as a proposal and is never generated here: it is reported for the tray.
// Resumable from the canvas itself: a heading and steps already stamped for this section (an earlier visit, a failed
// step, a reload mid-way) are reused, and only the missing steps are drawn, each under the step before it.
// Pure apart from the injected canvas (canvasApi's blocks / reserve / insertBlock / release / showSection) and post.

// One or two model calls per step (learn-artifact.js): a request that never answers is a failed step, as a / command's is.
const ARTIFACT_TIMEOUT_MS = 120000;
// After the next paint: a slot reserved this tick is only in the canvas once it has rendered (learn-slash.js afterPaint;
// outside a browser, the next task).
const paint = () => new Promise(resolve => (globalThis.requestAnimationFrame ? requestAnimationFrame(() => requestAnimationFrame(resolve)) : setTimeout(resolve, 0)));
// A step's card title: its §9.3 role ("worked_example" -> "Worked example").
const roleTitle = role => (role ? role[0].toUpperCase() + role.slice(1).replace(/_/g, ' ') : 'Step');

// journey: { active_section_id, path, materialized(section_id, heading_block_id) }. post(path, body, { signal }) resolves
// to the route's JSON and throws on a refusal. Returns { heading_block_id, block_ids (the section's step cards, in
// order), proposals ({ step_id, primitive, message, block, after }: `after` is the card it would follow) } and, when a
// step failed (stopping there, keeping what came before), failed_step - the section is then not reported as materialized.
export async function materializeSection({ canvas, journey, sectionPlan, post, onProgress = () => {}, timeoutMs = ARTIFACT_TIMEOUT_MS }) {
  const id = journey?.active_section_id;
  if (id == null || sectionPlan?.section_id !== id) throw new Error(`Only the current section is materialized: this plan is for ${sectionPlan?.section_id}, the current section is ${id}.`);
  const sections = journey.path?.sections || [], at = sections.findIndex(s => s.id === id), section = sections[at];
  if (!section) throw new Error(`The path has no section ${id}, the current section.`);
  const existing = canvas.blocks?.() || [];
  const drawn = new Map(existing.filter(b => b.journey?.section_id === id).map(b => [b.journey.step_id, b.id]));
  const steps = sectionPlan.teaching_sequence || [], block_ids = [], proposals = [];
  let heading = existing.find(b => b.type === 'heading' && b.journey_section_id === id)?.id ?? null, slot = null, failed_step = null;
  try {
    if (!heading) {
      slot = canvas.reserve({ label: `Preparing section ${at + 1}…` });
      await paint();
      heading = canvas.insertBlock({ type: 'heading', level: 1, text: section.title, done: false, journey_section_id: id }, { into: slot });
    }
    let after = heading;
    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i], journeyTag = { section_id: id, step_id: step.step_id, claims: step.claims || [] };
      if (drawn.has(step.step_id)) { after = drawn.get(step.step_id); block_ids.push(after); continue; }
      onProgress({ step: i + 1, of: steps.length });
      let block;
      try {
        if (step.make?.command == null) block = { type: 'explanation', title: roleTitle(step.role), body: String(step.make?.text ?? '') };
        else {
          const result = await post('/api/learn/artifact', { command: step.make.command, args: step.make.request, context: `Journey section: ${section.title}` }, { signal: AbortSignal.timeout(timeoutMs) });
          if (result?.result === 'paid_proposal') {
            proposals.push({ step_id: step.step_id, primitive: result.primitive, message: result.message, after, block: { ...result.block, journey: journeyTag } });
            continue;
          }
          if (result?.result !== 'artifact') throw new Error(result?.error || result?.message || 'The step was not made.');
          block = result.block;
        }
      } catch {
        failed_step = step.step_id;
        break;
      }
      after = canvas.insertBlock({ ...block, journey: journeyTag }, { after });
      block_ids.push(after);
    }
  } finally {
    if (slot) canvas.release(slot); // a no-op once the heading filled it
  }
  const out = { heading_block_id: heading, block_ids, proposals };
  if (failed_step) return { ...out, failed_step };
  // The camera to the section's start, once its cards have been laid out.
  await paint();
  canvas.showSection?.(heading);
  await journey.materialized(id, heading);
  return out;
}
