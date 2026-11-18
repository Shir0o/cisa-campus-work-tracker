import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../../lib/firebase";
import { contactVisibilityConstraints } from "../../lib/contactQueries";
import { cn } from "../../lib/utils";
import { useAuth } from "../AuthProvider";
import { useLanguage } from "../LanguageProvider";
import type { ComposerPerson } from "../../lib/contactComposer";
import type { Contact } from "../../types";

// The people a Visit was with, besides the one whose page it is (cut-or-keep
// §5). A row of the people already added, and a chip that opens a short list of
// everyone the reader can see — the same roster Log interaction picks from.
// Saving writes one entry per person, so each person's story shows the visit.
export default function ComposerWith({
  people,
  onChange,
  excludeId,
}: {
  people: ComposerPerson[];
  onChange: (people: ComposerPerson[]) => void;
  /** The person whose page this is: already on the visit. */
  excludeId?: string;
}) {
  const { t } = useLanguage();
  const { user, role } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [roster, setRoster] = useState<Contact[]>([]);
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Read the roster only once the list is opened.
  useEffect(() => {
    if (!open) return;
    const q = query(
      collection(db, "contacts"),
      ...contactVisibilityConstraints(role, user?.uid),
      orderBy("name", "asc"),
    );
    return onSnapshot(
      q,
      (snap) => setRoster(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Contact[]),
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, "contacts");
        } catch {
          /* surfaced above */
        }
      },
    );
  }, [open, role, user?.uid]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return roster
      .filter((c) => c.id !== excludeId && (c.name || "").toLowerCase().includes(needle))
      .slice(0, 8);
  }, [roster, search, excludeId]);

  const isPicked = (id: string) => people.some((p) => p.id === id);
  const toggle = (c: Contact) =>
    onChange(isPicked(c.id) ? people.filter((p) => p.id !== c.id) : [...people, { id: c.id, name: c.name }]);
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className="cd-composer-chip-row" role="group" aria-label={t("modals.contactDetails.composer_with_label")}>
      <span className="text-[12.5px] font-semibold text-on-surface-variant">
        {t("modals.contactDetails.composer_with_label")}
      </span>
      {people.map((p) => (
        <span key={p.id} className="cd-composer-chip ghost">
          {p.name}
          <button
            type="button"
            aria-label={t("modals.remove_person").replace("{name}", p.name)}
            onClick={() => onChange(people.filter((x) => x.id !== p.id))}
            className="grid place-items-center"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <span
        className="cd-composer-pop"
        ref={wrapRef}
        onKeyDown={(e) => {
          if (open && e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
        }}
      >
        <button
          ref={triggerRef}
          type="button"
          className="cd-composer-chip ghost"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <Plus className="w-3 h-3" />
          {t("modals.contactDetails.composer_with_add")}
        </button>
        {open && (
          <div
            className="cd-composer-menu"
            role="dialog"
            aria-label={t("modals.contactDetails.composer_with_add")}
          >
            <span className="relative block">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-mute)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("modals.search_people")}
                aria-label={t("modals.search_people")}
                className="cd-composer-datetime !mb-0 !pl-7"
                autoFocus
              />
            </span>
            {matches.length === 0 ? (
              <span className="px-2.5 py-1.5 text-[12.5px] text-[var(--text-mute)]">
                {t("modals.no_contacts_matching").replace("{q}", search)}
              </span>
            ) : (
              matches.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={isPicked(c.id)}
                  className={cn("cd-composer-item flex items-center gap-2", isPicked(c.id) && "on")}
                  onClick={() => toggle(c)}
                >
                  <span className="grid h-3.5 w-3.5 place-items-center">
                    {isPicked(c.id) && <Check className="w-3 h-3" />}
                  </span>
                  {c.name}
                </button>
              ))
            )}
            <button type="button" className="cd-composer-item" onClick={close}>
              {t("actions.done")}
            </button>
          </div>
        )}
      </span>
    </div>
  );
}
