// WHAT CHANGED SINCE YOU LAST OPENED THIS (#546) — the web room of the sheet.
//
// A floating card over whatever the person was about to do, one way out, and
// dismissing it lands them where they were going. Not a version history, no
// badge, no nav item — there is one release on screen and nothing to come back
// to. The gate (`useRelease`) lives in src/lib/releases.ts; this surface only
// tells it whether the on-campus window is open (a phone fact, so the desktop
// passes nothing).
import React from 'react';
import { useAuth } from '../AuthProvider';
import {
  markReleaseSeen,
  releaseDateWords,
  useRelease,
  type Release,
} from '../../lib/releases';

const TITLE = 'A few things are different';
const SUB = 'Since you last opened this. Everything else is where you left it.';

function ReleaseLines({ rel }: { rel: Release }) {
  return (
    <div className="space-y-3">
      {rel.lines.map((l, i) => (
        <p key={i} className="text-[15px] leading-relaxed text-on-surface-variant">
          {l}
        </p>
      ))}
    </div>
  );
}

export function ReleaseSheet() {
  const { role } = useAuth();
  const rel = useRelease(role as never);
  const [gone, setGone] = React.useState(false);

  const close = React.useCallback(() => {
    if (rel) markReleaseSeen(rel.version);
    setGone(true);
  }, [rel]);

  const live = !!rel && !gone;

  React.useEffect(() => {
    if (!live) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [live, close]);

  if (!live || !rel) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 md:p-10"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={TITLE}
        className="relative w-full max-w-md bg-surface-container rounded-[28px] shadow-2xl border border-outline-variant overflow-hidden flex flex-col max-h-full"
      >
        <div className="px-7 pt-7 pb-4 shrink-0">
          <h2 className="text-2xl font-semibold text-on-surface">{TITLE}</h2>
          <p className="mt-1 text-sm text-on-surface-variant">{SUB}</p>
        </div>

        <div className="px-7 pb-6 overflow-y-auto">
          <ReleaseLines rel={rel} />
        </div>

        <div className="px-7 pb-6 shrink-0 flex items-center justify-between gap-3">
          <button
            onClick={close}
            autoFocus
            className="px-6 py-3 bg-primary text-on-primary rounded-full font-semibold hover:opacity-90 active:scale-95 transition-all"
          >
            Carry on
          </button>
          <span className="text-xs text-on-surface-variant">
            Version {rel.version} · {releaseDateWords(rel.date)}
          </span>
        </div>
      </div>
    </div>
  );
}