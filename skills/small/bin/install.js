#!/usr/bin/env node
'use strict';
// npx small-skill [--global] — install the skill into ./.claude/skills/small
// (or ~/.claude/skills/small with --global). Copies only the skill payload;
// this installer and package.json never land in the target.
const fs = require('fs');
const os = require('os');
const path = require('path');

const src = path.join(__dirname, '..');
const base = process.argv.includes('--global') ? os.homedir() : process.cwd();
const dst = path.join(base, '.claude', 'skills', 'small');

fs.mkdirSync(path.join(dst, 'references'), { recursive: true });
fs.copyFileSync(path.join(src, 'SKILL.md'), path.join(dst, 'SKILL.md'));
for (const f of fs.readdirSync(path.join(src, 'references'))) {
  if (f.endsWith('.md')) fs.copyFileSync(path.join(src, 'references', f), path.join(dst, 'references', f));
}
console.log(`✓ small skill installed → ${dst}`);
console.log('agents now know how to deploy Python tools with small — try: "share this with my team"');
