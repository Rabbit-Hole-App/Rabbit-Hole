// The server step of a card made from a DECLARED reference (the same-JSON change set; web/src/tutor-diagrams/calculation.js). A reference declares either a calculation (its function) or that it needs none.
// The step knows no reference id and no kind name: it reads the reference shown with the request, as `vary` does. For a card made from a reference that has a function, the diagram of the reference's kind
//   1. is read through its `variables` list: each input's type and limits are checked and the function's own input check runs,
//   2. gets its results overwritten with the function's results (each checked against its limits),
//   3. has every {{v:name}} placeholder of every text field filled with the number of the variable.
// For every declared reference (a function or none) the card is then checked:
//   4. the prose of the body, and the caption of every diagram, may write a number with a decimal point or a percent sign only if the picture prints it (explanation_bad_prose_number),
//   5. no text field of a diagram may still hold a "?" that stands for a number (explanation_bad_placeholder),
//   and {{v:name}} in the prose is filled from the calculated diagram's numbers.
// A problem is a card problem: it is thrown by the caller and goes to the one repair there is. The archive records what the step did on each card.
import { describeTutorDiagram, fillAllDerived, parseTutorDiagram } from '../../web/src/tutor-diagrams/spec.js';
import { fillDiagramText, fillVariableText, hasFunction, isDeclared, runCalculation, unfilledNumbers } from '../../web/src/tutor-diagrams/calculation.js';

const FENCE = /^\s*```\s*([\w+#.-]*)/;
const NUMBER = /-?\d+(?:\.\d+)?/g;
// A number a text writes with a decimal point (0.70) or a percent sign (70%, 62.5 %): the only numbers the card check reads.
const CHECKED = /(\d+\.\d+|\d+(?:\.\d+)?\s?%)/g;

const declaredReferences = references => (references ?? []).filter(ref => isDeclared(ref) && ref.spec?.diagram && !ref.shape && !ref.seededExample);
const textsOf = block => [block?.body, ...(block?.more || []).map(section => section?.text)];

// Every closed rh-diagram fence of a markdown text, and the prose lines outside the fences.
function walkFences(md, onFence, onProse) {
  const out = []; let open = null, other = false;
  for (const line of String(md ?? '').split('\n')) {
    if (open) {
      if (/^\s*```/.test(line)) { out.push(open.raw, ...(onFence(open.lines) ?? open.lines), line); open = null; } else open.lines.push(line);
      continue;
    }
    const match = line.match(FENCE);
    if (!other && match && match[1].toLowerCase() === 'rh-diagram') { open = { raw: line, lines: [] }; continue; }
    if (match) { other = !other; out.push(line); continue; } // another fence (an illustration, code): its lines are not prose
    out.push(other || !onProse ? line : onProse(line));
  }
  if (open) out.push(open.raw, ...open.lines);
  return out.join('\n');
}

// The numbers a picture prints: every numeric field of the diagram (the server's own computation filled in, the variables list apart), the numbers its description states, and the numbers written in its
// text fields other than the title and the caption (a label, a note). Title and caption are not counted: a caption cannot print its own numbers for itself.
function printedNumbers(diagram) {
  const printed = new Set();
  const add = text => { for (const match of String(text).matchAll(NUMBER)) printed.add(Number(match[0])); };
  const walk = (node, key) => {
    if (key === 'variables') return;
    if (typeof node === 'number') printed.add(node);
    else if (typeof node === 'string') { if (key !== 'title' && key !== 'caption') add(node); }
    else if (Array.isArray(node)) node.forEach(item => walk(item, key));
    else if (node && typeof node === 'object') for (const [name, item] of Object.entries(node)) walk(item, name);
  };
  let parsed = null;
  try { parsed = parseTutorDiagram({ version: 1, diagram }); fillAllDerived(parsed.diagram); } catch { /* an invalid diagram is the card's own check */ }
  walk(parsed?.diagram ?? diagram, '');
  if (parsed) { const description = describeTutorDiagram(parsed); add(Array.isArray(description) ? description.slice(1).join('\n') : String(description).split('\n').slice(1).join('\n')); }
  return printed;
}

// A checked number of a text that no picture of the card prints at its rounding: [] when every one is printed.
function unprintedNumbers(text, printed) {
  const bad = [];
  for (const match of String(text).matchAll(CHECKED)) {
    const raw = match[0].replace(/\s?%$/, ''), value = Number(raw), decimals = (raw.split('.')[1] ?? '').length, tolerance = 0.5 * 10 ** -decimals + 1e-9;
    if (![...printed].some(number => Math.abs(number - value) <= tolerance)) bad.push(match[0]);
  }
  return bad;
}

// -> { block, steps, problem }. steps: one record per calculated diagram { reference, inputs, written, results, overwritten } for the archive.
export function applyCalculations(block, references) {
  const declared = declaredReferences(references);
  if (!declared.length) return { block, steps: [], problem: null };
  const functions = declared.filter(hasFunction), steps = [], values = {}, done = new Set(), diagrams = [];
  let problem = null;

  // One closed rh-diagram fence: the lines back unchanged unless a function applies to this diagram.
  const settle = lines => {
    let spec; try { spec = JSON.parse(lines.join('\n')); } catch { return lines; }
    const diagram = spec?.diagram;
    if (!diagram || typeof diagram !== 'object') return lines;
    const reference = functions.find(ref => ref.spec.diagram.kind === diagram.kind && !done.has(ref));
    if (!reference) { diagrams.push(diagram); return lines; }
    done.add(reference);
    const run = runCalculation(diagram, reference.calculation);
    if (run.problem) { problem ??= `explanation_bad_calculation: ${run.problem}`; return lines; }
    const filled = fillDiagramText(run.diagram, run.values);
    if (filled.problem) { problem ??= `explanation_bad_calculation: ${filled.problem}`; return lines; }
    Object.assign(values, run.values);
    diagrams.push(filled.diagram);
    steps.push({ reference: reference.id, inputs: Object.fromEntries(reference.calculation.variables.filter(v => v.role === 'input').map(v => [v.name, run.values[v.name]])),
      written: run.written, results: Object.fromEntries(reference.calculation.variables.filter(v => v.role === 'result').map(v => [v.name, run.values[v.name]])), overwritten: run.overwritten });
    return [JSON.stringify({ ...spec, diagram: filled.diagram })];
  };

  let bodies = textsOf(block).map(md => (typeof md === 'string' ? walkFences(md, settle) : md));
  if (problem) return { block, steps, problem };

  // The prose: {{v:name}} outside the fences, from the numbers of the calculated diagrams.
  const fillProse = line => {
    if (!line.includes('{{v:')) return line;
    const filled = fillVariableText(line, values);
    if (filled.problem) { problem ??= `explanation_bad_calculation: ${filled.problem}`; return line; }
    return filled.text;
  };
  bodies = bodies.map(md => (typeof md === 'string' ? walkFences(md, () => null, fillProse) : md));
  if (problem) return { block, steps, problem };

  // A "?" that stands for a number: never delivered.
  for (const diagram of diagrams) {
    const left = unfilledNumbers(diagram);
    if (left.length) return { block, steps, problem: `explanation_bad_placeholder: the diagram still has a "?" where a number belongs (${left.slice(0, 3).join(', ')}); write the number, or {{v:name}} for one of the variables` };
  }
  // A number of the prose or of a caption that the picture does not print.
  const printed = new Set(diagrams.flatMap(diagram => [...printedNumbers(diagram)]));
  const unprinted = [];
  for (const md of bodies) if (typeof md === 'string') walkFences(md, () => null, line => { unprinted.push(...unprintedNumbers(line, printed)); return line; });
  for (const diagram of diagrams) if (typeof diagram.caption === 'string') unprinted.push(...unprintedNumbers(diagram.caption, printed));
  if (unprinted.length) return { block, steps, problem: `explanation_bad_prose_number: the text writes ${[...new Set(unprinted)].slice(0, 4).join(', ')}, which the picture does not print; write only numbers the picture prints (or {{v:name}} for a number of the variables), and never a starting number` };

  const more = (block.more || []).map((section, index) => (typeof section?.text === 'string' ? { ...section, text: bodies[index + 1] } : section));
  return { block: { ...block, body: typeof block.body === 'string' ? bodies[0] : block.body, ...(block.more ? { more } : {}) }, steps, problem: null };
}
