PRAGMA foreign_keys = ON;

ALTER TABLE assignments
ADD COLUMN available_from_utc TEXT;

ALTER TABLE assignments
ADD COLUMN available_until_utc TEXT;
