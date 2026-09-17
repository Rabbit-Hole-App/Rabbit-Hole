import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export function MathText({ expression, display = false }) {
  const html = useMemo(() => katex.renderToString(expression, {
    displayMode: display, throwOnError: false, trust: false,
    maxSize: 10, maxExpand: 1000, strict: 'ignore', output: 'htmlAndMathml',
  }), [expression, display]);
  const Tag = display ? 'div' : 'span';
  return <Tag data-chat-math={display ? 'display' : 'inline'} className={display ? 'my-3 max-w-full overflow-x-auto overflow-y-hidden py-1 [&_.katex-display]:m-0 [&_.katex-display]:text-left' : ''} dangerouslySetInnerHTML={{ __html: html }} />;
}

// Preserve literal code. Unfinished delimiters remain plain text during streaming.
export function tokenizeMath(text) {
  const math = [];
  const source = String(text).replace(/```[\s\S]*?(?:```|$)|`[^`\n]*`|\\\[[\s\S]*?\\\]|\\\([^\n]*?\\\)|\$\$[\s\S]*?\$\$|(?<![\\$])\$(?![$\s])(?:\\.|[^$\\\n])*?(?<!\s)\$(?![\d$])/g, value => {
    if (value.startsWith('`')) return value;
    const display = value.startsWith('$$') || value.startsWith('\\[');
    const width = value.startsWith('$') && !display ? 1 : 2;
    const token = `\uE000${math.length}\uE001`;
    math.push({ expression: value.slice(width, -width), display });
    return display ? `\n${token}\n` : token;
  });
  return { source, math };
}
