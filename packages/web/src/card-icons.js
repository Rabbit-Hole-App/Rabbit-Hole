import { AudioLines, BookOpenText, BookText, Blocks, Box, Boxes, Braces, ChartLine, Clapperboard, Code, Cuboid, Dumbbell, FileCode, FileSpreadsheet, FileText, Film, Focus, GalleryVerticalEnd, GitBranch, Globe, Heading, Image, Lightbulb, Link2, ListChecks, Minus, Network, PenTool, Pi, Presentation, Projector, Quote, Rotate3d, Route, Shapes, Spline, SquareFunction, Table2, Waypoints, Workflow } from 'lucide-react';

// One modern icon per card family (owner 2026-11-07: every card type has its own logo, not the dot the Explanation card drew). Pure: the header
// (CardHeader.jsx) and the tests read it. Keyed by block.type; a file card (type 'file') is keyed by its kind; an unknown type gets Shapes.
// docs/features/explain-on-canvas/card-header-template.md lists the family each type belongs to.
export const TYPE_ICONS = {
  explanation: Lightbulb,
  challenge: Dumbbell, explainBack: Dumbbell,
  quiz: ListChecks, flashcards: GalleryVerticalEnd,
  table: Table2,
  snippet: Braces, code: Code, 'repo-code': FileCode,
  graph: SquareFunction, plot: ChartLine, vector: Spline, mathAnimation: Pi,
  flow: Workflow, mermaid: Waypoints, walkthrough: Route, pipeline: Blocks,
  knowledge: Network, 'repo-graph': GitBranch,
  animation: Clapperboard, animationAxis: Clapperboard, animationResidual: Clapperboard, animationSigmoid: Clapperboard, referenceAttention: Focus,
  whiteboard: PenTool, whiteboardVideo: Projector, animation3d: Rotate3d,
  model3d: Box, scene: Boxes, cad: Cuboid,
  image: Image, imageGenerate: Image, video: Film, videoGenerate: Film, audio: AudioLines,
  paper: FileText, pdf: FileText, slide: Presentation, excerpt: Quote,
  wiki: BookOpenText, webpage: Globe, notebook: BookText, 'canvas-ref': Link2,
  divider: Minus, heading: Heading,
};
export const FILE_KIND_ICONS = { text: FileText, markdown: FileText, table: Table2, workbook: FileSpreadsheet, document: FileText, presentation: Presentation, image: Image, audio: AudioLines, video: Film, model: Box };

export function cardIconOf(block) {
  if (block?.type === 'explanation' && block.excerpt && (block.excerpt.kind === 'text' || block.excerpt.kind === 'region')) return TYPE_ICONS.excerpt; // a PDF excerpt is an explanation block (pdf-excerpt.js isExcerpt)
  if (block?.type === 'file') return FILE_KIND_ICONS[block.kind] || FileText;
  return TYPE_ICONS[block?.type] || Shapes;
}

// Slash command -> the card type(s) it puts on the canvas (owner 2026-11-07: every card a command produces has its own distinct icon). Covers EVERY entry of
// agent/slash.js SLASH and MATERIAL_TOOLS (the Tutor's internal tools); card-icons.test.mjs fails when one is added without a row. Traced from: learn-slash.js
// CARD_OF (primitive -> block type), generation-proposal-chat.js ADAPTERS (motion -> a 'video' block, mode generate), AdaptiveCanvas.jsx insertNotebook / insertWebpage /
// insertPaper / insertWiki, learn-slash.js runLearnCommand insert_whiteboard, and slash-sheet.js PREVIEWS. NOT traced to an insert call (named by BLOCK_TYPES / the
// primitive's own name): code_exercise -> code, knowledge_graph -> knowledge, 3d_model -> model3d, narration -> audio. goal opens the goal manager and creates no card.
export const COMMAND_CARDS = {
  explanation: ['explanation', 'table'], // /explain (written, owner 2026-11-07)
  explain: ['animation', 'audio'], // /interactive keeps the original id: the playable visual
  practice: ['explainBack', 'quiz', 'code'], quiz: ['quiz'], flashcards: ['flashcards'], goal: [],
  code: ['snippet', 'code'], graph: ['graph', 'plot', 'knowledge'], diagram: ['flow', 'mermaid'], notebook: ['notebook'],
  'generate-image': ['image'], motion: ['video'], cad: ['cad'], animation: ['animation3d'], 'whiteboard-video': ['whiteboardVideo'], '3d': ['model3d', 'scene'],
  browser: ['webpage'], image: ['image'], youtube: ['video'], arxiv: ['paper'], wikipedia: ['wiki'],
  compare: ['table', 'graph', 'plot', 'flow', 'mermaid'], walkthrough: ['walkthrough'], animate: ['referenceAttention', 'mathAnimation'], whiteboard: ['whiteboard'], video: ['videoGenerate'],
};
