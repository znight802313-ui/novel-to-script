const DB_NAME = 'NoveltoScriptDB';
const DB_VERSION = 1;
const STORE_NAME = 'projectStateStore';

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

export async function setItem<T>(key: string, value: T): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error('IndexedDB setItem error:', e);
  }
}

export async function getItem<T>(key: string): Promise<T | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      tx.oncomplete = () => resolve(request.result ?? null);
      tx.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error('IndexedDB getItem error:', e);
    return null;
  }
}

export async function removeItem(key: string): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error('IndexedDB removeItem error:', e);
  }
}
