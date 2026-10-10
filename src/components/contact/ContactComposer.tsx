import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Send } from "lucide-react";
import { cn } from "../../lib/utils";
import { useLanguage } from "../LanguageProvider";
import {
  INTERACTION_TYPES,
  timeChipFor,
  timePresets,
  type ComposerValue,
  type InteractionType,
} from "../../lib/contactComposer";

const TYPE_LABEL: Record<InteractionType, string> = {
  chat: "composer_type_chat",
  call: "composer_type_call",
  meeting: "composer_type_meeting",
  email: "composer_type_email",
  interaction: "composer_type_other",
};

// The story's composer (#1292): text first. The kind switch, the type and the
// time live in a quiet chip row inside the box, and Cancel / Log sit at its
// foot. ⌘/Ctrl+Enter logs. Full-timers can say who reached the person.
export default function ContactComposer({
  open,
  value,
  onChange,
  onOpen,
  onCancel,
  onSubmit,
  submitting,
  canLogOnBehalf = false,
  teamMembers = [],
  firstName,
}: {
  open: boolean;
  value: ComposerValue;
  onChange: React.Dispatch<React.SetStateAction<ComposerValue>>;
  onOpen: () => void;
  onCancel: () => void;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
  canLogOnBehalf?: boolean;
  teamMembers?: { id: string; name: string }[];
  firstName: string;
}) {
  const { t } = useLanguage();
  const formRef = useRef<HTMLFormElement | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const [menu, setMenu] = useState<null | "time" | "by">(null);

  useEffect(() => {
    if (open) textRef.current?.focus();
  }, [open]);

  const isPrayer = value.mode === "prayer";
  const canSubmit = value.text.trim().length > 0;

  const pickType = (type: InteractionType) => onChange((p) => ({ ...p, type }));
  // The native picker fires on every sub-field edit, so it writes the value
  // without dismissing the popover mid-selection (#1495).
  const setDateTime = (dateTime: string) => onChange((p) => ({ ...p, dateTime }));
  const pickTime = (at: string) => {
    setDateTime(at);
    setMenu(null);
  };
  const pickBy = (reachedById: string) => {
    onChange((p) => ({ ...p, reachedById }));
    setMenu(null);
  };
  const setMode = (mode: ComposerValue["mode"]) => {
    onChange((p) => ({ ...p, mode }));
    onOpen();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (canSubmit) formRef.current?.requestSubmit();
    }
  };

  const chip = timeChipFor(value.dateTime);
  const timeLabel =
    chip.kind === "now"
      ? t("modals.contactDetails.composer_time_now")
      : chip.kind === "today"
        ? chip.time
        : chip.kind === "yesterday"
          ? t("modals.contactDetails.composer_time_yesterday").replace("{time}", chip.time)
          : `${chip.date}, ${chip.time}`;
  const byName =
    teamMembers.find((m) => m.id === value.reachedById)?.name ||
    t("modals.contactDetails.by_me");
  const presets = timePresets();

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className={cn("cd-composer", open ? "is-open" : "is-rest")}
    >
      <div className="cd-composer-box">
        <textarea
          ref={textRef}
          value={value.text}
          onChange={(e) => onChange((p) => ({ ...p, text: e.target.value }))}
          onFocus={onOpen}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={t(
            isPrayer
              ? "modals.contactDetails.composer_prayer_placeholder"
              : "modals.contactDetails.composer_placeholder",
          ).replace("{name}", firstName)}
          aria-label={t("modals.contactDetails.composer_placeholder").replace("{name}", firstName)}
          className="cd-composer-text"
        />

        {open && isPrayer && (
          <textarea
            value={value.context}
            onChange={(e) => onChange((p) => ({ ...p, context: e.target.value }))}
            rows={2}
            placeholder={t("modals.contactDetails.prayer_context_placeholder")}
            aria-label={t("modals.contactDetails.prayer_context_label")}
            className="cd-composer-text cd-composer-context"
          />
        )}

        {open && !isPrayer && (
          <div className="cd-composer-detail">
            <div className="cd-composer-chip-row" role="group" aria-label={t("modals.contactDetails.type")}>
              {INTERACTION_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={value.type === type}
                  onClick={() => pickType(type)}
                  className={cn("cd-composer-chip", value.type === type && "on")}
                >
                  {t(`modals.contactDetails.${TYPE_LABEL[type]}`)}
                </button>
              ))}
              <span className="cd-composer-pop">
                <button
                  type="button"
                  className="cd-composer-chip ghost"
                  aria-haspopup="dialog"
                  aria-expanded={menu === "time"}
                  onClick={() => setMenu((m) => (m === "time" ? null : "time"))}
                >
                  {timeLabel}
                  <ChevronDown className="w-3 h-3" />
                </button>
                {menu === "time" && (
                  <div
                    className="cd-composer-menu"
                    role="dialog"
                    aria-label={t("modals.contactDetails.composer_time_pick")}
                  >
                    <input
                      type="datetime-local"
                      value={value.dateTime}
                      onChange={(e) => setDateTime(e.target.value)}
                      aria-label={t("modals.contactDetails.composer_time_value")}
                      className="cd-composer-datetime"
                    />
                    {presets.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        className={cn("cd-composer-item", value.dateTime === p.at && "on")}
                        onClick={() => pickTime(p.at)}
                      >
                        {t(`modals.contactDetails.composer_time_${p.key}`)}
                      </button>
                    ))}
                  </div>
                )}
              </span>
            </div>
          </div>
        )}

        <div className="cd-composer-foot">
          <div className="cd-composer-switch" role="group" aria-label={t("modals.contactDetails.composer_kind_group")}>
            <button
              type="button"
              aria-pressed={!isPrayer}
              onClick={() => setMode("interaction")}
              className={cn(!isPrayer && "on")}
            >
              {t("modals.contactDetails.composer_interaction")}
            </button>
            <button
              type="button"
              aria-pressed={isPrayer}
              onClick={() => setMode("prayer")}
              className={cn(isPrayer && "on")}
            >
              {t("modals.contactDetails.composer_prayer")}
            </button>
          </div>

          {canLogOnBehalf && !isPrayer && (
            <span className="cd-composer-pop">
              <button
                type="button"
                className="cd-composer-chip ghost"
                aria-haspopup="menu"
                aria-expanded={menu === "by"}
                onClick={() => setMenu((m) => (m === "by" ? null : "by"))}
              >
                {t("modals.contactDetails.composer_by_label").replace("{name}", byName)}
                <ChevronDown className="w-3 h-3" />
              </button>
              {menu === "by" && (
                <div className="cd-composer-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className={cn("cd-composer-item", !value.reachedById && "on")}
                    onClick={() => pickBy("")}
                  >
                    {t("modals.contactDetails.by_me")}
                  </button>
                  {teamMembers.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      role="menuitem"
                      className={cn("cd-composer-item", value.reachedById === member.id && "on")}
                      onClick={() => pickBy(member.id)}
                    >
                      {member.name}
                    </button>
                  ))}
                </div>
              )}
            </span>
          )}

          <span className="cd-composer-spacer" />
          {open && !isPrayer && (
            <span className="cd-composer-hint" aria-hidden="true">
              {t("modals.contactDetails.composer_hint")}
            </span>
          )}
          {open && (
            <>
              <button type="button" className="cd-composer-cancel" onClick={onCancel}>
                {t("modals.contactDetails.cancel")}
              </button>
              <button
                type="submit"
                disabled={submitting || !canSubmit}
                className="cd-composer-log"
              >
                {submitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                {t(isPrayer ? "modals.contactDetails.add_prayer" : "modals.contactDetails.composer_log")}
              </button>
            </>
          )}
        </div>
      </div>
    </form>
  );
}
