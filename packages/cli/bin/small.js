#!/usr/bin/env node
'use strict';
const { detect } = require('../lib/detect');
const { write } = require('../lib/generate');

const [cmd, ...rest] = process.argv.slice(2);
const flags = { _: [] };
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) {
    const key = rest[i].slice(2);
    flags[key] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;
  } else {
    flags._.push(rest[i]);
  }
}

const commands = {
  deploy() {
    const dir = process.cwd();
    const app = detect(dir, flags);
    console.log(`✓ entry: ${app.entry} (${app.framework}) via ${app.via}`);
    const out = write(dir, app);
    console.log(`✓ generated ${out}`);
    console.log('… network deploy not wired yet (control plane pending)');
  },
  login() {
    console.log('… login not wired yet (control plane pending)');
  },
  share() {
    console.log('… share not wired yet (control plane pending)');
  },
  list() {
    console.log('… list not wired yet (control plane pending)');
  },
  logs() {
    console.log('… logs not wired yet (control plane pending)');
  },
};

const run = commands[cmd];
if (!run) {
  console.log('usage: small <login|deploy|share|list|logs>');
  process.exitCode = 1;
} else {
  try {
    run();
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exitCode = 1;
  }
}
