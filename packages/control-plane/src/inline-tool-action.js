import { validInlineToolSnapshot } from '../../web/src/inline-tool-plan.js';
import { repositoryAccess, repositorySnapshot } from './repositories.js';

const scopeValid = scope => scope && typeof scope === 'object' && !Array.isArray(scope)
  && Object.keys(scope).every(key => ['app', 'repo', 'commit'].includes(key))
  && typeof scope.app === 'string' && /^[a-z0-9][a-z0-9-]{0,62}$/.test(scope.app)
  && typeof scope.repo === 'string' && /^[\w.-]+\/[\w.-]+$/.test(scope.repo)
  && typeof scope.commit === 'string' && /^[a-f0-9]{40}$/.test(scope.commit);

export function reviewActions(request) {
  if (!request || !['edit', 'explain'].includes(request.mode) || request.kind !== 'selection'
    || request.textRange || request.context?.target?.range || request.context?.target?.textRange
    || !Array.isArray(request.targetIds) || !request.targetIds.length
    || new Set(request.targetIds).size !== request.targetIds.length) return [];
  const actions = [], snapshot = request.context?.toolSnapshot;
  if (!validInlineToolSnapshot(snapshot) || (snapshot.intent || 'edit') !== request.mode
    || JSON.stringify(snapshot.ids) !== JSON.stringify(request.targetIds)) return [];
  if (snapshot.ids.length === 1) {
    const id = snapshot.ids[0], item = snapshot.objects[id];
    if (snapshot.lists[id] === 'items' && item.kind === 'text' && item.mode === 'code'
      && item.lang === 'javascript' && typeof item.text === 'string' && item.text.trim()
      && !item.locked && !item.fileRef && !item.source && !item.sources?.length && !item.citations?.length) actions.push('run_code');
  }
  if (scopeValid(request.context?.repoScope)) actions.push('find_evidence');
  return actions;
}

// Validate scope on BOTH signed-request endpoints. Loading the exact index is an
// identity check only: no search results or repository contents enter the prompt.
export async function authorizeReviewScope(req, env, request, { authorize = repositoryAccess, load = repositorySnapshot } = {}) {
  if (!request?.context || !Object.hasOwn(request.context, 'repoScope')) return null;
  const scope = request.context.repoScope;
  const error = (message, status) => Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!scopeValid(scope)) return error('Choose an explicit repository and exact commit.', 400);
  const app = await authorize(req, env, scope.app);
  if (app instanceof Response) return app;
  if (app?.repo !== scope.repo) return error('The repository scope does not match your access.', 403);
  let snapshot;
  try { snapshot = await load(env, app, scope.commit); }
  catch { return error('That repository version is unavailable.', 409); }
  return snapshot?.repo === scope.repo && snapshot.commit === scope.commit ? null : error('The repository snapshot identity changed.', 409);
}

export function checkToolAction(input, request, requestId) {
  const fail = () => ({ error: 'The review action does not match the frozen request.' });
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['summary', 'action'].includes(key))
    || typeof input.summary !== 'string' || !input.summary.trim() || input.summary.length > 300
    || typeof requestId !== 'string' || !/^[A-Za-z0-9-]{8,80}$/.test(requestId)) return fail();
  const action = input.action;
  if (!action || typeof action !== 'object' || Array.isArray(action)
    || Object.keys(action).some(key => !['tool', 'targetIds', 'query'].includes(key))
    || !reviewActions(request).includes(action.tool) || !Array.isArray(action.targetIds)
    || JSON.stringify(action.targetIds) !== JSON.stringify(request.targetIds)) return fail();
  if (action.tool === 'find_evidence'
    ? typeof action.query !== 'string' || !action.query.trim() || action.query.length > 200 || /[\x00-\x1f\x7f]/.test(action.query)
    : Object.hasOwn(action, 'query')) return fail();
  return { result: { kind: 'tool_action', action: action.tool, requestId, targetIds: [...action.targetIds], summary: input.summary,
    ...(action.tool === 'find_evidence' ? { query: action.query.trim() } : {}) } };
}

export const REVIEW_ACTION_SYSTEM = 'An available review action is NOT an execution or retrieval result. Only when explicitly requested, return {summary:"short review description",action:{tool:"run_code"|"find_evidence",targetIds:[all exact selected IDs],query?:"literal repository search up to 200 characters"}} alone, without ops, plan, text or any other result. run_code only opens Review Execution for the unchanged whole selected JavaScript source; never invent inputs or report output, and the learner must review JSON input, availability and cost then explicitly Run. find_evidence only opens the repository Search inspector with a proposed query in the explicitly authorized pinned scope; never claim evidence was found or searched. Preserve Edit/Explain intent. Ordinary edits and explanations keep their existing outputs. Only use actions listed in availableReviewActions.';

export function reviewActionTool(tool, actions) {
  if (!actions.length) return tool;
  const result = structuredClone(tool), schema = result.input_schema;
  const action = { type: 'object', additionalProperties: false, required: ['tool', 'targetIds'], properties: {
    tool: { type: 'string', enum: actions }, targetIds: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string', maxLength: 200 } }, query: { type: 'string', minLength: 1, maxLength: 200 },
  } };
  schema.properties.action = schema.properties.action ? { anyOf: [schema.properties.action, action] } : action;
  schema.properties.summary = { type: 'string', minLength: 1, maxLength: 300 };
  // Runtime validation keeps each existing result contract strict; a review
  // handoff deliberately has no ops/text/plan alongside it.
  delete schema.required;
  return result;
}
