-- Site config: one row per category for tenant 1 (Aura St. Claire)
INSERT OR IGNORE INTO site_config (tenant_id, category, hero_video_url, hero_title)
VALUES
  (1, 'wellness', 'pullover.mp4', 'The Wellness Issue'),
  (1, 'street',   'o.mp4',        'The Street Issue'),
  (1, 'beauty',   'blue-zoom.mp4','The Beauty Issue');

-- Sample story
INSERT OR IGNORE INTO stories (tenant_id, slug, category, social_title, social_img, intro_text, sections_json)
VALUES (
  1,
  'morning-glow-routine',
  'wellness',
  'The 5 AM Glow-Up Routine',
  '/heidi-in-bg.png',
  'True beauty starts with a calm morning. Here is how I set my intention for the day with these essentials.',
  '[{"product_id":"ali_12345","story_text":"I start with this silk dress. It feels like a second skin and makes me feel elegant even before my first coffee.","display_image":"/1st-duck.png"}]'
);

-- Populate story_products mapping table
-- story_id 1 = morning-glow-routine (first inserted story)
INSERT OR IGNORE INTO story_products (story_id, product_id, tenant_id)
VALUES (1, 'ali_12345', 1);
