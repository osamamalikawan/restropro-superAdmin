"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/** One app-wide loading indicator (top progress bar + corner spinner), mounted once in the root
 *  layout so no page needs wiring. It turns on while ANY of these is in flight:
 *    - a click on an internal <Link>/<a> until the new route renders,
 *    - a Next.js server action (POST with a `Next-Action` header) — every form action and
 *      onClick={() => someAction()} in the app,
 *    - a non-prefetch RSC navigation/refresh fetch,
 *    - Supabase auth/storage calls (login, logout, password change, gallery uploads).
 *  It waits SHOW_DELAY ms before appearing so instant actions don't flash. */
const SHOW_DELAY = 120;
const NAV_SAFETY_MS = 10000;

function headerOf(input: RequestInfo | URL, init: RequestInit | undefined, name: string) {
  const fromInit = init?.headers;
  if (fromInit) return new Headers(fromInit).get(name);
  if (typeof Request !== "undefined" && input instanceof Request) return input.headers.get(name);
  return null;
}

function urlOf(input: RequestInfo | URL) {
  return typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
}

export function GlobalLoading() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const state = useRef({ inflight: 0, navPending: false, update: () => {} });

  useEffect(() => {
    const s = state.current;
    let shown = false;
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let navSafety: ReturnType<typeof setTimeout> | undefined;

    s.update = () => {
      const busy = s.inflight > 0 || s.navPending;
      if (busy) {
        clearTimeout(hideTimer);
        if (!shown && !showTimer) {
          showTimer = setTimeout(() => {
            shown = true;
            showTimer = undefined;
            setVisible(true);
          }, SHOW_DELAY);
        }
      } else {
        clearTimeout(showTimer);
        showTimer = undefined;
        if (shown) {
          hideTimer = setTimeout(() => {
            shown = false;
            setVisible(false);
          }, 250);
        }
      }
    };

    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      const url = urlOf(input);
      const isServerAction = headerOf(input, init, "Next-Action") !== null;
      const isRsc = headerOf(input, init, "RSC") !== null && headerOf(input, init, "Next-Router-Prefetch") === null;
      const isSupabase = /\.supabase\.co\/(auth|storage)\/v1\//.test(url);
      if (!isServerAction && !isRsc && !isSupabase) return originalFetch(input, init);

      s.inflight++;
      s.update();
      try {
        return await originalFetch(input, init);
      } finally {
        s.inflight = Math.max(0, s.inflight - 1);
        s.update();
      }
    };

    // Link clicks: show immediately-ish, clear when the pathname changes (second effect below).
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const dest = new URL(a.href, window.location.href);
      if (dest.origin !== window.location.origin) return;
      if (dest.pathname === window.location.pathname && dest.search === window.location.search) return;
      s.navPending = true;
      s.update();
      clearTimeout(navSafety);
      navSafety = setTimeout(() => {
        s.navPending = false;
        s.update();
      }, NAV_SAFETY_MS);
    };
    document.addEventListener("click", onClick, true);

    return () => {
      window.fetch = originalFetch;
      document.removeEventListener("click", onClick, true);
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      clearTimeout(navSafety);
    };
  }, []);

  // New route committed → navigation finished.
  useEffect(() => {
    state.current.navPending = false;
    state.current.update();
  }, [pathname]);

  return (
    <div aria-hidden={!visible} role="status" aria-live="polite">
      <div className={`rp-bar ${visible ? "rp-bar-on" : ""}`} />
      <div className={`rp-corner ${visible ? "rp-corner-on" : ""}`}>
        <span className="rp-spinner" />
        <span className="text-xs font-semibold">Loading…</span>
      </div>
    </div>
  );
}
