// The rh-diagram fence: a TutorDiagram JSON spec inside Markdown (written Explanation body and More sections). Md.jsx draws it with
// TutorDiagram; the Tutor reads the same content as the library's own plain description, never the JSON.
import { describeTutorDiagram, parseTutorDiagram } from './tutor-diagrams/spec.js';

export const DIAGRAM_FENCE = /^rh-diagram$/i;

// -> the description text of a spec source, or null when it does not parse (the caller keeps the fence as written).
export function diagramText(source) {
  try { return describeTutorDiagram(parseTutorDiagram(source)); } catch { return null; }
}

// A Markdown string with each valid rh-diagram fence replaced by its description.
export const diagramsAsText = md => String(md ?? '').replace(/^[ \t]*```[ \t]*rh-diagram[^\n]*\n([\s\S]*?)^[ \t]*```[ \t]*$/gim, (all, body) => diagramText(body) ?? all);
