import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { RowActionItem } from './RowActions';

/** How long the pointer must rest on the trigger before the menu opens. */
const HOVER_OPEN_DELAY = 300;

interface ToolbarMenuProps {
  /** Trigger label — the group's name, e.g. "Insert". */
  label: string;
  items: RowActionItem[];
  className?: string;
}

/**
 * A labelled dropdown for a formatting toolbar.
 *
 * Click toggles, focus opens (keyboard reach), and a short hover delay opens
 * it for the mouse without firing on a crossing pointer. The menu closes on
 * Escape, an outside mousedown, or an item pick. Every button suppresses the
 * mousedown focus shift (#917) so the author's caret and scroll survive the
 * whole pick — the textarea never blurs.
 */
export function ToolbarMenu({ label, items, className }: ToolbarMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | null>(null);

  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  useEffect(() => () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
  }, []);

  const openAfterHover = () => {
    if (open) return;
    hoverTimer.current = window.setTimeout(() => setOpen(true), HOVER_OPEN_DELAY);
  };
  const cancelHover = () => {
    if (hoverTimer.current) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };

  return (
    <div
      ref={wrapRef}
      className={cn('relative shrink-0', className)}
      onMouseEnter={openAfterHover}
      onMouseLeave={cancelHover}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          cancelHover();
          setOpen((v) => !v);
        }}
        onFocus={() => setOpen(true)}
        onBlur={(e) => {
          if (!wrapRef.current?.contains(e.relatedTarget as Node)) close();
        }}
        className={cn(
          'flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border border-outline-variant bg-surface hover:bg-surface-variant transition-colors',
          open && 'bg-surface-variant text-on-surface',
        )}
      >
        {label}
        <ChevronDown
          className={cn('w-3.5 h-3.5 text-on-surface-variant transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1.5 z-50 min-w-[180px] rounded-2xl bg-surface-container-high border border-outline-variant shadow-xl p-1"
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onMouseDown={(e) => e.preventDefault()}
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
          })}
        </div>
      )}
    </div>
  );
}

export default ToolbarMenu;
