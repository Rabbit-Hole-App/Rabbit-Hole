import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MathfieldElement } from 'mathlive';
import katex from 'katex';
import { EQUATION_PALETTE } from './canvas-equation.js';

// An equation being edited (docs/features/canvas-equations.md). This file is the only one that imports MathLive, and
// AdaptiveCanvas loads it lazily the first time an equation is edited: the canvas's own bundle never carries MathLive.
// Its fonts are KaTeX's, already declared by KaTeX's stylesheet (MathText.jsx), so it fetches none; no sounds, no
// virtual keyboard, no menu - the palette above the field is the one way to build.
MathfieldElement.fontsDirectory = null;
MathfieldElement.soundsDirectory = null;

const CSS = `
math-field[data-equation-field] { display: block; font-size: 1.21em; min-width: 3em; padding: 0; border: 0; background: transparent; color: inherit; outline: none; --caret-color: #2383e2; --selection-background-color: rgb(35 131 226 / 0.2); --placeholder-color: currentColor; --placeholder-opacity: 0.35; --contains-highlight-background-color: transparent; }
math-field[data-equation-field]::part(menu-toggle), math-field[data-equation-field]::part(virtual-keyboard-toggle) { display: none; }
math-field[data-equation-field]::part(content) { padding: 2px 4px; }
`;
// The field's LaTeX as KaTeX reads it: MathLive's own macros (\differentialD for a typed dx) expanded, empty slots dropped.
const sourceOf = field => field.getValue('latex-expanded').replace(/\\placeholder\{\}/g, '').trim();
// Each button's picture, rendered once: a fresh innerHTML object per render would rewrite it under a press (MathText.jsx).
const LABELS = new Map(EQUATION_PALETTE.flatMap(group => group.items).map(item => [item.label, { __html: katex.renderToString(item.label, { throwOnError: false, output: 'html' }) }]));
const LATEX_TAB = 'latex';

// latex in, the field's source out on finish: when focus leaves the field and its palette (a click away, Esc, a tab
// away). Typing or pasting LaTeX works in the field itself; the LaTeX tab shows the source as plain text to edit.
export default function EquationEditor({ latex, zoom, onDone }) {
  const root = useRef(null), field = useRef(null), finished = useRef(false);
  const [tab, setTab] = useState(EQUATION_PALETTE[0].id);
  const [source, setSource] = useState(latex);
  // Under the equation instead when there is no room above it on the canvas (an equation near the top edge), checked
  // again when a taller tab (Greek, Matrix) opens.
  const [below, setBelow] = useState(false);
  useLayoutEffect(() => {
    const surface = root.current.closest('[data-canvas-surface]')?.getBoundingClientRect();
    if (!below && surface && root.current.querySelector('[data-equation-palette]').getBoundingClientRect().top < surface.top) setBelow(true);
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const mf = field.current;
    mf.mathVirtualKeyboardPolicy = 'manual';
    mf.menuItems = [];
    mf.placeholder = '\\text{Equation}';
    mf.value = latex;
    const changed = () => setSource(sourceOf(mf));
    mf.addEventListener('input', changed);
    mf.focus();
    mf.executeCommand('moveToMathfieldEnd');
    return () => mf.removeEventListener('input', changed);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    onDone(sourceOf(field.current));
  };
  const insert = template => {
    field.current.insert(template, { format: 'latex', selectionMode: 'placeholder', focus: true });
    setSource(sourceOf(field.current));
  };
  const group = EQUATION_PALETTE.find(entry => entry.id === tab);
  const tabClass = on => `rounded px-1.5 py-0.5 text-[11px] ${on ? 'bg-hover text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink'}`;
  return (
    <div ref={root} data-equation-editor data-keep-focus className="relative"
      onBlur={event => { if (!root.current.contains(event.relatedTarget)) finish(); }}>
      <style>{CSS}</style>
      {/* Counter-scaled so it reads the same at any zoom. A press on a button keeps the caret in the field. */}
      <div data-equation-palette role="toolbar" aria-label="Equation palette" style={{ transform: `scale(${1 / zoom})` }}
        className={`absolute left-0 z-30 w-max max-w-[420px] ${below ? 'top-full mt-2 origin-top-left' : 'bottom-full mb-2 origin-bottom-left'} rounded-lg border border-line bg-white p-1 text-ink shadow-md`}
        onPointerDown={event => { if (event.target.tagName !== 'INPUT') event.preventDefault(); event.stopPropagation(); }}>
        <div role="tablist" aria-label="Equation parts" className="flex gap-0.5 border-b border-line pb-1">
          {EQUATION_PALETTE.map(entry => (
            <button key={entry.id} type="button" role="tab" aria-selected={tab === entry.id} title={entry.name} onClick={() => setTab(entry.id)} className={tabClass(tab === entry.id)}>{entry.tab}</button>
          ))}
          <button type="button" role="tab" aria-selected={tab === LATEX_TAB} title="Type or paste LaTeX" onClick={() => setTab(LATEX_TAB)} className={tabClass(tab === LATEX_TAB)}>LaTeX</button>
        </div>
        {tab === LATEX_TAB
          ? <input data-equation-source aria-label="LaTeX source" autoFocus spellCheck={false} value={source} placeholder="\frac{a}{b}"
              onChange={event => { setSource(event.target.value); field.current.setValue(event.target.value, { silenceNotifications: true }); }}
              className="mt-1 h-7 w-[340px] rounded border border-line bg-white px-2 font-mono text-xs text-ink outline-none focus:border-ink-3" />
          : <div role="group" aria-label={group.name} className="mt-1 flex flex-wrap gap-0.5">
              {group.items.map(item => (
                <button key={item.title} type="button" title={item.title} aria-label={item.title} onClick={() => insert(item.insert)}
                  className="flex min-h-8 min-w-8 items-center justify-center rounded px-1 py-0.5 text-[16px] text-ink hover:bg-hover"
                  dangerouslySetInnerHTML={LABELS.get(item.label)} />
              ))}
            </div>}
      </div>
      <math-field ref={field} data-equation-field="" />
    </div>
  );
}
