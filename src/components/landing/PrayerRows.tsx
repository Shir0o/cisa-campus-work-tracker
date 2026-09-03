import React, { useState, useMemo } from "react";
import { ArrowRight, Clock, Plus, Trash2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { Contact, PrayerRecord } from "../../types";
import { isContactStale, getDaysSinceLastInteraction } from "../../lib/prayers";
import type { PersonalPrayer, PersonalPrayerStatus } from "../../lib/personalPrayers";
import { StatusPills, PillTone } from "./primitives";
import { agoLabel, editInputClass, dueLabelClass } from "./helpers";
import { useLanguage } from "../LanguageProvider";
import { Translate } from "../Translate";

export function TeamPrayerRow({
  prayer,
  contact,
  first,
  onUpdateStatus,
  onOpenContact,
  onOpenPrayerLog,
}: {
  prayer: PrayerRecord;
  contact?: Contact;
  first: boolean;
  onUpdateStatus: (id: string, status: PrayerRecord["status"], answer?: string, answeredAt?: string, archiveReason?: string) => void;
  onOpenContact: (contact: Contact) => void;
  onOpenPrayerLog: () => void;
}) {
  const { t } = useLanguage();
  const [answering, setAnswering] = useState(false);
  const [howDraft, setHowDraft] = useState(prayer.answer || "");
  const [archiving, setArchiving] = useState(false);
  const [archiveReasonDraft, setArchiveReasonDraft] = useState(prayer.archiveReason || "");
  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const teamPrayerPills = useMemo<{ val: PrayerRecord["status"]; label: string; tone: PillTone }[]>(() => [
    { val: "ongoing", label: t("prayers.pill_ongoing", "ongoing"), tone: "ongoing" },
    { val: "answered", label: t("prayers.pill_answered", "answered"), tone: "answered" },
    { val: "unanswered", label: t("prayers.pill_archive", "archive"), tone: "archived" },
  ], [t]);

  const handleStatusChange = (status: PrayerRecord["status"]) => {
    if (status === "answered") {
      setArchiving(false);
      onUpdateStatus(prayer.id, "answered", prayer.answer || undefined, prayer.answeredAt || today);
      if (!prayer.answer) {
        setHowDraft("");
        setAnswering(true);
      }
    } else if (status === "unanswered") {
      setAnswering(false);
      onUpdateStatus(prayer.id, "unanswered", undefined, undefined, prayer.archiveReason || undefined);
      if (!prayer.archiveReason) {
        setArchiveReasonDraft("");
        setArchiving(true);
      }
    } else {
      setAnswering(false);
      setArchiving(false);
      onUpdateStatus(prayer.id, status, undefined, undefined);
    }
  };

  const saveAnswer = () => {
    onUpdateStatus(prayer.id, "answered", howDraft.trim(), prayer.answeredAt || today);
    setAnswering(false);
  };

  const saveArchiveReason = () => {
    onUpdateStatus(prayer.id, "unanswered", undefined, undefined, archiveReasonDraft.trim());
    setArchiving(false);
  };

  return (
    <div
      className={cn(
        "py-4",
        !first && "border-t border-outline-variant/40",
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-on-surface font-medium leading-snug">
            <Translate text={prayer.burden} />
          </div>
          {contact && (
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              <button
                type="button"
                onClick={() => onOpenContact(contact)}
                className="text-sm text-accent underline underline-offset-2"
              >
                {t("prayers.for_contact", "for {name}").replace("{name}", contact.name)}
              </button>
              {isContactStale(contact) && (
                <span
                  data-testid="stale-badge"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20"
                >
                  <Clock className="w-3 h-3" />
                  {getDaysSinceLastInteraction(contact) !== null
                    ? t('prayers.no_interaction_days', `No contact in ${getDaysSinceLastInteraction(contact)}d`).replace('{n}', String(getDaysSinceLastInteraction(contact)))
                    : t('prayers.no_interaction_recorded', 'No interactions')}
                </span>
              )}
            </div>
          )}

          {!answering && prayer.status === "answered" && (prayer.answer || prayer.answeredAt) && (
            <div className="mt-2 text-sm bg-success/5 border border-success/15 rounded-xl p-3 max-w-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-success">
                  {t("prayers.status_answered", "Answered")}{prayer.answeredAt ? ` · ${prayer.answeredAt}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setHowDraft(prayer.answer || "");
                    setAnswering(true);
                  }}
                  className="text-[11px] text-on-surface-variant hover:text-accent font-medium"
                >
                  {t("prayers.edit_testimony", "Edit Testimony")}
                </button>
              </div>
              {prayer.answer && (
                <p className="font-serif text-[15px] text-on-surface mt-1 leading-relaxed italic">
                  "<Translate text={prayer.answer} />"
                </p>
              )}
            </div>
          )}

          {answering && (
            <div className="mt-3 p-3 bg-surface-variant/30 rounded-2xl border border-outline-variant max-w-xl">
              <label className="block text-xs font-medium text-on-surface-variant mb-1">
                {t("prayers.how_was_it_answered", "How was it answered?")}
              </label>
              <textarea
                className="w-full p-2.5 rounded-xl bg-surface border border-outline-variant focus:border-primary outline-none text-sm text-on-surface resize-none"
                autoFocus
                rows={2}
                value={howDraft}
                onChange={(e) => setHowDraft(e.target.value)}
                placeholder={t("prayers.answer_placeholder", "A sentence on how God answered — the testimony.")}
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  className="px-3 py-1 rounded-full text-xs text-on-surface-variant hover:bg-surface-variant"
                  onClick={() => setAnswering(false)}
                >
                  {t("actions.skip", "Skip")}
                </button>
                <button
                  type="button"
                  className="px-3 py-1 rounded-full text-xs bg-primary text-on-primary"
                  onClick={saveAnswer}
                >
                  {t("actions.save", "Save")}
                </button>
              </div>
            </div>
          )}

          {!archiving && prayer.status === "unanswered" && prayer.archiveReason && (
            <div className="mt-2 text-sm bg-surface-variant/40 border border-outline-variant/60 rounded-xl p-3 max-w-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-on-surface-variant">
                  {t("prayers.archive_reason", "Archive reason")}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setArchiveReasonDraft(prayer.archiveReason || "");
                    setArchiving(true);
                  }}
                  className="text-[11px] text-on-surface-variant hover:text-accent font-medium"
                >
                  {t("prayers.edit_archive_reason", "Edit Reason")}
                </button>
              </div>
              <p className="font-serif text-[15px] text-on-surface mt-1 leading-relaxed italic">
                "<Translate text={prayer.archiveReason} />"
              </p>
            </div>
          )}

          {archiving && (
            <div className="mt-3 p-3 bg-surface-variant/30 rounded-2xl border border-outline-variant max-w-xl">
              <label className="block text-xs font-medium text-on-surface-variant mb-1">
                {t("prayers.why_is_it_archived", "Why is this archived?")}
              </label>
              <textarea
                className="w-full p-2.5 rounded-xl bg-surface border border-outline-variant focus:border-primary outline-none text-sm text-on-surface resize-none"
                autoFocus
                rows={2}
                value={archiveReasonDraft}
                onChange={(e) => setArchiveReasonDraft(e.target.value)}
                placeholder={t("prayers.archive_reason_placeholder", "A note on why this is archived (optional)")}
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  className="px-3 py-1 rounded-full text-xs text-on-surface-variant hover:bg-surface-variant"
                  onClick={() => setArchiving(false)}
                >
                  {t("actions.skip", "Skip")}
                </button>
                <button
                  type="button"
                  className="px-3 py-1 rounded-full text-xs bg-primary text-on-primary"
                  onClick={saveArchiveReason}
                >
                  {t("actions.save", "Save")}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
          <span className="text-xs text-on-surface-variant whitespace-nowrap">
            {agoLabel(prayer.date, t)}
          </span>
          <StatusPills
            value={prayer.status}
            options={teamPrayerPills}
            onChange={(s) => handleStatusChange(s as PrayerRecord["status"])}
          />
          <button
            type="button"
            onClick={onOpenPrayerLog}
            className="inline-flex items-center gap-1 text-[11.5px] text-on-surface-variant hover:text-accent transition-colors"
          >
            <ArrowRight className="w-3 h-3" /> {t("prayers.prayer_log", "Prayer Log")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PersonalPrayerRow({
  prayer,
  first,
  contacts,
  onUpdate,
  onDelete,
  onOpenContact,
}: {
  prayer: PersonalPrayer;
  first: boolean;
  contacts: Contact[];
  onUpdate: (
    id: string,
    patch: { 
      title?: string; 
      contactId?: string | null; 
      status?: PersonalPrayerStatus;
      answeredAt?: string | null;
      answeredBody?: string | null;
    },
  ) => void;
  onDelete: (id: string) => void;
  onOpenContact: (contact: Contact) => void;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(prayer.title);
  const [contactId, setContactId] = useState(prayer.contactId || "");
  const [answering, setAnswering] = useState(false);
  const [howDraft, setHowDraft] = useState(prayer.answeredBody || "");
  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const linked = prayer.contactId ? contacts.find((c) => c.id === prayer.contactId) : null;

  const personalPrayerPills = useMemo<{ val: PersonalPrayerStatus; label: string; tone: PillTone }[]>(() => [
    { val: "open", label: t("prayers.pill_ongoing", "ongoing"), tone: "ongoing" },
    { val: "answered", label: t("prayers.pill_answered", "answered"), tone: "answered" },
    { val: "archived", label: t("prayers.pill_archive", "archive"), tone: "archived" },
  ], [t]);

  const openEdit = () => {
    setTitle(prayer.title);
    setContactId(prayer.contactId || "");
    setOpen(true);
  };
  const save = () => {
    const tVal = title.trim();
    if (!tVal) return;
    onUpdate(prayer.id, { title: tVal, contactId: contactId || null });
    setOpen(false);
  };

  const handleStatusChange = (status: PersonalPrayerStatus) => {
    if (status === "answered") {
      onUpdate(prayer.id, { status: "answered", answeredAt: prayer.answeredAt || today });
      if (!prayer.answeredBody) {
        setHowDraft("");
        setAnswering(true);
      }
    } else {
      setAnswering(false);
      onUpdate(prayer.id, { status, answeredAt: null, answeredBody: null });
    }
  };

  const saveAnswer = () => {
    onUpdate(prayer.id, { status: "answered", answeredBody: howDraft.trim(), answeredAt: prayer.answeredAt || today });
    setAnswering(false);
  };

  return (
    <div
      className={cn(
        "py-4",
        !first && "border-t border-outline-variant/40",
        open && "bg-surface-variant/40 rounded-xl px-3 -mx-3",
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div
          className={cn("min-w-0 flex-1", !open && "cursor-pointer")}
          onClick={() => !open && openEdit()}
        >
          <div className="text-on-surface font-medium leading-snug">
            <Translate text={prayer.title} />
          </div>
          {linked ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenContact(linked);
              }}
              className="text-sm text-accent hover:underline mt-0.5"
            >
              {t("prayers.for_contact", "for {name}").replace("{name}", linked.name)}
            </button>
          ) : (
            <span className="text-sm text-on-surface-variant/60 mt-0.5 inline-block">
              {t("prayers.personal", "personal")}
            </span>
          )}

          {!open && !answering && prayer.status === "answered" && (prayer.answeredAt || prayer.answeredBody) && (
            <div className="mt-2 text-sm bg-success/5 border border-success/15 rounded-xl p-3 max-w-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-success">
                  {t("prayers.status_answered", "Answered")}{prayer.answeredAt ? ` · ${prayer.answeredAt}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setHowDraft(prayer.answeredBody || "");
                    setAnswering(true);
                  }}
                  className="text-[11px] text-on-surface-variant hover:text-accent font-medium"
                >
                  {t("prayers.edit_testimony", "Edit Testimony")}
                </button>
              </div>
              {prayer.answeredBody && (
                <p className="font-serif text-[15px] text-on-surface mt-1 leading-relaxed italic">
                  "<Translate text={prayer.answeredBody} />"
                </p>
              )}
            </div>
          )}

          {answering && (
            <div className="mt-3 p-3 bg-surface-variant/30 rounded-2xl border border-outline-variant max-w-xl" onClick={(e) => e.stopPropagation()}>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">
                {t("prayers.how_was_it_answered", "How was it answered?")}
              </label>
              <textarea
                className="w-full p-2.5 rounded-xl bg-surface border border-outline-variant focus:border-primary outline-none text-sm text-on-surface resize-none"
                autoFocus
                rows={2}
                value={howDraft}
                onChange={(e) => setHowDraft(e.target.value)}
                placeholder={t("prayers.answer_placeholder", "A sentence on how God answered — the testimony.")}
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  className="px-3 py-1 rounded-full text-xs text-on-surface-variant hover:bg-surface-variant"
                  onClick={() => setAnswering(false)}
                >
                  {t("actions.skip", "Skip")}
                </button>
                <button
                  type="button"
                  className="px-3 py-1 rounded-full text-xs bg-primary text-on-primary"
                  onClick={saveAnswer}
                >
                  {t("actions.save", "Save")}
                </button>
              </div>
            </div>
          )}

          {open && (
            <div className="mt-2.5 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
              <input
                autoFocus
                className={editInputClass}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                  if (e.key === "Escape") setOpen(false);
                }}
                placeholder={t("prayers.what_are_you_praying_for", "What are you praying for?")}
              />
              <div className={dueLabelClass}>{t("prayers.for_a_contact_optional", "For a contact (optional)")}</div>
              <select
                className={cn(editInputClass, "cursor-pointer")}
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
              >
                <option value="">{t("prayers.no_one_in_particular", "— no one in particular")}</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-sm text-on-surface-variant hover:text-error transition-colors"
                  onClick={() => onDelete(prayer.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" /> {t("actions.delete", "Delete")}
                </button>
                <div className="flex-1" />
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-full text-sm text-on-surface hover:bg-surface-variant"
                  onClick={() => setOpen(false)}
                >
                  {t("actions.cancel", "Cancel")}
                </button>
                <button
                  type="button"
                  disabled={!title.trim()}
                  className="px-3 py-1.5 rounded-full text-sm bg-primary text-on-primary disabled:opacity-50"
                  onClick={save}
                >
                  {t("actions.save", "Save")}
                </button>
              </div>
            </div>
          )}
        </div>

        {!open && !answering && (
          <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
            <span className="text-xs text-on-surface-variant whitespace-nowrap">
              {agoLabel(prayer.date, t)}
            </span>
            <StatusPills
              value={prayer.status}
              options={personalPrayerPills}
              onChange={(s) => handleStatusChange(s as PersonalPrayerStatus)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Inline composer for a new personal prayer. Self-contained: owns its open/title/
// contact state. The contact <select> is only shown when `contacts` is provided
// (Student "friends" pass none — a friend is just a titled prayer).
export function AddPersonalPrayer({
  contacts = [],
  onAdd,
  addLabel,
  placeholder,
}: {
  contacts?: Contact[];
  onAdd: (title: string, contactId: string | null) => void;
  addLabel?: string;
  placeholder?: string;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [contactId, setContactId] = useState("");

  const effectiveAddLabel = addLabel ?? t("myDay.add_a_personal_prayer", "Add a personal prayer");
  const effectivePlaceholder = placeholder ?? t("prayers.what_would_you_like_to_pray_for", "What would you like to pray for?");

  const reset = () => {
    setOpen(false);
    setTitle("");
    setContactId("");
  };
  const commit = () => {
    const tVal = title.trim();
    if (!tVal) return;
    onAdd(tVal, contactId || null);
    reset();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-accent transition-colors py-3"
      >
        <Plus className="w-3.5 h-3.5" /> {effectiveAddLabel}
      </button>
    );
  }

  return (
    <div className="py-4 border-t border-outline-variant/40 flex flex-col gap-2">
      <input
        autoFocus
        className={editInputClass}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") reset();
        }}
        placeholder={effectivePlaceholder}
      />
      {contacts.length > 0 && (
        <>
          <div className={dueLabelClass}>{t("prayers.for_a_contact_optional", "For a contact (optional)")}</div>
          <select
            className={cn(editInputClass, "cursor-pointer")}
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
          >
            <option value="">{t("prayers.no_one_in_particular", "— no one in particular")}</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </>
      )}
      <div className="flex items-center gap-2">
        <div className="flex-1" />
        <button
          type="button"
          className="px-3 py-1.5 rounded-full text-sm text-on-surface hover:bg-surface-variant"
          onClick={reset}
        >
          {t("actions.cancel", "Cancel")}
        </button>
        <button
          type="button"
          disabled={!title.trim()}
          className="px-3 py-1.5 rounded-full text-sm bg-primary text-on-primary disabled:opacity-50"
          onClick={commit}
        >
          {t("actions.add", "Add")}
        </button>
      </div>
    </div>
  );
}
