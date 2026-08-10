import { useEffect, useRef } from "react";

/**
 * Keep the shell's scroll position across a full-page swap.
 *
 * Opening a person renders the contact-detail PAGE in place of the current
 * view, so the list unmounts; when it comes back we restore where it was
 * (the design project's `openContactFor`/`backFromContact` behaviour).
 * Call with `active` = whether the detail page is currently shown.
 */
export function usePreserveScroll(active: boolean) {
  const saved = useRef(0);

  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    if (active) {
      saved.current = main.scrollTop;
    } else {
      const raf = requestAnimationFrame(() => {
        main.scrollTop = saved.current;
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [active]);
}
