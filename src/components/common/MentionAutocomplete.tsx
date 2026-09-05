import React, { useEffect, useRef } from "react";
import { cn } from "../../lib/utils";
import type { MentionUser } from "../../lib/mentions";

interface MentionAutocompleteProps {
  candidates: MentionUser[];
  selectedIndex: number;
  onSelect: (user: MentionUser) => void;
  className?: string;
  anchorEl?: HTMLElement | null;
}

export function MentionAutocomplete({
  candidates,
  selectedIndex,
  onSelect,
  className,
  anchorEl,
}: MentionAutocompleteProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = React.useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (activeEl && typeof activeEl.scrollIntoView === "function") {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  useEffect(() => {
    if (!anchorEl) {
      setCoords(null);
      return;
    }
    const updatePos = () => {
      const rect = anchorEl.getBoundingClientRect();
      setCoords({
        top: rect.top,
        left: rect.left,
        width: Math.min(rect.width, 280),
      });
    };
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [anchorEl]);

  if (candidates.length === 0) return null;

  const style: React.CSSProperties = coords
    ? {
        position: "fixed",
        bottom: `${window.innerHeight - coords.top + 6}px`,
        left: `${coords.left}px`,
        width: `${Math.max(coords.width, 256)}px`,
      }
    : {};

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Teammate mentions"
      data-mention-autocomplete="true"
      style={style}
      className={cn(
        coords ? "z-[9999]" : "absolute z-50 bottom-full mb-1 left-0 w-64",
        "max-h-48 overflow-y-auto rounded-xl bg-surface border border-outline-variant shadow-lg py-1 flex flex-col text-sm",
        className,
      )}
    >
      {candidates.map((user, idx) => {
        const isSelected = idx === selectedIndex;
        return (
          <button
            key={user.uid}
            role="option"
            aria-selected={isSelected}
            type="button"
            onMouseDown={(e) => {
              // Prevent textarea blur
              e.preventDefault();
              onSelect(user);
            }}
            className={cn(
              "w-full px-3 py-1.5 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer",
              isSelected
                ? "bg-primary/10 text-accent font-medium"
                : "text-on-surface hover:bg-surface-container-high",
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-accent text-[10px] grid place-items-center flex-none font-semibold">
                {user.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="truncate">{user.name}</span>
            </div>
            {user.role && (
              <span className="text-[10px] text-on-surface-variant/70 uppercase tracking-wider flex-none">
                {user.role}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
