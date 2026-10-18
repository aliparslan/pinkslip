-- Step 4 (docs/backend-inventory-2026-10-16.md, Decisions: Application dates
-- and gaps #7, #8): the company's domain and the job's pay are kept on the
-- application, so Tracker shows pay and the logo stays after the job leaves
-- the catalog, and so applications added by hand (no Pinkslip job) have a
-- logo when their company is in the catalog.
ALTER TABLE applications ADD COLUMN company_domain TEXT;
ALTER TABLE applications ADD COLUMN salary TEXT;

UPDATE applications
SET company_domain = (
      SELECT c.website FROM jobs j JOIN companies c ON c.id = j.company_id WHERE j.id = applications.job_id
    ),
    salary = (SELECT j.salary FROM jobs j WHERE j.id = applications.job_id)
WHERE job_id IS NOT NULL;
