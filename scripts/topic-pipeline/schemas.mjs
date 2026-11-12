import Ajv from 'ajv';
import { tutorDiagramJsonSchema } from '../../packages/web/src/tutor-diagrams/spec.js';

export const kindCatalogue = (tutorDiagramJsonSchema.properties.diagram.anyOf ?? tutorDiagramJsonSchema.properties.diagram.oneOf)
  .map(branch => branch.properties.kind.const);
const keyword = { type: 'string', minLength: 1, pattern: '^[a-z0-9]+(?:[ -][a-z0-9]+){0,2}$' };
export const promptsSchema = {
  type: 'object', additionalProperties: false,
  required: ['topic', 'toyData', 'prompts'],
  properties: {
    topic: { type: 'string', pattern: '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$' },
    toyData: { type: 'object', required: ['rows', 'features', 'label', 'usedBy'], properties: {
      rows: { type: 'array', maxItems: 10, items: {} }, features: { type: 'array', maxItems: 2, items: { type: 'string' } },
      label: { type: 'string' }, usedBy: { type: 'array', items: { type: 'integer' } },
    }, additionalProperties: false },
    extraData: { type: 'object' },
    prompts: { type: 'array', minItems: 12, maxItems: 12, items: {
      type: 'object', additionalProperties: false, required: ['id', 'prompt', 'kind', 'content', 'keywords', 'data', 'why', 'origin'],
      properties: { id: { type: 'integer', minimum: 1, maximum: 12 },
        prompt: { type: 'string', minLength: 2, maxLength: 140, pattern: '\\?$' },
        kind: { type: 'string', enum: kindCatalogue }, content: { type: 'string', minLength: 1 },
        keywords: { type: 'array', minItems: 2, maxItems: 3, uniqueItems: true, items: keyword },
        data: { enum: ['toy-exact', 'illustrative'] }, why: { type: 'string', minLength: 1 },
        origin: { enum: ['lesson', 'learner', 'owner'] }, lesson: { type: 'string', pattern: '^\\d{2}$' },
      },
    } },
  },
};
const ajv = new Ajv({ allErrors: true });
const check = ajv.compile(promptsSchema);
export const topicSchema = { type: 'object', additionalProperties: false, required: ['topic', 'title', 'lessons', 'sources'],
  properties: { topic: promptsSchema.properties.topic, title: { type: 'string', minLength: 1 },
    lessons: { type: 'array', uniqueItems: true, items: { type: 'string', pattern: '^\\d{2}$' } },
    sources: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind', 'path', 'revision'],
      properties: { kind: { type: 'string', minLength: 1 }, path: { type: 'string', minLength: 1 }, revision: { type: 'string' } } } },
  } };
const checkTopic = ajv.compile(topicSchema);

export function validateTopic(value) {
  if (!checkTopic(value)) throw new Error(`Invalid topic metadata ${ajv.errorsText(checkTopic.errors)}`);
  return value;
}

export function validatePrompts(value) {
  if (!check(value)) throw new Error(`Invalid prompts schema ${ajv.errorsText(check.errors)}`);
  const rows = value.prompts;
  if (new Set(rows.map(row => row.id)).size !== 12 || new Set(rows.map(row => row.prompt)).size !== 12) throw new Error('Prompts require unique ids and strings');
  if (rows.some(row => row.prompt !== row.prompt.toLowerCase())) throw new Error('Prompts must be lowercase');
  if (rows.some(row => row.origin === 'lesson' && !row.lesson)) throw new Error('A lesson-origin prompt requires its lesson metadata');
  const counts = rows.reduce((all, row) => ({ ...all, [row.kind]: (all[row.kind] ?? 0) + 1 }), {});
  if ((counts['coordinate-plot'] ?? 0) < 6 || Object.entries(counts).some(([kind, count]) => kind !== 'coordinate-plot' && count > 3)) throw new Error('Prompt kind mix violates the topic contract');
  return value;
}
