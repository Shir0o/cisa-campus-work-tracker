// Moving a contact between stages from their own page (#677).
//
// Until now the only route was Edit details → the PIPELINE STAGE select →
// Save. These two affordances replace that detour without adding a new
// surface: `StageMenu` turns the header's existing stage pill into a menu
// (so the move is reachable from every tab), and `StageMoveSheet` is the
// board's "Where is {name} now?" sheet, reached from the mobile hero.
//
// Both lists scroll: stages are admin-editable and there can be many.
import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { Stage } from "../../types";
import { cn } from "../../lib/utils";
import { stageToneStyle } from "../../lib/stageTones";
import { useLanguage } from "../LanguageProvider";

/** The one row shape both the menu and the sheet use. */
function StageOption({
  stage,
  index,
  isHere,
  onSelect,
  size,
}: {
  stage: Stage;
  index: number;
  isHere: boolean;
  onSelect: () => void;
  size: "menu" | "sheet";
}) {
  const { t } = useLanguage();
  const sheet = size === "sheet";

  return (
    <button
      role={sheet ? undefined : "menuitem"}
      style={stageToneStyle(stage.color, index)}
      onClick={onSelect}
      className={cn(
        "w-full flex items-center text-left transition-colors",
        sheet
          ? "gap-3.5 p-4 rounded-xl border min-h-[56px] text-[15px]"
          : "gap-2.5 px-4 py-2 text-sm",
        isHere
          ? sheet
            ? "bg-[var(--tone-soft)] border-[var(--tone)]/30 text-[var(--tone)] font-semibold"
            : "bg-[var(--tone-soft)] font-semibold"
          : sheet
            ? "bg-surface border-outline-variant hover:bg-surface-variant"
            : "hover:bg-surface-variant",
      )}
    >
      <span className="w-2 h-2 rounded-full bg-[var(--tone)] shrink-0" />
      <span className="flex-1 min-w-0 truncate">{stage.label}</span>
      {isHere ? (
        <span className="text-[11.5px] font-semibold text-[var(--tone)] shrink-0">
          {t('modals.contactDetails.here_now')}
        </span>
      ) : (
        sheet && <ChevronRight className="w-4 h-4 text-on-surface-variant/40 shrink-0" />
      )}
    </button>
  );
}

/** Desktop: the header stage pill, now a menu trigger. */
export function StageMenu({
  stages,
  current,
  onSelect,
}: {
  stages: Stage[];
  current: string;
  onSelect: (label: string) => void;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = current || t('modals.contactDetails.not_in_step');
  const pick = (value: string) => {
    setOpen(false);
    if (value !== current) onSelect(value);
  };

  return (
    <span className="cd-stage-wrap" ref={wrapRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t('modals.contactDetails.move_to_step')}: ${label}`}
        className={cn("cd-stage-pill is-menu", !current && "unset", open && "open")}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="w-3 h-3 chev" />
      </button>

      {open && (
        <div className="cd-stage-menu" role="menu">
          <div className="cd-stage-menu-label">{t('modals.contactDetails.move_to_step')}</div>
          <div className="cd-stage-menu-list">
            {stages.map((s, i) => (
              <StageOption
                key={s.id}
                stage={s}
                index={i}
                isHere={s.label === current}
                onSelect={() => pick(s.label)}
                size="menu"
              />
            ))}
          </div>
          {current && (
            <>
              <div className="cd-stage-menu-rule" />
              <button
                role="menuitem"
                onClick={() => pick("")}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-left text-[13.5px] text-on-surface-variant hover:bg-surface-variant transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-outline shrink-0" />
                {t('modals.contactDetails.not_in_step')}
              </button>
            </>
          )}
        </div>
      )}
    </span>
  );
}

/** Mobile: the board's move sheet, reached from the hero's stage chip. */
export function StageMoveSheet({
  stages,
  current,
  contactName,
  onSelect,
  onClose,
}: {
  stages: Stage[];
  current: string;
  contactName: string;
  onSelect: (label: string) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const firstName = contactName.split(" ")[0];

  const pick = (value: string) => {
    onClose();
    if (value !== current) onSelect(value);
  };

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/35 flex items-end justify-center scrim"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-t-2xl shadow-2xl w-full max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-outline/20 mx-auto my-3 shrink-0" />
        <div className="flex items-start justify-between px-5 pt-1 gap-3">
          <div>
            <h3 className="font-serif text-lg text-on-surface">
              {t('modals.contactDetails.where_is_now').replace('{name}', firstName)}
            </h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {t('modals.contactDetails.move_to_fitting_step')}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t('actions.close')}
            className="p-1.5 rounded-full text-on-surface-variant hover:bg-surface-variant transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-4 pb-8 pt-4 flex flex-col gap-2">
          {stages.map((s, i) => (
            <StageOption
              key={s.id}
              stage={s}
              index={i}
              isHere={s.label === current}
              onSelect={() => pick(s.label)}
              size="sheet"
            />
          ))}
          {current && (
            <button
              onClick={() => pick("")}
              className="w-full flex items-center gap-3.5 p-4 rounded-xl border border-outline-variant bg-surface text-on-surface-variant text-sm text-left min-h-[56px] hover:bg-surface-variant transition-colors"
            >
              <span className="w-2 h-2 rounded-full bg-outline shrink-0" />
              <span className="flex-1">{t('modals.contactDetails.not_in_step')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
