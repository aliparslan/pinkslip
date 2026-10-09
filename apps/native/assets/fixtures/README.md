# Prototype fixtures (1.6b)

Committed so the resume-import experiment is reproducible without a Files app
round trip. They are fixture inputs, not app assets.

- `resume-text.pdf` — one-page text resume produced with macOS
  `cupsfilter -m application/pdf` from the plain-text resume in the observation
  log. The server converter parses it into contact, experience, education and
  skills.
- `resume-notext.pdf` — generated with `pdf-lib`: rectangles and rules, no text
  layer. Exercises the `no_extractable_text` path (a stand-in for a scan).
- `resume-malformed.pdf` — ASCII bytes with a `.pdf` name; exercises the
  `invalid_pdf` path.
