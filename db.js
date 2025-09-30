// IndexedDB wrapper for DB "people", store "entries"
// Schema: { id, name, notes, whereMet, whenMet, tags[], createdAt }

const DB_NAME = 'people';
const DB_VERSION = 1;
const STORE = 'entries';

let dbp;

function openDB() {
  if (!('indexedDB' in window)) {
    throw new Error('This browser does not support IndexedDB');
  }
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (ev) => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
          store.createIndex('name', 'name', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

function withStore(mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const result = fn(store);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
      })
  );
}

function uuid() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  // Fallback
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function addEntry(data) {
  const now = new Date().toISOString();
  const entry = {
    id: data.id || uuid(),
    name: data.name?.trim() || '',
    notes: data.notes?.trim() || '',
    whereMet: data.whereMet?.trim() || '',
    whenMet: data.whenMet || '',
    tags: Array.isArray(data.tags) ? data.tags : [],
    createdAt: data.createdAt || now,
  };
  await withStore('readwrite', (store) => store.add(entry));
  return entry;
}

export async function getEntry(id) {
  return withStore('readonly', (store) => store.get(id));
}

export async function updateEntry(id, updates) {
  const prev = await getEntry(id);
  if (!prev) throw new Error('Entry not found');
  const next = {
    ...prev,
    ...updates,
  };
  await withStore('readwrite', (store) => store.put(next));
  return next;
}

export async function deleteEntry(id) {
  await withStore('readwrite', (store) => store.delete(id));
}

export async function listEntries() {
  return withStore('readonly', (store) => {
    const req = store.getAll();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => {
        const rows = req.result || [];
        rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        resolve(rows);
      };
      req.onerror = () => reject(req.error);
    });
  });
}

export async function bulkImport(arr = [], { mode = 'merge' } = {}) {
  // mode: 'merge' (use id if present) | 'newIds' (always assign new id)
  const toPut = arr.map((x) => {
    const copy = { ...x };
    if (mode === 'newIds' || !copy.id) copy.id = uuid();
    if (!copy.createdAt) copy.createdAt = new Date().toISOString();
    if (!Array.isArray(copy.tags)) copy.tags = [];
    return copy;
  });
  await withStore('readwrite', (store) => {
    toPut.forEach((r) => store.put(r));
  });
  return toPut.length;
}

export async function exportAll() {
  const all = await listEntries();
  return all;
}

