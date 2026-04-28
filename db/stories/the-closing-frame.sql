-- Story: the-closing-frame
-- Video: Departure — woman packing, mirror moment, grabbing perfume, leaving apartment
-- Products: satin-blouse (SHEIN), backless-dress (SHEIN), tube-top (SHEIN), led-mirror (AliExpress)
-- Hero image: scene-3-mirror.jpg

INSERT OR IGNORE INTO stories (tenant_id, slug, category, social_title, social_img, intro_text, curated_title, sections_json)
VALUES (
  1,
  'the-closing-frame',
  'fashion',
  'something about the way the light hits. i can''t explain it.',
  '/scene-3-mirror.jpg',
  'something shifted. maybe you felt it too.
these are the pieces i reach for when i go quiet and start moving.',
  'it''s there if you want it.',
  '[{"product_id":"289626563","story_text":"the last thing i put on before i locked the door.","display_image":"http://img.ltwebstatic.com/v4/j/spmp/2025/11/15/48/176318253629b0ee2243173a7564bd8c6ee190347b_thumbnail_405x552.jpg"},{"product_id":"263179281","story_text":"i don''t know where i''m going. i know what i''m wearing when i get there.","display_image":"http://img.ltwebstatic.com/v4/j/spmp/2026/01/20/43/17688771664e264828d09c938a4ef6bec4561726e0_thumbnail_405x552.jpg"},{"product_id":"62232334","story_text":"the one thing i always pack. the one thing i never explain.","display_image":"http://img.ltwebstatic.com/v4/j/spmp/2025/12/03/e9/17647483181b6eb52f43a5deac21aff5cce1d2915f_thumbnail_405x552.jpg"},{"product_id":"1005006241120784","story_text":"i held it up in the dark. i looked. i kept moving.","display_image":"https://ae01.alicdn.com/kf/S28174095e4554148b93756bbd284f8caz.jpg"}]'
);

-- Map story → products for click tracking
INSERT OR IGNORE INTO story_products (story_id, product_id, tenant_id)
SELECT s.id, '289626563', 1
FROM stories s WHERE s.slug = 'the-closing-frame' AND s.tenant_id = 1;

INSERT OR IGNORE INTO story_products (story_id, product_id, tenant_id)
SELECT s.id, '263179281', 1
FROM stories s WHERE s.slug = 'the-closing-frame' AND s.tenant_id = 1;

INSERT OR IGNORE INTO story_products (story_id, product_id, tenant_id)
SELECT s.id, '62232334', 1
FROM stories s WHERE s.slug = 'the-closing-frame' AND s.tenant_id = 1;

INSERT OR IGNORE INTO story_products (story_id, product_id, tenant_id)
SELECT s.id, '1005006241120784', 1
FROM stories s WHERE s.slug = 'the-closing-frame' AND s.tenant_id = 1;
