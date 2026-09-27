-- Apple's full US search snapshot contains roughly 4,500 location-expanded
-- rows and can exceed a scheduled Worker's 15-minute wall-time. The adapter now
-- uses a bounded newest-first discovery feed during normal polling, so Apple can
-- move into the priority tier and deliver new-role alerts every 15 minutes.
UPDATE companies
SET poll_tier = 1
WHERE COALESCE(source_type, ats_type) = 'apple';
