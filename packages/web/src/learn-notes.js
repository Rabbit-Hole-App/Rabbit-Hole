export function notesScope(app) {
  if (!app.email || !app.org || !app.name) throw new Error('Sign in before saving personal notes.');
  return JSON.stringify([app.email, app.org, app.name]);
}

let database;
function openNotes() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('small-learn-notes', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('notes', { keyPath: ['scope', 'id'] }).createIndex('scope', 'scope');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = null; reject(request.error); };
  });
  return database;
}

export async function readNotes(scope) {
  const db = await openNotes();
  return new Promise((resolve, reject) => {
    const request = db.transaction('notes').objectStore('notes').index('scope').getAll(scope);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function writeNote(scope, note) {
  const db = await openNotes();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('notes', 'readwrite');
    tx.objectStore('notes').put({ ...note, scope });
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Notes could not be saved.'));
  });
}

// Copy only this page. Notes never share the running lesson's store or records.
export function captureNotePage(editor, lock = false) {
  const ids = editor.getCurrentPageShapeIds();
  const pageId = editor.getCurrentPageId();
  const { document } = editor.getSnapshot();
  const store = Object.fromEntries(Object.entries(document.store).filter(([, record]) =>
    record.typeName === 'document' || record.typeName === 'asset' ||
    record.id === pageId || ids.has(record.id) ||
    (record.typeName === 'binding' && ids.has(record.fromId) && ids.has(record.toId))
  ).map(([id, record]) => [id, lock && record.typeName === 'shape' ? { ...record, isLocked: true } : record]));
  return { document: { ...document, store } };
}

export async function deleteNote(scope, id) {
  const db = await openNotes();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('notes', 'readwrite');
    tx.objectStore('notes').delete([scope, id]);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Note could not be deleted.'));
  });
}
