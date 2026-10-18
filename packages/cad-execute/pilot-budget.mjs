import {
  readFileSync,
  writeFileSync,
  renameSync,
  openSync,
  closeSync,
  fsyncSync,
  lstatSync,
} from 'node:fs';
import { dirname, resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DevBudget } from './dev-budget.mjs';
const DAY = 86400000;
export function pilotConfig(env) {
  const id = env.CAD_PILOT_ID,
    start = Date.parse(env.CAD_PILOT_STARTED_AT),
    deadline = Date.parse(env.CAD_PILOT_DEADLINE);
  const maximum = Number(env.CAD_PILOT_MAX_BYTES),
    file = env.CAD_PILOT_LEDGER_FILE;
  if (
    !/^[A-Za-z0-9_-]{1,80}$/.test(id || '') ||
    !Number.isFinite(start) ||
    !Number.isFinite(deadline) ||
    deadline <= start ||
    deadline - start > 30 * DAY ||
    !Number.isSafeInteger(maximum) ||
    maximum <= 0 ||
    !file ||
    !isAbsolute(file) ||
    file.endsWith('/')
  )
    throw Error('Invalid CAD pilot budget configuration');
  return { id, start, deadline, maximum, file };
}
export function requirePersistentMount(
  file,
  mountinfo = readFileSync('/proc/self/mountinfo', 'utf8'),
) {
  const directory = resolve(dirname(file));
  const entry = mountinfo
    .split('\n')
    .find((line) => line.split(' ')[4]?.replace(/\\040/g, ' ') === directory);
  const fields = entry?.split(' - ')[1]?.split(' ');
  if (
    !fields ||
    !['ext4', 'xfs'].includes(fields[0]) ||
    !fields[1].startsWith('/dev/')
  )
    throw Error(
      'CAD pilot ledger requires its dedicated persistent volume mount',
    );
  if (lstatSync(directory).isSymbolicLink())
    throw Error('CAD pilot ledger directory must not be a symlink');
}
export function durableWrite(file, state, { exclusive = false } = {}) {
  const next = exclusive ? file : file + '.next';
  let fd;
  try {
    fd = openSync(next, exclusive ? 'wx' : 'w', 0o600);
    writeFileSync(fd, JSON.stringify(state));
    fsyncSync(fd);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  if (!exclusive) renameSync(next, file);
  // Linux deployment requires durable directory metadata as well as file contents.
  if (process.platform !== 'win32') {
    const directory = openSync(dirname(file), 'r');
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  }
}
export function initializePilot(
  env,
  { verifyMount = requirePersistentMount, now = Date.now } = {},
) {
  const c = pilotConfig(env);
  verifyMount(c.file);
  if (now() < c.start || now() + 610000 >= c.deadline)
    throw Error('CAD pilot term is not active');
  durableWrite(
    c.file,
    {
      schema: 'cad-pilot-budget/1',
      id: c.id,
      start: c.start,
      deadline: c.deadline,
      maximum: c.maximum,
      reservedBytes: 0,
      reservations: 0,
    },
    { exclusive: true },
  );
}
export class PilotBudget {
  constructor(
    env,
    { verifyMount = requirePersistentMount, now = Date.now } = {},
  ) {
    this.config = pilotConfig(env);
    this.now = now;
    verifyMount(this.config.file);
    let state;
    try {
      if (
        !lstatSync(this.config.file).isFile() ||
        lstatSync(this.config.file).isSymbolicLink()
      )
        throw Error();
      state = JSON.parse(readFileSync(this.config.file, 'utf8'));
    } catch {
      throw Error(
        'CAD pilot ledger missing or invalid; explicit initialization required',
      );
    }
    const c = this.config;
    if (
      state.schema !== 'cad-pilot-budget/1' ||
      ['id', 'start', 'deadline', 'maximum'].some((k) => state[k] !== c[k]) ||
      !Number.isSafeInteger(state.reservedBytes) ||
      state.reservedBytes < 0 ||
      state.reservedBytes > c.maximum ||
      !Number.isSafeInteger(state.reservations) ||
      state.reservations < 0
    )
      throw Error('CAD pilot ledger does not match approved configuration');
    this.state = state;
  }
  reserve(key, bytes) {
    const c = this.config;
    if (this.now() < c.start || this.now() + 610000 >= c.deadline)
      throw Error('pilot_budget_expired');
    if (!Number.isSafeInteger(bytes) || bytes < 0)
      throw Error('Invalid CAD transfer reservation');
    const allowance = bytes + 1024 ** 2;
    if (
      !Number.isSafeInteger(allowance) ||
      allowance > c.maximum - this.state.reservedBytes
    )
      throw Error('pilot_egress_limit');
    const next = {
      ...this.state,
      reservedBytes: this.state.reservedBytes + allowance,
      reservations: this.state.reservations + 1,
    };
    durableWrite(c.file, next);
    this.state = next;
  }
  expired() {
    return this.now() >= this.config.deadline;
  }
  summary() {
    return {
      mode: 'pilot',
      id: this.config.id,
      deadline: new Date(this.config.deadline).toISOString(),
      reservedBytes: this.state.reservedBytes,
      maximumBytes: this.config.maximum,
      reservations: this.state.reservations,
    };
  }
}
export function configuredBudget(env) {
  if (env.CAD_BUDGET_MODE === 'pilot') return new PilotBudget(env);
  if (env.CAD_BUDGET_MODE && env.CAD_BUDGET_MODE !== 'dev')
    throw Error('Unknown CAD budget mode');
  return new DevBudget({
    file: env.CAD_DEV_BUDGET_FILE || '/var/cad/budget/usage.json',
    deadline: env.CAD_DEV_DEADLINE,
  });
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  if (process.argv[2] !== 'init' || process.env.CAD_BUDGET_MODE !== 'pilot')
    throw Error('Use pilot mode and explicit init');
  initializePilot(process.env);
  console.log('CAD pilot ledger initialized; existing ledgers are never reset');
}
