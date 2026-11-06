// Turns the flat list of trackable section keys into one milestone per lesson,
// so the course progress bar can show where each lesson finishes rather than
// being a single undifferentiated fill.
//
// Keys look like `<lessonId>:<page>`. The nanoGPT course also appends objective
// checks with no lesson prefix at all; those are one group of their own rather
// than being folded into whichever lesson happened to come last.
export function lessonMilestones(sectionKeys) {
  const counts = new Map();
  for (const key of sectionKeys) {
    const id = key.includes(':') ? key.slice(0, key.indexOf(':')) : '';
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  const milestones = [];
  let running = 0;
  let index = 0;
  for (const [id, count] of counts) {
    running += count;
    milestones.push({ id, label: `Lesson ${++index}`, at: running / sectionKeys.length, done: running });
  }
  return milestones;
}
