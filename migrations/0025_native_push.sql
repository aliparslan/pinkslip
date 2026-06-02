-- Native iOS (APNs) push support.
-- "web" rows keep using p256dh/auth (Web Push). "ios" rows store the APNs
-- device token in the existing `endpoint` column with empty p256dh/auth.
ALTER TABLE push_subscriptions ADD COLUMN platform TEXT NOT NULL DEFAULT 'web';

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_platform
  ON push_subscriptions(platform);
