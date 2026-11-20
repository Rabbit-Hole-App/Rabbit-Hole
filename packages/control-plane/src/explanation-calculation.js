// MVP4 (owner 2026-11-19): the server step of a reference that has a calculation (web/src/tutor-diagrams/calculation.js). The author chose the inputs and wrote the figure; here the server
//   1. reads the inputs from the card's diagram through its `variables` list, checks each input's type and limits, and runs the calculation's own input check,
//   2. runs the function and overwrites the results on the card with its results, checking each result's limits,
//   3. fills the {{v:name}} placeholders (the diagram's title and caption, and the prose) with the numbers of the variables.
// A card made from a reference that has a calculation is found through the reference shown with the request (it travels on the reference as `vary` does). The diagram it applies to is the first one
// of the kind the reference's own diagram has. A problem (no variables list, an input outside its limits or refused by the function, a result outside its limits, an unknown placeholder) is a card
// problem: it is thrown as explanation_bad_calculation and goes to the one repair there is. No reference id and no kind name in this file.
import { fillVariableText, runCalculation } from '../../web/src/tutor-diagrams/calculation.js';

const FENCE = /^\s*```\s*([\w+#.-]*)/;

const withCalculation = references => (references ?? []).filter(ref => ref?.calculation && ref.spec?.diagram && !ref.shape && !ref.seededExample);

// -> { block, steps, problem }. steps: one record per calculated diagram { reference, inputs, written, results, overwritten } for the archive.
export function applyCalculations(block, references) {
  const calculations = withCalculation(references);
  if (!calculations.length) return { block, steps: [], problem: null };
  const steps = [], values = {}, done = new Set();
  let problem = null;

  const rewrite = md => {
    const out = []; let open = null;
    for (const line of String(md ?? '').split('\n')) {
      if (open) {
        if (/^\s*```/.test(line)) {
          out.push(open.raw, ...settle(open.lines), line); open = null;
        } else open.lines.push(line);
        continue;
      }
      const match = line.match(FENCE);
      if (match && match[1].toLowerCase() === 'rh-diagram') { open = { raw: line, lines: [] }; continue; }
      out.push(line);
    }
    if (open) out.push(open.raw, ...open.lines);
    return out.join('\n');
  };

  // One closed rh-diagram fence: the lines back unchanged unless a calculation applies to this diagram.
  const settle = lines => {
    let spec; try { spec = JSON.parse(lines.join('\n')); } catch { return lines; }
    const diagram = spec?.diagram;
    const reference = diagram && calculations.find(ref => ref.spec.diagram.kind === diagram.kind && !done.has(ref));
    if (!reference) return lines;
    done.add(reference);
    const run = runCalculation(diagram, reference.calculation);
    if (run.problem) { problem ??= `explanation_bad_calculation: ${run.problem}`; return lines; }
    const next = run.diagram;
    for (const field of ['title', 'caption']) {
      if (typeof next[field] !== 'string') continue;
      const filled = fillVariableText(next[field], run.values);
      if (filled.problem) { problem ??= `explanation_bad_calculation: the diagram's ${field}: ${filled.problem}`; return lines; }
      next[field] = filled.text;
    }
    Object.assign(values, run.values);
    steps.push({ reference: reference.id, inputs: Object.fromEntries(reference.calculation.variables.filter(v => v.role === 'input').map(v => [v.name, run.values[v.name]])),
      written: run.written, results: Object.fromEntries(reference.calculation.variables.filter(v => v.role === 'result').map(v => [v.name, run.values[v.name]])), overwritten: run.overwritten });
    return [JSON.stringify({ ...spec, diagram: next })];
  };

  const bodies = [block?.body, ...(block?.more || []).map(section => section?.text)].map(md => (typeof md === 'string' ? rewrite(md) : md));
  if (problem) return { block, steps, problem };

  // The prose: {{v:name}} outside the fences, from the numbers of the calculated diagrams.
  const fillProse = md => {
    if (typeof md !== 'string' || !md.includes('{{v:')) return md;
    let inside = false;
    return md.split('\n').map(line => {
      if (FENCE.test(line)) { inside = !inside; return line; }
      if (inside) return line;
      const filled = fillVariableText(line, values);
      if (filled.problem) { problem ??= `explanation_bad_calculation: ${filled.problem}`; return line; }
      return filled.text;
    }).join('\n');
  };
  const filled = bodies.map(fillProse);
  if (problem) return { block, steps, problem };
  const more = (block.more || []).map((section, index) => (typeof section?.text === 'string' ? { ...section, text: filled[index + 1] } : section));
  return { block: { ...block, body: typeof block.body === 'string' ? filled[0] : block.body, ...(block.more ? { more } : {}) }, steps, problem: null };
}
