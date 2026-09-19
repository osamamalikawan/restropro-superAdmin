-- Master Gallery (super admin): a shared pool of menu-item images restaurants can pick from.
-- Images are referenced by URL rather than uploaded binary, matching how products.image_url
-- already works elsewhere in the app.
CREATE TABLE public.gallery_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  url text NOT NULL,
  category text,
  tags text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gallery_images ENABLE ROW LEVEL SECURITY;

-- Every restaurant's staff needs to browse the gallery to pick a menu image, so any
-- authenticated user may read active images. Only super admins can write (checked in the
-- app layer via the service-role client, same pattern as every other super-admin action) —
-- no insert/update/delete policy means the anon/authenticated roles are blocked from writing,
-- and the service-role client used server-side bypasses RLS entirely.
CREATE POLICY "Authenticated users can read active gallery images"
  ON public.gallery_images
  FOR SELECT
  TO authenticated
  USING (is_active = true);
