'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('skill frontmatter follows the published authoring constraints', () => {
  const source = read('SKILL.md');
  const match = source.match(/^---\r?\nname: ([^\r\n]+)\r?\ndescription: ([^\r\n]+)\r?\n---\r?\n/);
  assert.ok(match, 'SKILL.md needs name and description frontmatter');
  const [, name, description] = match;
  assert.match(name, /^[a-z0-9-]{1,64}$/);
  assert.doesNotMatch(name, /anthropic|claude/);
  assert.ok(description.length > 0 && description.length <= 1024);
  assert.doesNotMatch(description, /<[^>]+>|\b(?:I|we|you|your)\b/i);
  assert.match(description, /^.+\. Use when /, 'description must say what the skill does and when to use it');
  assert.ok(source.slice(match[0].length).split(/\r?\n/).length < 500);
});

test('references stay one level deep and long references have contents', () => {
  for (const name of fs.readdirSync(path.join(root, 'references'))) {
    if (!name.endsWith('.md')) continue;
    const source = read(path.join('references', name));
    assert.doesNotMatch(source, /references\/[a-z0-9_-]+\.md/i, `${name} must not create a nested reading chain`);
    if (source.split(/\r?\n/).length > 100) assert.match(source, /^## Contents$/m, `${name} needs a table of contents`);
  }
});

test('instructions do not embed customer identities, environment URLs, or release versions', () => {
  const files = ['SKILL.md', 'README.md', ...fs.readdirSync(path.join(root, 'references')).filter((name) => name.endsWith('.md')).map((name) => path.join('references', name))];
  const source = files.map(read).join('\n');
  assert.doesNotMatch(source, /\b\d{12}\b|(?:workers\.dev|cloudfront\.net)|small-deploy@\d|release `?\d+\.\d+\.\d+/i);
  assert.doesNotMatch(source, /[A-Za-z]:\\|\\[A-Za-z0-9_.-]+\\/);
});
