INSERT INTO preferences (key, value)
SELECT 'notify_threshold', value
FROM preferences
WHERE key = 'notification_threshold'
ON CONFLICT(key) DO UPDATE SET value = excluded.value;

DELETE FROM preferences
WHERE key = 'notification_threshold';
