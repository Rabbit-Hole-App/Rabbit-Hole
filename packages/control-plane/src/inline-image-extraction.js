// Existing vision generation, with explicit recognition limits. No provider,
// source access, or mutation lives here; the caller supplies its read receipt.
export const IMAGE_EXTRACTION_SYSTEM = `The selected image was read as a whole image. Return the normal tool proposal inside content, and uncertainties as an array of {location,message}. Describe uncertain recognition or relationships using short human-readable locations, not invented verified coordinates. Do not invent unreadable text, values, units or connections. When ambiguity prevents a useful proposal, return only clarify:{question:"one concise question"}, without content or uncertainties. An empty uncertainties array does not establish accuracy. The original image is preserved.`;

export function imageExtractionTool(tool) {
  return { ...tool, input_schema: {
    type: 'object', additionalProperties: false,
    properties: {
      clarify: { type: 'object', additionalProperties: false, required: ['question'], properties: { question: { type: 'string', minLength: 1, maxLength: 240 } } },
      content: tool.input_schema,
      uncertainties: { type: 'array', maxItems: 8, items: {
        type: 'object', additionalProperties: false, required: ['location', 'message'],
        properties: { location: { type: 'string', minLength: 1, maxLength: 120 }, message: { type: 'string', minLength: 1, maxLength: 240 } },
      } },
    },
  } };
}

export function checkImageExtraction(input, checkContent, source) {
  const invalid = () => ({ error: 'The image interpretation did not include valid recognition limits.' });
  if (input && Object.hasOwn(input, 'clarify')) {
    const question = input.clarify?.question;
    if (Object.keys(input).length !== 1 || !input.clarify || Array.isArray(input.clarify)
      || Object.keys(input.clarify).length !== 1 || typeof question !== 'string' || !question.trim() || question.length > 240) return invalid();
    return { result: { kind: 'clarify', question: question.trim() } };
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['content', 'uncertainties'].includes(key))
    || !Array.isArray(input.uncertainties) || input.uncertainties.length > 8) return invalid();
  const uncertainties = [];
  for (const entry of input.uncertainties) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || Object.keys(entry).some(key => !['location', 'message'].includes(key))
      || typeof entry.location !== 'string' || !entry.location.trim() || entry.location.length > 120
      || typeof entry.message !== 'string' || !entry.message.trim() || entry.message.length > 240) return invalid();
    uncertainties.push({ location: entry.location.trim(), message: entry.message.trim() });
  }
  const checked = checkContent(input.content);
  if (checked.error) return checked;
  return { result: { ...checked.result, extraction: { source: structuredClone(source), uncertainties } } };
}
