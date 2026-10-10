-- The built-in account visitors read the feed as (worker/catalog-reader.ts).
-- Its search profile is created with the defaults on first read.
INSERT OR IGNORE INTO users (id, name) VALUES ('catalog-reader', 'Public catalog');
