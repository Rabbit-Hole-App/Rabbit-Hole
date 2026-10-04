// The identity and permission model the image ships (Dockerfile, sudoers, sandbox-init). The
// first Fly run failed with EACCES on job.json because motion-svc's shared group was only a
// supplementary group, which Fly does not apply. service.linux.test.mjs proves the model with
// the real uids; these checks fail on any host if the model drifts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = f => readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const dockerfile = read('./Dockerfile'), sudoers = read('./sudoers'), init = read('./sandbox-init'), server = read('./server.mjs');
const useradd = name => dockerfile.match(new RegExp(`useradd [^\\n&]* ${name}\\b`))?.[0] ?? '';

test('motion-svc and motion-render: distinct uids, the same primary group motion, no supplementary groups', () => {
  assert.match(dockerfile, /groupadd -g 10010 motion\b/);
  for (const user of ['motion-svc', 'motion-render']) {
    const line = useradd(user);
    assert.match(line, / -g motion /, `${user} has motion as its primary group`);
    assert.doesNotMatch(line, / -G /, `${user} has no supplementary groups`);
  }
  const uid = user => useradd(user).match(/-u (\d+)/)[1];
  assert.notEqual(uid('motion-svc'), uid('motion-render'));
  assert.match(dockerfile, /^USER motion-svc$/m);
  assert.doesNotMatch(dockerfile, /^USER root$/m);
});

test('the job tree is motion-svc:motion 2770 (setgid) and the service writes 2770 directories and a 0640 job input', () => {
  assert.match(dockerfile, /install -d -m 2770 -o motion-svc -g motion \/var\/motion\/jobs/);
  assert.match(server, /chmodSync\(d, 0o2770\)/);
  assert.match(server, /job\.json'\), JSON\.stringify\([^\n]*\{ mode: 0o640 \}\)/);
});

test('one sudo rule: motion-svc may start the launcher and nothing else', () => {
  const rules = sudoers.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('Defaults'));
  assert.deepEqual(rules, ['motion-svc ALL=(root) NOPASSWD: /usr/local/sbin/motion-sandbox']);
});

test('sandbox-init checks the workspace before the child starts, and the child runs as motion-render with only motion', () => {
  const preflight = init.indexOf('preflight_fail()'), exec = init.indexOf('exec setpriv');
  assert.ok(preflight > 0 && preflight < exec, 'the preflight runs before the child');
  for (const check of [
    '[ "$(stat -c %G "$d")" = motion ]', '[ "$(stat -c %a "$d")" = 2770 ]',
    '[ "$(stat -c %G /tmp/job/job.json)" = motion ]', '[ "$(stat -c %a /tmp/job/job.json)" = 640 ]',
    'asrender test -r /tmp/job/job.json', 'asrender test -w /tmp/job/out',
    'asrender ls -A /var/motion', 'asrender ls -A /home', 'asrender test -r /etc/sudoers.d/motion',
  ]) assert.ok(init.includes(check), check);
  assert.match(init, /exec setpriv --reuid=motion-render --regid=motion --clear-groups --no-new-privs/);
});
