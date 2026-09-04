'use strict';
// prepack: copy the canonical runtime files into the package so npm ships them.
const fs = require('fs');
const path = require('path');

for (const name of ['guard.py', 'runner.py']) {
  const src = path.join(__dirname, '..', '..', 'runtime', name);
  const dst = path.join(__dirname, '..', 'assets', name);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  console.log(`synced ${name} -> assets/`);
}
