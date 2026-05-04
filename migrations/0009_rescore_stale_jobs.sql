-- Re-cap scores for senior/staff/etc titles that were scored before disqualification logic
UPDATE jobs SET score = 15 WHERE score > 15 AND (
  title LIKE '%Senior%' OR title LIKE '%Staff%' OR title LIKE '%Principal%'
  OR title LIKE '%Director%' OR title LIKE '%Intern,%' OR title LIKE '%Internship%'
  OR title LIKE '%Lead %' OR title LIKE '%Sr.%' OR title LIKE '%Sr %'
  OR title LIKE '%Manager%' OR title LIKE '%Head of%' OR title LIKE '%Architect%'
  OR title LIKE '%VP %'
);

-- Re-cap scores for non-US locations: cap anything that doesn't look US-based
-- Matches: Remote, United States, ", XX" state codes, and common US cities
UPDATE jobs SET score = 15 WHERE score > 15
  AND location != ''
  AND location NOT LIKE '%Remote%'
  AND location NOT LIKE '%remote%'
  AND location NOT LIKE '%United States%'
  AND location NOT LIKE '%, US%'
  AND location NOT LIKE '%, AL%' AND location NOT LIKE '%, AK%' AND location NOT LIKE '%, AZ%'
  AND location NOT LIKE '%, AR%' AND location NOT LIKE '%, CA%' AND location NOT LIKE '%, CO%'
  AND location NOT LIKE '%, CT%' AND location NOT LIKE '%, DE%' AND location NOT LIKE '%, FL%'
  AND location NOT LIKE '%, GA%' AND location NOT LIKE '%, HI%' AND location NOT LIKE '%, ID%'
  AND location NOT LIKE '%, IL%' AND location NOT LIKE '%, IN%' AND location NOT LIKE '%, IA%'
  AND location NOT LIKE '%, KS%' AND location NOT LIKE '%, KY%' AND location NOT LIKE '%, LA%'
  AND location NOT LIKE '%, ME%' AND location NOT LIKE '%, MD%' AND location NOT LIKE '%, MA%'
  AND location NOT LIKE '%, MI%' AND location NOT LIKE '%, MN%' AND location NOT LIKE '%, MS%'
  AND location NOT LIKE '%, MO%' AND location NOT LIKE '%, MT%' AND location NOT LIKE '%, NE%'
  AND location NOT LIKE '%, NV%' AND location NOT LIKE '%, NH%' AND location NOT LIKE '%, NJ%'
  AND location NOT LIKE '%, NM%' AND location NOT LIKE '%, NY%' AND location NOT LIKE '%, NC%'
  AND location NOT LIKE '%, ND%' AND location NOT LIKE '%, OH%' AND location NOT LIKE '%, OK%'
  AND location NOT LIKE '%, OR%' AND location NOT LIKE '%, PA%' AND location NOT LIKE '%, RI%'
  AND location NOT LIKE '%, SC%' AND location NOT LIKE '%, SD%' AND location NOT LIKE '%, TN%'
  AND location NOT LIKE '%, TX%' AND location NOT LIKE '%, UT%' AND location NOT LIKE '%, VT%'
  AND location NOT LIKE '%, VA%' AND location NOT LIKE '%, WA%' AND location NOT LIKE '%, WV%'
  AND location NOT LIKE '%, WI%' AND location NOT LIKE '%, WY%' AND location NOT LIKE '%, DC%'
  AND location NOT LIKE '%New York%' AND location NOT LIKE '%San Francisco%'
  AND location NOT LIKE '%Dallas%' AND location NOT LIKE '%NYC%'
  AND location NOT LIKE '%Multiple%' AND location NOT LIKE '%Various%';
