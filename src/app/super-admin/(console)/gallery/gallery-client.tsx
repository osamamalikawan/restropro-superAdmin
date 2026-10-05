"use client";
import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addGalleryImage, createGalleryUpload, toggleGalleryImage, removeGalleryImage } from "./actions";

type Image = { id: string; title: string; url: string; category: string | null; tags: string[]; is_active: boolean };
type PickedFile = { file: File; preview: string };

const UNCATEGORIZED = "__none__";
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif";
const inputCls = "w-full mt-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm";
const labelCls = "text-xs font-semibold text-ink-mid uppercase tracking-wide";

function baseName(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Untitled";
}

export function GalleryClient({ images }: { images: Image[] }) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<"upload" | "url">("upload");
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Filters are driven by Category: one pill per distinct category, with counts.
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    let none = 0;
    for (const i of images) {
      const c = i.category?.trim();
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
      else none++;
    }
    return {
      list: Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0])),
      none,
    };
  }, [images]);

  const filtered = images.filter((i) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || i.title.toLowerCase().includes(q) || i.tags.some((t) => t.includes(q));
    const matchesCategory =
      !categoryFilter ||
      (categoryFilter === UNCATEGORIZED ? !i.category?.trim() : i.category?.trim() === categoryFilter);
    return matchesSearch && matchesCategory;
  });

  function addFiles(list: FileList | File[]) {
    const next: PickedFile[] = [];
    const problems: string[] = [];
    for (const f of Array.from(list)) {
      if (!f.type.startsWith("image/")) problems.push(`${f.name} is not an image`);
      else if (f.size > MAX_BYTES) problems.push(`${f.name} is larger than 5 MB`);
      else next.push({ file: f, preview: URL.createObjectURL(f) });
    }
    setError(problems.join(" · "));
    if (next.length) setPicked((p) => [...p, ...next]);
  }

  function removePicked(idx: number) {
    setPicked((p) => {
      URL.revokeObjectURL(p[idx].preview);
      return p.filter((_, i) => i !== idx);
    });
  }

  function resetForm() {
    picked.forEach((p) => URL.revokeObjectURL(p.preview));
    setPicked([]);
    setTitle("");
    setUrl("");
    setCategory("");
    setTags("");
    setProgress("");
    if (fileInput.current) fileInput.current.value = "";
  }

  async function submit() {
    setError("");
    // Reuse an existing category's exact spelling so "burgers" doesn't create a second pill next to "Burgers".
    const typed = category.trim();
    const cat = categories.list.find(([c]) => c.toLowerCase() === typed.toLowerCase())?.[0] ?? typed;
    const tagList = tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);

    if (mode === "url") {
      setSaving(true);
      const res = await addGalleryImage({ title, url, category: cat, tags: tagList });
      setSaving(false);
      if (!res.ok) return setError(res.error);
      resetForm();
      setShowForm(false);
      return;
    }

    if (picked.length === 0) return setError("Choose at least one image");

    setSaving(true);
    const supabase = createClient();
    let done = 0;
    for (const { file, preview } of picked) {
      setProgress(`Uploading ${done + 1} of ${picked.length}…`);
      const imgTitle = picked.length === 1 && title.trim() ? title.trim() : baseName(file.name);

      const slot = await createGalleryUpload({ fileName: file.name, contentType: file.type, size: file.size });
      if (!slot.ok) {
        setError(`${file.name}: ${slot.error}`);
        break;
      }
      const { error: upErr } = await supabase.storage.from("gallery").uploadToSignedUrl(slot.path, slot.token, file, {
        contentType: file.type,
      });
      if (upErr) {
        setError(`${file.name}: ${upErr.message}`);
        break;
      }
      const saved = await addGalleryImage({ title: imgTitle, url: slot.publicUrl, category: cat, tags: tagList });
      if (!saved.ok) {
        setError(`${file.name}: ${saved.error}`);
        break;
      }
      done++;
      URL.revokeObjectURL(preview);
      setPicked((p) => p.filter((x) => x.file !== file));
    }
    setSaving(false);
    setProgress("");
    if (done === picked.length) {
      resetForm();
      setShowForm(false);
    }
  }

  async function toggle(img: Image) {
    setBusyId(img.id);
    const res = await toggleGalleryImage(img.id, !img.is_active);
    setBusyId(null);
    if (!res.ok) alert(res.error);
  }

  async function remove(img: Image) {
    if (!confirm(`Remove "${img.title}" from the gallery?`)) return;
    setBusyId(img.id);
    const res = await removeGalleryImage(img.id);
    setBusyId(null);
    if (!res.ok) alert(res.error);
  }

  const pill = (active: boolean) =>
    `text-xs font-semibold px-3 py-1 rounded-full transition-colors ${active ? "bg-chili-500 text-white" : "bg-raised text-ink-mid hover:bg-hover"}`;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title or tag…"
          className="rounded-md border border-line bg-canvas px-3 py-2 text-sm"
        />
        <button onClick={() => setShowForm((s) => !s)} className="rounded-md bg-chili-500 hover:bg-chili-600 text-white text-xs font-semibold px-3 py-1.5">
          {showForm ? "Close" : "+ Add images"}
        </button>
      </div>

      {(categories.list.length > 0 || categories.none > 0) && (
        <div className="flex flex-wrap gap-2 mb-4" role="tablist" aria-label="Filter by category">
          <button onClick={() => setCategoryFilter("")} className={pill(categoryFilter === "")}>
            All ({images.length})
          </button>
          {categories.list.map(([c, n]) => (
            <button key={c} onClick={() => setCategoryFilter(c)} className={pill(categoryFilter === c)}>
              {c} ({n})
            </button>
          ))}
          {categories.none > 0 && (
            <button onClick={() => setCategoryFilter(UNCATEGORIZED)} className={pill(categoryFilter === UNCATEGORIZED)}>
              Uncategorized ({categories.none})
            </button>
          )}
        </div>
      )}

      {showForm && (
        <div className="rounded-xl border border-line bg-surface p-4 mb-5 max-w-xl space-y-3">
          <div className="flex gap-2">
            <button onClick={() => setMode("upload")} className={pill(mode === "upload")}>Upload files</button>
            <button onClick={() => setMode("url")} className={pill(mode === "url")}>Paste URL</button>
          </div>

          {mode === "upload" ? (
            <div>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
                onClick={() => fileInput.current?.click()}
                className={`cursor-pointer rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition-colors ${dragOver ? "border-chili-500 bg-chili-500/10" : "border-line hover:bg-hover"}`}
              >
                <div className="font-semibold text-ink-strong">Click to choose or drop images here</div>
                <div className="text-xs text-ink-faint mt-1">JPG, PNG, WebP, GIF or AVIF · up to 5 MB each</div>
                <input
                  ref={fileInput}
                  type="file"
                  accept={ACCEPT}
                  multiple
                  className="hidden"
                  onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
                />
              </div>
              {picked.length > 0 && (
                <div className="grid grid-cols-4 gap-2 mt-3">
                  {picked.map((p, idx) => (
                    <div key={p.preview} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.preview} alt={p.file.name} className="w-full h-16 object-cover rounded-md bg-raised" />
                      <button
                        onClick={() => removePicked(idx)}
                        disabled={saving}
                        aria-label={`Remove ${p.file.name}`}
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-crimson-500 text-white text-xs leading-5"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {picked.length === 1 && (
                <div className="mt-3">
                  <label className={labelCls}>Title</label>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={baseName(picked[0].file.name)} className={inputCls} />
                </div>
              )}
              {picked.length > 1 && <p className="text-xs text-ink-faint mt-2">Each image is titled from its file name.</p>}
            </div>
          ) : (
            <>
              <div>
                <label className={labelCls}>Title</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Image URL</label>
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className={inputCls} />
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Category</label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                list="gallery-categories"
                placeholder="Burgers"
                className={inputCls}
              />
              <datalist id="gallery-categories">
                {categories.list.map(([c]) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className={labelCls}>Tags (comma separated)</label>
              <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="beef, spicy" className={inputCls} />
            </div>
          </div>

          {error && <p className="text-crimson-500 text-xs">{error}</p>}
          <button onClick={submit} disabled={saving} className="rounded-md bg-chili-500 hover:bg-chili-600 text-white text-xs font-semibold px-4 py-2 disabled:opacity-50">
            {saving ? progress || "Saving…" : mode === "upload" ? `Upload${picked.length > 1 ? ` ${picked.length} images` : ""}` : "Add to gallery"}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {filtered.map((img) => (
          <div key={img.id} className={`rounded-xl border border-line bg-surface overflow-hidden transition-opacity ${busyId === img.id ? "opacity-50" : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt={img.title} className="w-full h-28 object-cover bg-raised" loading="lazy" />
            <div className="p-3">
              <div className="font-semibold text-sm text-ink-strong truncate">{img.title}</div>
              <div className="text-xs text-ink-mid truncate">{img.category?.trim() || "Uncategorized"}</div>
              <div className="text-xs text-ink-faint mb-2 truncate">{img.tags.map((t) => `#${t}`).join(" ")}</div>
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${img.is_active ? "bg-basil-500/15 text-basil-500" : "bg-ink-faint/15 text-ink-faint"}`}>
                  {img.is_active ? "Active" : "Hidden"}
                </span>
                <div className="flex gap-1">
                  <button onClick={() => toggle(img)} disabled={busyId === img.id} className="text-xs px-2 py-1 rounded-md bg-raised hover:bg-hover" title={img.is_active ? "Hide" : "Activate"}>
                    {img.is_active ? "Hide" : "Show"}
                  </button>
                  <button onClick={() => remove(img)} disabled={busyId === img.id} className="text-xs px-2 py-1 rounded-md bg-crimson-500/15 text-crimson-500 hover:bg-crimson-500/25">
                    Remove
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="col-span-full text-center py-10 text-ink-faint text-sm">No images match, try another category or add one.</div>}
      </div>
    </div>
  );
}
