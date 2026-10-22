// The canvas menubar's local menus (SHARE-01): Insert's local rows, Edit, Arrange and View, one definition for the owner's
// canvas (LearnPage) and a shared canvas (SharedBoardPage), so a shared canvas never keeps a second menubar.
// canvas: () => the canvas api; canvasState: AdaptiveCanvas onState; comments: useCanvasComments (active, showPins, setPins).
// quickEdit: the AI Quick Edit row (paid; off on a shared canvas); onSlashHelp: the Slash commands row, where there are any.
import { AlignCenterHorizontal, LockOpen, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalSpaceBetween, AlignStartHorizontal, AlignStartVertical, AlignVerticalSpaceBetween, ArrowDown, ArrowUp, ArrowUpToLine, BoxSelect, BringToFront, ClipboardPaste, Copy, CopyPlus, FileText, Grid3x3, Group, Heading1, Heading2, Heading3, Keyboard, Lightbulb, Lock, Map as MapIcon, Maximize2, MessageCircle, Network, NotebookPen, PaintRoller, Pipette, Redo2, RotateCcw, Scissors, SendToBack, SeparatorHorizontal, SquareSlash, StickyNote, Trash2, Type, Undo2, Ungroup, Wand, ZoomIn, ZoomOut } from 'lucide-react';

// Section, sub-sections, text box, sticky note and divider: inserted on this canvas only, no request, no model call.
export const localInsertItems = canvas => [
  { label: 'Section', icon: Heading1, size: 19, weight: 650, onSelect: () => canvas()?.insertHeading(1) },
  { label: 'Sub-section', icon: Heading2, size: 16, weight: 600, onSelect: () => canvas()?.insertHeading(2) },
  { label: 'Sub-sub-section', icon: Heading3, size: 14, weight: 550, onSelect: () => canvas()?.insertHeading(3) },
  { divider: true },
  { label: 'Text box', icon: Type, onSelect: () => canvas()?.insertText() },
  { label: 'Sticky note', icon: StickyNote, onSelect: () => canvas()?.insertSticky() },
  { label: 'Divider line', icon: SeparatorHorizontal, onSelect: () => canvas()?.insertDivider() },
];

export const canvasEditMenus = ({ canvas, canvasState, inlineAi = null, quickEdit = false, comments = {}, docView, setDocView, onShortcuts, onSlashHelp = null }) => [
  {
    title: 'Edit',
    items: [
      ...(quickEdit ? [{ label: 'Quick Edit', icon: Wand, hint: 'Ctrl K', disabled: !canvasState.selected || !inlineAi, onSelect: () => canvas()?.inlineAi?.('edit') }, { divider: true }] : []),
      { label: 'Undo', icon: Undo2, hint: 'Ctrl Z', onSelect: () => canvas()?.undo() },
      { label: 'Redo', icon: Redo2, hint: 'Ctrl Y', onSelect: () => canvas()?.redo() },
      { divider: true },
      { label: 'Cut', icon: Scissors, hint: 'Ctrl X', disabled: !canvasState.selected, onSelect: () => canvas()?.cut() },
      { label: 'Copy', icon: Copy, hint: 'Ctrl C', disabled: !canvasState.selected, onSelect: () => canvas()?.copy() },
      { label: 'Paste', icon: ClipboardPaste, hint: 'Ctrl V', disabled: !canvasState.canPaste, onSelect: () => canvas()?.paste() },
      { label: 'Duplicate', icon: CopyPlus, hint: 'Ctrl D', disabled: !canvasState.selected, onSelect: () => canvas()?.duplicate() },
      { label: 'Copy style', icon: Pipette, hint: 'Ctrl Alt C', disabled: !canvasState.selected, onSelect: () => canvas()?.copyStyle() },
      { label: 'Paste style', icon: PaintRoller, hint: 'Ctrl Alt V', disabled: !canvasState.selected || !canvasState.canPasteStyle, onSelect: () => canvas()?.pasteStyle() },
      { label: canvasState.selectionLocked ? 'Unlock' : 'Lock', icon: canvasState.selectionLocked ? LockOpen : Lock, hint: 'Ctrl Shift L', disabled: !canvasState.selected, onSelect: () => canvas()?.lockSelection() },
      { divider: true },
      { label: 'Group', icon: Group, hint: 'Ctrl G', disabled: canvasState.selected < 2, onSelect: () => canvas()?.group() },
      { label: 'Ungroup', icon: Ungroup, hint: 'Ctrl Shift G', disabled: !canvasState.grouped, onSelect: () => canvas()?.ungroup() },
      { divider: true },
      { label: 'Select all', icon: BoxSelect, hint: 'Ctrl A', onSelect: () => canvas()?.selectAll() },
      { label: 'Delete selection', icon: Trash2, hint: 'Del', disabled: !canvasState.selected, onSelect: () => canvas()?.deleteSelection() },
    ],
  },
  {
    // Lines up what is selected; a group counts as one piece.
    title: 'Arrange',
    items: [
      { label: 'Align left', icon: AlignStartVertical, disabled: canvasState.units < 2, onSelect: () => canvas()?.arrange('left') },
      { label: 'Align center', icon: AlignCenterVertical, disabled: canvasState.units < 2, onSelect: () => canvas()?.arrange('center') },
      { label: 'Align right', icon: AlignEndVertical, disabled: canvasState.units < 2, onSelect: () => canvas()?.arrange('right') },
      { divider: true },
      { label: 'Align top', icon: AlignStartHorizontal, disabled: canvasState.units < 2, onSelect: () => canvas()?.arrange('top') },
      { label: 'Align middle', icon: AlignCenterHorizontal, disabled: canvasState.units < 2, onSelect: () => canvas()?.arrange('middle') },
      { label: 'Align bottom', icon: AlignEndHorizontal, disabled: canvasState.units < 2, onSelect: () => canvas()?.arrange('bottom') },
      { divider: true },
      { label: 'Distribute horizontally', icon: AlignHorizontalSpaceBetween, disabled: canvasState.units < 3, onSelect: () => canvas()?.arrange('spread-x') },
      { label: 'Distribute vertically', icon: AlignVerticalSpaceBetween, disabled: canvasState.units < 3, onSelect: () => canvas()?.arrange('spread-y') },
      { divider: true },
      { label: 'Bring to front', icon: BringToFront, hint: 'Ctrl Shift ]', disabled: !canvasState.selected, onSelect: () => canvas()?.order('front') },
      { label: 'Bring forward', icon: ArrowUp, hint: 'Ctrl ]', disabled: !canvasState.selected, onSelect: () => canvas()?.order('forward') },
      { label: 'Send backward', icon: ArrowDown, hint: 'Ctrl [', disabled: !canvasState.selected, onSelect: () => canvas()?.order('backward') },
      { label: 'Send to back', icon: SendToBack, hint: 'Ctrl Shift [', disabled: !canvasState.selected, onSelect: () => canvas()?.order('back') },
    ],
  },
  {
    title: 'View',
    items: [
      { label: 'Zoom in', icon: ZoomIn, hint: 'Ctrl +', onSelect: () => canvas()?.zoomIn() },
      { label: 'Zoom out', icon: ZoomOut, hint: 'Ctrl -', onSelect: () => canvas()?.zoomOut() },
      { label: 'Zoom to 100%', icon: RotateCcw, hint: 'Shift 0', onSelect: () => canvas()?.zoomReset() },
      { label: 'Zoom to fit', icon: Maximize2, hint: 'Shift 1', onSelect: () => canvas()?.zoomFit() },
      { divider: true },
      // Owner brief 2026-10-21 item 3: three identical switch rows, on by default and remembered on this device (ui-prefs.js).
      // Off hides the widget and frees its room; Curious on still shows only what Tutor allows (it never asks for a set).
      { label: 'Minimap', icon: MapIcon, toggle: canvasState.minimap, onToggle: on => canvas()?.showWidget('minimap', on) },
      { label: 'Rabbit Hole Map', icon: Network, toggle: canvasState.holeMap, onToggle: on => canvas()?.showWidget('holeMap', on) },
      { label: 'Curious', icon: Lightbulb, toggle: canvasState.curious, onToggle: on => canvas()?.showWidget('curious', on) },
      { divider: true },
      { label: 'Snap to grid', icon: Grid3x3, checked: canvasState.grid, onSelect: () => canvas()?.toggleGrid() },
      { label: 'Page guides', icon: FileText, choice: { value: canvasState.pages || 'off', options: [['off', 'Off'], ['portrait', 'A4 portrait'], ['landscape', 'A4 landscape']], onChange: value => canvas()?.setPages(value === 'off' ? false : value) } },
      ...(comments.active ? [{ label: 'Comments', icon: MessageCircle, toggle: comments.showPins, onToggle: comments.setPins }] : []),
      { label: 'Keep tool active', icon: Lock, checked: canvasState.lock, onSelect: () => canvas()?.toggleLock() },
      { divider: true },
      // The canvas's document (docs/features/blocknote-canvas.md): Editor shows it on the canvas, Canvas hides it (never
      // clears it); this browser remembers the choice for this canvas. Go to document start shows it and frames its top.
      { label: 'Mode', icon: NotebookPen, choice: { value: docView, options: [['canvas', 'Canvas'], ['editor', 'Editor']], onChange: setDocView } },
      { label: 'Go to document start', icon: ArrowUpToLine, onSelect: () => { setDocView('editor'); requestAnimationFrame(() => requestAnimationFrame(() => canvas()?.goToDoc())); } },
      { divider: true },
      { label: 'Keyboard shortcuts', icon: Keyboard, hint: '?', onSelect: onShortcuts },
      ...(onSlashHelp ? [{ label: 'Slash commands', icon: SquareSlash, onSelect: onSlashHelp }] : []),
    ],
  },
];
