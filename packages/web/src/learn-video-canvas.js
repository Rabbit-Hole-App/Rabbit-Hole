import { AssetRecordType, PageRecordType, createShapeId } from 'tldraw';
import { api, getWs } from './api.js';

export function videoCanvas(editor, app, getLesson, restoreLesson, { kind = 'video' } = {}) {
  const isScene = kind === 'scene', collection = isScene ? 'scenes' : 'videos';
  const endpoint = `/api/learn/${kind}?app=${encodeURIComponent(app.name)}&workspace=${encodeURIComponent(getWs())}`;
  const known = new Map(), starting = new Map(), positions = new Map();
  let disposed = false, applying = false, timer, saveTimer, loading = false;
  const pageKey = page => page.meta.learnCoursePage ? `course:${page.meta.learnCoursePage}` : page.meta.sigmoidLessonPage !== undefined ? `sigmoid:${page.meta.sigmoidLessonPage}` : 'freeform';
  const position = shape => ({ x: shape.x, y: shape.y, w: shape.props.w, h: shape.props.h });
  const post = body => api(endpoint, { method: 'POST', body: JSON.stringify(body) });
  const findPage = video => {
    let page = editor.getPages().find(p => pageKey(p) === video.page);
    if (!page) {
      const meta = video.page.startsWith('sigmoid:') ? { sigmoidLessonPage: Number(video.page.slice(8)) } : video.page.startsWith('course:') ? { learnCoursePage: video.page.slice(7) } : {};
      const id = PageRecordType.createId(); editor.createPage({ id, name: video.operation.caption || 'Saved lesson asset', meta }); page = editor.getPage(id);
    }
    return page;
  };
  const render = video => {
    if (video.hidden) return;
    if (known.get(video.id)?.hidden) return; // Do not resurrect a local deletion while its save is in flight.
    const id = known.get(video.id)?.shapeId || createShapeId(`lesson-video-${video.id}`);
    const existing = editor.getShape(id);
    const page = existing ? editor.getPage(existing.parentId) : findPage(video);
    if (!page) return;
    const ratio = isScene ? 600 / 420 : video.operation.aspectRatio === '9:16' ? 9 / 16 : video.operation.aspectRatio === '1:1' ? 1 : 16 / 9;
    const p = existing ? position(existing) : video.position || { x: 100, y: 100, w: 480, h: 480 / ratio };
    const lesson = getLesson();
    const meta = { ...existing?.meta, ...(isScene ? { scenePlacement: video.id, sceneOperation: video.operation, concept: video.operation.concept, purpose: video.operation.purpose, sourceSceneSpec: video.operation.scene, outputType: 'glb' } : { videoPlacement: video.id, videoOperation: video.operation }), author: 'assistant', objectId: existing?.meta.objectId || video.operation.id, lessonId: video.lessonId,
      runId: lesson?.lessonId === video.lessonId ? lesson.runId : `saved-video-${video.id}`, kind: isScene ? 'three_d' : 'video', label: video.operation.caption || (video.operation.prompt || video.operation.concept).slice(0, 80),
      originalText: isScene ? `Technical 3D scene: ${video.operation.concept}. ${video.operation.caption || ''}. Objects: ${video.operation.scene.objects.map(o => o.id + ' (' + o.type + ')').join(', ')}.`.slice(0, 1000) : `AI-generated illustration: ${video.operation.caption || video.operation.prompt}. Purpose: ${video.operation.purpose}. Generated footage is not a measured simulation.`.slice(0, 1000),
      renderStatus: video.status === 'ready' ? 'complete' : 'drawing', relatedObjectIds: existing?.meta.relatedObjectIds || [] };
    const type = video.status === 'ready' ? (isScene ? 'three-d-viewer' : 'video') : 'learn-video-pending';
    let props;
    if (type === 'three-d-viewer') {
      const view = existing?.type === type ? existing.props : video.viewState || {};
      props = { w: p.w, h: p.h, modelUrl: new URL(`${endpoint}&asset=${video.key}`, window.location.origin).href, camera: view.camera || {}, animation: view.animation || { autoplay: false }, animationTime: view.animationTime || 0, autoRotate: view.autoRotate || false };
    } else if (type === 'video') {
      const assetId = AssetRecordType.createId(`lesson-video-${video.key}`);
      if (!editor.getAsset(assetId)) editor.createAssets([{ id: assetId, typeName: 'asset', type: 'video', meta: {}, props: { w: 480, h: 480 / ratio, name: meta.label, src: `${endpoint}&asset=${video.key}`, mimeType: 'video/mp4', isAnimated: true } }]);
      props = { w: p.w, h: p.h, assetId, autoplay: false };
    } else props = { w: p.w, h: p.h, status: video.status, caption: meta.label, error: video.error || '', retryable: video.retryable !== false };
    applying = true;
    try {
      const selected = editor.getSelectedShapeIds().includes(id);
      if (existing?.type !== type) {
        if (existing) editor.deleteShapes([id]);
        editor.createShape({ id, type, parentId: page.id, x: p.x, y: p.y, opacity: existing?.opacity ?? 1, props, meta });
        if (selected) editor.select(id);
      } else editor.updateShape({ id, type, props, meta });
      known.set(video.id, { ...video, shapeId: id });
      if (!positions.has(video.id)) positions.set(video.id, JSON.stringify(p));
    } finally { applying = false; }
  };
  const refresh = async () => {
    if (disposed || loading) return;
    loading = true;
    try {
      const result = await api(endpoint);
      if (disposed) return;
      if (!getLesson() && result[collection].some(v => !v.hidden)) {
        const first = result[collection].find(v => !v.hidden), page = findPage(first);
        restoreLesson({ lessonId: first.lessonId, runId: crypto.randomUUID(), pageId: page.id, currentStage: 'explanation', topic: first.operation.caption || first.operation.concept || 'Saved lesson asset', recentExplanations: [] });
        editor.setCurrentPage(page.id);
      }
      result[collection].forEach(render);
      if (!known.size) return;
    } catch (error) { console.warn('Could not refresh saved lesson videos:', error.message); }
    finally { loading = false; if (!disposed) timer = setTimeout(refresh, 5000); }
  };
  const savePositions = async () => {
    for (const [id, video] of known) {
      const shape = editor.getShape(video.shapeId);
      const p = shape ? position(shape) : video.position;
      if (!p) continue;
      const viewState = isScene && shape?.type === 'three-d-viewer' ? { camera: shape.props.camera, animation: shape.props.animation, animationTime: shape.props.animationTime, autoRotate: shape.props.autoRotate } : {};
      const encoded = shape ? JSON.stringify({ p, viewState }) : 'hidden';
      if (positions.get(id) === encoded) continue;
      try { await post({ action: 'place', id, position: p, hidden: !shape, ...(isScene ? { viewState } : {}) }); positions.set(id, encoded); video.position = p; video.hidden = !shape; }
      catch (error) { console.warn('Could not save video position:', error.message); }
    }
  };
  const start = async (shapeId, operation, snapshot, retry = false) => {
    const shape = editor.getShape(shapeId);
    if (!shape || disposed || starting.has(shapeId)) return;
    starting.set(shapeId, { operation, snapshot });
    editor.updateShape({ id: shapeId, type: shape.type, props: { status: isScene ? 'queued' : 'generating', error: '' } });
    try {
      // Only reached from the shape's Generate button: the learner confirmed.
      const result = await post({ operation, lessonId: snapshot.lessonId, page: pageKey(editor.getPage(shape.parentId)), retry, confirmed: true });
      const video = result[collection].find(v => v.id === result.placementId);
      video.position = position(editor.getShape(shapeId) || shape);
      await post({ action: 'place', id: video.id, position: video.position });
      if (disposed) return;
      known.set(video.id, { ...video, shapeId });
      render(video);
    } catch (error) {
      if (!disposed && editor.getShape(shapeId)) editor.updateShape({ id: shapeId, type: 'learn-video-pending', props: { status: 'failed', error: error.message } });
    } finally { starting.delete(shapeId); }
  };
  // Generate on a proposed shape; a retry is a failed job proposed again.
  const generate = event => {
    const shape = editor.getShape(event.detail);
    if (!shape || !!shape.meta.sceneOperation !== isScene) return;
    const video = [...known.values()].find(v => v.shapeId === shape.id);
    start(shape.id, video?.operation || (isScene ? shape.meta.sceneOperation : shape.meta.videoOperation), { lessonId: video?.lessonId || shape.meta.lessonId }, shape.meta.retry === true);
  };
  const unlisten = editor.store.listen(() => {
    if (applying) return;
    for (const video of known.values()) if (!editor.getShape(video.shapeId)) video.hidden = true;
    clearTimeout(saveTimer); saveTimer = setTimeout(savePositions, 500);
  }, { source: 'user', scope: 'document' });
  editor.getContainer().addEventListener('learn-video-generate', generate);
  refresh();
  return { start, sync() {
    for (const video of known.values()) if (!video.hidden) render(video);
  }, dispose() { disposed = true; clearTimeout(timer); clearTimeout(saveTimer); unlisten(); editor.getContainer().removeEventListener('learn-video-generate', generate); savePositions(); } };
}
