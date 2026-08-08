import { describe, expect, test } from "bun:test";
import { resolveTailoringPersistence } from "../worker/routes/tailor";

function corpusDb(createdId = 77) {
  let insertCount = 0;
  const db = {
    prepare(sql: string) {
      return {
        bind() {
          return {
            async run() {
              if (sql.includes("INSERT INTO corpus_versions")) insertCount += 1;
              return { success: true, meta: { changes: 1 } };
            },
            async first() {
              return sql.includes("SELECT id FROM corpus_versions")
                ? { id: createdId }
                : null;
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { db, inserted: () => insertCount };
}

describe("tailoring persistence target", () => {
  test("reuses an existing corpus for included tailoring", async () => {
    const { db, inserted } = corpusDb();
    const target = await resolveTailoringPersistence({
      db,
      userId: "user-1",
      corpusVersionId: 12,
      hasProfile: true,
      localMode: false,
    });

    expect(target).toEqual({ corpusVersionId: 12 });
    expect(inserted()).toBe(0);
  });

  test("creates an empty corpus target for a profile-only user", async () => {
    const { db, inserted } = corpusDb(42);
    const target = await resolveTailoringPersistence({
      db,
      userId: "user-2",
      corpusVersionId: null,
      hasProfile: true,
      localMode: false,
    });

    expect(target).toEqual({ corpusVersionId: 42 });
    expect(inserted()).toBe(1);
  });

  test("keeps personal-key tailoring local", async () => {
    const { db, inserted } = corpusDb();
    const target = await resolveTailoringPersistence({
      db,
      userId: "user-3",
      corpusVersionId: null,
      hasProfile: true,
      localMode: true,
    });

    expect(target).toBeUndefined();
    expect(inserted()).toBe(0);
  });
});
