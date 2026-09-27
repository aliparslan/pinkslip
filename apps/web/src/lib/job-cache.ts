import type { Job } from "../../../../packages/client/src/lib/api";

export const JOB_CACHE_SCHEMA_VERSION = 1;
export const JOB_CACHE_MAX_FEED_JOBS = 50;
export const JOB_CACHE_MAX_DETAILS = 20;
export const JOB_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

const DATABASE_NAME = "pinkslip-web-jobs";
const DATABASE_VERSION = 1;
const OWNER_KEY = "owner";
const FEED_KEY = "latest";

const METADATA_STORE = "metadata";
const FEED_STORE = "feed";
const DETAIL_STORE = "details";

export type CachedJob = Pick<
  Job,
  | "id"
  | "title"
  | "url"
  | "location"
  | "department"
  | "posted_at"
  | "first_seen_at"
  | "evergreen"
  | "specialties"
  | "sponsorship_available"
  | "source_type"
  | "description"
  | "salary"
  | "closed_at"
  | "company_name"
  | "company_domain"
  | "ats_type"
  | "ats_slug"
  | "content_pending"
  | "content_refresh_after_ms"
>;

export interface ReadableCachedFeed {
  jobs: CachedJob[];
  cachedAt: number;
}

export interface ReadableCachedJobDetail {
  job: CachedJob;
  cachedAt: number;
}

interface OwnerRecord {
  key: typeof OWNER_KEY;
  value: string;
  schemaVersion: typeof JOB_CACHE_SCHEMA_VERSION;
}

interface FeedRecord {
  key: typeof FEED_KEY;
  ownerFingerprint: string;
  cachedAt: number;
  jobs: CachedJob[];
}

export interface DetailRecord {
  key: string;
  ownerFingerprint: string;
  cachedAt: number;
  lastAccessedAt: number;
  job: CachedJob;
}

export interface JobCacheStorage {
  readOwner(): Promise<string | null>;
  switchOwner(ownerFingerprint: string | null): Promise<void>;
  readFeed(): Promise<FeedRecord | null>;
  writeFeed(record: FeedRecord): Promise<void>;
  deleteFeed(): Promise<void>;
  readDetail(id: string): Promise<DetailRecord | null>;
  writeDetail(record: DetailRecord): Promise<void>;
  deleteDetail(id: string): Promise<void>;
  listDetails(): Promise<DetailRecord[]>;
  clearContent(): Promise<void>;
}

export interface JobCache {
  setOwner(ownerIdentity: string): Promise<string>;
  clearOwner(): Promise<void>;
  clear(): Promise<void>;
  writeFeed(jobs: readonly Job[], cachedAt?: number): Promise<void>;
  readFeed(): Promise<ReadableCachedFeed | null>;
  writeDetail(job: Job, cachedAt?: number): Promise<void>;
  readDetail(id: string): Promise<ReadableCachedJobDetail | null>;
  hasReadableJobs(): Promise<boolean>;
}

export function sanitizeCachedJob(job: Job): CachedJob {
  // Keep this an explicit allowlist. New API fields must be reviewed before
  // becoming durable; in particular, match/mutation/account fields never enter
  // IndexedDB by accident through object spreading.
  return {
    id: job.id,
    title: job.title,
    url: job.url,
    location: job.location,
    department: job.department,
    posted_at: job.posted_at,
    first_seen_at: job.first_seen_at,
    evergreen: job.evergreen,
    specialties: job.specialties ? [...job.specialties] : undefined,
    sponsorship_available: job.sponsorship_available,
    source_type: job.source_type,
    description: job.description,
    salary: job.salary,
    closed_at: job.closed_at,
    company_name: job.company_name,
    company_domain: job.company_domain,
    ats_type: job.ats_type,
    ats_slug: job.ats_slug,
    content_pending: job.content_pending,
    content_refresh_after_ms: job.content_refresh_after_ms,
  };
}

function isFresh(cachedAt: number, now: number): boolean {
  return Number.isFinite(cachedAt)
    && cachedAt <= now
    && now - cachedAt <= JOB_CACHE_MAX_AGE_MS;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function fingerprintJobCacheOwner(ownerIdentity: string): Promise<string> {
  const normalized = ownerIdentity.trim();
  if (!normalized) throw new Error("A non-empty owner identity is required.");
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure hashing is unavailable; the jobs cache cannot be account-scoped.");
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized),
  );
  return base64Url(new Uint8Array(digest));
}

function serialExecutor() {
  let pending = Promise.resolve();
  return function run<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation, operation);
    pending = result.then(() => undefined, () => undefined);
    return result;
  };
}

export function createJobCache(
  storage: JobCacheStorage,
  now: () => number = Date.now,
): JobCache {
  const run = serialExecutor();

  async function removeExpiredDetails(
    records: DetailRecord[],
    currentTime: number,
  ): Promise<DetailRecord[]> {
    const fresh: DetailRecord[] = [];
    for (const record of records) {
      if (isFresh(record.cachedAt, currentTime)) fresh.push(record);
      else await storage.deleteDetail(record.key);
    }
    return fresh;
  }

  return {
    setOwner(ownerIdentity) {
      return run(async () => {
        const fingerprint = await fingerprintJobCacheOwner(ownerIdentity);
        if (await storage.readOwner() !== fingerprint) {
          await storage.switchOwner(fingerprint);
        }
        return fingerprint;
      });
    },

    clearOwner() {
      return run(() => storage.switchOwner(null));
    },

    clear() {
      return run(() => storage.clearContent());
    },

    writeFeed(jobs, cachedAt = now()) {
      return run(async () => {
        const ownerFingerprint = await storage.readOwner();
        if (!ownerFingerprint) return;
        await storage.writeFeed({
          key: FEED_KEY,
          ownerFingerprint,
          cachedAt,
          jobs: jobs.slice(0, JOB_CACHE_MAX_FEED_JOBS).map(sanitizeCachedJob),
        });
      });
    },

    readFeed() {
      return run(async () => {
        const ownerFingerprint = await storage.readOwner();
        const record = await storage.readFeed();
        if (!ownerFingerprint || !record || record.ownerFingerprint !== ownerFingerprint) {
          return null;
        }
        if (!isFresh(record.cachedAt, now())) {
          await storage.deleteFeed();
          return null;
        }
        return { jobs: record.jobs, cachedAt: record.cachedAt };
      });
    },

    writeDetail(job, cachedAt = now()) {
      return run(async () => {
        const ownerFingerprint = await storage.readOwner();
        if (!ownerFingerprint) return;
        const currentTime = now();
        await storage.writeDetail({
          key: job.id,
          ownerFingerprint,
          cachedAt,
          lastAccessedAt: currentTime,
          job: sanitizeCachedJob(job),
        });

        const fresh = await removeExpiredDetails(
          await storage.listDetails(),
          currentTime,
        );
        fresh.sort((left, right) => right.lastAccessedAt - left.lastAccessedAt);
        for (const record of fresh.slice(JOB_CACHE_MAX_DETAILS)) {
          await storage.deleteDetail(record.key);
        }
      });
    },

    readDetail(id) {
      return run(async () => {
        const ownerFingerprint = await storage.readOwner();
        const record = await storage.readDetail(id);
        if (!ownerFingerprint || !record || record.ownerFingerprint !== ownerFingerprint) {
          return null;
        }
        const currentTime = now();
        if (!isFresh(record.cachedAt, currentTime)) {
          await storage.deleteDetail(id);
          return null;
        }
        await storage.writeDetail({ ...record, lastAccessedAt: currentTime });
        return { job: record.job, cachedAt: record.cachedAt };
      });
    },

    hasReadableJobs() {
      return run(async () => {
        const ownerFingerprint = await storage.readOwner();
        if (!ownerFingerprint) return false;
        const currentTime = now();
        const feed = await storage.readFeed();
        if (feed?.ownerFingerprint === ownerFingerprint) {
          if (isFresh(feed.cachedAt, currentTime) && feed.jobs.length > 0) return true;
          if (!isFresh(feed.cachedAt, currentTime)) await storage.deleteFeed();
        }

        const details = await removeExpiredDetails(
          await storage.listDetails(),
          currentTime,
        );
        return details.some((record) => record.ownerFingerprint === ownerFingerprint);
      });
    },
  };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error), { once: true });
  });
}

class IndexedDbJobCacheStorage implements JobCacheStorage {
  private database: Promise<IDBDatabase>;

  constructor(factory: IDBFactory) {
    this.database = new Promise((resolve, reject) => {
      const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
      request.addEventListener("upgradeneeded", () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(METADATA_STORE)) {
          database.createObjectStore(METADATA_STORE, { keyPath: "key" });
        }
        if (!database.objectStoreNames.contains(FEED_STORE)) {
          database.createObjectStore(FEED_STORE, { keyPath: "key" });
        }
        if (!database.objectStoreNames.contains(DETAIL_STORE)) {
          const details = database.createObjectStore(DETAIL_STORE, { keyPath: "key" });
          details.createIndex("lastAccessedAt", "lastAccessedAt");
        }
      });
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
      request.addEventListener("blocked", () => {
        reject(new Error("The jobs cache database upgrade was blocked."));
      }, { once: true });
    });
  }

  async readOwner(): Promise<string | null> {
    const database = await this.database;
    const transaction = database.transaction(METADATA_STORE, "readonly");
    const complete = transactionComplete(transaction);
    const record = await requestResult(
      transaction.objectStore(METADATA_STORE).get(OWNER_KEY),
    ) as OwnerRecord | undefined;
    await complete;
    return record?.schemaVersion === JOB_CACHE_SCHEMA_VERSION ? record.value : null;
  }

  async switchOwner(ownerFingerprint: string | null): Promise<void> {
    const database = await this.database;
    const transaction = database.transaction(
      [METADATA_STORE, FEED_STORE, DETAIL_STORE],
      "readwrite",
    );
    const complete = transactionComplete(transaction);
    transaction.objectStore(FEED_STORE).clear();
    transaction.objectStore(DETAIL_STORE).clear();
    const metadata = transaction.objectStore(METADATA_STORE);
    if (ownerFingerprint) {
      metadata.put({
        key: OWNER_KEY,
        value: ownerFingerprint,
        schemaVersion: JOB_CACHE_SCHEMA_VERSION,
      } satisfies OwnerRecord);
    } else {
      metadata.delete(OWNER_KEY);
    }
    await complete;
  }

  async readFeed(): Promise<FeedRecord | null> {
    const database = await this.database;
    const transaction = database.transaction(FEED_STORE, "readonly");
    const complete = transactionComplete(transaction);
    const record = await requestResult(
      transaction.objectStore(FEED_STORE).get(FEED_KEY),
    ) as FeedRecord | undefined;
    await complete;
    return record ?? null;
  }

  async writeFeed(record: FeedRecord): Promise<void> {
    const database = await this.database;
    const transaction = database.transaction(FEED_STORE, "readwrite");
    const complete = transactionComplete(transaction);
    transaction.objectStore(FEED_STORE).put(record);
    await complete;
  }

  async deleteFeed(): Promise<void> {
    const database = await this.database;
    const transaction = database.transaction(FEED_STORE, "readwrite");
    const complete = transactionComplete(transaction);
    transaction.objectStore(FEED_STORE).delete(FEED_KEY);
    await complete;
  }

  async readDetail(id: string): Promise<DetailRecord | null> {
    const database = await this.database;
    const transaction = database.transaction(DETAIL_STORE, "readonly");
    const complete = transactionComplete(transaction);
    const record = await requestResult(
      transaction.objectStore(DETAIL_STORE).get(id),
    ) as DetailRecord | undefined;
    await complete;
    return record ?? null;
  }

  async writeDetail(record: DetailRecord): Promise<void> {
    const database = await this.database;
    const transaction = database.transaction(DETAIL_STORE, "readwrite");
    const complete = transactionComplete(transaction);
    transaction.objectStore(DETAIL_STORE).put(record);
    await complete;
  }

  async deleteDetail(id: string): Promise<void> {
    const database = await this.database;
    const transaction = database.transaction(DETAIL_STORE, "readwrite");
    const complete = transactionComplete(transaction);
    transaction.objectStore(DETAIL_STORE).delete(id);
    await complete;
  }

  async listDetails(): Promise<DetailRecord[]> {
    const database = await this.database;
    const transaction = database.transaction(DETAIL_STORE, "readonly");
    const complete = transactionComplete(transaction);
    const records = await requestResult(
      transaction.objectStore(DETAIL_STORE).getAll(),
    ) as DetailRecord[];
    await complete;
    return records;
  }

  async clearContent(): Promise<void> {
    const database = await this.database;
    const transaction = database.transaction(
      [FEED_STORE, DETAIL_STORE],
      "readwrite",
    );
    const complete = transactionComplete(transaction);
    transaction.objectStore(FEED_STORE).clear();
    transaction.objectStore(DETAIL_STORE).clear();
    await complete;
  }
}

let browserCache: JobCache | null | undefined;

function getBrowserJobCache(): JobCache | null {
  if (browserCache !== undefined) return browserCache;
  browserCache = typeof indexedDB === "undefined"
    ? null
    : createJobCache(new IndexedDbJobCacheStorage(indexedDB));
  return browserCache;
}

export async function setJobCacheOwner(ownerIdentity: string): Promise<string | null> {
  return await getBrowserJobCache()?.setOwner(ownerIdentity) ?? null;
}

export async function clearJobCacheOwner(): Promise<void> {
  await getBrowserJobCache()?.clearOwner();
}

export async function clearCachedJobs(): Promise<void> {
  await getBrowserJobCache()?.clear();
}

export async function writeCachedFeed(
  jobs: readonly Job[],
  cachedAt?: number,
): Promise<void> {
  await getBrowserJobCache()?.writeFeed(jobs, cachedAt);
}

export async function readCachedFeed(): Promise<ReadableCachedFeed | null> {
  return await getBrowserJobCache()?.readFeed() ?? null;
}

export async function writeCachedJobDetail(
  job: Job,
  cachedAt?: number,
): Promise<void> {
  await getBrowserJobCache()?.writeDetail(job, cachedAt);
}

export async function readCachedJobDetail(
  id: string,
): Promise<ReadableCachedJobDetail | null> {
  return await getBrowserJobCache()?.readDetail(id) ?? null;
}

export async function hasReadableJobs(): Promise<boolean> {
  return await getBrowserJobCache()?.hasReadableJobs() ?? false;
}
