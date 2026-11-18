export function createTokenLinksShape({ z, titled, text, numeric }) {
  const tokens = z.array(text(24)).min(2).max(8);
  return z.strictObject({
    ...titled,
    kind: z.literal('token-links'),
    source: tokens,
    target: tokens,
    queries: z.array(z.strictObject({
      index: z.int().min(0).max(7),
      weights: z.array(numeric.min(0).max(1)).min(2).max(8),
    })).min(1).max(3),
    normalized: z.boolean().optional(),
  });
}

export function validateTokenLinks({ source, target, queries, normalized }, issue) {
  const seen = new Set();
  queries.forEach(({ index, weights }, row) => {
    if (index >= source.length) issue(['queries', row, 'index'], 'Use an existing zero-based source index');
    if (seen.has(index)) issue(['queries', row, 'index'], 'Each query must use a distinct source index');
    seen.add(index);
    if (weights.length !== target.length) {
      issue(['queries', row, 'weights'], 'Give one weight per target token in order');
    } else if (normalized) {
      const sum = weights.reduce((total, weight) => total + weight, 0);
      // Allow floating-point addition error at the inclusive decimal bounds.
      const roundoff = weights.length * Number.EPSILON;
      if (sum < 0.98 - roundoff || sum > 1.02 + roundoff) {
        issue(['queries', row, 'weights'], 'Normalized query weights must sum to between 0.98 and 1.02');
      }
    }
  });
}

export function tokenLinksText({ title, caption, source, target }) {
  return [title, caption, ...source, ...target].filter(Boolean);
}

export function describeTokenLinks({ source, target, queries, normalized }) {
  return [
    `Source tokens in order · ${source.join(', ')}`,
    `Target tokens in order · ${target.join(', ')}`,
    ...queries.map(({ index, weights }) => {
      const links = weights.map((weight, position) => `“${target[position]}” at target position ${position + 1} (weight ${weight})`);
      return `Query “${source[index]}” at source position ${index + 1} links to ${links.join(', ')}`;
    }),
    ...(normalized ? ['Weights sum to about 1 per query.'] : []),
  ];
}
