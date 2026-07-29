-- Source catalog refresh. Every board below returned a live, non-empty
-- response when probed on 2026-07-28; boards with no public endpoint were
-- deliberately left alone rather than guessed at.

-- ── Re-point companies whose board moved ────────────────────────────────────
-- Clearing quarantine and the failure count lets these rejoin the normal
-- cadence on the next tick instead of waiting out the 24-hour retry window.
UPDATE companies SET ats_type = 'ashby', source_type = 'ashby', ats_slug = 'openai', enabled = 1, quarantined_at = NULL, poll_failure_count = 0, last_poll_status = NULL, last_poll_error = NULL WHERE name = 'OpenAI';
UPDATE companies SET ats_type = 'greenhouse', source_type = 'greenhouse', ats_slug = 'andurilindustries', enabled = 1, quarantined_at = NULL, poll_failure_count = 0, last_poll_status = NULL, last_poll_error = NULL WHERE name = 'Anduril';
UPDATE companies SET ats_type = 'ashby', source_type = 'ashby', ats_slug = 'snowflake', enabled = 1, quarantined_at = NULL, poll_failure_count = 0, last_poll_status = NULL, last_poll_error = NULL WHERE name = 'Snowflake';
UPDATE companies SET ats_type = 'ashby', source_type = 'ashby', ats_slug = 'cohere', enabled = 1, quarantined_at = NULL, poll_failure_count = 0, last_poll_status = NULL, last_poll_error = NULL WHERE name = 'Cohere';
UPDATE companies SET ats_type = 'greenhouse', source_type = 'greenhouse', ats_slug = 'wizinc', enabled = 1, quarantined_at = NULL, poll_failure_count = 0, last_poll_status = NULL, last_poll_error = NULL WHERE name = 'Wiz';
UPDATE companies SET ats_type = 'greenhouse', source_type = 'greenhouse', ats_slug = 'robinhood', enabled = 1, quarantined_at = NULL, poll_failure_count = 0, last_poll_status = NULL, last_poll_error = NULL WHERE name = 'Robinhood';
UPDATE companies SET ats_type = 'ashby', source_type = 'ashby', ats_slug = 'ramp', enabled = 1, quarantined_at = NULL, poll_failure_count = 0, last_poll_status = NULL, last_poll_error = NULL WHERE name = 'Ramp';
UPDATE companies SET ats_type = 'ashby', source_type = 'ashby', ats_slug = 'plaid', enabled = 1, quarantined_at = NULL, poll_failure_count = 0, last_poll_status = NULL, last_poll_error = NULL WHERE name = 'Plaid';
UPDATE companies SET ats_type = 'ashby', source_type = 'ashby', ats_slug = 'notion', enabled = 1, quarantined_at = NULL, poll_failure_count = 0, last_poll_status = NULL, last_poll_error = NULL WHERE name = 'Notion';
UPDATE companies SET ats_type = 'lever', source_type = 'lever', ats_slug = 'spotify', enabled = 1, quarantined_at = NULL, poll_failure_count = 0, last_poll_status = NULL, last_poll_error = NULL WHERE name = 'Spotify';
UPDATE companies SET ats_type = 'ashby', source_type = 'ashby', ats_slug = 'replit', enabled = 1, quarantined_at = NULL, poll_failure_count = 0, last_poll_status = NULL, last_poll_error = NULL WHERE name = 'Replit';
UPDATE companies SET ats_type = 'ashby', source_type = 'ashby', ats_slug = 'langchain', enabled = 1, quarantined_at = NULL, poll_failure_count = 0, last_poll_status = NULL, last_poll_error = NULL WHERE name = 'LangChain';
UPDATE companies SET ats_type = 'ashby', source_type = 'ashby', ats_slug = 'baseten', enabled = 1, quarantined_at = NULL, poll_failure_count = 0, last_poll_status = NULL, last_poll_error = NULL WHERE name = 'Baseten';
UPDATE companies SET ats_type = 'ashby', source_type = 'ashby', ats_slug = '1password', enabled = 1, quarantined_at = NULL, poll_failure_count = 0, last_poll_status = NULL, last_poll_error = NULL WHERE name = '1Password';
UPDATE companies SET ats_type = 'ashby', source_type = 'ashby', ats_slug = 'benchling', enabled = 1, quarantined_at = NULL, poll_failure_count = 0, last_poll_status = NULL, last_poll_error = NULL WHERE name = 'Benchling';
UPDATE companies SET ats_type = 'ashby', source_type = 'ashby', ats_slug = 'sentry', enabled = 1, quarantined_at = NULL, poll_failure_count = 0, last_poll_status = NULL, last_poll_error = NULL WHERE name = 'Sentry';
UPDATE companies SET ats_type = 'greenhouse', source_type = 'greenhouse', ats_slug = 'tailscale', enabled = 1, quarantined_at = NULL, poll_failure_count = 0, last_poll_status = NULL, last_poll_error = NULL WHERE name = 'Tailscale';
UPDATE companies SET ats_type = 'ashby', source_type = 'ashby', ats_slug = 'miro', enabled = 1, quarantined_at = NULL, poll_failure_count = 0, last_poll_status = NULL, last_poll_error = NULL WHERE name = 'Miro';
UPDATE companies SET ats_type = 'ashby', source_type = 'ashby', ats_slug = 'render', enabled = 1, quarantined_at = NULL, poll_failure_count = 0, last_poll_status = NULL, last_poll_error = NULL WHERE name = 'Render';
UPDATE companies SET ats_type = 'ashby', source_type = 'ashby', ats_slug = 'modal', enabled = 1, quarantined_at = NULL, poll_failure_count = 0, last_poll_status = NULL, last_poll_error = NULL WHERE name = 'Modal';
UPDATE companies SET ats_type = 'custom', source_type = 'rippling', ats_slug = 'rippling', enabled = 1, quarantined_at = NULL, poll_failure_count = 0, last_poll_status = NULL, last_poll_error = NULL WHERE name = 'Rippling';
UPDATE companies SET ats_type = 'ashby', source_type = 'ashby', ats_slug = 'character', enabled = 1, quarantined_at = NULL, poll_failure_count = 0, last_poll_status = NULL, last_poll_error = NULL WHERE name = 'Character.ai';
UPDATE companies SET ats_type = 'ashby', source_type = 'ashby', ats_slug = 'zapier', enabled = 1, quarantined_at = NULL, poll_failure_count = 0, last_poll_status = NULL, last_poll_error = NULL WHERE name = 'Zapier';
UPDATE companies SET ats_type = 'greenhouse', source_type = 'greenhouse', ats_slug = 'helsing', enabled = 1, quarantined_at = NULL, poll_failure_count = 0, last_poll_status = NULL, last_poll_error = NULL WHERE name = 'Helsing';
UPDATE companies SET ats_type = 'ashby', source_type = 'ashby', ats_slug = 'drata', enabled = 1, quarantined_at = NULL, poll_failure_count = 0, last_poll_status = NULL, last_poll_error = NULL WHERE name = 'Drata';
UPDATE companies SET ats_type = 'greenhouse', source_type = 'greenhouse', ats_slug = 'temporaltechnologies', enabled = 1, quarantined_at = NULL, poll_failure_count = 0, last_poll_status = NULL, last_poll_error = NULL WHERE name = 'Temporal';
UPDATE companies SET ats_type = 'ashby', source_type = 'ashby', ats_slug = 'lemonade', enabled = 1, quarantined_at = NULL, poll_failure_count = 0, last_poll_status = NULL, last_poll_error = NULL WHERE name = 'Lemonade';
UPDATE companies SET ats_type = 'ashby', source_type = 'ashby', ats_slug = 'mem0', enabled = 1, quarantined_at = NULL, poll_failure_count = 0, last_poll_status = NULL, last_poll_error = NULL WHERE name = 'Mem';
UPDATE companies SET ats_type = 'ashby', source_type = 'ashby', ats_slug = 'levels', enabled = 1, quarantined_at = NULL, poll_failure_count = 0, last_poll_status = NULL, last_poll_error = NULL WHERE name = 'Levels';
UPDATE companies SET ats_type = 'ashby', source_type = 'ashby', ats_slug = 'going', enabled = 1, quarantined_at = NULL, poll_failure_count = 0, last_poll_status = NULL, last_poll_error = NULL WHERE name = 'Going';

-- ── New sources ─────────────────────────────────────────────────────────────
-- Tier 1 polls every cycle; tier 2 rotates. Small niche boards go to tier 2:
-- an early-stage company posting twice a quarter does not need a 15-minute
-- check, and the public ATS APIs already throttle this origin at 221 sources.
-- INSERT OR IGNORE on the unique source index
-- keeps this migration safe to re-run and harmless if a slug already exists.
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Databricks', 'greenhouse', 'greenhouse', 'databricks', 'databricks.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Crusoe', 'ashby', 'ashby', 'crusoe', 'crusoe.ai', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Samsara', 'greenhouse', 'greenhouse', 'samsara', 'samsara.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Verkada', 'greenhouse', 'greenhouse', 'verkada', 'verkada.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Roblox', 'greenhouse', 'greenhouse', 'roblox', 'roblox.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'ElevenLabs', 'ashby', 'ashby', 'elevenlabs', 'elevenlabs.io', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Fivetran', 'greenhouse', 'greenhouse', 'fivetran', 'fivetran.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Airbnb', 'greenhouse', 'greenhouse', 'airbnb', 'airbnb.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Sierra', 'ashby', 'ashby', 'sierra', 'sierra.ai', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'ClickHouse', 'greenhouse', 'greenhouse', 'clickhouse', 'clickhouse.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Klaviyo', 'greenhouse', 'greenhouse', 'klaviyo', 'klaviyo.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Coinbase', 'greenhouse', 'greenhouse', 'coinbase', 'coinbase.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Ripple', 'greenhouse', 'greenhouse', 'ripple', 'ripple.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Cursor', 'ashby', 'ashby', 'cursor', 'cursor.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Cerebras', 'ashby', 'ashby', 'cerebras', 'cerebras.net', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Skydio', 'ashby', 'ashby', 'skydio', 'skydio.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Glean', 'greenhouse', 'greenhouse', 'gleanwork', 'glean.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Vanta', 'ashby', 'ashby', 'vanta', 'vanta.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Nuro', 'greenhouse', 'greenhouse', 'nuro', 'nuro.ai', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Nubank', 'ashby', 'ashby', 'nubank', 'nubank.com.br', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Neuralink', 'greenhouse', 'greenhouse', 'neuralink', 'neuralink.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Mercor', 'ashby', 'ashby', 'mercor', 'mercor.com', 1, 2);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Deepgram', 'ashby', 'ashby', 'deepgram', 'deepgram.com', 1, 2);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Sigma Computing', 'greenhouse', 'greenhouse', 'sigmacomputing', 'sigmacomputing.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Chainguard', 'greenhouse', 'greenhouse', 'chainguard', 'chainguard.dev', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Chime', 'greenhouse', 'greenhouse', 'chime', 'chime.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Hightouch', 'greenhouse', 'greenhouse', 'hightouch', 'hightouch.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Suno', 'ashby', 'ashby', 'suno', 'suno.com', 1, 2);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Duolingo', 'greenhouse', 'greenhouse', 'duolingo', 'duolingo.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Luma AI', 'ashby', 'ashby', 'lumaai', 'lumalabs.ai', 1, 2);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Exa', 'ashby', 'ashby', 'exa', 'exa.ai', 1, 2);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Confluent', 'ashby', 'ashby', 'confluent', 'confluent.io', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Cartesia', 'ashby', 'ashby', 'cartesia', 'cartesia.ai', 1, 2);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Dropbox', 'greenhouse', 'greenhouse', 'dropbox', 'dropbox.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Physical Intelligence', 'ashby', 'ashby', 'physicalintelligence', 'physicalintelligence.company', 1, 2);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Anrok', 'ashby', 'ashby', 'anrok', 'anrok.com', 1, 2);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Squarespace', 'greenhouse', 'greenhouse', 'squarespace', 'squarespace.com', 1, 2);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'LlamaIndex', 'ashby', 'ashby', 'llamaindex', 'llamaindex.ai', 1, 2);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Airbyte', 'ashby', 'ashby', 'airbyte', 'airbyte.com', 1, 2);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'World Labs', 'greenhouse', 'greenhouse', 'worldlabs', 'worldlabs.ai', 1, 2);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'AssemblyAI', 'greenhouse', 'greenhouse', 'assemblyai', 'assemblyai.com', 1, 2);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Infisical', 'ashby', 'ashby', 'infisical', 'infisical.com', 1, 2);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Unstructured', 'ashby', 'ashby', 'unstructured', 'unstructured.io', 1, 2);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Pinecone', 'ashby', 'ashby', 'pinecone', 'pinecone.io', 1, 2);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Prefect', 'ashby', 'ashby', 'prefect', 'prefect.io', 1, 2);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Weaviate', 'ashby', 'ashby', 'weaviate', 'weaviate.io', 1, 2);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Deepnote', 'ashby', 'ashby', 'deepnote', 'deepnote.com', 1, 2);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Tigera', 'greenhouse', 'greenhouse', 'tigera', 'tigera.io', 1, 2);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Doppler', 'ashby', 'ashby', 'doppler', 'doppler.com', 1, 2);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Knock', 'ashby', 'ashby', 'knock', 'knock.app', 1, 2);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Prisma', 'greenhouse', 'greenhouse', 'prisma', 'prisma.io', 1, 2);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Chroma', 'ashby', 'ashby', 'trychroma', 'trychroma.com', 1, 2);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Optiver', 'greenhouse', 'greenhouse', 'optiverus', 'optiver.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'IMC Trading', 'greenhouse', 'greenhouse', 'imc', 'imc.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Jump Trading', 'greenhouse', 'greenhouse', 'jumptrading', 'jumptrading.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Old Mission Capital', 'greenhouse', 'greenhouse', 'oldmissioncapital', 'oldmissioncapital.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Chicago Trading Company', 'greenhouse', 'greenhouse', 'chicagotrading', 'chicagotrading.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Relativity', 'greenhouse', 'greenhouse', 'relativity', 'relativity.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Braze', 'greenhouse', 'greenhouse', 'braze', 'braze.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Fetch', 'greenhouse', 'greenhouse', 'fetch', 'fetch.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Enova', 'greenhouse', 'greenhouse', 'enova', 'enova.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'project44', 'greenhouse', 'greenhouse', 'project44', 'project44.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Sprout Social', 'greenhouse', 'greenhouse', 'sproutsocial', 'sproutsocial.com', 1, 2);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Cameo', 'greenhouse', 'greenhouse', 'cameo', 'cameo.com', 1, 2);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Decagon', 'ashby', 'ashby', 'decagon', 'decagon.ai', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Justworks', 'greenhouse', 'greenhouse', 'justworks', 'justworks.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Zocdoc', 'greenhouse', 'greenhouse', 'zocdoc', 'zocdoc.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Fireworks AI', 'ashby', 'ashby', 'fireworks', 'fireworks.ai', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Attentive', 'greenhouse', 'greenhouse', 'attentive', 'attentive.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Marqeta', 'greenhouse', 'greenhouse', 'marqeta', 'marqeta.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'CLEAR', 'greenhouse', 'greenhouse', 'clear', 'clearme.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Flatiron Health', 'greenhouse', 'greenhouse', 'flatironhealth', 'flatiron.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Yext', 'greenhouse', 'greenhouse', 'yext', 'yext.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Movable Ink', 'greenhouse', 'greenhouse', 'movableink', 'movableink.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Ondo Finance', 'greenhouse', 'greenhouse', 'ondofinance', 'ondo.finance', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Rent the Runway', 'greenhouse', 'greenhouse', 'renttherunway', 'renttherunway.com', 1, 1);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Modern Treasury', 'ashby', 'ashby', 'moderntreasury', 'moderntreasury.com', 1, 2);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Arcade', 'ashby', 'ashby', 'arcade', 'arcade.software', 1, 2);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Sisense', 'greenhouse', 'greenhouse', 'sisense', 'sisense.com', 1, 2);
INSERT OR IGNORE INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier) VALUES (lower(hex(randomblob(16))), 'Current', 'greenhouse', 'greenhouse', 'current', 'current.com', 1, 2);
