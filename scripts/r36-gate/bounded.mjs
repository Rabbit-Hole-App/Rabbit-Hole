// A gate command past its time limit is killed with its whole process tree (child.kill() on Windows ends only the
// direct child, so the processes bash started lived on), and it settles even if a surviving process still holds its
// output pipes. Proof run 38632347191 shard-5 ran 35 min inside its step until a force-cancel: the shard script's
// own bound was 120 min and the job's 150 min. Which command hung there is unconfirmed (the force-cancel lost the log).
// Servers started in the background by a subshell (stack.sh) are not in the tree; the scoped stop.ps1 cleanup ends them.
import { spawn, spawnSync } from 'node:child_process';

// The termination command is bounded too: a taskkill that stalls or fails is reported, never waited on.
// -> { ok, error } where error says why the tree kill did not complete.
export function killTree(pid, { command, args, timeout = 15000 } = {}) {
  if (!command && process.platform !== 'win32') {
    try { process.kill(-pid, 'SIGKILL'); return { ok: true, error: null }; } catch {}
    try { process.kill(pid, 'SIGKILL'); return { ok: true, error: null }; } catch (e) { return { ok: false, error: e.message }; }
  }
  const r = spawnSync(command || 'taskkill', args || ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout });
  if (r.error) return { ok: false, error: r.error.code === 'ETIMEDOUT' ? `the kill command timed out after ${timeout} ms` : r.error.message };
  return r.status === 0 ? { ok: true, error: null } : { ok: false, error: `the kill command exited ${r.status}` };
}

// -> Promise<{ code, signal, timedOut, killError }>. onData gets every stdout and stderr chunk. kill overrides the
// termination command (tests only).
export function runBounded(file, args, { cwd, env, timeout, grace = 10000, onData = () => {}, kill } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let finished = false, timedOut = false, killError = null, after;
    const finish = (code, signal) => { if (finished) return; finished = true; clearTimeout(timer); clearTimeout(after); resolve({ code, signal, timedOut, killError }); };
    const timer = setTimeout(() => {
      timedOut = true;
      const k = killTree(child.pid, kill);
      // The tree kill failed or stalled: record why, and end at least the direct child.
      if (!k.ok) { killError = k.error; try { child.kill('SIGKILL'); } catch {} }
      after = setTimeout(() => { child.stdout.destroy(); child.stderr.destroy(); finish(null, 'timeout'); }, grace);
    }, timeout);
    for (const output of [child.stdout, child.stderr]) output.on('data', onData);
    child.once('error', e => { if (finished) return; finished = true; clearTimeout(timer); clearTimeout(after); reject(e); });
    child.once('close', finish);
  });
}
