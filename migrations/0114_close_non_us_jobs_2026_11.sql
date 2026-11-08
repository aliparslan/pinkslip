-- Closes the 27 open jobs that are entirely outside the US (owner, 2026-11-08,
-- after a Snowflake role in India was reported). Each location below fails
-- isUsJobLocation once worker/us-jobs.ts is fixed, so the poller won't reopen
-- them. Matching the exact text leaves multi-city roles with a US option alone.

UPDATE jobs
SET closed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE closed_at IS NULL
  AND location IN (
    'Bengaluru, KA, IN',
    'Bengaluru, KA, IN / Bengaluru, Karnataka, IN',
    'CA-British Columbia-Remote',
    'CA-Ontario-Toronto',
    'CO-Colombia-Remote',
    'DE-Berlin-Trion Building',
    'IL-Israel-Remote',
    'IN-Bangalore-MSO',
    'IN-Pune',
    'Toronto, ON, CA',
    'Toronto, ON, CA / Toronto, Ontario, CA'
  );
