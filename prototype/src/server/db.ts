/**
 * Prototype persistence: one JSON document on disk plus private photo files.
 * Mutations run against a copy and only replace the live state after the write
 * succeeds, so a failed action never leaves a half-applied change. Subscribers
 * (the SSE endpoint) are told the new revision after every commit.
 *
 * Production would use PostgreSQL transactions and object storage instead.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DB } from "@/lib/domain";
import { buildSeed } from "./seed";

// Kept outside the project so the dev server's file watcher doesn't reload pages on every write.
const DIR = process.env.TUGON_DATA_DIR ?? path.join(os.tmpdir(), "tugon-prototype");
const FILE = path.join(DIR, "db.json");
const PHOTO_DIR = path.join(DIR, "photos");

type Listener = (rev: number) => void;
interface Store {
  db: DB | null;
  listeners: Set<Listener>;
}

// Survives dev hot reloads so every route sees the same state and listeners.
const g = globalThis as typeof globalThis & { __tugonStore?: Store };
const store: Store = (g.__tugonStore ??= { db: null, listeners: new Set() });

function persist(db: DB) {
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, FILE);
}

function publish(db: DB) {
  store.db = db;
  for (const listener of store.listeners) listener(db.rev);
}

export function readDb(): DB {
  // Dev hot reloads keep the in-memory store; after a schema change, reload it like a cold start.
  if (store.db?.version === 3) return store.db;
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8")) as DB;
    if (parsed.version !== 3) throw new Error("schema changed");
    store.db = parsed;
  } catch {
    store.db = buildSeed();
    persist(store.db);
  }
  return store.db;
}

export function mutate<T>(fn: (db: DB) => T): T {
  const draft = structuredClone(readDb());
  const out = fn(draft);
  draft.rev += 1;
  persist(draft);
  publish(draft);
  return out;
}

export function resetDb() {
  fs.rmSync(PHOTO_DIR, { recursive: true, force: true });
  const db = buildSeed();
  db.rev = (store.db?.rev ?? 0) + 1;
  persist(db);
  publish(db);
}

export function subscribe(listener: Listener) {
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}

/** Photos live outside the web root under a server-chosen key; never trust client names. */
const photoPath = (key: string) => path.join(PHOTO_DIR, `${key.replace(/[^a-z0-9_]/gi, "")}.jpg`);

export function savePhoto(key: string, jpeg: Buffer) {
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
  fs.writeFileSync(photoPath(key), jpeg);
}

export function readPhoto(key: string): Buffer | null {
  try {
    return fs.readFileSync(photoPath(key));
  } catch {
    return null;
  }
}

export function deletePhoto(key: string) {
  fs.rmSync(photoPath(key), { force: true });
}
