-- Support rate limiting the magic-link endpoint (previously unbounded: no
-- cooldown, cap, or IP tracking, making it an email-spam / cost-abuse vector).
ALTER TABLE email_login_tokens ADD COLUMN request_ip TEXT;

CREATE INDEX IF NOT EXISTS idx_email_login_tokens_email_created
  ON email_login_tokens(email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_login_tokens_ip_created
  ON email_login_tokens(request_ip, created_at DESC);
