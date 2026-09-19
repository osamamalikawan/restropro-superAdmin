"use client";
import { useMemo, useState } from "react";
import { addGalleryImage, toggleGalleryImage, removeGalleryImage } from "./actions";

type Image = { id: string; title: string; url: string; category: string | null; tags: string[]; is_active: boolean };

export function GalleryClient({ images }: { images: Image[] }) {
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const allTags = useMemo(() => Array.from(new Set(images.flatMap((i) => i.tags))).sort(), [images]);
  const filtered = images.filter((i) => {
    const matchesSearch = !search || i.title.toLowerCase().includes(search.toLowerCase());
    const matchesTag = !tagFilter || i.tags.includes(tagFilter);
    return matchesSearch && matchesTag;
  });

  async function submit() {
    setSaving(true);
    setError("");
    try {
      await addGalleryImage({
        title,
        url,
        category,
        tags: tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
      });
      setTitle("");
      setUrl("");
      setCategory("");
      setTags("");
      setShowForm(false);
    } catch (e: any) {
      setError(e.message ?? "Could not add image");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title…"
            className="rounded-md border border-line bg-canvas px-3 py-2 text-sm"
          />
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="rounded-md bg-chili-500 hover:bg-chili-600 text-white text-xs font-semibold px-3 py-1.5">
          {showForm ? "Close" : "+ Add image"}
        </button>
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setTagFilter("")}
            className={`text-xs font-semibold px-3 py-1 rounded-full ${tagFilter === "" ? "bg-chili-500 text-white" : "bg-raised text-ink-mid"}`}
          >
            All
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => setTagFilter(t)}
              className={`text-xs font-semibold px-3 py-1 rounded-full ${tagFilter === t ? "bg-chili-500 text-white" : "bg-raised text-ink-mid"}`}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      {showForm && (
        <div className="rounded-xl border border-line bg-surface p-4 mb-5 max-w-lg space-y-3">
          <div>
            <label className="text-xs font-semibold text-ink-mid uppercase tracking-wide">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full mt-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-ink-mid uppercase tracking-wide">Image URL</label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="w-full mt-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-ink-mid uppercase tracking-wide">Category</label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Burgers" className="w-full mt-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-ink-mid uppercase tracking-wide">Tags (comma separated)</label>
              <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="beef, spicy" className="w-full mt-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm" />
            </div>
          </div>
          {error && <p className="text-crimson-500 text-xs">{error}</p>}
          <button onClick={submit} disabled={saving} className="rounded-md bg-chili-500 hover:bg-chili-600 text-white text-xs font-semibold px-4 py-2 disabled:opacity-50">
            {saving ? "Saving…" : "Add to gallery"}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {filtered.map((img) => (
          <div key={img.id} className="rounded-xl border border-line bg-surface overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt={img.title} className="w-full h-28 object-cover bg-raised" loading="lazy" />
            <div className="p-3">
              <div className="font-semibold text-sm text-ink-strong truncate">{img.title}</div>
              <div className="text-xs text-ink-faint mb-2">{img.tags.map((t) => `#${t}`).join(" ")}</div>
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${img.is_active ? "bg-basil-500/15 text-basil-500" : "bg-ink-faint/15 text-ink-faint"}`}>
                  {img.is_active ? "Active" : "Hidden"}
                </span>
                <div className="flex gap-1">
                  <button onClick={() => toggleGalleryImage(img.id, !img.is_active)} className="text-xs px-2 py-1 rounded-md bg-raised hover:bg-hover" title={img.is_active ? "Hide" : "Activate"}>
                    {img.is_active ? "Hide" : "Show"}
                  </button>
                  <button onClick={() => removeGalleryImage(img.id)} className="text-xs px-2 py-1 rounded-md bg-crimson-500/15 text-crimson-500 hover:bg-crimson-500/25">
                    Remove
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="col-span-full text-center py-10 text-ink-faint text-sm">No images match, try another tag or add one.</div>}
      </div>
    </div>
  );
}
