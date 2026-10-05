/** Shown instantly inside the console shell (sidebar + topbar stay put) while the next
 *  super-admin page's server data loads — this is the page-change animation. */
export default function ConsoleLoading() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-32 text-ink-faint">
      <span className="rp-spinner rp-spinner-lg" />
      <span className="text-sm">Loading…</span>
    </div>
  );
}
