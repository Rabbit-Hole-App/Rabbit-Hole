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

// R4 owner decision 5B, contract C8: the button hands one proposal to the page's Apply/Discard flow and applies nothing.
test('Use as table of contents proposes the saved syllabus through toContents and never applies it here', () => {
  assert.match(source, /syllabusProposal\(\{ \.\.\.syllabus, topics: topics\.map\(/);
  assert.match(source, /toContents\.propose\(proposal\)/);
  assert.match(source, /toContents\.outline\(\)/, 'against the contents as they are at the click');
  // Owner decision, Release A3 item 1: an adoption past the 120-heading limit is refused here, whole, before any proposal.
  assert.match(source, /else if \(problem\) setAdopted\(`\$\{problem\} Nothing was changed\.`\);\s*else \{ toContents\.propose\(proposal\)/);
  assert.match(source, /data-syllabus-contents disabled=\{dirty\}/, 'unsaved edits are saved first');
  assert.match(source, /Already in the table of contents\./);
  assert.doesNotMatch(source, /applyOutline/);
});
