import { useEffect, useRef, useState } from 'react';
import { AlignCenter, AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalSpaceBetween, AlignLeft, AlignRight, AlignStartHorizontal, AlignStartVertical, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, AlignVerticalSpaceBetween, ArrowDown, ArrowUp, Bold, BringToFront, CornerDownRight, Group, Italic, Lock, LockOpen, Minus, PaintRoller, Pipette, Plus, SendToBack, Slash, Spline, Square, Squircle, Underline, Ungroup } from 'lucide-react';
import { DASH_STYLES, HEADS, OPACITIES, TEXT_LEVELS, dashStyle } from './learn-style-panel.js';
import { FONTS, FONT_KEYS, SIZE_PRESETS, fontSize as validSize, hexColor } from './learn-rich-text.js';
import { CODE_LANGS } from './code-lang.js';

export const COLORS = ['#37352f', '#2383e2', '#b42318', '#1a7f37', '#f59e0b', '#7c3aed'];
export const WIDTHS = [2, 3.5, 6];
const MIXED = 'mixed';

// Colour, thickness and dash used to live in the tool column, which had grown to 26 buttons and scrolled. They sit in
// their own island, beside the tools, shown only while a drawing tool is armed or something styleable is selected
// (learn-style-panel.js panelFor says which rows). Every row shows the selection's own value, or Mixed when the
// selection disagrees - never one object's value as if it were everyone's (docs/features/canvas-editing.md).
// The whole panel is data-keep-focus and swallows pointerdown, so a press here restyles the text being edited without
// taking its caret or selection; its two fields (hex, size) hand the focus back when they are done.

// The accessible name is the plain control name (screen readers and checks find a control by it); the tooltip adds
// the shortcut (keys) or a longer description (tip).
const Btn = ({ label, keys = null, tip = null, pressed = undefined, onClick, children, className = '', ...rest }) => (
  <button type="button" title={tip || (keys ? `${label} (${keys})` : label)} aria-label={label} aria-pressed={pressed === MIXED ? 'mixed' : pressed} onClick={onClick} {...rest}
    className={`flex h-6 min-w-7 items-center justify-center rounded-md px-1 text-[11px] ${pressed === true ? 'bg-hover text-ink' : pressed === MIXED ? 'bg-hover/50 text-ink-2 outline outline-1 outline-dashed outline-line-strong' : 'text-ink-2 hover:bg-hover hover:text-ink'} ${className}`}>{children}</button>
);

const Row = ({ label, mixed = false, children }) => (
  <div className="flex flex-col gap-0.5 px-1 py-1">
    <div className="flex items-center justify-between text-[10px] font-semibold tracking-wider text-ink-3 uppercase">
      <span>{label}</span>{mixed && <span data-mixed className="font-normal tracking-normal normal-case">Mixed</span>}
    </div>
    <div className="flex flex-wrap items-center gap-0.5">{children}</div>
  </div>
);

// Swatches, a picker for any colour and a hex field. value 'mixed' presses nothing.
// name labels the swatches when it differs from the row heading ('Color #2383e2' under Stroke, as it always was;
// 'Text #2383e2' under Text color, so a lookup of 'Color #…' finds the one stroke swatch). custom adds the picker and the
// hex field; a comment pin keeps to the six colours.
function ColorRow({ label, name = label, value, onPick, none = null, tint = 1, refocus, custom: open = true }) {
  const picker = useRef(null);
  const [hex, setHex] = useState(value && value !== MIXED ? value : '');
  useEffect(() => { setHex(value && value !== MIXED ? value : ''); }, [value]);
  // The native picker reports once it closes, so one choice is one undo step.
  useEffect(() => {
    const input = picker.current;
    if (!input) return undefined;
    const change = () => { onPick(input.value); refocus?.(); };
    input.addEventListener('change', change);
    return () => input.removeEventListener('change', change);
  });
  const commitHex = () => { const valid = hexColor(hex); if (valid && valid !== value) onPick(valid); else setHex(value && value !== MIXED ? value : ''); refocus?.(); };
  const custom = value && value !== MIXED && !COLORS.includes(value);
  return (
    <Row label={label} mixed={value === MIXED}>
      {none && <Btn label={none} pressed={value === null} onClick={() => onPick(null)}>
        <span className="h-3.5 w-3.5 rounded-sm border border-line bg-white"><svg viewBox="0 0 14 14" aria-hidden="true"><line x1="1" y1="13" x2="13" y2="1" stroke="#b42318" strokeWidth="1.5" /></svg></span>
      </Btn>}
      {COLORS.map(color => (
        <Btn key={color} label={`${name} ${color}`} pressed={value === color} onClick={() => onPick(color)}>
          <span style={{ background: color, opacity: tint }} className={`h-3.5 w-3.5 rounded-full ${value === color ? 'ring-2 ring-[#2383e2] ring-offset-1' : ''}`} />
        </Btn>
      ))}
      {open && <><label title={`Pick any ${label.toLowerCase()}`} className="relative flex h-6 min-w-7 cursor-pointer items-center justify-center rounded-md hover:bg-hover">
        <span aria-hidden="true" style={custom ? { background: value } : { background: 'conic-gradient(#b42318, #f59e0b, #1a7f37, #2383e2, #7c3aed, #b42318)' }}
          className={`h-3.5 w-3.5 rounded-full ${custom ? 'ring-2 ring-[#2383e2] ring-offset-1' : ''}`} />
        <input ref={picker} type="color" aria-label={`Custom ${label.toLowerCase()}`} value={value && value !== MIXED ? value : '#37352f'} onChange={() => {}}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
      </label>
      <input type="text" aria-label={`${label} hex`} placeholder={value === MIXED ? 'Mixed' : '#hex'} value={hex} spellCheck={false} maxLength={7}
        onChange={event => setHex(event.target.value)} onBlur={commitHex}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commitHex(); } if (event.key === 'Escape') { event.stopPropagation(); setHex(value && value !== MIXED ? value : ''); refocus?.(); } }}
        className="h-6 w-[4.6rem] rounded-md border border-line px-1.5 font-mono text-[11px] outline-none focus:border-ink-3" /></>}
    </Row>
  );
}

// 0-100%: a drag is one undo step (onStart), its values follow live.
function Slider({ label, value, onStart, onValue }) {
  const shown = value === MIXED || value == null ? 100 : Math.round(value * 100);
  return (
    <div className="flex w-full items-center gap-2 pt-0.5">
      <input type="range" min={0} max={100} step={1} value={shown} aria-label={label} aria-valuetext={value === MIXED ? 'Mixed' : `${shown}%`}
        onPointerDown={onStart} onKeyDown={event => { if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') onStart(); }}
        onChange={event => onValue(Number(event.target.value) / 100)} className="min-w-0 flex-1 accent-[#2383e2]" />
      <span className="w-9 text-right text-[11px] text-ink-2 tabular-nums">{value === MIXED ? '—' : `${shown}%`}</span>
    </div>
  );
}

const headIcon = kind => (
  <svg width="18" height="10" viewBox="0 0 18 10" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="5" x2={kind === 'none' ? 17 : 12} y2="5" />
    {kind === 'arrow' && <path d="M12 1.5 16 5l-4 3.5" />}
    {kind === 'triangle' && <path d="M12 1.5 17 5l-5 3.5Z" fill="currentColor" />}
    {kind === 'dot' && <circle cx="14" cy="5" r="2.6" fill="currentColor" />}
    {kind === 'bar' && <line x1="14" y1="1" x2="14" y2="9" />}
  </svg>
);

// The font size field and its steps: a typed number (8-160), the presets one step down or up.
function SizeField({ value, onSize, refocus }) {
  const [draft, setDraft] = useState(value === MIXED || value == null ? '' : String(value));
  useEffect(() => { setDraft(value === MIXED || value == null ? '' : String(value)); }, [value]);
  const commit = () => { const valid = validSize(draft); if (valid && valid !== value) onSize(valid); else setDraft(value === MIXED || value == null ? '' : String(value)); refocus?.(); };
  const step = up => {
    const now = value === MIXED || value == null ? 14 : value;
    const next = up ? SIZE_PRESETS.find(size => size > now) ?? SIZE_PRESETS[SIZE_PRESETS.length - 1] : [...SIZE_PRESETS].reverse().find(size => size < now) ?? SIZE_PRESETS[0];
    onSize(next);
  };
  return (
    <>
      <Btn label="Smaller font size" onClick={() => step(false)}><Minus size={12} /></Btn>
      <input type="text" inputMode="decimal" aria-label="Font size" list="canvas-font-sizes" placeholder={value === MIXED ? 'Mixed' : ''} value={draft}
        onChange={event => setDraft(event.target.value)} onBlur={commit}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(); } if (event.key === 'Escape') { event.stopPropagation(); setDraft(value === MIXED || value == null ? '' : String(value)); refocus?.(); } }}
        className="h-6 w-12 rounded-md border border-line px-1.5 text-center text-[11px] tabular-nums outline-none focus:border-ink-3" />
      <datalist id="canvas-font-sizes">{SIZE_PRESETS.map(size => <option key={size} value={size} />)}</datalist>
      <Btn label="Larger font size" onClick={() => step(true)}><Plus size={12} /></Btn>
    </>
  );
}

const rule = <div className="mx-1 my-0.5 h-px bg-line" />;

// panel: what applies (learn-style-panel.js panelFor). values: what the selection holds (or the armed defaults).
// on: the handlers, each restyling the selection - or the open text's characters - and arming the default.
export default function StylePanel({ side = 'right', colorOnly = false, panel = {}, values = {}, on = {}, flags = {} }) {
  const refocus = on.refocus;
  if (colorOnly) {
    // A comment pin has a colour and nothing else (owner, 2026-10-08).
    return (
      <div role="group" aria-label="Style" data-keep-focus onPointerDown={event => event.stopPropagation()}
        className={`absolute top-1/2 ${side === 'left' ? 'left-24' : 'right-24'} z-20 w-[232px] -translate-y-1/2 rounded-xl border border-line bg-white p-1 shadow-md`}>
        <ColorRow label="Color" value={values.color} onPick={on.color} custom={false} />
      </div>
    );
  }
  const text = panel.typography;
  return (
    <div role="group" aria-label="Style" data-keep-focus data-style-panel
      onPointerDown={event => { event.stopPropagation(); if (!event.target.closest('input')) event.preventDefault(); }}
      // Centred in the gutter, and never as tall as the floating bottom strip on its side (the minimap and zoom on the
      // left, the hooks on the right): it scrolls inside instead of running under them.
      style={{ maxHeight: `calc(100% - 2 * var(${side === 'left' ? '--chrome-left' : '--chrome-right'}, 0px) - 16px)` }}
      className={`absolute top-1/2 ${side === 'left' ? 'left-24' : 'right-24'} z-20 flex w-[244px] -translate-y-1/2 flex-col overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-md @max-[640px]:static @max-[640px]:col-span-3 @max-[640px]:mt-1 @max-[640px]:max-h-[38vh]! @max-[640px]:w-full @max-[640px]:translate-y-0`}>
      {panel.locked?.length > 0 && (
        <div data-locked-note className="flex items-center justify-between gap-2 px-1 py-1 text-xs text-ink-2">
          <span className="flex items-center gap-1"><Lock size={12} />{panel.locked.length === 1 ? 'Locked' : `${panel.locked.length} locked`}</span>
          <button type="button" onClick={on.lock} className="rounded-md px-2 py-0.5 text-xs font-medium text-ink hover:bg-hover">Unlock</button>
        </div>
      )}
      {panel.stroke && <ColorRow label={panel.paper ? 'Note' : 'Stroke'} name="Color" value={values.stroke} onPick={on.color} none={panel.noStroke ? 'No stroke' : null} refocus={refocus} />}
      {panel.fill && <>
        {/* Fill keeps the Excalidraw habit of a light tint by default (25%), now adjustable. */}
        <ColorRow label="Fill" value={values.fill} onPick={on.fill} none="No fill" tint={0.35} refocus={refocus} />
        <div className="px-1 pb-1"><Slider label="Fill opacity" value={values.fillOpacity} onStart={on.start} onValue={on.fillOpacity} /></div>
      </>}
      {panel.widths && (
        <Row label="Stroke width" mixed={values.width === MIXED || values.dash === MIXED}>
          {WIDTHS.map(width => <Btn key={width} label={`Stroke width ${width}`} pressed={values.width === width} onClick={() => on.width(width)}><span style={{ height: width }} className="w-4 rounded-full bg-current" /></Btn>)}
          <span className="mx-0.5 h-4 w-px bg-line" />
          {DASH_STYLES.map(dash => (
            <Btn key={dash} label={`${dash} lines`} pressed={values.dash !== MIXED && dashStyle(values.dash) === dash} onClick={() => on.dash(dash)}>
              <svg width="16" height="4" aria-hidden="true"><line x1="0" y1="2" x2="16" y2="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray={dash === 'dashed' ? '4 3' : dash === 'dotted' ? '0 4' : undefined} /></svg>
            </Btn>
          ))}
        </Row>
      )}
      {panel.heads && <>
        {[['start', 'Start'], ['end', 'End']].map(([end, label]) => (
          <Row key={end} label={`${label} arrowhead`} mixed={values[`${end}Head`] === MIXED}>
            {HEADS.map(kind => (
              <Btn key={kind} label={`${label} arrowhead: ${kind}`} pressed={values[`${end}Head`] === kind} onClick={() => on.head(end, kind)}>
                <span className={end === 'start' ? '-scale-x-100' : ''}>{headIcon(kind)}</span>
              </Btn>
            ))}
          </Row>
        ))}
      </>}
      {panel.route && (
        <Row label="Line">
          {[['straight', Slash, 'Straight line'], ['curved', Spline, 'Curved line'], ['elbow', CornerDownRight, 'Elbow line']].map(([value, Icon, label]) => (
            <Btn key={value} label={label} pressed={panel.routeValue === value} onClick={() => on.route(value)}><Icon size={14} strokeWidth={1.7} /></Btn>
          ))}
        </Row>
      )}
      {text && <>
        {(panel.stroke || panel.fill || panel.widths || panel.heads || panel.route) && rule}
        <Row label="Text style">
          {TEXT_LEVELS.map(entry => <Btn key={entry.id} label={entry.label} tip={entry.label === 'Text' ? 'Body text' : `Heading ${entry.label.slice(1)}`} pressed={values.level === entry.id} onClick={() => on.level(entry.id)} style={{ fontWeight: entry.weight }}>{entry.label}</Btn>)}
        </Row>
        <Row label="Font" mixed={values.font === MIXED}>
          {FONT_KEYS.map(key => <Btn key={key} label={`${FONTS[key].label} font`} pressed={values.font === key} onClick={() => on.font(key)} style={{ fontFamily: FONTS[key].stack }} className="px-2">{FONTS[key].label}</Btn>)}
        </Row>
        <Row label="Font size" mixed={values.size === MIXED}>
          <SizeField value={values.size} onSize={on.size} refocus={refocus} />
          <span className="mx-0.5 h-4 w-px bg-line" />
          <Btn label="Bold" keys="Ctrl B" pressed={values.b} onClick={() => on.toggle('b')} data-format="b"><Bold size={13} /></Btn>
          <Btn label="Italic" keys="Ctrl I" pressed={values.i} onClick={() => on.toggle('i')} data-format="i"><Italic size={13} /></Btn>
          <Btn label="Underline" keys="Ctrl U" pressed={values.u} onClick={() => on.toggle('u')} data-format="u"><Underline size={13} /></Btn>
        </Row>
        <ColorRow label="Text color" name="Text" value={values.textColor} onPick={on.textColor} refocus={refocus} />
        <Row label="Align" mixed={values.align === MIXED || values.valign === MIXED}>
          {[['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]].map(([value, Icon]) => <Btn key={value} label={`Align ${value}`} pressed={values.align === value} onClick={() => on.align(value)}><Icon size={13} /></Btn>)}
          {panel.valign && <>
            <span className="mx-0.5 h-4 w-px bg-line" />
            {[['top', AlignVerticalJustifyStart], ['middle', AlignVerticalJustifyCenter], ['bottom', AlignVerticalJustifyEnd]].map(([value, Icon]) => <Btn key={value} label={`Text to the ${value}`} pressed={values.valign === value} onClick={() => on.valign(value)}><Icon size={13} /></Btn>)}
          </>}
        </Row>
        {panel.code && (
          <Row label="Show as">
            {[['text', 'Text'], ['code', 'Code']].map(([value, label]) => <Btn key={value} label={value === 'code' ? 'Show as code' : 'Show as text'} pressed={(values.mode || 'text') === value} onClick={() => on.mode(value)} className={`px-2 ${value === 'code' ? 'font-mono' : ''}`}>{label}</Btn>)}
            {values.mode === 'code' && (
              <select aria-label="Code language" title="Code language" value={values.lang} onChange={event => on.lang(event.target.value)}
                className="ml-1 cursor-pointer rounded border border-line bg-white px-1 py-0.5 text-[11px] text-ink-2 outline-none hover:bg-hover hover:text-ink">
                {CODE_LANGS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            )}
          </Row>
        )}
      </>}
      {rule}
      <Row label="Opacity" mixed={values.opacity === MIXED}>
        {OPACITIES.map(value => (
          <Btn key={value} label={`Opacity ${Math.round(value * 100)}%`} pressed={values.opacity === value} onClick={() => on.opacity(value)}>
            <span style={{ background: values.color && values.color !== MIXED ? values.color : '#37352f', opacity: value }} className="h-3.5 w-3.5 rounded-full" />
          </Btn>
        ))}
        <Slider label="Opacity" value={values.opacity} onStart={on.start} onValue={on.opacitySlide} />
      </Row>
      {panel.corners && (
        <Row label="Corners" mixed={values.round === MIXED}>
          <Btn label="Sharp corners" pressed={values.round === MIXED ? undefined : !values.round} onClick={() => on.round(false)}><Square size={14} strokeWidth={1.7} /></Btn>
          <Btn label="Rounded corners" pressed={values.round === MIXED ? undefined : !!values.round} onClick={() => on.round(true)}><Squircle size={14} strokeWidth={1.7} /></Btn>
        </Row>
      )}
      {panel.order && (
        <Row label="Layers">
          <Btn label="Send to back" keys="Ctrl Shift [" onClick={() => on.order('back')}><SendToBack size={14} strokeWidth={1.7} /></Btn>
          <Btn label="Send backward" keys="Ctrl [" onClick={() => on.order('backward')}><ArrowDown size={14} strokeWidth={1.7} /></Btn>
          <Btn label="Bring forward" keys="Ctrl ]" onClick={() => on.order('forward')}><ArrowUp size={14} strokeWidth={1.7} /></Btn>
          <Btn label="Bring to front" keys="Ctrl Shift ]" onClick={() => on.order('front')}><BringToFront size={14} strokeWidth={1.7} /></Btn>
        </Row>
      )}
      {panel.arrange && (
        <Row label="Arrange">
          {[['left', AlignStartVertical, 'Align left'], ['center', AlignCenterVertical, 'Align center'], ['right', AlignEndVertical, 'Align right'], ['top', AlignStartHorizontal, 'Align top'], ['middle', AlignCenterHorizontal, 'Align middle'], ['bottom', AlignEndHorizontal, 'Align bottom']].map(([how, Icon, label]) => <Btn key={how} label={label} onClick={() => on.arrange(how)}><Icon size={14} strokeWidth={1.7} /></Btn>)}
          <Btn label="Distribute horizontally" disabled={flags.units < 3} onClick={() => on.arrange('spread-x')} className="disabled:opacity-40"><AlignHorizontalSpaceBetween size={14} strokeWidth={1.7} /></Btn>
          <Btn label="Distribute vertically" disabled={flags.units < 3} onClick={() => on.arrange('spread-y')} className="disabled:opacity-40"><AlignVerticalSpaceBetween size={14} strokeWidth={1.7} /></Btn>
          <Btn label="Group" keys="Ctrl G" onClick={on.group}><Group size={14} strokeWidth={1.7} /></Btn>
          <Btn label="Ungroup" keys="Ctrl Shift G" disabled={!flags.grouped} onClick={on.ungroup} className="disabled:opacity-40"><Ungroup size={14} strokeWidth={1.7} /></Btn>
        </Row>
      )}
      {(panel.order || panel.locked?.length > 0) && !flags.sketch && (
        <Row label="Object">
          <Btn label={flags.allLocked ? 'Unlock' : 'Lock'} keys="Ctrl Shift L" pressed={flags.allLocked} onClick={on.lock} data-lock-toggle>{flags.allLocked ? <Lock size={14} /> : <LockOpen size={14} />}</Btn>
          <Btn label="Copy style" keys="Ctrl Alt C" onClick={on.copyStyle} disabled={!panel.order}><Pipette size={14} strokeWidth={1.7} /></Btn>
          <Btn label="Paste style" keys="Ctrl Alt V" onClick={on.pasteStyle} disabled={!flags.canPasteStyle || !panel.order} className="disabled:opacity-40"><PaintRoller size={14} strokeWidth={1.7} /></Btn>
        </Row>
      )}
    </div>
  );
}
