-- Add curated_title to stories (shown as section heading on the story page)
ALTER TABLE stories ADD COLUMN curated_title TEXT NOT NULL DEFAULT '';
