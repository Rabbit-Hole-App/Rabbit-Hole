// No new hard-coded colours in the confirmation, slash notice, chat composer and CAD surfaces (brief section 3,
// owner clarification 9: "a scoped check against new hard-coded UI colors ... avoid an indiscriminate repository-wide ban").
// A colour in these files comes from a semantic token in index.css (bg-surface, text-ink, border-line-strong, bg-accent/30,
// text-fail ...), which .dark re-skins. A hex, rgb()/hsl()/oklch() value, a 0x number, a Tailwind palette shade (text-red-700)
// or black does not follow the theme - LearnSlash's #2383e2 tint is how the dark confirmation broke (L3-report.md).
//
// SCOPE is the files checked (a slice of a file when `from`/`to` is given). ALLOW is every literal those files may hold,
// with its exact count and why: a new literal fails, and so does an entry whose literal is gone (remove it). Add an entry
// only for a colour that must not follow the theme (the CAD viewport's white/black, a 3D light) and say why.
// Not covered (shortcut: named colours in strings - 'white', 'red' - and the themed --color-white classes bg-white/text-white,
// which this codebase uses as its page surface; widen the patterns if a bypass of that kind recurs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SCOPE = [
  { file: 'PaidConfirm.jsx' },
  { file: 'LearnSlash.jsx' },
  { file: 'ChatComposer.jsx' },
  { file: 'ChatMessages.jsx' },
  { file: 'ChatOutputs.jsx' },
  { file: 'CadCard.jsx' },
  { file: 'three-d-renderer.js' },
  { file: 'ui.jsx', from: 'export function Button(', to: '\n}\n' },
];
const ALLOW = [
  { file: 'ChatComposer.jsx', literal: 'rgba(35,131,226,0.2)', count: 2, why: 'the focus ring shadow: --color-accent at 20% in a shadow-[] value' },
  { file: 'ChatComposer.jsx', literal: 'rgba(15,15,15,0.05)', count: 1, why: 'the flat composer shadow, the same as --shadow-pop\'s first layer' },
  { file: 'ChatMessages.jsx', literal: '#b42318', count: 3, why: 'the chosen next-step chip\'s red (border, tint, icon); predates this check' },
  { file: 'CadCard.jsx', literal: 'text-red-700', count: 1, why: 'the job error line; a palette shade, not themed (text-fail is the token). Lane L2 owns the file.' },
  { file: 'three-d-renderer.js', literal: '#f4f5f7', count: 1, why: 'the 3D viewport background: model content, not app chrome' },
  { file: 'three-d-renderer.js', literal: '0xffffff', count: 2, why: 'the scene lights (hemisphere sky, directional): white light, not a UI colour' },
  { file: 'three-d-renderer.js', literal: '0x667788', count: 1, why: 'the hemisphere light\'s ground colour' },
  { file: 'ui.jsx', literal: 'rgba(0,0,0,0.12)', count: 1, why: 'the secondary Button\'s faint drop shadow' },
];

const PALETTE = 'red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone';
const UTILITY = 'bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|outline|fill|stroke|from|via|to|shadow|decoration|divide|placeholder|caret|accent';
const PATTERNS = [
  /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g, // #2383e2, bg-[#2383e2]/30
  /\b0x[0-9a-fA-F]{6}\b/g, // three.js colours
  /(?<![a-zA-Z-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([^)]*\)/g, // also inside shadow-[0_1px_rgba(...)]
  new RegExp(`(?<![\\w-])(?:${UTILITY})-(?:(?:${PALETTE})-\\d{2,3}|black)(?![\\w-])`, 'g'), // text-red-700, bg-black
];
export const colourLiterals = source => PATTERNS.flatMap(pattern => [...source.matchAll(pattern)].map(match => ({
  literal: match[0].replace(/\s+/g, ' '), line: source.slice(0, match.index).split('\n').length,
})));

const sliceOf = ({ file, from, to }) => {
  const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  if (!from) return { source, offset: 0 };
  const start = source.indexOf(from);
  assert.ok(start >= 0, `${file}: '${from}' not found; update SCOPE`);
  const end = source.indexOf(to, start);
  return { source: source.slice(start, end < 0 ? undefined : end), offset: source.slice(0, start).split('\n').length - 1 };
};

test('the scanner finds hard-coded colours and leaves semantic tokens alone', () => {
  const found = colourLiterals("a 'border-[#2383e2]/30 bg-[#fff]' rgba(0, 0, 0, .1) hsl(1 2% 3%) text-red-700 bg-black/50 0x667788 x\n"
    + "fine: bg-accent/30 text-ink border-line-strong bg-surface text-fail &#123; #root-id to-ink text-redish-700").map(f => f.literal);
  assert.deepEqual(found.sort(), ['#2383e2', '#fff', '0x667788', 'bg-black', 'hsl(1 2% 3%)', 'rgba(0, 0, 0, .1)', 'text-red-700'].sort());
});

test('the scoped UI files hold no hard-coded colour outside the documented allow list', () => {
  const problems = [];
  for (const scope of SCOPE) {
    const { source, offset } = sliceOf(scope);
    const counts = new Map();
    for (const { literal, line } of colourLiterals(source)) {
      counts.set(literal, (counts.get(literal) || []).concat(line + offset));
    }
    for (const [literal, lines] of counts) {
      const entry = ALLOW.find(a => a.file === scope.file && a.literal === literal);
      if (!entry) problems.push(`${scope.file}:${lines.join(',')} hard-codes ${literal}; use a token from index.css (or add a documented ALLOW entry)`);
      else if (entry.count !== lines.length) problems.push(`${scope.file}:${lines.join(',')} has ${literal} ${lines.length}x; ALLOW says ${entry.count}`);
    }
    for (const entry of ALLOW.filter(a => a.file === scope.file && !counts.has(a.literal))) problems.push(`${scope.file}: ALLOW lists ${entry.literal} but it is gone; remove the entry`);
  }
  for (const entry of ALLOW) assert.ok(SCOPE.some(s => s.file === entry.file), `ALLOW names ${entry.file}, which is not in SCOPE`);
  assert.deepEqual(problems, []);
});
