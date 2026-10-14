// SyllabusMessage.jsx (chat-workspace-CONTRACT.md B6): a Tutor syllabus as an editable ordered list that saves through
// saveSyllabus (chat-syllabus-route.js). Source pins, as the other component checks read their files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./SyllabusMessage.jsx', import.meta.url), 'utf8');

test('the syllabus is an ordered list, editable only with saveSyllabus, saved whole with refs as sourceIds', () => {
  assert.match(source, /<ol /);
  assert.match(source, /const editable = !!saveSyllabus;/);
  assert.match(source, /await saveSyllabus\(topics\.map\(/);
  assert.match(source, /refs: t\.refs\.map\(r => r\.sourceId\)/);
  assert.match(source, /objectives: lines\(objectivesText\)/);
  assert.doesNotMatch(source, /fetch\(|generate\w*\(/i, 'it saves through the prop and never generates');
});

test('icon-only controls carry aria-label and title; icons are descriptive lucide icons', () => {
  const icons = source.split('\n').filter(line => line.includes('className={ICON}>'));
  assert.equal(icons.length, 3);
  for (const button of icons) { assert.match(button, /aria-label=/); assert.match(button, /title=/); }
  assert.match(source, /from 'lucide-react'/);
  assert.doesNotMatch(source, /Sparkles|AppIcon/);
});
