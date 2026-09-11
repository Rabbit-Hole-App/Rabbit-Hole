'use strict';
// prepack: copy the canonical runtime files into the package so npm ships them.
const fs = require('fs');
const path = require('path');

for (const name of ['guard.py', 'runner.py', 'aws_runner.py']) {
  const src = path.join(__dirname, '..', '..', 'runtime', name);
  const dst = path.join(__dirname, '..', 'assets', name);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  console.log(`synced ${name} -> assets/`);
}

// the agent skill ships with the CLI so `small skill` can install it into a project.
// Replace the snapshot so a file removed from the canonical skill cannot remain in npm.
const skillDst = path.join(__dirname, '..', 'assets', 'skill');
fs.rmSync(skillDst, { recursive: true, force: true });
fs.cpSync(path.join(__dirname, '..', '..', '..', 'skills', 'small'), skillDst, { recursive: true });
console.log('synced skills/small -> assets/skill/');
