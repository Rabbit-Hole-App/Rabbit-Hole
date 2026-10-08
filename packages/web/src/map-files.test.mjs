// The Main canvas's Files panel, the owner's 2026-10-08 clarification (docs/features/repository-browser.md "Files in Learn"):
// Ask in chat and Copy on a selection, the chat chip's passage, and pasted code asking Code card or Jupyter notebook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contextPassage, copiedCode, languageOf, rememberCodeCopy } from './map-files.js';
import { looksLikeCode, pasteKind } from './canvas-paste.js';
import { IMPORT_CHOICES, pasteBlock, pasteName } from './learn-file-import.js';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const memory = () => { const map = new Map(); return () => ({ getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) }); };
const SHA = 'c'.repeat(40);

test('the chat chip shows the file path, the lines (or Whole file) and the first lines of a passage; a symbol shows none', () => {
  const range = { commit: SHA, range: { path: 'nanogpt/model.py', start: 10, end: 14 }, label: 'model.py:10–14' };
  assert.deepEqual(contextPassage(range, 'a = 1\nb = 2\nc = 3\nd = 4\ne = 5'), { path: 'nanogpt/model.py', lines: 'lines 10–14', excerpt: [{ n: 10, text: 'a = 1' }, { n: 11, text: 'b = 2' }, { n: 12, text: 'c = 3' }], more: true });
  assert.equal(contextPassage({ commit: SHA, range: { path: 'm.py', start: 3, end: 3 }, label: 'm.py:3' }, 'x').lines, 'line 3');
  assert.deepEqual(contextPassage({ commit: SHA, path: 'train.py', label: 'train.py' }), { path: 'train.py', lines: 'Whole file', excerpt: [], more: false });
  assert.equal(contextPassage({ commit: SHA, nodeId: 'model_gpt', label: 'GPT' }), null);
  assert.equal(contextPassage(null), null);
});

test('text copied from a file is remembered with its path, matched by the text itself; blocked storage remembers nothing', () => {
  const store = memory();
  rememberCodeCopy(store, { text: 'def f():\r\n    return 1', path: 'nanogpt/model.py', repo: 'karpathy/nanoGPT', commit: SHA, start: 4, end: 5 });
  assert.deepEqual(copiedCode(store, 'def f():\n    return 1\n'), { text: 'def f():\r\n    return 1', path: 'nanogpt/model.py', repo: 'karpathy/nanoGPT', commit: SHA, start: 4, end: 5 });
  assert.equal(copiedCode(store, 'something copied after it'), null, 'anything copied after it wins');
  const blocked = () => { throw Error('SecurityError'); };
  assert.doesNotThrow(() => rememberCodeCopy(blocked, { text: 'x', path: 'a.py' }));
  assert.equal(copiedCode(blocked, 'x'), null);
  assert.deepEqual(['a.py', 'b.TS', 'c.jsx', 'README', null].map(languageOf), ['python', 'typescript', 'javascript', null, null]);
});

test('pasted code is told apart conservatively: code from a file always, other text only when most of its lines read as code', () => {
  for (const code of ['def attention(q, k, v):\n    w = q @ k.T\n    return softmax(w) @ v', 'function add(a, b) {\n  return a + b;\n}', 'import torch\nfrom torch import nn\nclass GPT(nn.Module):\n    pass'])
    assert.equal(looksLikeCode(code), true, code);
  for (const prose of ['Attention lets each token look at the others.', 'Softmax turns scores into weights.\nThey add up to one, so each is a share.',
    '- queries\n- keys\n- values', 'import torch', 'Here is the plan:\nRead the paper, then write notes.\nAsk about the parts that are unclear.'])
    assert.equal(looksLikeCode(prose), false, prose);
  const marker = 'rabbit-hole:copied-cards';
  assert.equal(pasteKind({ text: 'def f():\n    return 1', marker, code: true }), 'code');
  assert.equal(pasteKind({ text: 'plain words', marker }), 'text', 'prose still pastes as text');
  assert.equal(pasteKind({ images: 1, text: 'def f():', marker, code: true }), 'image', 'images unchanged');
  assert.equal(pasteKind({ text: marker, marker, cards: 2, code: true }), 'cards', 'our own card copies unchanged');
});

test('the paste popup offers exactly Code card and Jupyter notebook; a choice makes the card, keeping a file copy\'s name, path, language and lines', () => {
  assert.deepEqual(IMPORT_CHOICES.paste, [['code', 'Code card'], ['notebook', 'Jupyter notebook']]);
  const copy = { text: 'x = 1\ny = 2', path: 'nanogpt/model.py', repo: 'karpathy/nanoGPT', commit: SHA, start: 7, end: 8 };
  assert.equal(pasteName(copy), 'model.py');
  assert.equal(pasteName(null), 'snippet.py');
  const card = pasteBlock({ text: copy.text, copy, choice: 'code', assetKey: 'import:1', language: 'python' });
  assert.deepEqual([card.type, card.title, card.code, card.path, card.language, card.source_asset], ['snippet', 'model.py', 'x = 1\ny = 2', 'nanogpt/model.py', 'python', 'import:1']);
  assert.deepEqual(card.sources, [{ kind: 'code', repo: 'karpathy/nanoGPT', revision: SHA, path: 'nanogpt/model.py', lines: [7, 8] }]);
  const notebook = pasteBlock({ text: copy.text, copy, choice: 'notebook', assetKey: 'import:2', language: 'python' });
  assert.deepEqual([notebook.type, notebook.ipynb_path, notebook.files, notebook.seed_files], ['notebook', 'model.ipynb', ['model.ipynb', 'model.py'], { 'model.py': 'x = 1\ny = 2' }]);
  assert.equal(notebook.ipynb.cells[0].source, 'x = 1\ny = 2');
  assert.deepEqual(notebook.ipynb.cells[0].outputs, [], 'nothing ran');
  const pasted = pasteBlock({ text: 'a = 1\nb = 2', choice: 'code', assetKey: 'import:3' });
  assert.deepEqual([pasted.title, pasted.path, pasted.language, pasted.sources], ['snippet.py', undefined, undefined, undefined]);
  assert.throws(() => pasteBlock({ text: 'a', choice: 'attachment', assetKey: 'k' }), /choose how to add it/);
});

test('the panel\'s selection offers exactly Ask in chat and Copy; the Map keeps Ask and Learn; Copy answers on the button', () => {
  const reader = read('CodeReader.jsx'), repo = read('RepositoryPage.jsx');
  assert.match(repo, /files=\{snapshot&&reader\(\{query:'',stacked:true,place:'panel'\}\)\}/, 'the panel is the place that gets the two actions');
  const toolbar = reader.slice(reader.indexOf('{panel ? <>'), reader.indexOf('</div>} />'));
  const [panel, map] = toolbar.split(/<\/> : <>\n/); // the place switch, not the Copied ternary inside it
  assert.equal(panel.match(/<Button /g).length, 2, 'two actions');
  assert.match(panel, /data-range-ask onClick=\{\(\) => act\('ask', r\)\}><MessageSquare size=\{13\} \/>Ask in chat<\/Button>/);
  assert.match(panel, /data-range-copy onClick=\{\(\) => copy\(r\)\}>\{copied === `\$\{r\.path\}:\$\{r\.start\}-\$\{r\.end\}` \? <><Check size=\{13\} \/>Copied<\/> : <><Copy size=\{13\} \/>Copy<\/>\}/);
  assert.doesNotMatch(panel, /Learn/);
  assert.match(map, /act\('ask', r\)\}>Ask<\/Button>[\s\S]*act\('learn', r\)\}>Learn<\/Button>/);
  assert.doesNotMatch(reader, /toast\(/, 'no corner toast for Copy');
  assert.match(reader, /await navigator\.clipboard\.writeText\(r\.text\)/);
  assert.match(reader, /rememberCodeCopy\(\(\) => sessionStorage, \{ text: r\.text, path: r\.path, repo: app\.repo, commit: snapshot\.commit, start: r\.start, end: r\.end \}\)/);
  // Ask in chat attaches the passage (its text only for the chip) and prefills; it never sends (RepositoryPage askAbout).
  assert.match(reader, /onRange\(kind, \{ \.\.\.rangeContext\(r\.path, r\.start, r\.end, snapshot\.commit\), text: r\.text \}\)/);
  assert.match(repo, /const askAbout=\(object,question=askQuestion\)=>\{if\(!object\|\|object\.record\)return;setContext\(ground\(object\)\);setTimeout\(\(\)=>askDraft\(question\(object\)\),0\);\};/);
  assert.match(repo, /repositoryExcerpt=\{context\?\.kind==='range'\?context\.text:null\}/);
  assert.doesNotMatch(read('agent/scope.js').match(/export const wireContext[^\n]*/)[0], /\.text|text:/, 'the excerpt is never sent');
});

test('a code paste opens the Add to canvas dialog with the paste choices, before anything is placed', () => {
  const canvas = read('AdaptiveCanvas.jsx'), page = read('LearnPage.jsx');
  assert.match(canvas, /const code = !!pasteCodeRef\.current && \(!!copiedCode\(\(\) => sessionStorage, text\) \|\| looksLikeCode\(text\)\);/);
  assert.match(canvas, /if \(kind === 'code'\) \{ event\.preventDefault\(\); pasteCodeRef\.current\(text\); return; \}/);
  assert.match(page, /onDropFiles=\{takeDrop\} onPasteCode=\{pasteCode\}/);
  assert.match(page, /setImports\(queue => \[\.\.\.queue, \{ id: crypto\.randomUUID\(\), file: new File\(\[text\], pasteName\(copy\), \{ type: 'text\/plain' \}\), kind: 'paste', at: null, copy \}\]\);/);
  // The dialog is the file-drop one: Cancel (or Escape) is nextImport, which places nothing.
  assert.match(page, /<FileImportDialog key=\{imports\[0\]\.id\} file=\{imports\[0\]\.file\} kind=\{imports\[0\]\.kind\}[^\n]*\n\s+onCancel=\{nextImport\} onConfirm=\{addImport\} \/>/);
});

test('the chat chip names the path, the lines and a preview, removable; a question about lines or a file carries them to the repository reader', () => {
  const ask = read('ask.jsx');
  assert.match(ask, /const passage = contextPassage\(repositoryContext, repositoryExcerpt\);/);
  assert.match(ask, /<div data-context-path [^\n]*>\{passage\.path\} · \{passage\.lines\}<\/div>/);
  assert.match(ask, /<pre data-context-excerpt [^\n]*\{passage\.excerpt\.map\(line =>/);
  assert.match(ask, /aria-label="Clear repository selection" onClick=\{onClearRepository\}/);
  // Send: the Tutor turn does not carry Learn's repository context, so a file or lines question takes the Learn chat path,
  // whose request carries the range (repositoryAsk reads it); a symbol context stays with the Tutor.
  assert.match(ask, /const codeTurn = repository && !!\(repositoryContext\?\.range \|\| repositoryContext\?\.path\);/);
  assert.match(ask, /if \(tutor && !codeTurn\) \{/);
  assert.match(ask, /\.\.\.\(repository && repositoryContext \? \{ repository_context: \{ \.\.\.repositoryContext, commit: /);
});

test('Ask in chat in the panel puts the lines on the canvas as one selected Code card, keeping the range context; the Map\'s Ask does not', () => {
  const repo = read('RepositoryPage.jsx'), page = read('LearnPage.jsx');
  // Only the panel's Ask in chat places a card; Learn and the Map's own Ask never do.
  assert.match(repo, /onRange=\{\(kind,range\)=>\{attach\(range\);if\(kind==='learn'\)learnThis\(range\);else\{askAbout\(range\);if\(extra\?\.place==='panel'\)codeCard\(range\);\}\}\}/);
  assert.match(repo, /const codeCard=range=>window\.dispatchEvent\(new CustomEvent\('small:code-card',\{detail:\{text:range\.text,path:range\.path,start:range\.start,end:range\.end,commit:range\.commit,repo:app\.repo\}\}\)\);/);
  const place = page.slice(page.indexOf("const place = async event => {"), page.indexOf("window.addEventListener('small:code-card', place);"));
  // The paste dialog's Code card, with its file, lines and language as its code source, placed in view and selected.
  assert.match(place, /const block = pasteBlock\(\{ text, copy, choice: 'code', assetKey, language: languageOf\(path\) \}\);/);
  assert.match(place, /id = surface\.insertImported\(block\);/);
  assert.match(place, /surface\.select\(id\);/);
  // The same lines (repo, commit, path, start and end) reselect their card instead of making another.
  assert.match(place, /source\.kind === 'code' && source\.repo === repo && source\.revision === commit && source\.path === path && source\.lines\?\.\[0\] === start && source\.lines\?\.\[1\] === end/);
  assert.doesNotMatch(place, /fetch\(|api\(|\/ask|askDraft|send\(/, 'placing the card asks nothing');
  // And the card's lines: exactly the range, as a code source the card cites.
  const card = pasteBlock({ text: 'a = 1\nb = 2\nc = 3', copy: { path: 'train.py', repo: 'karpathy/nanoGPT', commit: SHA, start: 5, end: 7 }, choice: 'code', assetKey: 'import:9', language: 'python' });
  assert.deepEqual([card.type, card.title, card.code, card.sources[0].lines], ['snippet', 'train.py', 'a = 1\nb = 2\nc = 3', [5, 7]]);
});
