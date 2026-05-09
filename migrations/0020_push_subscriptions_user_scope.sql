ALTER TABLE push_subscriptions ADD COLUMN user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON push_subscriptions(user_id);
