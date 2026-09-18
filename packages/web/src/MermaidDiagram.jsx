import { useEffect, useRef, useState } from 'react';

// Text-authored diagrams: the agent writes mermaid, the browser renders it.
// The source view is highlighted with Shiki so it matches the code blocks.
// ponytail: one light theme; a dark variant when the canvas gets one.

let started;
function mermaidOnce() {
  if (!started) started = import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict', // no click handlers or raw HTML from lesson text
      theme: 'base',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      themeVariables: {
        primaryColor: '#ffffff', primaryTextColor: '#37352f', primaryBorderColor: '#2383e2',
        lineColor: '#94a3b8', secondaryColor: '#f7f7f5', tertiaryColor: '#f7f7f5', fontSize: '13px',
      },
    });
    return mermaid;
  });
  return started;
}

export function MermaidSource({ code }) {
  const [html, setHtml] = useState('');
  useEffect(() => {
    let live = true;
    import('shiki').then(async ({ codeToHtml }) => {
      const marked = await codeToHtml(code, { lang: 'mermaid', theme: 'github-light' });
      if (live) setHtml(marked);
    }).catch(() => { if (live) setHtml(''); });
    return () => { live = false; };
  }, [code]);
  return html
    ? <div className="mermaid-source overflow-x-auto rounded-lg border border-line p-2 text-[11px] leading-5" dangerouslySetInnerHTML={{ __html: html }} />
    : <pre className="overflow-x-auto rounded-lg border border-line bg-code p-2 font-mono text-[11px] leading-5">{code}</pre>;
}

export default function MermaidDiagram({ code }) {
  const host = useRef(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setError('');
    mermaidOnce().then(async mermaid => {
      const id = `mermaid-${Math.abs([...code].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) | 0, 7))}`;
      const { svg } = await mermaid.render(id, code);
      if (live && host.current) host.current.innerHTML = svg;
    }).catch(problem => { if (live) setError(problem.message.split('\n')[0]); });
    return () => { live = false; };
  }, [code]);
  if (error) return <div className="grid h-full place-content-center p-4 text-center text-xs text-red-700">{error}</div>;
  return <div ref={host} data-mermaid className="flex h-full w-full items-center justify-center overflow-auto [&_svg]:max-w-full" />;
}
