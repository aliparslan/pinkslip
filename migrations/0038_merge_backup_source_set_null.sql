-- account_merge_backups.source_user_id previously declared ON DELETE CASCADE.
-- mergeGuestDataIntoAccount() ends by deleting the guest (source) user, which
-- cascade-deleted the very conflict backups created moments earlier to preserve
-- that guest's resume/profile. Rebuild the table with ON DELETE SET NULL so the
-- backup survives the guest user's removal.
CREATE TABLE account_merge_backups_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO account_merge_backups_new (id, user_id, source_user_id, kind, label, payload_json, created_at)
  SELECT id, user_id, source_user_id, kind, label, payload_json, created_at FROM account_merge_backups;

DROP TABLE account_merge_backups;
ALTER TABLE account_merge_backups_new RENAME TO account_merge_backups;

CREATE INDEX IF NOT EXISTS idx_account_merge_backups_user
  ON account_merge_backups(user_id, created_at DESC);
