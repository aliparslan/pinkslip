-- Keep one APNs token per native app installation while retaining true
-- multi-device notification delivery for the same user.
ALTER TABLE push_subscriptions ADD COLUMN installation_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_push_ios_installation
  ON push_subscriptions(user_id, installation_id)
  WHERE platform = 'ios' AND installation_id IS NOT NULL;
