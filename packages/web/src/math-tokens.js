// The card's maths delimiters, shared by Md.jsx (prose), the TutorDiagram labels and their validator (tutor-diagrams/spec.js). Import-free: the
// control plane imports spec.js.
// Preserve literal code. Unfinished delimiters remain plain text during streaming.
export function tokenizeMath(text) {
  const math = [];
  const source = String(text).replace(/```[\s\S]*?(?:```|$)|`[^`\n]*`|\\\[[\s\S]*?\\\]|\\\([^\n]*?\\\)|\$\$[\s\S]*?\$\$|(?<![\\$])\$(?![$\s])(?:\\.|[^$\\\n])*?(?<!\s)\$(?![\d$])/g, value => {
    if (value.startsWith('`')) return value;
    const display = value.startsWith('$$') || value.startsWith('\\[');
    const width = value.startsWith('$') && !display ? 1 : 2;
    const token = `\uE000${math.length}\uE001`;
    math.push({ expression: value.slice(width, -width), display, raw: value });
    return display ? `\n${token}\n` : token;
  });
  return { source, math };
}
