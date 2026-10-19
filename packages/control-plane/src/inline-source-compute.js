import { computeRecognizedSourcePlot } from '../../web/src/inline-source-compute.js';
import { FILE_SOURCE } from '../../web/src/file-chat-ref.js';
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const only = (value, keys) => record(value) && Object.keys(value).every(key => keys.includes(key));

export function sourceComputeAvailable(request) {
  const context = request?.context, intent = context?.sourceComputation, ranges = context?.sourceRanges;
  return request?.kind === 'selection' && request.mode === 'explain' && !request.textRange && !context?.target?.range && !context?.target?.textRange
    && !context?.image && !context?.repoScope && !context?.imageReplacement
    && only(intent, ['type']) && intent.type === 'table_plot'
    && Array.isArray(request.targetIds) && request.targetIds.length > 0 && new Set(request.targetIds).size === request.targetIds.length
    && Array.isArray(ranges) && ranges.length > 0 && ranges.length <= 4
    && ranges.every(entry => only(entry, ['targetId', 'sourceId', 'range']) && typeof entry.targetId === 'string' && request.targetIds.includes(entry.targetId)
      && typeof entry.sourceId === 'string' && FILE_SOURCE.test(entry.sourceId) && only(entry.range, ['page']) && Number.isSafeInteger(entry.range.page) && entry.range.page > 0)
    && request.targetIds.every(id => ranges.some(entry => entry.targetId === id));
}
export function checkSourceCompute(input, request, requestId, readings) {
  const fail = () => ({ error: 'The recognized page plot does not match the explicit frozen source scope.' });
  if (!sourceComputeAvailable(request) || typeof requestId !== 'string' || !/^[A-Za-z0-9-]{8,80}$/.test(requestId)
    || !Array.isArray(readings) || readings.length !== request.context.sourceRanges.length
    || readings.some((reading, index) => {
      const wanted = request.context.sourceRanges[index];
      return !only(reading, ['targetId', 'sourceId', 'range', 'coverage']) || reading.targetId !== wanted.targetId || reading.sourceId !== wanted.sourceId
        || !only(reading.range, ['page']) || reading.range.page !== wanted.range.page || !['extracted', 'partial'].includes(reading.coverage);
    })) return fail();
  if (only(input, ['clarify']) && typeof input.clarify?.question === 'string' && input.clarify.question.trim() && input.clarify.question.length <= 240 && only(input.clarify, ['question'])) return { result: { kind: 'clarify', question: input.clarify.question.trim() } };
  if (!only(input, ['summary', 'sourceComputation', 'uncertainties']) || typeof input.summary !== 'string' || !input.summary.trim() || input.summary.length > 300
    || !only(input.sourceComputation, ['table', 'operation'])) return fail();
  const checked = computeRecognizedSourcePlot({ ...input.sourceComputation, uncertainties: input.uncertainties });
  if (!checked.ok) return { error: checked.reason };
  // Numerical answers and graph data are recomputed by the client, never accepted from the model.
  return { result: { kind: 'source_compute', requestId, targetIds: [...request.targetIds], summary: input.summary.trim(),
    table: checked.table, operation: checked.operation, uncertainties: checked.uncertainties, sourceReadings: structuredClone(readings) } };
}
export const SOURCE_COMPUTE_SYSTEM = 'The learner explicitly requested one recognized PDF-page table and plot preview. Use ONLY supplied extracted page text, never attached context or prior chat. Return {summary,sourceComputation:{table:{columns:[recognized headings],rows:[[recognized string cells]]},operation:{type:"table_plot",columns:[zero-based Y column indexes],units:[known unit labels],xColumn:distinct zero-based X index,xUnit:"known X unit"}},uncertainties:[{location,message}]} alone. At most 100 rows, eight columns, 128 characters per cell, 16000 table characters and eight uncertainties. Preserve literal recognized numeric strings; do not calculate values, infer missing cells, fit curves or provide points/graphs. The application deterministically converts recognized cells into a plot; it does not verify recognition. Units must be explicitly supported by the source or user, never guessed. Partial extracted-page coverage is not the complete PDF or a verified exact dataset. If cells, units or columns cannot be established, return only clarify:{question:"one concise question"}. Source is unchanged; the learner must inspect recognized cells, uncertainties and page coverage before explicit Accept.';
export const SOURCE_COMPUTE_TOOL = { name: 'inline_source_compute', description: 'Recognized page values with uncertainty for one deterministic plot preview.', input_schema: {
  type: 'object', additionalProperties: false, properties: {
    clarify: { type: 'object', additionalProperties: false, required: ['question'], properties: {question:{type:'string',minLength:1,maxLength:240}} },
    summary: {type:'string',minLength:1,maxLength:300},
    sourceComputation: { type:'object',additionalProperties:false,required:['table','operation'],properties:{
      table:{type:'object',additionalProperties:false,required:['columns','rows'],properties:{columns:{type:'array',minItems:2,maxItems:8,items:{type:'string',minLength:1,maxLength:128}},rows:{type:'array',minItems:1,maxItems:100,items:{type:'array',minItems:2,maxItems:8,items:{type:'string',maxLength:128}}}}},
      operation:{type:'object',additionalProperties:false,required:['type','columns','units','xColumn','xUnit'],properties:{type:{type:'string',enum:['table_plot']},columns:{type:'array',minItems:1,maxItems:7,items:{type:'integer',minimum:0,maximum:7}},units:{type:'array',minItems:1,maxItems:7,items:{type:'string',minLength:1,maxLength:80}},xColumn:{type:'integer',minimum:0,maximum:7},xUnit:{type:'string',minLength:1,maxLength:80}}}
    }},
    uncertainties:{type:'array',maxItems:8,items:{type:'object',additionalProperties:false,required:['location','message'],properties:{location:{type:'string',minLength:1,maxLength:120},message:{type:'string',minLength:1,maxLength:240}}}}
  }
} };
