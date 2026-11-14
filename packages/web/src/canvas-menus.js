// The canvas menubar's menus (owner brief 2026-10-22, "Canvas menu redesign": Insert, Edit, Arrange, View), one definition for the
// owner's canvas (LearnPage) and a shared canvas (SharedBoardPage, MemberBoardPage), so a shared canvas never keeps a second menubar.
// canvas: () => the canvas api; canvasState: AdaptiveCanvas onState; comments: useCanvasComments (active, showPins, setPins).
// quickEdit: the Edit with AI row (paid; off on a shared canvas). panel: { open, setOpen } for the right panel, where the page has one.
// There is no Files menu (the right panel's Context and Search do that work) and no Share, Publish or Embed here (the Share button).
// Row kinds, drawn by CanvasMenubar: an action (label, icon, hint, disabled, onSelect), a submenu (items), a radio or check row
// (radio / check, a check row stays open), a choice (the Page guides selector) and a divider. Disabled rows stay, greyed, never explained.
import { AlignHorizontalDistributeCenter, AlignHorizontalJustifyCenter, ArrowUpToLine, Clipboard, Copy, CopyPlus, Eye, Focus, Globe, Grid2X2, Group, Heading1, Keyboard, Layers, Link, LockKeyhole, LockKeyholeOpen, Maximize2, Minus, NotebookPen, Paintbrush, PanelsTopLeft, Pipette, Redo2, Scan, Scissors, Search, Sigma, SquareSlash, StickyNote, Trash2, Type, Undo2, Ungroup, Upload, Wand, ZoomIn, ZoomOut, Frame, GraduationCap, Ruler, Heading2, Heading3 } from 'lucide-react';
import { ariaFor, hintFor, isMac } from './shortcuts.js';

// Section, sub-sections, text box, sticky note, divider and equation: inserted on this canvas only, no request, no model call.
export const localInsertItems = canvas => [
  { label: 'Section', icon: Heading1, items: [
    { label: 'Section', icon: Heading1, onSelect: () => canvas()?.insertHeading(1) },
    { label: 'Sub-section', icon: Heading2, onSelect: () => canvas()?.insertHeading(2) },
    { label: 'Sub-sub-section', icon: Heading3, onSelect: () => canvas()?.insertHeading(3) },
  ] },
  { label: 'Text box', icon: Type, onSelect: () => canvas()?.insertText() },
  { label: 'Sticky note', icon: StickyNote, onSelect: () => canvas()?.insertSticky() },
  { label: 'Divider', icon: Minus, onSelect: () => canvas()?.insertDivider() },
  { label: 'Equation', icon: Sigma, onSelect: () => canvas()?.insertEquation() },
];

// The owner's Insert menu: the local rows, then what reaches beyond this canvas, then the link. Upload a file is the one way to add
// a file (the page asks where it goes); Search sources is the one source finder (YouTube, arXiv and Wikipedia are choices inside it).
export const ownerInsertItems = ({ canvas, onUpload, onSearchSources, onLinkToCanvas }) => [
  ...localInsertItems(canvas),
  { divider: true },
  { label: 'Notebook', icon: NotebookPen, onSelect: () => canvas()?.insertNotebook() },
  { label: 'Upload a file', icon: Upload, onSelect: onUpload },
  { label: 'Webpage', icon: Globe, onSelect: () => canvas()?.insertWebpage() },
  { label: 'Search sources', icon: Search, onSelect: onSearchSources },
  { divider: true },
  { label: 'Add a link', icon: Link, onSelect: onLinkToCanvas },
];

// Align needs two pieces, Distribute three (a group counts as one piece).
const arrangeRows = (canvas, rows, least, state) => rows.map(([label, how]) => ({ label, disabled: (state.units || 0) < least, onSelect: () => canvas()?.arrange(how) }));

// panel: the right panel's { open, setOpen } where the page has one; drawing: false where the canvas has no toolbar (a viewer).
// study: the owner's Pinned Study (StudyPane.jsx useStudy, UI-27); a shared canvas passes none, so it has no Canvas / Study rows.
// onSlashCommands: opens the Slash Commands window (owner spec 2026-10-29 section 7.1); a canvas without a Chat composer passes none,
// so it has no row that does nothing. onShortcuts: opens View > Shortcuts (ShortcutsSheet.jsx, owner brief 2026-11-02), directly below
// Slash Commands. Hints and aria-keyshortcuts come from shortcuts.js, spelled for this platform (mac).
export const canvasEditMenus = ({ canvas, canvasState, inlineAi = null, quickEdit = false, comments = {}, docView, setDocView, panel = null, drawing = true, study = null, onSlashCommands = null, onShortcuts = null, mac = isMac() }) => {
  const locked = canvasState.selectionLocked;
  const k = id => ({ hint: hintFor(id, mac), keys: ariaFor(id, mac) });
  const checkRow = (label, on, set) => ({ label, check: !!on, onToggle: set });
  const widget = name => on => canvas()?.showWidget(name, on);
  return [
    {
      title: 'Edit',
      items: [
        { label: 'Undo', icon: Undo2, ...k('undo'), onSelect: () => canvas()?.undo() },
        { label: 'Redo', icon: Redo2, ...k('redo'), onSelect: () => canvas()?.redo() },
        { divider: true },
        { label: 'Cut', icon: Scissors, ...k('cut'), disabled: !canvasState.selected, onSelect: () => canvas()?.cut() },
        { label: 'Copy', icon: Copy, ...k('copy'), disabled: !canvasState.selected, onSelect: () => canvas()?.copy() },
        { label: 'Paste', icon: Clipboard, ...k('paste'), disabled: !canvasState.canPaste, onSelect: () => canvas()?.paste() },
        { divider: true },
        { label: 'Duplicate', icon: CopyPlus, ...k('duplicate'), disabled: !canvasState.selected, onSelect: () => canvas()?.duplicate() },
        { label: 'Delete', icon: Trash2, ...k('delete'), disabled: !canvasState.selected, onSelect: () => canvas()?.deleteSelection() },
        { divider: true },
        { label: 'Copy style', icon: Pipette, ...k('copy-style'), disabled: !canvasState.selected, onSelect: () => canvas()?.copyStyle() },
        { label: 'Paste style', icon: Paintbrush, ...k('paste-style'), disabled: !canvasState.selected || !canvasState.canPasteStyle, onSelect: () => canvas()?.pasteStyle() },
        { divider: true },
        { label: 'Select all', icon: Scan, ...k('select-all'), onSelect: () => canvas()?.selectAll() },
        // Quick Edit under its new name (owner brief 2026-10-22 item 4): the same safe editing; Explain stays its own operation.
        ...(quickEdit ? [{ divider: true }, { label: 'Edit with AI', icon: Wand, ...k('quick-edit'), disabled: !canvasState.selected || !inlineAi, onSelect: () => canvas()?.inlineAi?.('edit') }] : []),
      ],
    },
    {
      // Lines up what is selected; a group counts as one piece.
      title: 'Arrange',
      items: [
        { label: 'Align', icon: AlignHorizontalJustifyCenter, items: arrangeRows(canvas, [['Left', 'left'], ['Center', 'center'], ['Right', 'right'], ['Top', 'top'], ['Middle', 'middle'], ['Bottom', 'bottom']], 2, canvasState) },
        { label: 'Distribute', icon: AlignHorizontalDistributeCenter, items: arrangeRows(canvas, [['Horizontally', 'spread-x'], ['Vertically', 'spread-y']], 3, canvasState) },
        { label: 'Layer order', icon: Layers, items: [
          { label: 'Bring to front', ...k('order-front'), disabled: !canvasState.selected, onSelect: () => canvas()?.order('front') },
          { label: 'Bring forward', ...k('order-forward'), disabled: !canvasState.selected, onSelect: () => canvas()?.order('forward') },
          { label: 'Send backward', ...k('order-backward'), disabled: !canvasState.selected, onSelect: () => canvas()?.order('backward') },
          { label: 'Send to back', ...k('order-back'), disabled: !canvasState.selected, onSelect: () => canvas()?.order('back') },
        ] },
        { divider: true },
        { label: 'Group', icon: Group, ...k('group'), disabled: !(canvasState.selected >= 2), onSelect: () => canvas()?.group() },
        { label: 'Ungroup', icon: Ungroup, ...k('ungroup'), disabled: !canvasState.grouped, onSelect: () => canvas()?.ungroup() },
        { divider: true },
        { label: locked ? 'Unlock' : 'Lock', icon: locked ? LockKeyholeOpen : LockKeyhole, ...k('lock'), disabled: !canvasState.selected, onSelect: () => canvas()?.lockSelection() },
        { label: 'Snap to grid', icon: Grid2X2, check: !!canvasState.grid, ...k('grid'), onToggle: () => canvas()?.toggleGrid() },
      ],
    },
    {
      title: 'View',
      items: [
        { label: 'Zoom in', icon: ZoomIn, ...k('zoom-in'), onSelect: () => canvas()?.zoomIn() },
        { label: 'Zoom out', icon: ZoomOut, ...k('zoom-out'), onSelect: () => canvas()?.zoomOut() },
        { label: 'Zoom to 100%', icon: Scan, ...k('zoom-reset'), onSelect: () => canvas()?.zoomReset() },
        { label: 'Fit canvas', icon: Maximize2, ...k('fit-canvas'), onSelect: () => canvas()?.zoomFit() },
        { label: 'Fit selection', icon: Focus, ...k('fit-selection'), disabled: !canvasState.selected, onSelect: () => canvas()?.zoomToSelection() },
        { divider: true },
        // The workspace layout (Pinned Study): Canvas shows the full canvas, Study the pinned reference beside the work. Neither
        // moves a card, saves the board or asks a model; this browser remembers the choice for this canvas.
        ...(study ? [
          { label: 'Canvas', icon: Frame, radio: study.mode !== 'study', onSelect: () => study.setMode('canvas') },
          { label: 'Study', icon: GraduationCap, radio: study.mode === 'study', onSelect: () => study.setMode('study') },
          { divider: true },
        ] : []),
        // The canvas's document (docs/features/blocknote-canvas.md): Editor shows it on the canvas, Canvas hides it (never clears
        // it); this browser remembers the choice for this canvas.
        { label: 'Workspace', icon: PanelsTopLeft, items: [
          { label: 'Canvas', radio: docView === 'canvas', onSelect: () => setDocView('canvas') },
          { label: 'Editor', radio: docView === 'editor', onSelect: () => setDocView('editor') },
        ] },
        // Each row drives the state that already shows or hides the thing; the choice is this person's, on this device
        // (ui-prefs.js), never the shared canvas or another viewer's.
        { label: 'Show / hide', icon: Eye, items: [
          ...(drawing ? [checkRow('Toolbar', canvasState.toolbar !== false, widget('toolbar'))] : []),
          ...(panel ? [{ ...checkRow('Right panel', panel.open, panel.setOpen), ...k('right-panel') }] : []),
          checkRow('Minimap', canvasState.minimap, widget('minimap')),
          checkRow('Rabbit Hole Map', canvasState.holeMap, widget('holeMap')),
          // Comment pins are marker visibility only; who may comment stays in Share.
          ...(comments.active ? [checkRow('Comment pins', comments.showPins, comments.setPins)] : []),
          checkRow('Learning suggestions', canvasState.curious, widget('curious')),
        ] },
        { label: 'Page guides', icon: Ruler, choice: { value: canvasState.pages || 'off', options: [['off', 'Off'], ['portrait', 'A4 portrait'], ['landscape', 'A4 landscape']], onChange: value => canvas()?.setPages(value === 'off' ? false : value) } },
        { divider: true },
        // Shows the document and frames its top.
        { label: 'Go to document start', icon: ArrowUpToLine, onSelect: () => { setDocView('editor'); requestAnimationFrame(() => requestAnimationFrame(() => canvas()?.goToDoc())); } },
        ...(onSlashCommands || onShortcuts ? [{ divider: true }] : []),
        ...(onSlashCommands ? [{ label: 'Slash Commands', icon: SquareSlash, ...k('slash-commands'), onSelect: onSlashCommands }] : []),
        ...(onShortcuts ? [{ label: 'Shortcuts', icon: Keyboard, ...k('shortcuts'), onSelect: onShortcuts }] : []),
      ],
    },
  ];
};
