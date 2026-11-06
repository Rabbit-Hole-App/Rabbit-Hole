// Mounts the R4 roadmap UI into the two contended files (LearnPage.jsx is Lead-only; ask.jsx is hot with R2 and cleanup P2) by exact
// anchors, so it applies on any base where those anchors still exist and refuses loudly where one moved. A line diff cannot do this:
// the anchors are single very long lines that other lanes rewrite.
// Usage (Lead, at integration, from the repository root): node docs/features/explain-on-canvas/ui-patches/apply-r4-ui-mount.mjs [root]
// Writes nothing unless every anchor is found exactly once. Proven on the R4 UI base, cleanup P2, R1, R2 and R3 (see the hand-back).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] || process.cwd();
const edit = (file, steps) => {
  const path = join(root, 'packages/web/src', file);
  let text = readFileSync(path, 'utf8');
  const crlf = text.includes('\r\n');
  if (crlf) text = text.replace(/\r\n/g, '\n');
  if (text.includes('useRoadmap') || text.includes('divert')) throw Error(`${file}: already mounted`);
  for (const [name, find, replace] of steps) {
    const hits = typeof find === 'string' ? text.split(find).length - 1 : (text.match(new RegExp(find.source, find.flags.replace('g', '') + 'g')) || []).length;
    if (hits !== 1) throw Error(`${file}: anchor "${name}" found ${hits} times (expected 1)`);
    text = text.replace(find, replace);
  }
  return { path, text: crlf ? text.replace(/\n/g, '\r\n') : text };
};

const learn = edit('LearnPage.jsx', [
  ['imports', "import { useNextSteps } from './LearnNextSteps.jsx';", "import { useNextSteps } from './LearnNextSteps.jsx';\nimport { useRoadmap } from './use-roadmap.js';\nimport { RoadmapCanvas, RoadmapChat, RoadmapToc } from './RoadmapSurfaces.jsx';"],
  ['hook after useCanvasComments', /\n  const comments = useCanvasComments\([^\n]*\n/, match => `${match}  // Explain-on-canvas roadmap (R4): server-owned state, rendered in Chat, the ToC and over the canvas. ponytail: sourceBlockId maps R3's
  // 'file:<id>' source key to the file card by fileChatRef().sourceId, and insertCard uses the canvas's own insert (outward placement and
  // boardRevision are integration follow-ups).
  const sourceBlock = key => canvasApi.current?.blocks?.().find(block => fileChatRef(block)?.sourceId === String(key || '').replace(/^file:/, ''));
  const roadmap = useRoadmap({ api, boardId: commentBoard, enabled: isCanvas && !hole && boardName === 'main' && canEditCanvas && !!commentBoard, mode: chat?.thread?.mode || 'auto',
    host: { hasBlock: id => !!canvasApi.current?.blocks?.().some(block => block.id === id), insertCard: block => canvasApi.current?.insertImported({ ...block, dx: 0, dy: 0 }),
      persist: () => canvasApi.current?.persist?.(), boardRevision: () => null, readOnly: () => !canEditCanvas, presenting: () => !!canvasStateRef.current.presenting,
      focusBlock: id => id && canvasApi.current?.focusBlock(id), sourceBlockId: key => sourceBlock(key)?.id, sourceElement: key => { const id = sourceBlock(key)?.id; return id ? document.querySelector(\`[data-block-id="\${CSS.escape(id)}"]\`) : null; },
      sourceRev: key => sourceBlock(key)?.fileRef?.revision, instruction: () => '', depth: () => 'standard' } });
`],
  ['D1: Next Steps stand down while a roadmap is active', '<NextStepsHost on={nextStepsHere}', '<NextStepsHost on={nextStepsHere && !roadmap.active}'],
  ['overlay and indicator over the canvas', '<ChatHandle to={chatRef} /></div>', '<RoadmapCanvas roadmap={roadmap} /><ChatHandle to={chatRef} /></div>'],
  ['ToC section above the outline', '      <TableOfContents subtitle=', '      <RoadmapToc roadmap={roadmap} />\n      <TableOfContents subtitle='],
  ['Edit plan reaches the ToC conversation', '<TocConversation {...chatAskProps} scope={askScope}', '<TocConversation {...chatAskProps} divert={roadmap.divert} scope={askScope}'],
  ['Chat strip', "      <ChatPane key={app.name} hidden={panelTab !== 'chat'}", "      {panelTab === 'chat' && <RoadmapChat roadmap={roadmap} />}\n      <ChatPane key={app.name} hidden={panelTab !== 'chat'}"],
]);
const ask = edit('ask.jsx', [
  ['AskPanel prop', 'hideConversation = false', 'hideConversation = false, divert = null'],
  ['send diverts a plan revision', /(const send = async \(raw, scopeOverride,[^\n]*\} = \{\}\) => \{\n)/, "$1    // The Table of contents' Edit plan: the next message there is the roadmap's plan revision, not an outline turn (use-roadmap.js divert).\n    if (divert && tocView && !regenerate && !commandName && divert(raw)) { setInput(''); return; }\n"],
]);
for (const { path, text } of [learn, ask]) writeFileSync(path, text);
console.log('R4 roadmap UI mounted in LearnPage.jsx and ask.jsx');
