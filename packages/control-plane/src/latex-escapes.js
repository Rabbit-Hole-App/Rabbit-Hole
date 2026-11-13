// A model that writes a LaTeX command inside a JSON string with ONE backslash (\frac, \theta, \times, \to, \neq, \rho, \beta) gets a valid JSON escape
// instead: \f form feed, \t tab, \n newline, \r carriage return, \b backspace. JSON.parse accepts all of them, so the card body held a control character
// where the backslash belongs and KaTeX showed "rac{1}{2}" (logistic-regression pack, release 123). A command the JSON grammar does not know
// (\alpha, \sigma, \lambda) makes JSON.parse throw instead; parseModelJson reads that answer with the stray backslashes doubled.
//
// shortcut: form feed and backspace are restored wherever they appear (no text needs them); tab, carriage return and newline only inside a $...$ span
// and only before a known command, because prose and code legitimately contain them. Upgrade when a command outside these lists shows up in a pack.

// Each list is what FOLLOWS the escape's letter: JSON read \t out of \theta, so the text after the tab is "heta".
const AFTER = [
  [/\t/g, 'heta|imes|au|ext|extbf|extit|extrm|extsf|an|anh|op|riangle|ilde|herefore|frac|binom|o|hinspace|hickspace', '\\t'],
  [/\r/g, 'ho|ight|ightarrow|angle|ceil|floor|m|Vert|vert|ightleftharpoons|brace|brack', '\\r'],
  [/\n/g, 'eq|abla|eg|ot|otin|e|mid|less|gtr|leq|geq|rightarrow|u|ewline|onumber', '\\n'],
].map(([control, names, restored]) => ({ pattern: new RegExp(`${control.source}(?=(?:${names})(?![A-Za-z]))`, 'g'), restored }));
const MATH = /\$\$[\s\S]*?\$\$|\$[^$]*\$/g;

export function restoreLatexEscapes(text) {
  if (typeof text !== 'string' || !/[\t\n\r\b\f]/.test(text)) return text;
  const noControl = text.replace(/\f(?=[A-Za-z])/g, '\\f').replace(/\x08(?=[A-Za-z])/g, '\\b'); // never legitimate text
  return noControl.replace(MATH, span => AFTER.reduce((out, { pattern, restored }) => out.replace(pattern, () => restored), span));
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
