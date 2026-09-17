// Human/agent adjudication maps actual finding IDs to pre-labelled defects.
// Verdict alone is deliberately insufficient evidence that the target was found.
export function scoreReviews(results, annotations) {
  const counts = { cases: results.length, errors: 0, defective: 0, detected: 0, blocked: 0,
    missed: 0, severityMisses: 0, acceptable: 0, falseRejections: 0 };
  for (const row of results) {
    if (row.error) { counts.errors++; continue; }
    const note = annotations[row.id];
    if (!note || !Array.isArray(note.targetFindingIds)) throw new Error(`Missing adjudication for ${row.id}`);
    const findings = note.targetFindingIds.map(id => {
      const finding = row.evaluation.findings.find(f => f.id === id);
      if (!finding) throw new Error(`Unknown finding ${id} for ${row.id}`);
      return finding;
    });
    if (row.expected.verdict === 'revise') {
      counts.defective++;
      if (!findings.length) counts.missed++;
      else {
        counts.detected++;
        if (findings.some(f => f.severity === 'blocking')) counts.blocked++;
        else counts.severityMisses++;
      }
    } else {
      counts.acceptable++;
      if (row.evaluation.verdict !== 'ready') counts.falseRejections++;
    }
  }
  return counts;
}
