export function createTensorPayload({ z, text, numeric }) {
  return z.strictObject({
    rows: z.int().min(1).max(4),
    columns: z.int().min(1).max(8),
    dimensions: text(12),
    name: text(60).optional(),
    values: z.array(numeric).min(1).max(8).optional(),
    role: z.enum(['input', 'weight', 'output']).optional(),
  });
}

export function validateTensor({ rows, columns, values }, issue) {
  const count = rows * columns;
  if (count > 8) issue([], 'Show at most eight visible cells');
  if (values && values.length !== count) issue(['values'], 'Provide one value for each visible cell');
}

export function createTensorShape({ z, titled, tensorPayload }) {
  return z.strictObject({ ...titled, kind: z.literal('tensor'), tensor: tensorPayload });
}

export function tensorText({ name, dimensions, values }) {
  return [name, dimensions, ...(values ?? []).map(String)].filter(Boolean);
}
