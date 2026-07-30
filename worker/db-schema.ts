export async function hasTable(db: D1Database, tableName: string): Promise<boolean> {
  try {
    const row = await db.prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table' AND name = ?
       LIMIT 1`
    ).bind(tableName).first<{ name: string }>();

    return Boolean(row?.name);
  } catch {
    return false;
  }
}
