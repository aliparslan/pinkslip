# Resume import: LaTeX resumes hang and import wrong (2026-10-29)

A tester's one-page resume, built from the common LaTeX template (pdfTeX,
Latin Modern fonts, "Company / date" then "Title | stack / city" rows), took
20–36 seconds to import and came back wrong. Production's import log shows the
same path six times since Oct 22. The PDF itself is fine: `pdftotext` reads
every line.

## What happens now

1. `POST /resume-import/parse` runs Workers AI `toMarkdown`. For this PDF it
   keeps almost no line breaks: the name, contact line, "Education", the
   school and its date come back as one run of text ("…GaddamKushal…@…
   EducationUniversity of Florida May 2025B.S. in…"). pdfTeX writes no
   newline characters, and the converter only breaks where it finds one.
2. The parser finds no name and no sections in that run, so the route answers
   `no_extractable_text` (about 0.2 s).
3. The phone falls back to the scan: it renders the page (1391×1800 JPEG,
   ~0.7 MB) and Llama 4 Scout transcribes it. That is the 20–36 s wait, with
   nothing moving on screen. Two overlapping scans on Oct 29 look like a
   second tap during the wait.
4. The scan reads every word correctly but changes the layout: each
   right-aligned date and city moves to its own line, and company names come
   back as headings. The parser then gets most entries wrong:
   - experience: company and title blank on all three jobs;
   - education: no graduation date or city, the minor fused into the major,
     coursework lost;
   - projects: the first project empty, its stack line made a project, the
     second project lost and its bullets moved into the first;
   - "Leadership & Involvement": three nameless projects (the heading
     pattern doesn't know "Involvement");
   - skills: "MATLAB" becomes "MA TLAB" (the fused-state rule reads ", MA"
     followed by a capital as Massachusetts).

## What a fix needs

- **Lines from the PDF itself.** pdf.js (`pdfjs-dist`, already a dependency
  of the native renderer and the web app) gives each text run with its
  position. Grouping runs by baseline and keeping a wide gap as two spaces
  reproduced the page exactly, right-aligned dates on their rows, in 36 ms.
  No scan needed for any PDF with a text layer.
- **The parser taught this template.** Even from exact lines it misreads it
  (companies and titles shift by one entry, Education is dropped, project
  stack lines become projects). The two-row entry ("Company  date" over
  "Title | stack  city") needs to be a known shape, "Involvement" a
  leadership heading, and the state rule must not split a word like MATLAB.
  A sanitized fixture of this template belongs in
  `tests/fixtures/resume-import/corpus.json`.
- **The scan stays** for real scans (no text layer). Today the sheet tells
  this text PDF "It's a scan, so reading it page by page." and its bar holds
  at 75% for the whole half minute, which reads as a hang. With lines from
  pdf.js only true scans would get there.

The debug steps are reproducible with a script that calls `toMarkdown` and
Llama 4 Scout over the REST API and runs `parseResumeText` on each result.
