// A gate command past its time limit is killed with its whole process tree (child.kill() on Windows ends only the
// direct child, so the processes bash started lived on), and it settles even if a surviving process still holds its
// output pipes. Proof run 38632347191 shard-5 ran 35 min inside its step until a force-cancel: the shard script's
// own bound was 120 min and the job's 150 min. Which command hung there is unconfirmed (the force-cancel lost the log).
// Servers started in the background by a subshell (stack.sh) are not in the tree; the scoped stop.ps1 cleanup ends them.
import { spawn, spawnSync } from 'node:child_process';

export function killTree(pid) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch {} }
}

// -> Promise<{ code, signal, timedOut }>. onData gets every stdout and stderr chunk.
export function runBounded(file, args, { cwd, env, timeout, grace = 10000, onData = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let finished = false, timedOut = false, after;
    const finish = (code, signal) => { if (finished) return; finished = true; clearTimeout(timer); clearTimeout(after); resolve({ code, signal, timedOut }); };
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
      after = setTimeout(() => { child.stdout.destroy(); child.stderr.destroy(); finish(null, 'timeout'); }, grace);
    }, timeout);
    for (const output of [child.stdout, child.stderr]) output.on('data', onData);
    child.once('error', e => { if (finished) return; finished = true; clearTimeout(timer); clearTimeout(after); reject(e); });
    child.once('close', finish);
  });
}
