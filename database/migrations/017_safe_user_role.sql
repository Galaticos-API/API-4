-- Preserve existing accounts; only omitted roles in new accounts default to dev.
ALTER TABLE usuario ALTER COLUMN role SET DEFAULT 'dev';
