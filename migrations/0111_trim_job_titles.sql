-- Job titles as people read them (owner, 2026-11-04: a push showed GitLab's
-- "Intermediate Fullstack Engineer, Subscription Lifecycle " with its
-- trailing space). New listings are tidied as they're polled
-- (worker/poller.ts `cleanTitle`); this tidies the ones already stored:
-- tabs and line breaks to spaces, doubled spaces to one, ends trimmed.
UPDATE jobs
SET title = trim(replace(replace(replace(replace(replace(title, char(9), ' '), char(10), ' '), char(13), ' '), '  ', ' '), '  ', ' '))
WHERE title != trim(title)
   OR title LIKE '%  %'
   OR instr(title, char(9)) > 0
   OR instr(title, char(10)) > 0
   OR instr(title, char(13)) > 0;
