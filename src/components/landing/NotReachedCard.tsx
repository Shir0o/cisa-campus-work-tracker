import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Contact } from "../../types";
import { Avatar } from "./primitives";
import { useLanguage } from "../LanguageProvider";
import { parseMs } from "./helpers";
import { cn } from "../../lib/utils";
import { contactKind } from "../../lib/contactKind";
import {
  tiedTeammateNames,
  unreachedContacts,
  type ReachPerson,
  type ReachReading,
  type ReachScope,
} from "../../lib/reach";

// ── "Not reached yet" as a bento card (#1287) ──────────────────────────────
// The Contacts added in the last 30 days nobody has reached, following the My
// Day card conventions: a five-row cap with "show more", and a labelled region
// even when empty. A Trainee sees the people they are tied to; a Full-timer
// gets a Yours · Team switch, Team showing everyone with who is tied to them.

const COLLAPSED_LIMIT = 5;

export default function NotReachedCard({
  contacts,
  reach,
  nameByUid,
  role,
  uid,
  onOpenContact,
  className,
}: {
  contacts: Contact[];
  reach: ReadonlyMap<string, ReachReading>;
  nameByUid: Record<string, string>;
  role?: string | null;
  uid: string;
  onOpenContact: (contact: Contact) => void;
  className?: string;
}) {
  const { t } = useLanguage();
  const isFullTimer = role === "admin";
  const [scope, setScope] = useState<ReachScope>("yours");
  const [showAll, setShowAll] = useState(false);

  const people = useMemo<ReachPerson[]>(
    () =>
      contacts.map((c) => ({
        id: c.id,
        kind: contactKind(c),
        createdAtMs: parseMs(c.createdAt),
        createdBy: c.createdBy,
        addedBy: c.addedBy,
        founders: c.founders,
        coCreators: c.coCreators,
        carers: c.carers,
      })),
    [contacts],
  );

  const listed = useMemo(
    () =>
      unreachedContacts(people, reach, {
        scope: isFullTimer ? scope : "yours",
        viewerUid: uid,
        nowMs: Date.now(),
      }),
    [people, reach, isFullTimer, scope, uid],
  );

  const visible = showAll ? listed : listed.slice(0, COLLAPSED_LIMIT);
  const hidden = listed.length - visible.length;

  return (
    <section
      aria-label={t("myDay.not_reached_title")}
      className={cn(
        "bg-surface border border-outline-variant/60 rounded-3xl p-5 sm:p-6 flex flex-col gap-3 shadow-xs",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-outline-variant/40 pb-3">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <h3 className="font-serif text-lg text-on-surface font-semibold m-0">
            {t("myDay.not_reached_title")}
          </h3>
          <span className="text-xs text-on-surface-variant">{t("myDay.not_reached_sub")}</span>
        </div>
        {isFullTimer && (
          <div
            role="group"
            aria-label={t("myDay.not_reached_scope")}
            className="inline-flex rounded-full border border-outline-variant p-0.5"
          >
            {(["yours", "team"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={scope === s}
                onClick={() => setScope(s)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                  scope === s
                    ? "bg-primary text-on-primary"
                    : "text-on-surface-variant hover:bg-surface-variant",
                )}
              >
                {t(s === "yours" ? "myDay.not_reached_yours" : "myDay.not_reached_team")}
              </button>
            ))}
          </div>
        )}
      </div>

      {listed.length === 0 ? (
        <p className="text-xs text-on-surface-variant italic py-2">
          {t("myDay.not_reached_empty")}
        </p>
      ) : (
        <div className="flex flex-col">
          {visible.map((person, i) => {
            const contact = contacts.find((c) => c.id === person.id);
            if (!contact) return null;
            const tiedNames = tiedTeammateNames(person, nameByUid);
            return (
              <button
                key={person.id}
                type="button"
                onClick={() => onOpenContact(contact)}
                className={cn(
                  "flex items-center gap-3 py-3 text-left rounded-xl px-2 -mx-2 hover:bg-surface-variant transition-colors",
                  i > 0 && "border-t border-outline-variant/40",
                )}
              >
                <Avatar contact={contact} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-on-surface truncate">
                    {contact.name}
                  </span>
                  {scope === "team" && tiedNames.length > 0 && (
                    <span className="block text-xs text-on-surface-variant mt-0.5">
                      {t("myDay.not_reached_tied_to").replace("{names}", tiedNames.join(", "))}
                    </span>
                  )}
                </span>
                <ArrowRight className="w-4 h-4 text-on-surface-variant shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="py-1.5 text-xs font-medium text-accent hover:underline text-center cursor-pointer"
        >
          {t("whatsNew.show_more_people").replace("{n}", String(hidden))}
        </button>
      )}
      {showAll && listed.length > COLLAPSED_LIMIT && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="py-1.5 text-xs font-medium text-accent hover:underline text-center cursor-pointer"
        >
          {t("whatsNew.show_less")}
        </button>
      )}
    </section>
  );
}
