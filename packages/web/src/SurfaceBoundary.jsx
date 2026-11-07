import { Component } from 'react';
import { reportClientError } from './client-telemetry.js';

// main.jsx swaps the whole page for its crash screen on any uncaught render error. A Tutor surface (the canvas overlay, a slot card, the
// Next card pill, a Tutor entry in Chat, an Explanation card) that throws while drawing shows its fallback instead (nothing, or the plain
// words) and is reported; the rest of the page keeps working. It is contained, not retried: a reload heals it.
export default class SurfaceBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error(`[${this.props.artifact}]`, error); reportClientError('render_failed', error, { artifact: this.props.artifact }); }
  render() { return this.state.failed ? (this.props.fallback ?? null) : this.props.children; }
}
