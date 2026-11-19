// Check 1 of the blueprint checker, the form (Brief 38 spec section 5): the strict schema and every limit of section 4 answered as sentences the model can act on, and every option outside BUILT answered "not built yet".
// A sentence names the field by its path and says what is wrong and what is allowed. No subject appears here.
import { BUILT, FULL_SCHEMA, BUILT_SCHEMA, pathText } from './interact-blueprint.js';

const code = text => `\`${text}\``;
const where = path => (path ? code(path) : 'the blueprint');
const valueAt = (root, path) => path.reduce((value, key) => (value === undefined || value === null ? undefined : value[key]), root);
const list = values => values.map(value => (typeof value === 'string' ? `"${value}"` : String(value))).join(', ');
const kindOf = value => (value === null ? 'null' : Array.isArray(value) ? 'a list' : typeof value === 'object' ? 'an object' : typeof value === 'string' ? 'text' : typeof value === 'number' ? 'a number' : typeof value === 'boolean' ? 'true or false' : 'nothing');

// The options a discriminator may take, by where it stands (a part's type, a control's type, a claim's type, an output's kind).
const choicesAt = full => { const last = full.at(-1), list = full.at(-3) === undefined ? null : full[full.length - 3]; if (last === 'type' && full.includes('parts')) return BUILT.parts; if (last === 'type' && full[0] === 'inputs') return BUILT.inputs; if (last === 'type' && full[0] === 'claims') return BUILT.claims; if (last === 'kind' && full.includes('outputs')) return BUILT.outputs; return null; };
// zod issues -> problems. A union that fails reports the branch with the fewest problems (the one the value was closest to).
function issuesToProblems(root, issues, prefix = []) {
  const out = [];
  for (const issue of issues) {
    const full = [...prefix, ...issue.path], path = pathText(full), value = valueAt(root, full);
    if (issue.code === 'invalid_union' && !(issue.errors?.length)) {
      const kind = full.at(-1), parent = full.at(-2), options = kind === 'type' && typeof full.at(-3) === 'number' ? (full.at(-4) === 'parts' ? BUILT.parts : full.at(-2) === undefined ? null : null) : null;
      out.push({ code: 'form', path: pathText(full), message: `${where(pathText(full))} is ${typeof valueAt(root, full) === 'string' ? `"${valueAt(root, full)}"` : String(valueAt(root, full))}${(options ?? choicesAt(full)) ? `; it must be one of ${list(options ?? choicesAt(full))}` : ''}.` });
    } else if (issue.code === 'invalid_union') {
      const branches = (issue.errors ?? []).map(branch => issuesToProblems(root, branch, full));
      const best = branches.filter(branch => branch.length).sort((a, b) => a.length - b.length)[0];
      out.push(...(best ?? [{ code: 'form', path, message: `${where(path)} does not match any of the shapes the form allows.` }]));
    } else if (issue.code === 'unrecognized_keys') out.push({ code: 'form', path, message: `${where(path)} has the field ${issue.keys.map(code).join(', ')}, which the form does not have.` });
    else if (issue.code === 'invalid_type') out.push({ code: 'form', path, message: value === undefined ? `${where(path)} is missing.` : `${where(path)} must be ${issue.expected === 'number' ? 'a number' : issue.expected === 'string' ? 'text' : issue.expected === 'boolean' ? 'true or false' : issue.expected === 'array' ? 'a list' : issue.expected === 'object' ? 'an object' : `of type ${issue.expected}`}, not ${kindOf(value)}.` });
    else if (issue.code === 'too_big' || issue.code === 'too_small') {
      const big = issue.code === 'too_big', limit = big ? issue.maximum : issue.minimum, direction = big ? 'at most' : 'at least';
      if (issue.origin === 'string') out.push({ code: 'form', path, message: `${where(path)} is ${typeof value === 'string' ? value.length : '?'} characters; ${direction} ${limit}.` });
      else if (issue.origin === 'array') out.push({ code: 'form', path, message: `${where(path)} has ${Array.isArray(value) ? value.length : '?'} ${Array.isArray(value) && value.length === 1 ? 'entry' : 'entries'}; ${direction} ${limit}.` });
      else out.push({ code: 'form', path, message: `${where(path)} is ${value}; ${direction} ${limit}${issue.inclusive === false ? ' (not equal to it)' : ''}.` });
    } else if (issue.code === 'invalid_value') out.push({ code: 'form', path, message: `${where(path)} is ${typeof value === 'string' ? `"${value}"` : String(value)}; it must be ${issue.values.length === 1 ? list(issue.values) : `one of ${list(issue.values)}`}.` });
    else if (issue.code === 'invalid_format') out.push({ code: 'form', path, message: `${where(path)} is ${typeof value === 'string' ? `"${value}"` : String(value)}; an id starts with a letter and has at most 32 letters, digits or underscores.` });
    else out.push({ code: 'form', path, message: `${where(path)}: ${issue.message}` });
  }
  return out;
}

// What the full form takes and BUILT does not: "not built yet".
const notYet = (path, what) => ({ code: 'not_built', path, message: `${where(path)} is ${what}, which is not built yet; use only the options the instructions describe.` });
export function notBuilt(blueprint) {
  const out = [];
  blueprint.inputs.forEach((input, k) => { if (!BUILT.inputs.includes(input.type)) out.push(notYet(`inputs[${k}]`, `a control of type "${input.type}"`)); });
  if (!BUILT.time.includes(blueprint.time.mode)) out.push(notYet('time', `a time of mode "${blueprint.time.mode}"`));
  blueprint.math.outputs.forEach((output, k) => { if (!BUILT.outputs.includes(output.kind)) out.push(notYet(`math.outputs[${k}]`, `an output of kind "${output.kind}"`)); });
  if (blueprint.math.sweeps !== undefined) out.push(notYet('math.sweeps', 'a sweep'));
  const picture = (entry, path, allowed) => {
    if (entry === null) return;
    const name = entry.type === 'parts' ? 'parts' : entry.kind;
    if (!allowed.includes(name)) out.push(notYet(path, name === 'parts' ? 'a parts picture here' : `a picture of kind "${name}"`));
    if (entry.type === 'parts') entry.parts.forEach((part, k) => {
      if (!BUILT.parts.includes(part.type)) out.push(notYet(`${path}.parts[${k}]`, `a part of type "${part.type}"`));
      if (part.type === 'label' && part.textFrom !== undefined) out.push(notYet(`${path}.parts[${k}].textFrom`, 'a label whose text comes from an output'));
    });
    if (entry.kind === 'coordinate-plot') {
      entry.series.forEach((series, k) => { if (!BUILT.plotStyles.includes(series.style)) out.push(notYet(`${path}.series[${k}].style`, `a line style "${series.style}"`)); });
      if (entry.y.range !== undefined) out.push(notYet(`${path}.y.range`, 'a chosen y range'));
    }
  };
  picture(blueprint.pictures.main, 'pictures.main', BUILT.main); picture(blueprint.pictures.panel, 'pictures.panel', BUILT.panel);
  blueprint.claims.forEach((claim, k) => {
    if (!BUILT.claims.includes(claim.type)) out.push(notYet(`claims[${k}]`, `a claim of type "${claim.type}"`));
    if (claim.atTime !== undefined) out.push(notYet(`claims[${k}].atTime`, 'a claim tested at one moment'));
    if (claim.strict !== undefined) out.push(notYet(`claims[${k}].strict`, 'a claim that allows standing still'));
    if ((claim.type === 'increases' || claim.type === 'decreases') && claim.with === 'time') out.push(notYet(`claims[${k}].with`, 'a claim about time'));
  });
  return out;
}

// -> { ok, problems }
export function checkForm(value) {
  const full = FULL_SCHEMA.safeParse(value);
  if (!full.success) return { ok: false, problems: issuesToProblems(value, full.error.issues) };
  const named = notBuilt(full.data);
  if (named.length) return { ok: false, problems: named };
  const built = BUILT_SCHEMA.safeParse(full.data);
  if (!built.success) return { ok: false, problems: issuesToProblems(value, built.error.issues) };
  return { ok: true, problems: [], value: built.data };
}
