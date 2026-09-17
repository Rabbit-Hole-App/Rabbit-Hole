import { validateThreeD } from '../../control-plane/src/learn-three-d-schema.js';
import { PageRecordType } from 'tldraw';
import { validateGraph } from '../../control-plane/src/learn-graph-schema.js';

let database;
const db = () => database ||= new Promise((resolve, reject) => {
  const request = indexedDB.open('small-learn-graphs', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('canvases');
  request.onsuccess = () => resolve(request.result); request.onerror = () => { database = null; reject(request.error); };
});
async function storage(key, value) {
  const connection = await db();
  return new Promise((resolve, reject) => {
    const transaction = connection.transaction('canvases', value === undefined ? 'readonly' : 'readwrite');
    const store = transaction.objectStore('canvases');
    const request = value === undefined ? store.get(key) : store.put(value, key);
    transaction.oncomplete = () => resolve(request.result); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
  });
}
const pageKey = page => page.meta.learnCoursePage ? `course:${page.meta.learnCoursePage}` : page.meta.sigmoidLessonPage !== undefined ? `sigmoid:${page.meta.sigmoidLessonPage}` : 'freeform';

// Personal interactive state follows the existing notes' browser/account/app scope.
export function persistGraphs(editor, app, getLesson, restoreLesson, onError) {
  const key = JSON.stringify([app.email, app.org, app.name]);
  let disposed = false, loaded = false, timer;
  const save = async () => {
    if (!loaded) return;
    const records = editor.getPages().flatMap(page => [...editor.getPageShapeIds(page.id)].map(id => editor.getShape(id)).filter(shape => ['interactive-graph', 'three-d-viewer'].includes(shape.type) && !shape.meta.scenePlacement).map(shape => ({ shape: { ...shape, opacity: 1 }, page: { name: page.name, meta: page.meta, key: pageKey(page) } })));
    try { await storage(key, { records, camera: { ...editor.getCamera() }, page: pageKey(editor.getCurrentPage()) }); onError(''); } catch { onError('Could not save interactive objects in this browser.'); }
  };
  storage(key).then(saved => {
    if (disposed) return;
    const records = Array.isArray(saved) ? saved : saved?.records;
    for (const record of records || []) {
      if (record.shape.type === 'three-d-viewer') validateThreeD({ op: 'interactive_3d', id: 'saved-model', concept: record.shape.meta.concept || '3D model', modelUrl: record.shape.props.modelUrl, camera: record.shape.props.camera, animation: record.shape.props.animation, autoRotate: record.shape.props.autoRotate });
      else validateGraph(record.shape.props.spec);
      let page = editor.getPages().find(p => pageKey(p) === record.page.key);
      if (!page) { const id = PageRecordType.createId(); editor.createPage({ id, name: record.page.name, meta: record.page.meta }); page = editor.getPage(id); }
      let lesson = getLesson();
      if (!lesson) {
        lesson = { lessonId: record.shape.meta.lessonId, runId: crypto.randomUUID(), pageId: page.id, currentStage: 'explanation', topic: (record.shape.meta.concept || record.shape.props.spec?.concept || 'Interactive lesson').slice(0, 150), recentExplanations: [] };
        restoreLesson(lesson); editor.setCurrentPage(page.id);
      }
      if (!editor.getShape(record.shape.id)) editor.createShape({ ...record.shape, parentId: page.id, props: { ...record.shape.props, ...(record.shape.type === 'interactive-graph' ? { app: app.name } : {}) }, meta: { ...record.shape.meta, runId: lesson.lessonId === record.shape.meta.lessonId ? lesson.runId : record.shape.meta.runId } });
    }
    const currentPage = saved?.page && editor.getPages().find(p => pageKey(p) === saved.page);
    if (records?.length && currentPage && saved.camera) { editor.setCurrentPage(currentPage.id); editor.setCamera(saved.camera); }
    loaded = true;
  }).catch(() => { loaded = true; onError('Could not restore saved interactive objects in this browser.'); });
  const unlisten = editor.store.listen(() => { if (loaded && !disposed) { clearTimeout(timer); timer = setTimeout(save, 250); } });
  return { sync() {
    const lesson = getLesson(); if (!lesson) return;
    for (const shape of editor.getCurrentPageShapes()) if (['interactive-graph', 'three-d-viewer'].includes(shape.type) && shape.meta.lessonId === lesson.lessonId && shape.meta.runId !== lesson.runId) editor.updateShape({ id: shape.id, type: shape.type, meta: { ...shape.meta, runId: lesson.runId } });
  }, dispose() { disposed = true; clearTimeout(timer); unlisten(); save(); } };
}
