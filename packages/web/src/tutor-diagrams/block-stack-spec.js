export function createBlockStackShape({ z, titled, text, id, tensorPayload }) {
  const merge = z.enum(['add', 'multiply']).optional();
  const child = z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('flow'), steps: z.array(text(60)).min(2).max(5) }),
    z.strictObject({ kind: z.literal('tensor'), tensor: tensorPayload }),
    z.strictObject({ kind: z.literal('layers'), layers: z.array(z.strictObject({
      label: text(50), detail: text(80).optional(),
    })).min(2).max(5) }),
  ]);
  return z.strictObject({
    ...titled, kind: z.literal('block-stack'),
    blocks: z.array(z.strictObject({
      id, label: text(60), repeat: z.int().min(2).max(999).optional(), repeatTo: id.optional(),
      variant: text(14).optional(), dims: text(18).optional(), role: z.literal('changed').optional(), merge,
      inputs: z.array(z.strictObject({ label: text(24) })).max(2).optional(),
      detail: z.int().min(1).max(3).optional(), diagram: child.optional(),
    })).min(2).max(6),
    edges: z.array(z.strictObject({ kind: z.literal('residual'), from: id, to: id, merge })).max(4).optional(),
    callouts: z.array(z.strictObject({ node: id, label: text(48), value: text(16).optional() })).max(4).optional(),
  });
}

export function validateBlockStack({ blocks, edges, callouts }, issue, validateTensor) {
  const order = new Map();
  for (const [index, block] of blocks.entries()) {
    if (order.has(block.id)) issue(['blocks', index, 'id'], 'Block IDs must be unique');
    order.set(block.id, index);
  }
  const ranges = [];
  for (const [index, { repeat, repeatTo, diagram }] of blocks.entries()) {
    if (diagram?.kind === 'tensor') {
      validateTensor(diagram.tensor, (path, message) => issue(['blocks', index, 'diagram', 'tensor', ...path], message));
    }
    if (repeatTo === undefined) continue;
    const target = order.get(repeatTo);
    const path = ['blocks', index, 'repeatTo'];
    if (repeat === undefined) issue(path, 'A repeat group needs a repeat count');
    if (target === undefined || target <= index) issue(path, 'A repeat group must end at a later block');
    else {
      if (ranges.some(end => index <= end && end < target)) issue(path, 'Repeat groups cannot cross');
      ranges.push(target);
    }
  }
  for (const [index, { from, to }] of (edges ?? []).entries()) {
    if (!order.has(from)) issue(['edges', index, 'from'], 'Residual source must refer to a block');
    if (!order.has(to)) issue(['edges', index, 'to'], 'Residual target must refer to a block');
    else if (order.get(to) < order.get(from)) issue(['edges', index, 'to'], 'Residual target must be the source block or a later block');
  }
  for (const [index, { node }] of (callouts ?? []).entries()) {
    if (!order.has(node)) issue(['callouts', index, 'node'], 'Callout must refer to a block');
  }
}

function childText(diagram, tensorText) {
  if (diagram?.kind === 'flow') return diagram.steps;
  if (diagram?.kind === 'layers') return diagram.layers.flatMap(({ label, detail }) => [label, detail]);
  if (diagram?.kind === 'tensor') return tensorText?.(diagram.tensor) ?? [];
  return [];
}

export function blockStackText({ title, caption, blocks, callouts }, tensorText) {
  return [title, caption, ...blocks.flatMap(block => [
    block.label, block.variant, block.dims, ...(block.inputs ?? []).map(input => input.label), ...childText(block.diagram, tensorText),
  ]), ...(callouts ?? []).flatMap(callout => [callout.label, callout.value])];
}

export function describeBlockStack({ blocks, edges, callouts }, describeTensor) {
  const names = new Map(blocks.map(block => [block.id, block.label]));
  return [
    blocks.map(block => block.label).join(' → '),
    ...blocks.flatMap(({ label, role, variant, dims, repeat, repeatTo, inputs, merge, detail, diagram }) => [
      [role === 'changed' ? `Changed block ${label}` : label, variant, dims].filter(Boolean).join(' · '),
      repeatTo ? `Repeat ${label} through ${names.get(repeatTo)} ${repeat} times` : repeat ? `Repeat ${label} ${repeat} times` : undefined,
      ...(inputs ?? []).map(input => `${input.label} → ${merge ? `${label} ${merge} join` : label}`),
      merge ? `${label} uses a ${merge} join` : undefined,
      detail ? `${label} detail in Visual ${detail}` : undefined,
      diagram?.kind === 'flow' ? diagram.steps.join(' → ') : undefined,
      ...(diagram?.kind === 'layers' ? diagram.layers.map(layer => [layer.label, layer.detail].filter(Boolean).join(' · ')) : []),
      ...(diagram?.kind === 'tensor' ? describeTensor?.(diagram.tensor) ?? [] : []),
    ]),
    ...(edges ?? []).map(({ from, to, merge = 'add' }) => `Residual bypass from ${names.get(from)} through ${names.get(to)}, then ${merge}`),
    ...(callouts ?? []).map(({ node, label, value }) => [names.get(node), label, value].filter(Boolean).join(' · ')),
  ].filter(Boolean);
}
