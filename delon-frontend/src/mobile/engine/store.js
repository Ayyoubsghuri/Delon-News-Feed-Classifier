// Tiny IndexedDB wrapper: everything the standalone app keeps on the phone.
const DB_NAME = "delon";
const VERSION = 1;
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("articles")) db.createObjectStore("articles", { keyPath: "id" });
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        let result;
        Promise.resolve(fn(s)).then((r) => (result = r));
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

const reqP = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export const getAllArticles = () => tx("articles", "readonly", (s) => reqP(s.getAll()));

export const putArticles = (list) =>
  tx("articles", "readwrite", (s) => {
    list.forEach((a) => s.put(a));
  });

export const deleteArticle = (id) => tx("articles", "readwrite", (s) => s.delete(id));

export const kvGet = (key, fallback = null) =>
  tx("kv", "readonly", (s) => reqP(s.get(key))).then((v) => (v === undefined ? fallback : v));

export const kvSet = (key, value) => tx("kv", "readwrite", (s) => s.put(value, key));

export async function pruneOlderThan(days) {
  const limit = Date.now() - days * 86400000;
  const all = await getAllArticles();
  const old = all.filter((a) => (a.savedAt || 0) < limit && !a.bookmarked);
  if (old.length) await tx("articles", "readwrite", (s) => old.forEach((a) => s.delete(a.id)));
  return old.length;
}

export async function clearAll() {
  await tx("articles", "readwrite", (s) => s.clear());
  await tx("kv", "readwrite", (s) => s.clear());
}
