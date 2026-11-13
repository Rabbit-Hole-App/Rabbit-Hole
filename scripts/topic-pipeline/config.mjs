import { readFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, resolve, join } from 'node:path';

export async function loadConfig(path) {
  if (basename(path) !== 'config.local.json') throw new Error('Configuration must be named config.local.json');
  let config;
  try { config = JSON.parse(await readFile(path, 'utf8')); }
  catch { throw new Error('Cannot read a valid config.local.json'); }
  if (!config.repo?.root || !config.paths?.topicsRoot) throw new Error('Set repo.root and paths.topicsRoot in config.local.json');
  const base = dirname(resolve(path));
  config.repo.root = resolve(base, config.repo.root);
  for (const [key, value] of Object.entries(config.paths)) {
    if (typeof value === 'string' && value) config.paths[key] = resolve(base, value);
  }
  for (const key of ['toolingRoot', 'worktreeRoot']) {
    if (config.repo[key]) config.repo[key] = resolve(base, config.repo[key]);
  }
  config.repo.toolingRef ??= 'main';
  if (config.planner?.fixtureFile) config.planner.fixtureFile = resolve(base, config.planner.fixtureFile);
  for (const [section, keys] of Object.entries({ stack: ['varsFile', 'appLog', 'persistDir'], bench: ['outRoot'], preview: ['urlFile'], release: ['ledgerPath', 'queuePath'] })) {
    for (const key of keys) if (config[section]?.[key]) config[section][key] = resolve(base, config[section][key]);
  }
  if (config.bench?.fixtureRuns) config.bench.fixtureRuns = config.bench.fixtureRuns.map(path => resolve(base, path));
  config.limits ??= { authorRounds: 3, verifyRounds: 2, perLessonUsd: 15 };
  return config;
}

export function getTopicPaths(config, topic) {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(topic)) throw new Error('Topic must be a slug');
  return { topicDir: join(config.paths.topicsRoot, topic),
    fixtureDir: config.paths.fixtureRoot ? join(config.paths.fixtureRoot, topic, 'fixture') : join(config.paths.topicsRoot, topic, 'fixture') };
}

export function redact(value, config) {
  let text = String(value);
  const privateValues = [];
  function visit(object) {
    for (const [key, item] of Object.entries(object ?? {})) {
      if (item && typeof item === 'object') visit(item);
      else if (typeof item === 'string' && item && (/key|token|secret|url|path|root|file|dir|cmd/i.test(key) || isAbsolute(item))) privateValues.push(item);
    }
  }
  visit(config);
  for (const item of privateValues.sort((a, b) => b.length - a.length)) text = text.split(item).join('[redacted]');
  return text;
}
