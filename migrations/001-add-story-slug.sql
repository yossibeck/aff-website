-- Add story_slug to page_view_log and click_log
-- Safe to run against shared aff-story-db — both columns are nullable

ALTER TABLE page_view_log ADD COLUMN story_slug TEXT;
ALTER TABLE click_log     ADD COLUMN story_slug TEXT;

CREATE INDEX IF NOT EXISTS idx_page_view_log_story ON page_view_log (story_slug);
CREATE INDEX IF NOT EXISTS idx_click_log_story     ON click_log     (story_slug);
