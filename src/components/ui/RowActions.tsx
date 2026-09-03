import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useMediaQuery } from '../../lib/useMediaQuery';

/** Where the popover sits relative to the trigger — `top-9` / `bottom-9`, in px. */
const MENU_OFFSET = 36;

export interface RowActionItem {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  danger?: boolean;
  disabled?: boolean;
  /** Draw a hairline above this item — separates a destructive row from the rest. */
  separated?: boolean;
  onSelect: () => void;
}

interface RowActionsProps {
  items: RowActionItem[];
  /** Accessible name for the trigger button. */
  label?: string;
  /** Which side the desktop popover should align to. */
  align?: 'left' | 'right';
  className?: string;
}

/**
 * Shared row menu (#332).
 *
 * Desktop: a compact ⋯ icon button that opens a small popover with the same
 * action vocabulary used on every person/visit/prayer/outreach row.
 * Mobile: the same list opens as a bottom sheet so the actions stay reachable
 * without a hover affordance.
 *
 * The desktop popover flips above its trigger when the window has no room
 * below it (#715): the prayer card's ⋯ sits low on a short laptop window, and
 * a four-item menu dropping downwards ends past the bottom of the page.
 */
export function RowActions({
  items,
  label = 'More for this row',
  align = 'right',
  className,
}: RowActionsProps) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isMobile = useMediaQuery('(max-width: 768px)');

  const close = () => setOpen(false);

  // Measure once the menu is in the DOM, before paint, and again whenever the
  // trigger moves under it. A zero height means the environment doesn't lay out
  // (jsdom, a hidden tab) — leave it dropping down rather than guessing.
  useLayoutEffect(() => {
    if (!open || isMobile) return;
    const measure = () => {
      const trigger = wrapRef.current?.getBoundingClientRect();
      const menuHeight = menuRef.current?.getBoundingClientRect().height ?? 0;
      if (!trigger || !menuHeight) return;
      // The popover hangs MENU_OFFSET below the trigger's top when it drops and
      // sits MENU_OFFSET above its bottom when it flips, so the room each way is
      // measured from those edges rather than from the trigger's own height.
      const below = window.innerHeight - (trigger.top + MENU_OFFSET);
      const above = trigger.bottom - MENU_OFFSET;
      setDropUp(below < menuHeight && above > below);
    };
    measure();
    // Capture, so a scrolling ancestor counts and not just the window.
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open, isMobile, items.length]);

  useEffect(() => {
    if (!open || isMobile) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open, isMobile]);

  if (items.length === 0) return null;

  const renderItem = (item: RowActionItem) => {
    const Icon = item.icon;
    const row = (
      <button
        key={item.id}
        type="button"
        role="menuitem"
        disabled={item.disabled}
        onClick={(e) => {
          e.stopPropagation();
          close();
          item.onSelect();
        }}
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-[13.5px] transition-colors',
          item.danger
            ? 'text-error hover:bg-error/10'
            : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface',
          item.disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        {Icon && <Icon className="w-4 h-4 shrink-0" />}
        <span className="min-w-0 flex-1">{item.label}</span>
      </button>
    );

    if (!item.separated) return row;
    return (
      <React.Fragment key={item.id}>
        <span role="separator" className="block h-px bg-outline-variant mx-2 my-1" />
        {row}
      </React.Fragment>
    );
  };

  if (isMobile && open) {
    return (
      <div
        className="fixed inset-0 z-[120] flex items-end bg-scrim/50"
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div
          className="w-full bg-surface-container-high rounded-t-3xl shadow-2xl border-t border-outline-variant pb-[max(env(safe-area-inset-bottom),12px)] pt-2 px-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mx-auto w-10 h-1 rounded-full bg-outline-variant mb-3" />
          <div className="flex flex-col gap-0.5">
            {items.map(renderItem)}
          </div>
          <button
            type="button"
            onClick={close}
            className="w-full mt-2 h-11 rounded-xl text-sm font-medium text-on-surface-variant hover:bg-surface-variant transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className={cn('relative shrink-0', className)}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          // Drop down until measured, so a flip from a previous open doesn't
          // stick when the trigger has since moved up the page.
          setDropUp(false);
          setOpen((v) => !v);
        }}
        className={cn(
          'p-1.5 rounded-full text-on-surface-variant hover:bg-surface-variant hover:text-on-surface transition-colors',
          open && 'bg-surface-variant text-on-surface',
        )}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div
            ref={menuRef}
            role="menu"
            className={cn(
              'absolute z-50 min-w-[180px] max-w-[240px] rounded-2xl bg-surface-container-high border border-outline-variant shadow-xl p-1',
              dropUp ? 'bottom-9' : 'top-9',
              align === 'right' ? 'right-0' : 'left-0',
            )}
          >
            {items.map(renderItem)}
          </div>
        </>
      )}
    </div>
  );
}

export default RowActions;
