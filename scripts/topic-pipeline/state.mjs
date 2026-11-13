import { mkdir, readFile, rename, writeFile, open, unlink } from 'node:fs/promises';
import { join, relative, isAbsolute, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

// On Windows a rename onto a file that a reader holds open (a watcher polling state.json) fails with EPERM for a moment; it cost the linear-regression run a whole author round (reviewer 2026-11-13).
// The rename is tried again a few times with a short wait before the error is allowed to stand.
export async function renameRetrying(from, to, move = rename, tries = 8) {
  for (let attempt = 1; ; attempt++) {
    try { return await move(from, to); }
    catch (error) { if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt >= tries) throw error; await new Promise(done => setTimeout(done, 25 * attempt)); }
  }
}

export async function writeJson(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await renameRetrying(temporary, path);
}

export async function loadState(topicDir, topic) {
  try {
    const state = await readJson(join(topicDir, 'state.json'));
    if (state.topic !== topic) throw new Error('State belongs to another topic');
    return state;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { version: 1, topic, stages: {}, calls: [], spendUsd: 0, status: 'pending' };
  }
}

export async function saveState(topicDir, state) {
  await mkdir(topicDir, { recursive: true });
  state.updatedAt = new Date().toISOString();
  await writeJson(join(topicDir, 'state.json'), state);
}

export async function withTopicLock(topicDir, work) {
  await mkdir(topicDir, { recursive: true });
  const path = join(topicDir, '.run.lock');
  let handle;
  try {
    handle = await open(path, 'wx', 0o600);
    await handle.writeFile(JSON.stringify({ pid: process.pid }));
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Another run owns this topic. Recover its lock after confirming that run has ended.');
    throw error;
  }
  try { return await work(); }
  finally { await handle.close(); await unlink(path); }
}

// keep: absolute paths that stay where they are (a resumed author attempt keeps its author folder and manifest); their stage entries are still dropped.
export async function archiveFrom(topicDir, state, from, { keep = [] } = {}) {
  const kept = keep.map(path => resolve(path));
  const ids = Object.keys(state.stages).filter(id => id >= from);
  if (!ids.length) return;
  const archive = join(topicDir, 'history', `${Date.now()}-${randomUUID().slice(0, 8)}`);
  await mkdir(archive, { recursive: true });
  await writeJson(join(archive, 'state.json'), state);
  const moved = new Set();
  for (const id of ids) {
    for (const path of state.stages[id].artefacts ?? []) {
      const rel = relative(topicDir, path);
      if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Stage artefact is outside its topic folder');
      if (moved.has(path) || kept.includes(resolve(path))) continue;
      const destination = join(archive, rel);
      await mkdir(join(destination, '..'), { recursive: true });
      try { await rename(path, destination); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      moved.add(path);
    }
    delete state.stages[id];
  }
}
