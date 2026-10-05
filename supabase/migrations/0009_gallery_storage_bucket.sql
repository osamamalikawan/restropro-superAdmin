-- Master Gallery uploads: a public Storage bucket for the image files themselves.
-- gallery_images.url keeps pointing at a URL (now the bucket's public URL for uploaded files,
-- or any external URL if one is pasted instead), so restaurants' product pickers need no change.
--
-- Writes happen only through signed upload URLs minted by the super-admin server action
-- (service-role client), so no INSERT/UPDATE/DELETE policies are added for anon/authenticated.
-- The bucket is public, which lets <img src> work without signing every read.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'gallery',
  'gallery',
  true,
  5242880, -- 5 MB per image
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
