/**
 * Minimal IndexedDB wrapper. Stores only: app settings, local device identity, paired
 * device records, transfer history metadata, and resumable-transfer progress (file
 * manifests + the index of the last verified chunk per file — never plaintext or
 * encrypted file bytes, and never encryption keys). See SECURITY.md.
 */
const DB_NAME = "securetransfer";
const DB_VERSION = 1;

export const STORES = {
  settings: "settings",
  device: "device",
  pairedDevices: "pairedDevices",
  history: "history",
  resumeState: "resumeState",
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.settings)) db.createObjectStore(STORES.settings);
      if (!db.objectStoreNames.contains(STORES.device)) db.createObjectStore(STORES.device);
      if (!db.objectStoreNames.contains(STORES.pairedDevices)) db.createObjectStore(STORES.pairedDevices, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORES.history)) db.createObjectStore(STORES.history, { keyPath: "transferId" });
      if (!db.objectStoreNames.contains(STORES.resumeState)) db.createObjectStore(STORES.resumeState, { keyPath: "transferId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function dbGet<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  const tx = db.transaction(store, "readonly");
  return wrap(tx.objectStore(store).get(key));
}

export async function dbPut<T>(store: string, value: T, key?: IDBValidKey): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  await wrap(key === undefined ? tx.objectStore(store).put(value) : tx.objectStore(store).put(value, key));
}

export async function dbDelete(store: string, key: IDBValidKey): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  await wrap(tx.objectStore(store).delete(key));
}

export async function dbGetAll<T>(store: string): Promise<T[]> {
  const db = await openDb();
  const tx = db.transaction(store, "readonly");
  return wrap(tx.objectStore(store).getAll());
}

export async function dbClear(store: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  await wrap(tx.objectStore(store).clear());
}
