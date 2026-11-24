// Reads the explanation author's system text from its section files (src/prompts/explanation/*.md, bundled by scripts/build-explanation-prompts.mjs into
// explanation-prompts.generated.js). Code only selects a block and fills a slot; every word the model reads is in a file.
// Marker syntax (it occurs in no other text of the repository): a block is `{% block name %}` ... `{% endblock %}` (no nesting; a newline right after the
// opening marker and right before the closing marker is not part of the block), a slot is `{% slot name %}`. Joining characters between blocks stay in code.
import { EXPLANATION_PROMPT_FILES } from './explanation-prompts.generated.js';

const BLOCK = /\{% block ([a-z0-9-]+) %\}\n?([\s\S]*?)\n?\{% endblock %\}/g;
const SLOT = /\{% slot ([a-z0-9-]+) %\}/g;

// A file's text -> { blocks: name -> text, section: the text with its block markers removed }. A marker that is not a whole block or a slot is a bug in the file.
export function parsePromptText(name, text) {
  const blocks = {};
  const section = text.replace(BLOCK, (_, key, body) => {
    if (Object.hasOwn(blocks, key)) throw new Error(`${name}: block ${key} is written twice`);
    blocks[key] = body;
    return body;
  });
  if (section.replace(SLOT, '').includes('{%')) throw new Error(`${name}: an unknown or unclosed marker`);
  return { blocks, section };
}

const parsed = new Map();
function file(name) {
  if (!parsed.has(name)) {
    const entry = EXPLANATION_PROMPT_FILES[name];
    if (!entry) throw new Error(`explanation prompt file ${name} is missing (npm run prompts:build:explanation)`);
    parsed.set(name, parsePromptText(name, entry.text));
  }
  return parsed.get(name);
}

// Replaces each slot by the value given for it; a slot with no value, or a value for no slot, is a bug in the caller.
export function fillSlots(text, slots = {}) {
  const used = new Set();
  const out = text.replace(SLOT, (_, key) => {
    if (!Object.hasOwn(slots, key)) throw new Error(`slot ${key} has no value`);
    used.add(key);
    return String(slots[key]);
  });
  const unused = Object.keys(slots).filter(key => !used.has(key));
  if (unused.length) throw new Error(`no slot for ${unused.join(', ')}`);
  return out;
}

// One named block of a file, with its slots still in it unless `slots` fills them.
export function promptBlock(name, block, slots) {
  const { blocks } = file(name);
  if (!Object.hasOwn(blocks, block)) throw new Error(`${name} has no block ${block}`);
  return slots ? fillSlots(blocks[block], slots) : blocks[block];
}
// The whole file as it is sent: its markers removed, its slots filled.
export const promptSection = (name, slots = {}) => fillSlots(file(name).section, slots);
// The section's own heading line (the first line that starts with "# ").
export const promptHeading = name => /^# .+$/m.exec(file(name).section)?.[0] ?? (() => { throw new Error(`${name} has no heading`); })();
