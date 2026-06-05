-- Repair: migration 0012 was recorded but idx_push_endpoint is missing on remote.
-- Required for ON CONFLICT(endpoint) upserts in /api/push/apns and /api/push/subscribe.
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_endpoint ON push_subscriptions(endpoint);
