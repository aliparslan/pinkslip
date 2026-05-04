UPDATE companies
SET enabled = 0,
    last_poll_status = 'error',
    last_poll_error = 'Disabled by seed cleanup: ATS slug no longer resolves',
    last_polled_at = COALESCE(last_polled_at, datetime('now'))
WHERE (ats_type = 'greenhouse' AND ats_slug IN (
        'mistral',
        'adept',
        'character',
        'netflix',
        'openai',
        'cohere',
        'wandb',
        'huggingface',
        'replit',
        'plaid',
        'ramp',
        'notion',
        'snowflake',
        'hashicorp',
        'twosigma',
        'hudsonrivertrading',
        'retool',
        'crowdstrike',
        'paloaltonetworks',
        'wiz',
        'spotify',
        'snap',
        'uber',
        'doordash',
        'shopify',
        'palantir',
        'anduril',
        '1password',
        'zapier',
        'grafana',
        'sentry',
        'loom',
        'miro',
        'segment',
        'rippling',
        'cruise',
        'benchling',
        'langchain',
        'modal',
        'baseten'
      ))
   OR (ats_type = 'lever' AND ats_slug IN (
        'fly',
        'robinhood',
        'render',
        'tailscale',
        'deno',
        'doppler'
      ));

DELETE FROM companies
WHERE ats_type = 'custom'
  AND enabled = 0
  AND name IN (
    'Google',
    'Apple',
    'Amazon',
    'Meta',
    'Microsoft',
    'Bloomberg',
    'Citadel',
    'DE Shaw',
    'Atlassian',
    'GitHub',
    'Slack'
  )
  AND NOT EXISTS (SELECT 1 FROM jobs WHERE jobs.company_id = companies.id)
  AND NOT EXISTS (SELECT 1 FROM events WHERE events.company_id = companies.id);
