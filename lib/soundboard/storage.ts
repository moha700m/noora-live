import { validatePhraseText } from "./validation.ts";

export type SavedPhrase = { id: string; text: string; createdAt: number; updatedAt: number };
const PHRASES_KEY = "noora.soundboard.phrases.v1";
const AUDIO_DB = "noora-soundboard-audio-v1";
const AUDIO_STORE = "clips";
export const MAX_AUDIO_CLIPS = 40;

export function parseSavedPhrases(raw: string | null): SavedPhrase[] | null {
  if (raw === null) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || (value as { version?: unknown }).version !== 1 || !Array.isArray((value as { phrases?: unknown }).phrases)) return null;
    const phrases = (value as { phrases: unknown[] }).phrases;
    if (phrases.length > 100) return null;
    const parsed: SavedPhrase[] = [];
    for (const row of phrases) {
      if (!row || typeof row !== "object") return null;
      const item = row as Record<string, unknown>;
      const valid = validatePhraseText(item.text);
      if (typeof item.id !== "string" || !item.id || !valid.text || valid.error || !Number.isFinite(item.createdAt) || !Number.isFinite(item.updatedAt)) return null;
      parsed.push({ id: item.id, text: valid.text, createdAt: item.createdAt as number, updatedAt: item.updatedAt as number });
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveSavedPhrases(phrases: SavedPhrase[]): void {
  localStorage.setItem(PHRASES_KEY, JSON.stringify({ version: 1, phrases }));
}

export function audioCacheKey(cacheVersion: string, text: string): string {
  return `${cacheVersion}\u0000${text}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(AUDIO_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(AUDIO_STORE, { keyPath: "key" });
    let settled = false;
    const timer = setTimeout(() => { settled = true; reject(new Error("Audio cache open timed out")); }, 3000);
    request.onblocked = () => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error("Audio cache blocked")); } };
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      settled = true; clearTimeout(timer); resolve(request.result);
    };
    request.onerror = () => { if (!settled) { settled = true; clearTimeout(timer); reject(request.error || new Error("Audio cache unavailable")); } };
  });
}

export async function getCachedAudio(key: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(AUDIO_STORE, "readonly").objectStore(AUDIO_STORE).get(key);
    request.onsuccess = () => {
      const row = request.result as { blob?: Blob } | undefined;
      resolve(row?.blob instanceof Blob && row.blob.size > 0 ? row.blob : null);
      db.close();
    };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function putCachedAudio(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, "readwrite");
    const store = tx.objectStore(AUDIO_STORE);
    const all = store.getAll();
    all.onsuccess = () => {
      const rows = (all.result as { key: string; usedAt: number }[]).filter((row) => row.key !== key).sort((a, b) => a.usedAt - b.usedAt);
      while (rows.length >= MAX_AUDIO_CLIPS) store.delete(rows.shift()!.key);
      store.put({ key, blob, usedAt: Date.now() });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Audio cache write aborted"));
  }).finally(() => db.close());
}
