// Shared teaching policy for chat and the observable canvas plan.
export { TEACHING_POLICY } from './agents/learn-chat.js';

export const TEACHING_TOOLS = ['search_pexels', 'inspect_image', 'search_arxiv', 'read_arxiv_paper', 'interactive_plot', 'generate_video', 'interactive_3d', 'generate_3d_animation'];
export const REPRESENTATIONS = ['text', 'equation', 'diagram', 'code', 'image', 'paper_figure', 'desmos', 'plotly', 'video', 'three_d'];

export function validateTeachingHistory(history = []) {
  if (!Array.isArray(history) || history.length > 6 || history.some(turn => !turn || !['user', 'assistant'].includes(turn.role) || typeof turn.content !== 'string' || !turn.content.trim() || turn.content.length > 1000 || Object.keys(turn).some(key => !['role', 'content'].includes(key)))) throw new Error('Invalid teaching history');
  return history;
}
