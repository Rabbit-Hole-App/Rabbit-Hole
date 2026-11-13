// A model that writes a LaTeX command inside a JSON string with ONE backslash (\frac, \theta, \times, \neq, \rho, \beta) gets a valid JSON escape
// instead: \f form feed, \t tab, \n newline, \r carriage return, \b backspace. JSON.parse accepts all of them, so the card body held a control character
// where the backslash belongs and KaTeX showed "rac{1}{2}" (logistic-regression pack, release 123). The model does this intermittently: the same pack's
// sigmoid-derivative card has \sigma, \frac and \times intact, and nothing in our code between the reply and the saved body unescapes anything.
// A command the JSON grammar does not know (\alpha, \sigma, \lambda) makes JSON.parse throw instead; parseModelJson reads that answer with the stray
// backslashes doubled.
//
// Rule (no command list): inside a $...$ or $$...$$ span, a control character among \f \t \r \b that is immediately followed by a letter is a lost
// backslash, and becomes "\" + its letter. So \f+"rac" -> \frac, \t+"heta" -> \theta, \r+"ho" -> \rho, \b+"eta" -> \beta.
// shortcut: a newline is the one control character that is also real text. Inside an inline $...$ span a newline followed by a letter is restored
// (\n+"eq" -> \neq); inside a $$...$$ display span only when the character before it is a space (a real line break in display maths follows the end of a line,
// not a space). A lost \n right after a non-space ("x\neq y" -> "x", newline, "eq y") in display maths stays a newline; upgrade if a pack shows one.

const LOST = { '\f': 'f', '\t': 't', '\r': 'r', '\b': 'b' };
const MATH = /\$\$[\s\S]*?\$\$|\$[^$]*\$/g;

export function restoreLatexEscapes(text) {
  if (typeof text !== 'string' || !/[\f\t\r\b\n]/.test(text)) return text;
  return text.replace(MATH, span => {
    const display = span.startsWith('$$');
    return span.replace(/[\f\t\r\b](?=[A-Za-z])/g, control => `\\${LOST[control]}`)
      .replace(display ? /(?<= )\n(?=[A-Za-z])/g : /\n(?=[A-Za-z])/g, '\\n');
  });
}

export function restoreLatexIn(value) {
  if (typeof value === 'string') return restoreLatexEscapes(value);
  if (Array.isArray(value)) return value.map(restoreLatexIn);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, restoreLatexIn(item)]));
  return value;
}

// JSON.parse, then the restore. A reply with a backslash the grammar rejects is read once more with each such backslash doubled.
export function parseModelJson(text) {
  let value;
  try { value = JSON.parse(text); } catch (error) {
    const lenient = String(text).replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\');
    if (lenient === text) throw error;
    value = JSON.parse(lenient);
  }
  return restoreLatexIn(value);
}
