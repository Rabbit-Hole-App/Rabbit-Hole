// packages/web/src/tutor-lines.js
// A line the Tutor says in the chat from somewhere else on the page (the Run card: cannot-run-edge-cases.md section 1a, "no silent failure"). The chat's Tutor flow
// (TutorRehearsal.jsx) takes it as a Tutor message; where no flow is mounted (a saved card on a canvas without the flow) it is shown as a notice instead, never lost.
import { toast } from './ui.jsx';

export const TUTOR_LINE_EVENT = 'rh:tutor-line';
const plain = text => String(text).replace(/\*\*/g, '').replace(/`/g, '');

export function tutorLine(canvas, text) {
  const taken = window.dispatchEvent(new CustomEvent(TUTOR_LINE_EVENT, { detail: { canvas, text }, cancelable: true })) === false;
  if (!taken) toast(plain(text));
}
