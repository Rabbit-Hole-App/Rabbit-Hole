import { validInlineToolSnapshot } from '../../web/src/inline-tool-plan.js';
import { editableImage } from '../../web/src/inline-image-plan.js';
import { validateCardContent } from '../../web/src/inline-card-edit.js';
import { validateDiagram, DIAGRAM_SCHEMA } from '../../web/src/inline-diagram.js';
import { INLINE_EQUATION_TOOL, checkEquation } from './inline-equation.js';
import { imageExtractionTool, checkImageExtraction } from './inline-image-extraction.js';

const outputs = ['table', 'code', 'equation', 'diagram'];
export function imageReplacement(request) {
  const intent = request?.context?.imageReplacement, snapshot = request?.context?.toolSnapshot;
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)
    || Object.keys(intent).some(key => !['targetId', 'output'].includes(key)) || !outputs.includes(intent.output)
    || request.kind !== 'selection' || request.mode !== 'edit' || request.textRange
    || !validInlineToolSnapshot(snapshot) || (snapshot.intent || 'edit') !== 'edit'
    || snapshot.ids.length !== 1 || JSON.stringify(request.targetIds) !== JSON.stringify(snapshot.ids)
    || intent.targetId !== snapshot.ids[0] || snapshot.lists[intent.targetId] !== 'blocks'
    || snapshot.readOnlyGraph.links.length) return null;
  const block = snapshot.objects[intent.targetId], source = block.fileRef?.source;
  if (!editableImage(block) || block.groupId || block.group_id || request.context?.target?.groupId
    || typeof source?.id !== 'string' || !/^fs_[0-9a-f]{24}$/.test(source.id)
    || typeof source.rev !== 'string' || !/^[0-9a-f]{64}$/.test(source.rev)) return null;
  return { targetId: intent.targetId, output: intent.output, source: { id: source.id, rev: source.rev } };
}

export const IMAGE_REPLACEMENT_SYSTEM = 'The learner explicitly chose Edit and replacement of this one saved image with the selected native output. Read the actual authorized image pixels. Propose only that output using the tool and report uncertain recognition; do not silently switch to Explain, execute copied code, invent unreadable data or claim faithful reconstruction. This is a replacement preview, not an applied change. Accept later replaces the selected canvas object in one undoable transaction while retaining the original immutable asset. Never supply canvas IDs, coordinates, source references, permission changes or external dependencies. A diagram must contain native nodes/labels/connectors only. Tables contain recognized string cells; code is copied text only. If useful recognition is impossible, ask one concise clarification.';

export function replacementTool(output) {
  let schema;
  if (output === 'equation') schema = INLINE_EQUATION_TOOL.input_schema;
  else if (output === 'diagram') schema = DIAGRAM_SCHEMA;
  else schema = { type: 'object', additionalProperties: false, required: output === 'table' ? ['columns', 'rows'] : ['code'], properties: output === 'table' ? {
    columns: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'string', maxLength: 200 } },
    rows: { type: 'array', maxItems: 100, items: { type: 'array', maxItems: 50, items: { type: 'string', maxLength: 1000 } } },
  } : { code: { type: 'string', minLength: 1, maxLength: 3800 } } };
  return imageExtractionTool({ name: 'inline_image_replacement', description: `Recognized ${output} replacing the explicitly selected image, with uncertainty.`, input_schema: schema });
}

export function checkImageReplacement(input, request, requestId, source) {
  const intent = imageReplacement(request);
  if (!intent || typeof requestId !== 'string' || !/^[A-Za-z0-9-]{8,80}$/.test(requestId)
    || source?.blockId !== intent.targetId || source.coverage !== 'whole-image'
    || source.source?.id !== intent.source.id || source.source.rev !== intent.source.rev) return { error: 'The explicit image replacement or source revision changed.' };
  const content = value => {
    if (intent.output === 'equation') {
      const checked = checkEquation(value);
      return checked.result?.kind === 'clarify' ? { error: 'Return clarification outside content.' } : checked;
    }
    if (intent.output === 'diagram') {
      const checked = validateDiagram(value);
      return checked.ok ? { result: { kind: 'diagram', spec: checked.spec } } : { error: checked.errors[0] };
    }
    const table = intent.output === 'table';
    const checked = validateCardContent(table ? { type: 'table', columns: [''], rows: [] } : { type: 'snippet', code: '' }, value);
    if (!checked.ok || !table && !value?.code?.trim() || table && (!value.rows.length || value.columns.length > 50 || value.rows.length > 100)) return { error: checked.error || 'The recognized content is empty or exceeds the supported replacement bounds.' };
    return { result: { kind: 'card', block: { type: table ? 'table' : 'snippet', ...value } } };
  };
  const checked = checkImageExtraction(input, content, source);
  if (checked.error || checked.result.kind === 'clarify') return checked;
  const { extraction, ...value } = checked.result;
  return { result: { kind: 'image_replacement', requestId, targetId: intent.targetId, output: intent.output,
    summary: `Replace selected image with editable ${intent.output}`, content: value, extraction } };
}

// Read through the existing indexed-source ACL; never accept client pixel bytes or URLs.
export async function readReplacementImage(env, access, request, board, images) {
  if (!Object.hasOwn(request?.context || {}, 'imageReplacement')) return null;
  const intent = imageReplacement(request);
  if (!intent || board !== 'main') return Response.json({ error: 'Replacement requires one unlinked editable image with a saved immutable original on the main canvas. Save or normalize the imported original first.', code: 'replacement_unavailable' }, { status: 400 });
  const got = await images(env, access, { image_context: { block_id: intent.targetId }, image_source: intent.source, board }).catch(() => null);
  const source = got?.imageSource;
  if (!Array.isArray(got?.blocks) || !got.blocks.some(block => block.type === 'image')
    || source?.blockId !== intent.targetId || source.coverage !== 'whole-image'
    || source.source?.id !== intent.source.id || source.source.rev !== intent.source.rev) {
    return Response.json({ error: 'The selected image is unavailable or its saved source changed.', code: 'source_unavailable' }, { status: 409 });
  }
  return got;
}
