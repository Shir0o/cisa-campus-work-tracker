import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useMediaQuery } from '../../lib/useMediaQuery';

export interface RowActionItem {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  danger?: boolean;
  disabled?: boolean;
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
 */
export function RowActions({
  items,
  label = 'More for this row',
  align = 'right',
  className,
}: RowActionsProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const isMobile = useMediaQuery('(max-width: 768px)');

  const close = () => setOpen(false);

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
    return (
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
            role="menu"
            className={cn(
              'absolute top-9 z-50 min-w-[180px] max-w-[240px] rounded-2xl bg-surface-container-high border border-outline-variant shadow-xl p-1',
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
