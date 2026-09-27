import { describe, expect, it } from "bun:test";
import { resolveJobId, resolveJobIds } from "@worker/job-identity";

function fakeDb(aliases: Record<string, string>, fail = false): D1Database {
  const statement = (id = "") => ({
    bind(value: string) {
      return statement(value);
    },
    async first<T>() {
      if (fail) throw new Error("job_aliases is unavailable");
      const jobId = aliases[id];
      return (jobId ? { job_id: jobId } : null) as T | null;
    },
    async all<T>() {
      if (fail) throw new Error("job_aliases is unavailable");
      const jobId = aliases[id];
      return { results: jobId ? [{ job_id: jobId }] : [] } as D1Result<T>;
    },
  });

  return {
    prepare() {
      return statement() as unknown as D1PreparedStatement;
    },
    async batch<T>(statements: D1PreparedStatement[]) {
      if (fail) throw new Error("job_aliases is unavailable");
      return Promise.all(statements.map((statement) => statement.all<T>()));
    },
  } as unknown as D1Database;
}

describe("job identity aliases", () => {
  it("resolves historical IDs and leaves current IDs unchanged", async () => {
    const db = fakeDb({ "apple-location-uuid": "apple-base-uuid" });

    expect(await resolveJobId(db, "apple-location-uuid")).toBe("apple-base-uuid");
    expect(await resolveJobId(db, "current-uuid")).toBe("current-uuid");
    expect(await resolveJobIds(db, ["apple-location-uuid", "current-uuid"]))
      .toEqual(["apple-base-uuid", "current-uuid"]);
  });

  it("fails safe to requested IDs while the alias table is unavailable", async () => {
    const db = fakeDb({}, true);

    expect(await resolveJobId(db, "job-1")).toBe("job-1");
    expect(await resolveJobIds(db, ["job-1", "job-2"]))
      .toEqual(["job-1", "job-2"]);
  });
});
