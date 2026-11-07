import { afterPaint, usePerf } from './learn-perf.js';
import { useEffect, useRef, useState } from 'react';

// Text-authored diagrams: the agent writes mermaid, the browser renders it.
// The source view is highlighted with Shiki so it matches the code blocks.
// Both follow the app's theme toggle.

// The app's own toggle owns dark mode (.dark on <html>), so the diagram must
// follow it rather than the OS; light ink on a dark canvas was invisible.
const isDark = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

const palette = dark => dark
  ? { primaryColor: '#2a2a28', primaryTextColor: '#e9e9e7', primaryBorderColor: '#4f8ff7', lineColor: '#8b93a6',
      secondaryColor: '#33322f', tertiaryColor: '#33322f', background: '#1f1f1d', mainBkg: '#2a2a28',
      textColor: '#e9e9e7', nodeTextColor: '#e9e9e7', labelTextColor: '#e9e9e7',
      actorBkg: '#2a2a28', actorTextColor: '#e9e9e7', actorLineColor: '#8b93a6',
      signalColor: '#c9c9c5', signalTextColor: '#e9e9e7', noteBkgColor: '#33322f', noteTextColor: '#e9e9e7',
      sequenceNumberColor: '#1f1f1d', fontSize: '13px' }
  : { primaryColor: '#ffffff', primaryTextColor: '#37352f', primaryBorderColor: '#2383e2', lineColor: '#94a3b8',
      secondaryColor: '#f7f7f5', tertiaryColor: '#f7f7f5', textColor: '#37352f', nodeTextColor: '#37352f',
      labelTextColor: '#37352f', actorBkg: '#ffffff', actorTextColor: '#37352f', actorLineColor: '#94a3b8',
      signalColor: '#64748b', signalTextColor: '#37352f', noteBkgColor: '#f7f7f5', noteTextColor: '#37352f',
      fontSize: '13px' };

let loaded;
function mermaidOnce(dark) {
  if (!loaded) loaded = import('mermaid').then(({ default: mermaid }) => mermaid);
  return loaded.then(mermaid => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict', // no click handlers or raw HTML from lesson text
      theme: 'base',
      darkMode: dark,
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      themeVariables: palette(dark),
    });
    return mermaid;
  });
}

export function MermaidSource({ code }) {
  const [html, setHtml] = useState('');
  useEffect(() => {
    let live = true;
    import('shiki').then(async ({ codeToHtml }) => {
      const marked = await codeToHtml(code, { lang: 'mermaid', theme: isDark() ? 'github-dark' : 'github-light' });
      if (live) setHtml(marked);
    }).catch(() => { if (live) setHtml(''); });
    return () => { live = false; };
  }, [code]);
  return html
    ? <div className="mermaid-source overflow-x-auto rounded-lg border border-line p-2 text-[11px] leading-5" dangerouslySetInnerHTML={{ __html: html }} />
    : <pre className="overflow-x-auto rounded-lg border border-line bg-code p-2 font-mono text-[11px] leading-5">{code}</pre>;
}

export default function MermaidDiagram({ code }) {
  const report = usePerf();
  const host = useRef(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setError('');
    mermaidOnce().then(async mermaid => {
      const id = `mermaid-${Math.abs([...code].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) | 0, 7))}`;
      const { svg } = await mermaid.render(id, code);
      if (live && host.current) { host.current.innerHTML = svg; afterPaint(() => { report('content'); report('interactive'); }); }
    }).catch(problem => { if (live) setError(problem.message.split('\n')[0]); });
    return () => { live = false; };
  }, [code]);
  if (error) return <div className="grid h-full place-content-center p-4 text-center text-xs text-red-700">{error}</div>;
  return <div ref={host} data-mermaid className="flex h-full w-full items-center justify-center overflow-auto [&_svg]:max-w-full" />;
}
