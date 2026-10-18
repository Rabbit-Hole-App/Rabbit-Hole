import { repositoryAccess, repositorySnapshot } from './repositories.js';
import { repositoryTool } from './repository-context.js';

// Read-only adapter. The UI must explicitly name the repository and pinned commit;
// this never expands a canvas selection into a project-wide search on its own.
// No Chat state, provider request or mutation is part of retrieval.
export async function inlineRepositoryEvidence(req, env, input, { authorize = repositoryAccess, load = repositorySnapshot } = {}) {
  const error = (message, status = 400) => Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['app', 'commit', 'query'].includes(key))
    || typeof input.app !== 'string' || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(input.app)
    || typeof input.commit !== 'string' || !/^[a-f0-9]{40}$/.test(input.commit)
    || typeof input.query !== 'string' || !input.query.trim() || input.query.length > 200) return error('Choose a repository, exact commit and a query of 1–200 characters.');
  const app = await authorize(req, env, input.app);
  if (app instanceof Response) return app;
  let snapshot;
  try { snapshot = await load(env, app, input.commit); }
  catch { return error('That repository version is unavailable. No other version was searched.', 409); }
  if (snapshot?.commit !== input.commit || snapshot.repo !== app.repo) return error('The repository snapshot identity changed.', 409);
  const query = input.query.trim();
  const found = repositoryTool(snapshot, 'search_code', { query });
  return {
    kind: 'repository-evidence', query, scope: { app: input.app, repo: snapshot.repo, commit: snapshot.commit },
    matches: found.matches.map(match => ({ ...match, sourceId: `code:${snapshot.repo}@${snapshot.commit}:${match.path}`, textCoverage: 'line-prefix-up-to-300-characters' })),
    metadataMatches: found.nodes.map(({ id, label, path, line }) => ({ id, label, path: path || null, line: line || null })),
    coverage: { indexedFiles: Object.keys(snapshot.files).length, lineMatchLimit: 25, metadataMatchLimit: 20, possiblyLimited: found.matches.length === 25 || found.nodes.length === 20 },
    limitations: ['Search covers only this indexed snapshot, including any import omissions. Code matches are literal case-insensitive retrieval, not verification of a claim. Metadata matches do not establish that source code was read. Line text is limited to its first 300 characters; a later match may require an explicit source-range read.'],
  };
}
