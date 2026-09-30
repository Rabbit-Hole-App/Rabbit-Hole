import React, { Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { CodeBlock } from '../ui.jsx';
import { colorLine } from '../code.jsx';

export function mountCode(container) {
  const lines = container.textContent.trim().split('\n');
  createRoot(container).render(<CodeBlock>{lines.map((line, i) => <Fragment key={i}>{colorLine(line)}{i < lines.length - 1 ? '\n' : ''}</Fragment>)}</CodeBlock>);
}
