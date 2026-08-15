# Resume compiler

This service is Pinkslip's isolated, deterministic Typst boundary. It accepts
only versioned Typst source, uses the same pinned compiler package and bundled
Source Sans 3 files as the client, and returns the PDF plus source/PDF SHA-256
headers. It has no database, R2, resume-profile, or network dependency.

It is intentionally not wired into `wrangler.toml` yet. Cloudflare Containers
requires the Workers Paid plan; production activation should bind this service
as `RESUME_COMPILER` only after the account and deployment are explicitly
approved. Until then, the Worker accepts the verified client compiler path.
