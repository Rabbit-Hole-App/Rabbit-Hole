// Conservative approved-dev accounting: reserve full possible egress, never refund
// failed attempts. Root filesystem persistence must be configured before enabling admission.
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
export class DevBudget {
  constructor({ file, deadline, maximum = 800 * 1024 ** 2, now = Date.now }) {
    this.file = file; this.deadline = Date.parse(deadline); this.maximum = maximum; this.now = now;
    if (!Number.isFinite(this.deadline)) throw Error('CAD dev deadline must be configured');
    try { this.state = JSON.parse(readFileSync(file, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw Error('CAD budget state unreadable'); this.state = { reservedBytes: 0, reservations: [] }; }
    if (!Number.isSafeInteger(this.state.reservedBytes) || this.state.reservedBytes < 0 || !Array.isArray(this.state.reservations)) throw Error('CAD budget state invalid');
  }
  reserve(key, bytes) {
    if (this.now() + 610000 >= this.deadline) throw Error('dev_budget_expired');
    // A redispatch after process loss reserves again: wire bytes may repeat.
    const allowance = bytes + 1024 ** 2; // conservative callback/TLS/status overhead per accepted attempt
    if (this.state.reservedBytes + allowance > this.maximum) throw Error('dev_egress_limit');
    const next = { reservedBytes: this.state.reservedBytes + allowance, reservations: [...this.state.reservations, key] };
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file + '.next', JSON.stringify(next), { mode: 0o600 });
    renameSync(this.file + '.next', this.file); this.state = next;
  }
  expired() { return this.now() >= this.deadline; }
  summary() { return { deadline: new Date(this.deadline).toISOString(), reservedBytes: this.state.reservedBytes, maximumBytes: this.maximum }; }
}
