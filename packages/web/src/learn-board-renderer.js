import { AssetRecordType, Box, compressLegacySegments, createShapeId, toRichText } from 'tldraw';
import { writingFrames } from './canvas-writing.js';
import { connector } from './learn-board-layout.js';

export function drawExplanation(editor, snapshot, plan, { onVideo, onScene, app = '' } = {}) {
  const pageId = editor.getCurrentPageId(), camera = { ...editor.getCamera() };
  const explanationId = crypto.randomUUID(), ids = [], frames = [];
  editor.selectNone();
  const initial = editor.getCurrentPageShapes().map(s => ({ id: s.id, box: editor.getShapePageBounds(s.id) })).filter(s => s.box);
  const occupied = initial.map(s => s.box);
  const columnX = Math.max(0, ...occupied.map(b => b.maxX)) + 120;
  const columnTop = Math.min(0, ...occupied.map(b => b.y));
  let columnY = columnTop;
  const objects = [snapshot.target, ...snapshot.relatedObjects].filter(Boolean);
  const objectIds = plan.blocks.map((_, i) => `explanation-${explanationId}-${i}`);
  let timer, disposed = false, index = 0, followCamera = null, following = true;
  const followWriting = id => {
    if (!following || !followCamera) return;
    const camera = editor.getCamera();
    if (['x', 'y', 'z'].some(k => Math.abs(camera[k] - followCamera[k]) > 0.01)) { following = false; return; }
    const bounds = editor.getShapePageBounds(id), viewport = editor.getViewportPageBounds();
    if (!bounds) return;
    const margin = 45 / camera.z;
    const bottom = bounds.maxY;
    const delta = bottom > viewport.maxY - margin ? bottom - viewport.maxY + margin : bounds.h < viewport.h - 2 * margin && bounds.y < viewport.y + margin ? bounds.y - viewport.y - margin : 0;
    if (delta) editor.setCamera({ ...camera, y: camera.y - delta });
    followCamera = { ...editor.getCamera() };
  };
  const wrap = text => text.split('\n').flatMap(line => line.match(/.{1,52}(?:\s|$)|\S{1,52}/g)?.map(s => s.trim()) || ['']).join('\n');
  const create = (shape, meta) => { ids.push(shape.id); editor.createShape({ ...shape, opacity: 0, parentId: pageId, meta }); return shape.id; };
  for (const [i, block] of plan.blocks.entries()) {
    const source = objects.find(o => o.objectId === block.fromObjectId) || snapshot.target || objects[0];
    const sourceIds = snapshot.target && source?.objectId === snapshot.target.objectId ? snapshot.target.selectedShapeIds : source?.shapeIds;
    const bounds = sourceIds?.map(id => editor.getShapePageBounds(id)).filter(Boolean);
    const anchor = bounds?.length ? Box.Common(bounds) : editor.getCurrentPageBounds() || new Box(0, 0, 640, 480);
    const diagramText = block.kind === 'image' ? `${block.text}\nPhoto description: ${block.photo.alt}\nPhoto by ${block.photo.photographer} on Pexels.\nAnnotations: ${JSON.stringify(block.annotations || [])}` : block.kind === 'diagram' ? `${block.text}\nNodes: ${block.nodes.map(n => `${n.id}: ${n.label}`).join('; ')}\nConnections: ${block.edges.map(e => `${e.from} -> ${e.to}`).join('; ')}` : block.text;
    const meta = { author: 'assistant', explanationId, objectId: objectIds[i], label: block.text.slice(0, 80), originalText: (diagramText + (block.paper ? `\nSource: ${block.paper.title}, arXiv:${block.paper.id}, PDF page ${block.citation.page}, ${block.citation.label}` : '')).slice(0, 1000),
      ...(block.paper ? { paper: { ...block.paper, page: block.citation.page } } : {}),
      kind: block.kind, renderStatus: 'drawing', runId: snapshot.runId, lessonId: snapshot.lessonId,
      ...(block.kind === 'video' ? { videoOperation: block.operation } : {}),
      ...(block.kind === 'scene' ? { sceneOperation: block.operation } : {}),
      ...(block.kind === 'graph' ? { graphOperation: true } : {}),
      ...(block.kind === 'three_d' ? { threeDOperation: true, concept: block.operation.concept, description: block.operation.description || block.text } : {}),
      relatedObjectIds: [...new Set([...(source ? [source.objectId] : []), ...objectIds.filter(id => id !== objectIds[i])])],
    };
    const local = [], writes = [], credits = [], edgesBefore = new Map(), trailingEdges = [];
    const textShape = (text, x, y, font = 'draw', color = 'black') => {
      const id = create({ id: createShapeId(), type: 'text', x, y, props: { richText: toRichText(text), font, color, size: 'm', autoSize: true } }, meta);
      local.push(id); writes.push({ id, text }); return id;
    };
    const linkedCredit = (text, url, y) => {
      const credit = toRichText(wrap(text));
      for (const paragraph of credit.content) for (const node of paragraph.content || []) node.marks = [{ type: 'link', attrs: { href: url, target: '_blank', rel: 'noopener noreferrer' } }];
      const id = create({ id: createShapeId(), type: 'text', x: 0, y, props: { richText: credit, font: 'sans', color: 'blue', size: 's', autoSize: true } }, meta);
      local.push(id); credits.push(id);
    };
    if (block.kind === 'scene') {
      local.push(create({ id: createShapeId(), type: 'learn-video-pending', x: 0, y: 0, props: { w: 600, h: 420, status: 'queued', caption: block.operation.caption || block.text } }, meta));
    } else if (block.kind === 'three_d') {
      const op = block.operation;
      local.push(create({ id: createShapeId(), type: 'three-d-viewer', x: 0, y: 0, props: { w: 600, h: 420, modelUrl: op.modelUrl, camera: op.camera || {}, autoRotate: op.autoRotate || false, animation: op.animation || { autoplay: false }, animationTime: 0 } }, meta));
    } else if (block.kind === 'graph') {
      local.push(create({ id: createShapeId(), type: 'interactive-graph', x: 0, y: 0, props: { w: 640, h: 420, spec: block.operation, state: {}, app } }, meta));
    } else if (block.kind === 'video') {
      const ratio = block.operation.aspectRatio === '9:16' ? 9 / 16 : block.operation.aspectRatio === '1:1' ? 1 : 16 / 9;
      local.push(create({ id: createShapeId(), type: 'learn-video-pending', x: 0, y: 0, props: { w: 480, h: 480 / ratio, caption: block.operation.caption || block.text } }, meta));
    } else if (['image', 'paper_figure'].includes(block.kind)) {
      const photo = block.photo || block.figure;
      const scale = Math.min(1, 480 / photo.width, 320 / photo.height);
      const w = photo.width * scale, h = photo.height * scale;
      const assetId = AssetRecordType.createId();
      editor.createAssets([{ id: assetId, typeName: 'asset', type: 'image', meta: {}, props: { w: photo.width, h: photo.height, name: photo.alt, src: photo.src, mimeType: block.figure ? 'image/png' : 'image/jpeg', isAnimated: false } }]);
      local.push(create({ id: createShapeId(), type: 'image', x: 0, y: 0, props: { w, h, assetId, url: photo.url } }, meta));
      for (const mark of block.annotations || []) {
        if (['box', 'circle', 'highlight'].includes(mark.kind)) local.push(create({ id: createShapeId(), type: 'geo', x: mark.x * w, y: mark.y * h, props: { geo: mark.kind === 'circle' ? 'ellipse' : 'rectangle', w: mark.w * w, h: mark.h * h, color: mark.kind === 'highlight' ? 'yellow' : 'red', fill: mark.kind === 'highlight' ? 'semi' : 'none', size: 'm' } }, meta));
        else if (mark.kind === 'arrow') local.push(create({ id: createShapeId(), type: 'arrow', x: mark.x * w, y: mark.y * h, props: { start: { x: 0, y: 0 }, end: { x: (mark.x2 - mark.x) * w, y: (mark.y2 - mark.y) * h }, color: 'red', size: 'm', arrowheadEnd: 'arrow' } }, meta));
        else if (mark.kind === 'path') local.push(create({ id: createShapeId(), type: 'draw', x: 0, y: 0, props: { color: 'red', size: 'm', isComplete: true, segments: compressLegacySegments([{ type: 'free', points: mark.points.map(p => ({ x: p.x * w, y: p.y * h, z: 0.5 })) }]) } }, meta));
        else textShape(mark.text, mark.x * w, mark.y * h, 'sans', 'red');
      }
      const caption = textShape(wrap(block.text), 0, h + 15);
      if (block.photo) linkedCredit(`Photo by ${photo.photographer} on Pexels`, photo.url, editor.getShapePageBounds(caption).maxY + 12);
    } else if (block.kind === 'diagram') {
      textShape(block.text, 0, 0);
      // Order nodes so edges point rightward (topological; cycles keep given order).
      // Without this a hub node declared first sends every edge looping backward.
      const pending = block.nodes.map(n => n.id), order = [];
      while (pending.length) {
        const next = pending.find(id => !block.edges.some(e => e.to === id && e.from !== id && pending.includes(e.from))) ?? pending[0];
        order.push(next); pending.splice(pending.indexOf(next), 1);
      }
      const nodes = order.map(id => block.nodes.find(n => n.id === id));
      nodes.forEach((node, j) => {
        const id = create({ id: createShapeId(), type: 'geo', x: j * 220, y: 70, props: { geo: 'rectangle', w: 170, h: 160, color: 'blue', fill: 'semi', size: 's', font: 'sans', richText: toRichText(node.label) } }, meta);
        local.push(id); writes.push({ id, text: node.label });
      });
      let below = 0, above = 0;
      block.edges.forEach(edge => {
        const from = nodes.findIndex(n => n.id === edge.from), to = nodes.findIndex(n => n.id === edge.to);
        const adjacent = to === from + 1;
        // Forward skips arc below, backward edges arc above, each in its own lane.
        const lane = adjacent ? 0 : to < from ? above++ : below++;
        const y = to < from ? 58 - lane * 24 : 240 + lane * 24;
        const id = create({ id: createShapeId(), type: 'arrow', x: 0, y: 0, props: { start: { x: from * 220 + (adjacent ? 178 : 85), y: adjacent ? 150 : y }, end: { x: to * 220 + (adjacent ? -8 : 85), y: adjacent ? 150 : y }, bend: adjacent ? 0 : to < from ? -70 : 80, color: 'blue', size: 's', arrowheadEnd: 'arrow' } }, meta);
        local.push(id);
        if (to > from) { const target = writes[to + 1].id; edgesBefore.set(target, [...(edgesBefore.get(target) || []), id]); }
        else trailingEdges.push(id);
      });
    } else {
      // Equations and code retain their exact lines. Only prose is wrapped.
      textShape(block.kind === 'text' ? wrap(block.text) : block.text, 0, 0, block.kind === 'code' ? 'mono' : 'draw', block.kind === 'equation' ? 'blue' : 'black');
    }
    if (block.paper) {
      const bottom = Math.max(...local.map(id => editor.getShapePageBounds(id).maxY));
      linkedCredit(`${block.paper.title} | arXiv:${block.paper.id} | p.${block.citation.page} ${block.citation.label}`, `${block.paper.pdfUrl}#page=${block.citation.page}`, bottom + 12);
    }
    const measured = Box.Common(local.map(id => editor.getShapePageBounds(id)).filter(Boolean));
    const position = { x: columnX, y: columnY, w: measured.w, h: measured.h };
    columnY += measured.h + 60;
    for (const id of local) { const s = editor.getShape(id); editor.updateShape({ id, type: s.type, x: s.x + position.x - measured.x, y: s.y + position.y - measured.y }); }
    const route = block.fromObjectId && connector(anchor, position, initial.filter(s => !sourceIds?.includes(s.id) && !s.box.containsPoint(anchor.center)).map(s => s.box).concat(occupied.slice(initial.length)));
    const sourceArrow = route ? create({ id: createShapeId(), type: 'arrow', x: route.start.x, y: route.start.y, props: { start: { x: 0, y: 0 }, end: { x: route.end.x - route.start.x, y: route.end.y - route.start.y }, bend: 0, color: 'red', size: 's', arrowheadEnd: 'arrow' } }, meta) : null;
    if (sourceArrow) local.push(sourceArrow);
    occupied.push(position);
    frames.push({ apply: () => followWriting(local[0]), delay: 0 });
    const reveal = (id, delay = 0) => frames.push({ apply: () => { const shape = editor.getShape(id); if (shape) editor.updateShape({ id, type: shape.type, opacity: 1 }); }, delay });
    if (sourceArrow) reveal(sourceArrow, 180);
    const deferred = new Set([...writes.map(w => w.id), ...credits, ...[...edgesBefore.values()].flat(), ...trailingEdges, sourceArrow]);
    for (const id of local) if (!deferred.has(id)) reveal(id);
    if (block.kind === 'scene') frames.push({ apply: () => onScene?.(local[0], block.operation, snapshot), delay: 0 });
    if (block.kind === 'video') frames.push({ apply: () => onVideo?.(local[0], block.operation, snapshot), delay: 0 });
    for (const { id, text } of writes) {
      editor.updateShape({ id, type: editor.getShape(id).type, props: { richText: toRichText('') } });
      for (const edge of edgesBefore.get(id) || []) reveal(edge, 180);
      reveal(id);
      frames.push(...writingFrames(text, value => { if (editor.getShape(id)) { editor.updateShape({ id, type: editor.getShape(id).type, props: { richText: toRichText(value) } }); followWriting(id); } }));
    }
    for (const id of trailingEdges) reveal(id, 180);
    for (const id of credits) reveal(id);
    frames.push({ apply: () => { for (const id of local) { const s = editor.getShape(id); if (s) editor.updateShape({ id, type: s.type, meta: { ...s.meta, renderStatus: 'complete' } }); } }, delay: 0 });
  }
  const screen = editor.getViewportScreenBounds();
  const width = Math.max(...occupied.slice(initial.length).map(b => b.w), 400);
  // Pan to this explanation, keeping a readable zoom even for a long derivation.
  const zoom = Math.max(0.65, Math.min(1, (screen.w - 100) / width));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const target = { x: -columnX + 40 / zoom, y: -columnTop + 75 / zoom, z: zoom };
  // Glide to the explanation and only start writing once the pan lands.
  editor.setCamera(target, reduced ? undefined : { animation: { duration: 500 } });
  followCamera = target;
  const tick = () => {
    if (disposed || editor.getCurrentPageId() !== pageId) return;
    while (index < frames.length) { const frame = frames[index++]; frame.apply(); if (!reduced) { timer = setTimeout(tick, frame.delay); return; } }
  };
  timer = setTimeout(tick, reduced ? 0 : 520);
  return { dispose() {
    disposed = true; clearTimeout(timer);
    editor.run(() => editor.deleteShapes(ids.filter(id => editor.getShape(id)?.meta.explanationId === explanationId && !editor.getShape(id)?.meta.videoOperation && !editor.getShape(id)?.meta.graphOperation && !editor.getShape(id)?.meta.threeDOperation && !editor.getShape(id)?.meta.sceneOperation)), { ignoreShapeLock: true });
    if (editor.getCurrentPageId() === pageId) editor.setCamera(camera, { animation: { duration: 300 } });
  } };
}
