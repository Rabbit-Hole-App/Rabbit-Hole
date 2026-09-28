// Start a rabbit hole (T02 §5): the dialog's decisions, pure so node can test them.
import { route } from './agent/router.js';

export const PATHS = [['repository', 'Repository'], ['sources', 'Sources'], ['question', 'Question'], ['blank', 'Blank canvas']];
export const UNTITLED = 'Untitled canvas';

// 'small:start' carries a path; anything else opens on the first tab.
export const pathOr = (path) => (PATHS.some(([id]) => id === path) ? path : 'repository');

// The bar's rule 2 (T02 §6.6) decides what a repository link means for this workspace, so the
// dialog and the bar agree: connect, open the connected project, or choose between it and
// another branch. The dialog renders that decision; it never re-derives it. Anything else,
// a question included, is not a repository link here.
export function repositoryDecision(text, { catalog = [], scope = null } = {}) {
  const decision = route(text, { catalog, scope });
  const repository = (name) => name === 'connect_repository' || name === 'open_resource';
  if (decision.type === 'command' && repository(decision.name)) return decision;
  if (decision.type === 'choose' && decision.options.every((option) => repository(option.name))) return decision;
  return null;
}

export const titleFromQuestion = (question) => question.replace(/\s+/g, ' ').trim().slice(0, 80);

// ponytail: the Learn hook request has no depth field (T02 §9), so depth rides the prompt; add a field if Learn wants one.
export const teachPrompt = (question, depth) => (depth ? `${question.trim()}\n\nDepth: ${depth}` : question.trim());

// Sources from a connection are all Planned, so that method cannot submit (T02 §5).
export function canSubmit(path, f) {
  if (path === 'repository') return !!f.url.trim();
  if (path === 'question') return !!f.question.trim();
  if (path === 'sources') return f.method === 'upload';
  return true;
}

export const slugOf = (href) => href?.match(/^[/]apps[/]([a-z0-9-]+)/)?.[1] || null;
