import { useState } from 'react';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { motion } from 'motion/react';
import { Check, X } from 'lucide-react';

// Assemble a pipeline by dropping pieces into slots. dnd-kit owns the drag
// gesture, Motion owns the settle animation, and the behaviour owns whether a
// placement is right — the three never overlap.

function Piece({ piece, disabled }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: piece.id, disabled });
  return (
    <button ref={setNodeRef} type="button" data-piece={piece.id} {...listeners} {...attributes}
      className={`cursor-grab rounded-lg border px-2.5 py-1.5 text-xs active:cursor-grabbing ${disabled ? 'border-line bg-hover text-ink-3' : 'border-line bg-white text-ink hover:border-ink-3'} ${isDragging ? 'opacity-30' : ''}`}>
      {piece.label}
    </button>
  );
}

// The card the learner is actually holding: it floats above everything and
// follows the cursor, so a drop never feels like a guess.
function DraggedCard({ piece, reduced }) {
  return (
    <motion.div initial={reduced ? false : { scale: 0.96 }} animate={{ scale: 1.04, rotate: reduced ? 0 : -1.5 }} transition={{ duration: reduced ? 0 : 0.12 }}
      className="pointer-events-none cursor-grabbing rounded-lg border border-accent bg-white px-2.5 py-1.5 text-xs text-ink shadow-xl">
      {piece.label}
    </motion.div>
  );
}

function Slot({ slot, held, correct, reduced, onClear }) {
  const { setNodeRef, isOver } = useDroppable({ id: slot.id });
  return (
    <div ref={setNodeRef} data-slot={slot.id}
      className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs ${isOver ? 'border-accent bg-accent/5' : held ? (correct ? 'border-green-700/40 bg-green-700/5' : 'border-amber-600/50 bg-amber-500/5') : 'border-dashed border-line bg-hover'}`}>
      <span className="w-24 shrink-0 text-ink-2">{slot.label || slot.id}</span>
      {held ? (
        <motion.span layout={!reduced} initial={reduced ? false : { scale: 0.9, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: reduced ? 0 : 0.16 }}
          className="flex items-center gap-1.5 rounded-md border border-line bg-white px-2 py-1">
          {held.label}
          {correct ? <Check size={12} className="text-green-700" /> : <X size={12} className="text-amber-700" />}
          <button type="button" aria-label={`Remove ${held.label}`} onClick={() => onClear(slot.id)} className="text-ink-3 hover:text-ink">×</button>
        </motion.span>
      ) : <span className="text-ink-3">drop a step here</span>}
    </div>
  );
}

export default function PipelineScene({ state, run, reduced, selected, onSelect }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));
  const [dragging, setDragging] = useState(null);
  const placedIds = Object.values(state.placed);
  const pieceOf = id => state.pieces.find(piece => piece.id === id);
  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin}
      onDragStart={event => setDragging(event.active.id)}
      onDragCancel={() => setDragging(null)}
      onDragEnd={event => {
        setDragging(null);
        if (event.over) run({ type: 'place_item', slot: event.over.id, piece: event.active.id });
      }}>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="space-y-1.5">
          {state.slots.map(slot => (
            <div key={slot.id} onClick={() => onSelect?.(slot.id)} className={selected === slot.id ? 'rounded-lg ring-2 ring-[#2383e2]' : ''}>
              <Slot slot={slot} held={pieceOf(state.placed[slot.id])} correct={state.placed[slot.id] === slot.accepts}
                reduced={reduced} onClear={id => run({ type: 'clear_slot', slot: id })} />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 border-t border-line pt-2">
          {state.pieces.map(piece => <Piece key={piece.id} piece={piece} disabled={placedIds.includes(piece.id)} />)}
        </div>
        {/* Keyboard route: pick a piece, then a slot, without any dragging. */}
        <details className="text-xs text-ink-2">
          <summary className="cursor-pointer">Place without dragging</summary>
          <div className="mt-1.5 space-y-1.5">
            {state.slots.map(slot => (
              <label key={slot.id} className="flex items-center gap-2">
                <span className="w-24 shrink-0">{slot.label || slot.id}</span>
                <select aria-label={`Piece for ${slot.label || slot.id}`} value={state.placed[slot.id] || ''}
                  onChange={event => event.target.value ? run({ type: 'place_item', slot: slot.id, piece: event.target.value }) : run({ type: 'clear_slot', slot: slot.id })}
                  className="h-7 rounded border border-line px-2 text-xs">
                  <option value="">—</option>
                  {state.pieces.map(piece => <option key={piece.id} value={piece.id}>{piece.label}</option>)}
                </select>
              </label>
            ))}
          </div>
        </details>
      </div>
      <DragOverlay dropAnimation={reduced ? null : undefined}>
        {dragging ? <DraggedCard piece={pieceOf(dragging)} reduced={reduced} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
