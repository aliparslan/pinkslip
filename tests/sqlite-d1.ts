import { Database } from "bun:sqlite";

type SqliteBinding = string | number | bigint | boolean | null | Uint8Array;

/**
 * Minimal D1Database over in-memory SQLite, for tests that need real SQL
 * semantics (claims, RETURNING, conflict handling) rather than mocks.
 */
export function sqliteD1() {
  const sqlite = new Database(":memory:");

  function prepared(sql: string, bindings: unknown[] = []): D1PreparedStatement {
    const statement = {
      bind(...values: unknown[]) {
        return prepared(sql, values);
      },
      async all<T>() {
        return {
          results: sqlite.query(sql).all(...bindings as SqliteBinding[]) as T[],
        };
      },
      async first<T>(column?: string) {
        const row = sqlite.query(sql).get(
          ...bindings as SqliteBinding[]
        ) as Record<string, unknown> | null;
        return (column ? row?.[column] : row) as T | null;
      },
      async run() {
        const result = sqlite.query(sql).run(...bindings as SqliteBinding[]);
        return { meta: { changes: result.changes } };
      },
    };
    return statement as unknown as D1PreparedStatement;
  }

  const db = {
    prepare(sql: string) {
      return prepared(sql);
    },
    async batch(statements: D1PreparedStatement[]) {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  } as unknown as D1Database;

  return { sqlite, db };
}
