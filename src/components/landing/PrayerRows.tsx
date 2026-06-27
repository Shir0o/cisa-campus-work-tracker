import React, { useState } from "react";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { Contact, PrayerRecord } from "../../types";
import type { PersonalPrayer, PersonalPrayerStatus } from "../../lib/personalPrayers";
import { StatusPills, PillTone } from "./primitives";
import { agoLabel, editInputClass, dueLabelClass } from "./helpers";

// Contact / corporate prayer — read-only here. Status only + link to the Prayer Log.
const TEAM_PRAYER_PILLS: { val: PrayerRecord["status"]; label: string; tone: PillTone }[] = [
  { val: "ongoing", label: "ongoing", tone: "ongoing" },
  { val: "answered", label: "answered", tone: "answered" },
  { val: "unanswered", label: "archive", tone: "archived" },
];

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
  onUpdateStatus: (id: string, status: PrayerRecord["status"]) => void;
  onOpenContact: (contact: Contact) => void;
  onOpenPrayerLog: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 py-4",
        !first && "border-t border-outline-variant/40",
      )}
    >
      <div className="min-w-0">
        <div className="text-on-surface font-medium leading-snug">{prayer.burden}</div>
        {contact && (
          <button
            type="button"
            onClick={() => onOpenContact(contact)}
            className="text-sm text-primary hover:underline mt-0.5"
          >
            for {contact.name}
          </button>
        )}
      </div>
      <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
        <span className="text-xs text-on-surface-variant whitespace-nowrap">
          {agoLabel(prayer.date)}
        </span>
        <StatusPills
          value={prayer.status}
          options={TEAM_PRAYER_PILLS}
          onChange={(s) => onUpdateStatus(prayer.id, s as PrayerRecord["status"])}
        />
        <button
          type="button"
          onClick={onOpenPrayerLog}
          className="inline-flex items-center gap-1 text-[11.5px] text-on-surface-variant hover:text-primary transition-colors"
        >
          <ArrowRight className="w-3 h-3" /> Prayer Log
        </button>
      </div>
    </div>
  );
}

// Personal prayer — fully editable + removable, optionally tagged to a contact.
const PERSONAL_PRAYER_PILLS: { val: PersonalPrayerStatus; label: string; tone: PillTone }[] = [
  { val: "open", label: "ongoing", tone: "ongoing" },
  { val: "answered", label: "answered", tone: "answered" },
  { val: "archived", label: "archive", tone: "archived" },
];

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
    patch: { title?: string; contactId?: string | null; status?: PersonalPrayerStatus },
  ) => void;
  onDelete: (id: string) => void;
  onOpenContact: (contact: Contact) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(prayer.title);
  const [contactId, setContactId] = useState(prayer.contactId || "");
  const linked = prayer.contactId ? contacts.find((c) => c.id === prayer.contactId) : null;

  const openEdit = () => {
    setTitle(prayer.title);
    setContactId(prayer.contactId || "");
    setOpen(true);
  };
  const save = () => {
    const t = title.trim();
    if (!t) return;
    onUpdate(prayer.id, { title: t, contactId: contactId || null });
    setOpen(false);
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
          <div className="text-on-surface font-medium leading-snug">{prayer.title}</div>
          {linked ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenContact(linked);
              }}
              className="text-sm text-primary hover:underline mt-0.5"
            >
              for {linked.name}
            </button>
          ) : (
            <span className="text-sm text-on-surface-variant/60 mt-0.5 inline-block">personal</span>
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
                placeholder="What are you praying for?"
              />
              <div className={dueLabelClass}>For a contact (optional)</div>
              <select
                className={cn(editInputClass, "cursor-pointer")}
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
              >
                <option value="">— no one in particular</option>
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
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
                <div className="flex-1" />
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-full text-sm text-on-surface hover:bg-surface-variant"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!title.trim()}
                  className="px-3 py-1.5 rounded-full text-sm bg-primary text-on-primary disabled:opacity-50"
                  onClick={save}
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </div>

        {!open && (
          <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
            <span className="text-xs text-on-surface-variant whitespace-nowrap">
              {agoLabel(prayer.date)}
            </span>
            <StatusPills
              value={prayer.status}
              options={PERSONAL_PRAYER_PILLS}
              onChange={(s) => onUpdate(prayer.id, { status: s as PersonalPrayerStatus })}
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
  addLabel = "Add a personal prayer",
  placeholder = "What would you like to pray for?",
}: {
  contacts?: Contact[];
  onAdd: (title: string, contactId: string | null) => void;
  addLabel?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [contactId, setContactId] = useState("");

  const reset = () => {
    setOpen(false);
    setTitle("");
    setContactId("");
  };
  const commit = () => {
    const t = title.trim();
    if (!t) return;
    onAdd(t, contactId || null);
    reset();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-primary transition-colors py-3"
      >
        <Plus className="w-3.5 h-3.5" /> {addLabel}
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
        placeholder={placeholder}
      />
      {contacts.length > 0 && (
        <>
          <div className={dueLabelClass}>For a contact (optional)</div>
          <select
            className={cn(editInputClass, "cursor-pointer")}
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
          >
            <option value="">— no one in particular</option>
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
          Cancel
        </button>
        <button
          type="button"
          disabled={!title.trim()}
          className="px-3 py-1.5 rounded-full text-sm bg-primary text-on-primary disabled:opacity-50"
          onClick={commit}
        >
          Add
        </button>
      </div>
    </div>
  );
}
