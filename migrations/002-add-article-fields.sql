-- Add article layout support to stories
-- Safe to run against live data: columns are nullable / have defaults

ALTER TABLE stories ADD COLUMN content_type TEXT NOT NULL DEFAULT 'story';
ALTER TABLE stories ADD COLUMN hero_desktop_url TEXT;
ALTER TABLE stories ADD COLUMN hero_mobile_url TEXT;

-- Mark story 38 as the first article
UPDATE stories SET content_type = 'article' WHERE id = 38;
