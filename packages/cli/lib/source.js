'use strict';
const { spawnSync } = require('child_process');

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return r.status === 0 ? r.stdout.trim() : null; // git missing (ENOENT) leaves status null → null
}

// git@github.com:org/repo.git | ssh://git@github.com/org/repo.git | https://github.com/org/repo.git
// → https://github.com/org/repo. Unrecognized shapes → null.
// ponytail: any host normalizes; only github gets visibility checks server-side - GitLab when asked
function normalizeRemote(url) {
  if (!url) return null;
  const m = url.match(/^git@([^:/]+):(.+?)(?:\.git)?\/?$/) || url.match(/^\w+:\/\/(?:[^@/]+@)?([^:/]+)\/(.+?)(?:\.git)?\/?$/);
  return m ? `https://${m[1]}/${m[2]}` : null;
}

// Where the deploy came from, or null when the directory is not a git repo (or git is absent).
function capture(dir) {
  if (git(['rev-parse', '--is-inside-work-tree'], dir) !== 'true') return null;
  const commit = git(['rev-parse', 'HEAD'], dir);
  if (!commit) return null; // repo with no commits yet
  return {
    repoUrl: normalizeRemote(git(['remote', 'get-url', 'origin'], dir)),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD'], dir), // detached HEAD reads "HEAD"
    commit,
    shortCommit: git(['rev-parse', '--short', 'HEAD'], dir) || commit.slice(0, 7),
    dirty: git(['status', '--porcelain'], dir) !== '',
  };
}

module.exports = { capture, normalizeRemote };
