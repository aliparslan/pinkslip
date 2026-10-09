/**
 * The last resume PDF the user imported, kept on this device so autofill can
 * attach it to applications. It never leaves the device except into a form
 * the user is filling in.
 */
const DATABASE = "pinkslip-resume";
const STORE = "files";
const KEY = "resume";

interface StoredResume {
  name: string;
  bytes: ArrayBuffer;
  saved_at: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(database.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function saveResumeFile(file: File): Promise<void> {
  const stored: StoredResume = { name: file.name || "resume.pdf", bytes: await file.arrayBuffer(), saved_at: Date.now() };
  await run("readwrite", (store) => store.put(stored, KEY));
}

/** The saved resume as base64, for handing to the autofill script. */
export async function loadResumeFile(): Promise<{ name: string; base64: string } | null> {
  try {
    const stored = await run<StoredResume | undefined>("readonly", (store) => store.get(KEY));
    if (!stored) return null;
    const bytes = new Uint8Array(stored.bytes);
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return { name: stored.name, base64: btoa(binary) };
  } catch {
    return null;
  }
}

export async function clearResumeFile(): Promise<void> {
  await run("readwrite", (store) => store.delete(KEY)).catch(() => undefined);
}
