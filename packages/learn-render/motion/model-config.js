// Runtime model configuration for the Motion roles (spec §4.9). Contracts, briefs and jobs name
// only the roles (contracts.js MODEL_ROLES); a role resolves to a model id here, at call time,
// and the id is recorded only as call provenance. The environment wins; the defaults are the
// development choices (owner decision 2026-10-04: the Director runs on Claude Opus 5.5 for M2).
// ponytail: env + defaults; M7 decides whether the Motion roles join LEARN_TASKS.
export const ROLE_DEFAULTS = Object.freeze({
  MOTION_DIRECTOR_MODEL: 'claude-opus-5-5',
});

export const resolveRole = (role, env = {}) => env[role] || ROLE_DEFAULTS[role] || null;
