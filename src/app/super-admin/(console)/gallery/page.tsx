import { listGalleryImages } from "./actions";
import { GalleryClient } from "./gallery-client";

export default async function GalleryPage() {
  const images = await listGalleryImages();
  return (
    <main className="p-8">
      <h1 className="font-display text-2xl font-semibold mb-1">Master Gallery</h1>
      <p className="text-ink-mid text-sm mb-6">Shared menu-item images every restaurant can pick from when adding a product.</p>
      <GalleryClient images={images} />
    </main>
  );
}
