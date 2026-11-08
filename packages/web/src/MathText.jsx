import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export function MathText({ expression, display = false }) {
  // One object per expression: React 19 rewrites dangerouslySetInnerHTML whenever the object changes, and a rewrite under a
  // press (a canvas equation being clicked) swallows the click.
  const html = useMemo(() => ({ __html: katex.renderToString(expression, {
    displayMode: display, throwOnError: false, trust: false,
    maxSize: 10, maxExpand: 1000, strict: 'ignore', output: 'htmlAndMathml',
  }) }), [expression, display]);
  const Tag = display ? 'div' : 'span';
  return <Tag data-chat-math={display ? 'display' : 'inline'} className={display ? 'my-3 max-w-full overflow-x-auto overflow-y-hidden py-1 [&_.katex-display]:m-0 [&_.katex-display]:text-left' : ''} dangerouslySetInnerHTML={html} />;
}
