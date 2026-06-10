CREATE TABLE IF NOT EXISTS notification_deliveries (
  candidate_id TEXT NOT NULL REFERENCES notification_candidates(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'sending', 'sent', 'retry', 'failed')
  ),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_attempt_at TEXT,
  sent_at TEXT,
  PRIMARY KEY (candidate_id, subscription_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status
  ON notification_deliveries(status, last_attempt_at);
