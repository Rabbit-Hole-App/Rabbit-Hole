'use strict';
// prepack: copy the canonical guard.py into the package so npm ships it.
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', '..', 'runtime', 'guard.py');
const dst = path.join(__dirname, '..', 'assets', 'guard.py');
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.copyFileSync(src, dst);
console.log('synced guard.py -> assets/');
