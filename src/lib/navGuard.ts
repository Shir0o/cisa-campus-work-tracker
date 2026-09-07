import { useCallback, useEffect, useRef, useState } from 'react';

export type GuardDecision = 'stay' | 'discard' | 'save';

export type PendingNav =
  | { kind: 'push'; href: string; label: string }
  | { kind: 'back' };

/**
 * Unsaved-changes guard for a plain BrowserRouter app, where react-router's
 * useBlocker is unavailable (data routers only). Covers the three ways a
 * Full-timer can lose a week's writing:
 *
 * - clicking any internal link (nav rail, top nav, "All weeks") while dirty —
 *   intercepted with a capture-phase document listener, which runs before
 *   react-router's own handlers;
 * - browser back / forward — popstate has already moved the URL, so it is
 *   restored and the choice offered;
 * - closing the tab or reloading — beforeunload, which the browser renders
 *   natively.
 *
 * Navigation after a decision goes through history.pushState plus a synthetic
 * popstate, which react-router's BrowserRouter syncs from; `history.back()`
 * re-raises popstate on its own.
 */
export function useUnsavedGuard(options: {
  when: boolean;
  onSave?: () => Promise<void> | void;
}): { pending: PendingNav | null; decide: (decision: GuardDecision) => void } {
  const { when, onSave } = options;
  const whenRef = useRef(when);
  whenRef.current = when;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const bypassRef = useRef(false);
  const pendingRef = useRef<PendingNav | null>(null);
  const [pending, setPending] = useState<PendingNav | null>(null);

  // The href of the page the user is actually on, tracked across renders so a
  // popstate can restore it (the URL has already changed by the time the
  // event fires).
  const lastHrefRef = useRef(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
  lastHrefRef.current = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  useEffect(() => {
    const hrefOf = () =>
      `${window.location.pathname}${window.location.search}${window.location.hash}`;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!whenRef.current) return;
      e.preventDefault();
      // Legacy Chrome/Edge requires returnValue to show the dialog.
      e.returnValue = '';
    };

    const onClick = (e: MouseEvent) => {
      if (!whenRef.current || pendingRef.current || bypassRef.current) return;
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.('a[href]');
      if (!anchor) return;
      const href = anchor.getAttribute('href') ?? '';
      if (!href || href.startsWith('#')) return;
      let target: URL;
      try {
        target = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (target.origin !== window.location.origin) return;
      if (target.pathname + target.search + target.hash === hrefOf()) return;
      e.preventDefault();
      e.stopPropagation();
      const entry: PendingNav = {
        kind: 'push',
        href: target.pathname + target.search + target.hash,
        label: anchor.textContent?.trim() || target.pathname,
      };
      pendingRef.current = entry;
      setPending(entry);
    };

    const onPopState = () => {
      if (!whenRef.current || pendingRef.current || bypassRef.current) {
        bypassRef.current = false;
        return;
      }
      // The browser already navigated; put the page back and ask first.
      const current = lastHrefRef.current;
      window.history.pushState(window.history.state, '', current);
      window.dispatchEvent(new PopStateEvent('popstate'));
      const entry: PendingNav = { kind: 'back' };
      pendingRef.current = entry;
      setPending(entry);
    };

    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);

  const decide = useCallback((decision: GuardDecision) => {
    const entry = pendingRef.current;
    if (!entry) return;
    pendingRef.current = null;
    setPending(null);
    if (decision === 'stay') return;

    const go = () => {
      bypassRef.current = true;
      setTimeout(() => {
        bypassRef.current = false;
      }, 0);
      if (entry.kind === 'push') {
        window.history.pushState(window.history.state, '', entry.href);
        window.dispatchEvent(new PopStateEvent('popstate'));
      } else {
        window.history.back();
      }
    };

    if (decision === 'save') {
      Promise.resolve(onSaveRef.current?.())
        .then(go)
        .catch(() => {
          // Saving failed — keep the user here with their writing intact.
        });
      return;
    }
    go();
  }, []);

  return { pending, decide };
}
