import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  collection,
  query,
  onSnapshot,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { activitiesPageQuery, countActivities } from "../../packages/core/src/data/activities";
import { HISTORY_PAGE_SIZE, historyHasMore } from "../../packages/core/src/history";
import { Activity, Contact, SystemActivity } from "../types";
import { useAuth } from "../components/AuthProvider";
import {
  ArrowRight,
  UserPlus,
  UserMinus,
  Heart,
  Phone,
  Mail,
  Calendar,
  MessageSquare,
  House,
  Tag,
  Pencil,
  Users,
  ArrowRightLeft,
  Search,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { cn, relTime, isServiceAccountName } from "../lib/utils";
import ContactDetailsModal from "../components/modals/ContactDetailsModal";
import { DataLoadError } from "../components/ui/DataLoadError";
import PageContainer from "../components/layout/PageContainer";
import { useMediaQuery } from '../lib/useMediaQuery';
import { usePreserveScroll } from '../lib/usePreserveScroll';
import HistoryMobile from './HistoryMobile';
import { Translate } from '../components/Translate';
import { useLanguage } from '../components/LanguageProvider';
import { dayMark, historyRows } from './historyTime';

// ── the work of care, in four warm kinds ──────────────────────────────
type Bucket = "steps" | "prayer" | "talk" | "gather";

// The stream loads in pages of this many; "Show older moments" grows the
// window, so the whole record stays reachable instead of stopping at the
// newest page. The size lives with the paging contract (#1828).
const PAGE_SIZE = HISTORY_PAGE_SIZE;

const KINDS: { id: "all" | Bucket; label: string; i18nKey: string }[] = [
  { id: "all", label: "Everything", i18nKey: "history.everything" },
  { id: "steps", label: "Steps forward", i18nKey: "history.steps_forward" },
  { id: "prayer", label: "Prayer", i18nKey: "history.prayer" },
  { id: "talk", label: "Conversations", i18nKey: "history.conversations" },
  { id: "gather", label: "Gatherings", i18nKey: "history.gatherings" },
];

// Static class strings (so Tailwind keeps them) for each bucket's tonal node.
const BUCKET_NODE: Record<Bucket, string> = {
  steps: "bg-stage-accent-soft text-stage-accent",
  prayer: "bg-stage-violet-soft text-stage-violet",
  talk: "bg-stage-amber-soft text-stage-amber",
  gather: "bg-stage-teal-soft text-stage-teal",
};

interface Hist {
  id: string;
  userId?: string;
  user: string;
  userPhoto?: string;
  action: string;
  target: string;
  contactId?: string;
  type: Activity["type"];
  description?: string;
  createdAt: string;
}

interface StaffOption {
  id: string;
  name: string;
}

interface Humanized {
  bucket: Bucket;
  icon: LucideIcon;
  lead: string;
  tail?: string;
  showTarget: boolean;
  detail?: string;
}

// Strip DB-isms (char counts, masked digits, C-0xxx ids) into plain language.
const scrub = (s?: string): string =>
  (s || "")
    .replace(/\(\+?\d+\s*chars?\)/gi, "") // "(+34 chars)"
    .replace(/[•*]{2,}\s*\d*/g, "") // masked "•••• 1234" / "****"
    .replace(/\bC-\d+\b/g, "") // raw contact ids
    .replace(/\s{2,}/g, " ")
    .trim();

const truncate = (s: string, n = 160) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const quote = (s?: string) => {
  const t = scrub(s);
  return t ? `“${truncate(t)}”` : undefined;
};

// Map a real logged action onto warm, human language.
export const humanize = (a: Hist): Humanized => {
  const act = a.action.toLowerCase();
  const desc = a.description;

  if (act.startsWith("moved contact to stage")) {
    const m = scrub(desc).match(/from\s+(.+?)\s+to\s+(.+)$/i);
    const toStage = a.action.match(/to stage\s+"([^"]+)"/i)?.[1];
    return {
      bucket: "steps",
      icon: ArrowRight,
      lead: "walked",
      tail: "a step further",
      showTarget: true,
      detail: m
        ? `A step forward — from ${m[1].trim()} toward ${m[2].trim()}.`
        : toStage
          ? `A step forward — toward ${toStage}.`
          : undefined,
    };
  }
  if (act.startsWith("created a new contact") || act === "created contact") {
    return { bucket: "steps", icon: UserPlus, lead: "welcomed", showTarget: true };
  }
  if (act.startsWith("deleted contact")) {
    return { bucket: "steps", icon: UserMinus, lead: "let go of", showTarget: true };
  }
  if (act.startsWith("added a prayer burden for")) {
    return {
      bucket: "prayer",
      icon: Heart,
      lead: "started praying for",
      showTarget: true,
      detail: quote(desc) ? `Began carrying ${quote(desc)}.` : undefined,
    };
  }
  if (act.startsWith("edited a prayer burden for")) {
    return {
      bucket: "prayer",
      icon: Heart,
      lead: "added to a prayer for",
      showTarget: true,
      detail: quote(desc) ?? "Added a few lines to a prayer.",
    };
  }
  if (act.startsWith("marked a prayer burden as")) {
    const status = act.match(/as\s+(\w+)\s+for/)?.[1];
    if (status === "answered") {
      return {
        bucket: "prayer",
        icon: Heart,
        lead: "gave thanks for an answered prayer for",
        showTarget: true,
        detail: "Answered, after carrying it together.",
      };
    }
    return {
      bucket: "prayer",
      icon: Heart,
      lead: "updated a prayer for",
      showTarget: true,
      detail: status ? `Now marked ${status}.` : undefined,
    };
  }
  // Clearing a prayer deletes the burden (src/lib/prayers.ts), but it is still
  // the work of prayer — without this branch it fell through to the fallback
  // and was filed under Conversations (#1768).
  if (act.startsWith("cleared a prayer for")) {
    return {
      bucket: "prayer",
      icon: Heart,
      lead: "cleared a prayer for",
      showTarget: true,
      detail: quote(desc) ? `Laid down ${quote(desc)}.` : undefined,
    };
  }
  if (act.startsWith("logged a visit to") || act.startsWith("edited a visit to") || act.startsWith("removed a visit to")) {
    const lead = act.startsWith("logged")
      ? "went round to"
      : act.startsWith("edited")
        ? "wrote more about a visit to"
        : "removed a visit to";
    const where = scrub(desc);
    return {
      bucket: "talk",
      icon: House,
      lead,
      showTarget: true,
      detail: where ? `At ${where}.` : undefined,
    };
  }
  if (act.startsWith("logged an interaction for") || act.startsWith("logged a batch interaction for")) {
    const lead =
      a.type === "call"
        ? "called"
        : a.type === "email"
          ? "emailed"
          : a.type === "event"
            ? "met with"
            : a.type === "comment"
              ? "left a note for"
              : "spent time with";
    const icon =
      a.type === "call" ? Phone : a.type === "email" ? Mail : a.type === "event" ? Calendar : MessageSquare;
    return { bucket: "talk", icon, lead, showTarget: true, detail: quote(desc) };
  }
  if (act.startsWith("updated an interaction for")) {
    return { bucket: "talk", icon: Pencil, lead: "updated a conversation with", showTarget: true };
  }
  if (act.startsWith("left a comment on")) {
    return { bucket: "talk", icon: MessageSquare, lead: "left a note for", showTarget: true, detail: quote(desc) };
  }
  if (act.includes("tag")) {
    const removed = act.startsWith("removed");
    return {
      bucket: "talk",
      icon: Tag,
      lead: removed ? "removed a tag from" : "added a tag for",
      showTarget: true,
    };
  }
  if (act.startsWith('updated attendance for "') && act.includes('" to ')) {
    return { bucket: "gather", icon: Calendar, lead: "noted who gathered at", showTarget: true };
  }
  if (act.startsWith("submitted feedback")) {
    return { bucket: "talk", icon: MessageSquare, lead: "shared some feedback", showTarget: false, detail: quote(desc) };
  }
  if (act.startsWith("transferred a person")) {
    return {
      bucket: "talk",
      icon: ArrowRightLeft,
      lead: "handed off",
      showTarget: true,
      detail: scrub(desc) ? scrub(desc) : undefined,
    };
  }
  if (act.startsWith("updated")) {
    return {
      bucket: "talk",
      icon: Pencil,
      lead: "updated details for",
      showTarget: true,
      detail: scrub(desc) ? "Tidied up their details." : undefined,
    };
  }
  // Fallback — keep the verb, drop the DB-isms.
  return { bucket: "talk", icon: Pencil, lead: a.action, showTarget: !!a.contactId, detail: quote(desc) };
};

// ── time helpers ──────────────────────────────────────────────────────
// The marker and the stream order live in ./historyTime, so the phone and the
// desktop read the same date, from the same value, the same way.

const firstName = (name: string) => (name || "Someone").split(" ")[0];

export default function History() {
  useAuth();
  const { t, language } = useLanguage();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [activities, setActivities] = useState<Hist[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [team, setTeam] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const [kind, setKind] = useState<"all" | Bucket>("all");
  const [who, setWho] = useState("all");
  const [q, setQ] = useState("");
  const [windowSize, setWindowSize] = useState(PAGE_SIZE);
  const [recordCount, setRecordCount] = useState<number | null>(null);

  // Clear state before handleFirestoreError (which throws), so the skeleton always
  // clears and the failure surfaces instead of a stuck/partial view.
  const onLoadError = useCallback((e: unknown, path: string) => {
    setError("history");
    setLoading(false);
    handleFirestoreError(e, OperationType.LIST, path);
  }, []);

  useEffect(() => {
    const unsubscribeContacts = onSnapshot(
      query(collection(db, "contacts")),
      (snapshot) => {
        setContacts(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Contact[]);
      },
      (e) => onLoadError(e, "contacts"),
    );

    // The "Whole team" select lists every approved teammate, not only the people
    // who happen to appear in the recent activity window.
    const unsubscribeUsers = onSnapshot(
      query(collection(db, "users")),
      (snapshot) => {
        setTeam(
          snapshot.docs
            .map((d) => {
              const u = d.data() as { displayName?: string; email?: string; approved?: boolean };
              return { id: d.id, name: (u.displayName || u.email || "").trim(), approved: u.approved };
            })
            .filter((u) => u.approved !== false && !!u.name && !isServiceAccountName(u.name))
            .map((u) => ({ id: u.id, name: u.name })),
        );
      },
      (e) => onLoadError(e, "users"),
    );

    return () => {
      unsubscribeContacts();
      unsubscribeUsers();
    };
  }, [onLoadError]);

  // The activity stream is paged, not capped: growing the window is how older
  // moments — and a teammate whose activity sits beyond the newest page — stay
  // reachable.
  useEffect(() => {
    const unsubscribeActivities = onSnapshot(
      activitiesPageQuery(db, windowSize),
      (snapshot) => {
        setActivities(
          snapshot.docs.map((d) => {
            const data = d.data() as SystemActivity;
            return {
              id: d.id,
              userId: data.userId,
              user: data.userName,
              userPhoto: data.userPhoto,
              action: data.action,
              target: data.targetName,
              contactId: data.targetType === "contact" ? data.targetId : undefined,
              type: data.type,
              description: data.description,
              createdAt: data.createdAt,
            } as Hist;
          }),
        );
        setLoading(false);
      },
      (e) => onLoadError(e, "activities"),
    );

    return () => {
      unsubscribeActivities();
    };
  }, [windowSize, onLoadError]);

  // The record's own size (#1828). The stream is a page of it, so the header
  // asks for the count instead of reading `activities.length` — one aggregate
  // read, re-run when the newest moment changes (a live write) or another
  // page is asked for. If the aggregate is refused or fails, the total stays
  // unknown and every view scopes itself to the window rather than invent one.
  const newestId = activities[0]?.id;
  useEffect(() => {
    if (loading || error) return;
    let cancelled = false;
    countActivities(db).then(
      (n) => {
        if (!cancelled) setRecordCount(n);
      },
      () => {
        if (!cancelled) setRecordCount(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [loading, error, newestId, windowSize]);

  const openContact = (contactId?: string) => {
    if (!contactId) return;
    const c = contacts.find((x) => x.id === contactId);
    if (c) setSelectedContact(c);
  };

  // People detail is a full page (the design's ContactDetail), not a popup.
  usePreserveScroll(!!selectedContact);

  // The "Whole team ▾" select: every approved teammate, plus any legacy
  // activity author not (or no longer) in the users collection. Each option
  // carries the author's stable id, so filtering survives a display-name
  // change: activities are stamped with the name at write time, which may no
  // longer match the name shown here (#1254 follow-up).
  const staffOptions = useMemo<StaffOption[]>(() => {
    const byId = new Map<string, StaffOption>();
    const names = new Set<string>();
    team.forEach((u) => {
      byId.set(u.id, u);
      names.add(u.name);
    });
    activities.forEach((a) => {
      if (!a.user || (a.userId && byId.has(a.userId)) || names.has(a.user)) return;
      const id = a.userId || `legacy:${a.user}`;
      byId.set(id, { id, name: a.user });
      names.add(a.user);
    });
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [activities, team]);

  const staff = useMemo(() => [...new Set(staffOptions.map((o) => o.name))], [staffOptions]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const selected = who === "all" ? undefined : staffOptions.find((o) => o.name === who);
    return activities.filter((a) => {
      if (who !== "all") {
        const matchId = !!selected && !selected.id.startsWith("legacy:") && a.userId === selected.id;
        const matchName = a.user === who;
        if (!matchId && !matchName) return false;
      }
      if (kind !== "all" && humanize(a).bucket !== kind) return false;
      if (needle) {
        const hay = `${a.user} ${a.action} ${a.target} ${a.description || ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [activities, who, kind, q, staffOptions]);

  // One continuous stream, with a small marker wherever the day changes.
  const rows = useMemo(() => historyRows(filtered), [filtered]);

  const dayInfo = useCallback(
    (iso: string) => dayMark(iso, language, t),
    [language, t],
  );

  const clearFilters = useCallback(() => {
    setKind("all");
    setWho("all");
    setQ("");
  }, []);

  const peopleRemembered = useMemo(
    () => new Set(activities.filter((a) => a.contactId).map((a) => a.contactId)).size,
    [activities],
  );

  // A short page is proof the record ended; a full page is only proof when the
  // aggregate agrees (#1828). The count is floored by what is in view, so a
  // live write that lands between the two reads can never print "100 of 99".
  const pageIsShort = activities.length < windowSize;
  const totalMoments =
    recordCount === null
      ? (pageIsShort ? activities.length : null)
      : Math.max(recordCount, activities.length);
  const recordComplete = totalMoments !== null && activities.length >= totalMoments;
  const hasMore = historyHasMore(activities.length, windowSize, totalMoments);

  // The one sentence that may describe a page: it counts exactly the moments
  // on screen, so it is only used while the record is longer than the page.
  const shownMomentWord = activities.length === 1 ? t('history.moment') : t('history.moments');
  const windowDeck = t(
    'history.deck',
    'The small, faithful work of these days — {moments} across the team, touching {people} of the people in our care.',
  )
    .replace('{moments}', `${activities.length} ${shownMomentWord}`)
    .replace('{people}', String(peopleRemembered));

  // The card's moments figure. While the page is shorter than the record it
  // says "100 of 3412" using the app's plain "{shown} of {total}" template —
  // reused rather than minting a locale key for this one slot (#1828).
  const momentsFigure =
    recordComplete || totalMoments === null
      ? String(totalMoments ?? activities.length)
      : t('directory.of_people')
          .replace('{shown}', String(activities.length))
          .replace('{total}', String(totalMoments));

  const showOlder = () => setWindowSize((s) => s + PAGE_SIZE);
  const todayLong = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // The person detail is a full page (the design's ContactDetail), not a popup:
  // it replaces the view, so back returns here.
  if (selectedContact) {
    return (
      <ContactDetailsModal
        isOpen
        onClose={() => setSelectedContact(null)}
        contact={selectedContact}
      />
    );
  }

  if (error) {
    return <DataLoadError label={error} />;
  }

  if (isMobile) {
    return (
      <>
        <HistoryMobile
          activities={activities}
          contacts={contacts}
          filteredActivities={filtered}
          rows={rows}
          peopleRemembered={peopleRemembered}
          kind={kind}
          setKind={setKind}
          who={who}
          setWho={setWho}
          q={q}
          setQ={setQ}
          staff={staff}
          onOpenContact={openContact}
          onClearFilters={clearFilters}
          loading={loading}
          humanize={humanize}
          dayInfo={dayInfo}
          firstName={firstName}
          hasMore={hasMore}
          onShowOlder={showOlder}
          totalMoments={totalMoments}
        />
      </>
    );
  }

  return (
    <PageContainer variant="wide">
      {/* Header */}
      <header className="mb-8">
        <div className="font-sans text-[11px]   text-on-surface-variant mb-2">
          {todayLong}
        </div>
        <h1 className="font-serif page-title text-on-surface">{t('history.looking_back')}</h1>
        <p className="text-base text-on-surface-variant leading-relaxed mt-2 max-w-2xl">
          {totalMoments !== null ? (
            <>
              {t('history.record_small_faithful')}{" "}
              <span className="text-on-surface font-medium">{totalMoments}</span>{" "}
              {totalMoments === 1 ? t('history.moment') : t('history.moments')} across the team
              {recordComplete ? (
                <>
                  , touching{" "}
                  <span className="text-on-surface font-medium">{peopleRemembered}</span> of the people in our care.
                </>
              ) : (
                "."
              )}
            </>
          ) : (
            windowDeck
          )}
        </p>
      </header>

      {/* Controls — one row */}
      <div className="flex flex-wrap items-center gap-3 mb-7">
        <div className="inline-flex flex-wrap gap-1 p-1 rounded-full bg-surface-container-low border border-outline-variant">
          {KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => setKind(k.id)}
              className={cn(
                "text-[13px] px-3 py-1.5 rounded-full transition-colors",
                kind === k.id
                  ? "bg-surface text-on-surface "
                  : "text-on-surface-variant hover:text-on-surface",
              )}
            >
              {t(k.i18nKey, k.label)}
            </button>
          ))}
        </div>

        <label className="inline-flex items-center gap-2 h-10 pl-3 pr-2 rounded-full bg-surface border border-outline-variant text-sm text-on-surface focus-within:border-primary transition-colors">
          <Users className="w-3.5 h-3.5 text-on-surface-variant shrink-0" />
          <select
            value={who}
            onChange={(e) => setWho(e.target.value)}
            className="bg-transparent outline-none pr-1 text-on-surface cursor-pointer appearance-none"
          >
            <option value="all">{t('history.whole_team')}</option>
            {staff.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-on-surface-variant shrink-0 pointer-events-none" aria-hidden />
        </label>

        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('history.find_moment')}
            className="pl-10 pr-4 h-10 w-full rounded-full bg-surface border border-outline-variant focus:border-primary outline-none transition-colors text-sm text-on-surface placeholder:text-on-surface-variant/60"
          />
        </div>
      </div>

      {/* The stream */}
      {loading ? (
        <div className="text-center py-16 text-on-surface-variant">{t('history.gathering_last_few_days')}</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16">
          <h3 className="font-serif text-xl text-on-surface mb-1">{t('history.nothing_yet_filter')}</h3>
          <p className="text-sm text-on-surface-variant">{t('history.try_widening')}</p>
        </div>
      ) : (
        <div className="relative">
          {/* the single, unbroken thread */}
          <div className="absolute left-[14px] top-4 bottom-6 w-px bg-outline-variant -translate-x-1/2" aria-hidden />

          <div className="flex flex-col">
            {rows.map((row) => {
              if (row.type === "date") {
                const d = dayInfo(row.at);
                return (
                  <div key={row.key} className="flex items-center gap-4 pt-6 pb-3 first:pt-0">
                    <span className="relative z-10 w-7 flex justify-center shrink-0">
                      <span className="w-2 h-2 rounded-full bg-outline ring-4 ring-background" aria-hidden />
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-semibold text-on-surface leading-none">{d.label}</span>
                      <span className="text-[12px] text-on-surface-variant">{d.sub}</span>
                    </div>
                  </div>
                );
              }

              const a = row.a;
              const h = humanize(a);
              const Icon = h.icon;
              return (
                <div key={row.key} className="flex gap-4 py-2.5">
                  <span
                    className={cn(
                      "relative z-10 w-7 h-7 rounded-full flex items-center justify-center shrink-0 ring-4 ring-background",
                      BUCKET_NODE[h.bucket],
                    )}
                    aria-hidden
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="text-[15px] leading-snug text-on-surface-variant">
                      <span className="font-medium text-on-surface">{firstName(a.user)}</span>{" "}
                      <span>{h.lead}</span>
                      {h.showTarget && a.target && (
                        <>
                          {" "}
                          {a.contactId ? (
                            <button
                              onClick={() => openContact(a.contactId)}
                              className="font-medium text-on-surface hover:text-accent hover:underline transition-colors"
                            >
                              {a.target}
                            </button>
                          ) : (
                            <span className="font-medium text-on-surface">{a.target}</span>
                          )}
                        </>
                      )}
                      {h.tail && <span> {h.tail}</span>}
                      <span className="mx-1.5 text-on-surface-variant/50">·</span>
                      <span className="text-[13px] text-on-surface-variant/80">{relTime(a.createdAt)}</span>
                    </div>
                    {h.detail && (
                      <div className="text-[13.5px] text-on-surface-variant/90 leading-relaxed mt-1">
                        <Translate text={h.detail} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && !recordComplete && totalMoments !== null && (
        <p className="mt-6 text-center text-[13px] text-on-surface-variant/80 italic">{windowDeck}</p>
      )}

      {!loading && hasMore && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={showOlder}
            className="text-sm font-medium text-accent hover:underline"
          >
            {t('history.show_older')}
          </button>
        </div>
      )}

      {/* Quiet figures card */}
      {!loading && activities.length > 0 && (
        <div className="mt-12 bg-surface rounded-3xl border border-outline-variant/60 px-6 py-5 flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <div className="flex items-baseline gap-2">
            <span className="text-xl text-on-surface">
              {momentsFigure}
            </span>
            <span className="text-[13px] text-on-surface-variant">{t('history.moments_noted')}</span>
          </div>
          {/* Distinct contacts cannot be counted across the record server-side,
              so this figure is only claimed once every moment is loaded. Until
              then the page-scoped deck under the stream carries it. */}
          {recordComplete && (
            <div className="flex items-baseline gap-2">
              <span className="text-xl text-on-surface">{peopleRemembered}</span>
              <span className="text-[13px] text-on-surface-variant">{t('history.people_remembered')}</span>
            </div>
          )}
          <div className="flex items-baseline gap-2">
            <span className="text-xl text-on-surface">{staff.length}</span>
            <span className="text-[13px] text-on-surface-variant">{t('history.hands_at_work')}</span>
          </div>
          <span className="text-[13px] text-on-surface-variant/70 italic ml-auto">
            {t('history.we_write_it_down')}
          </span>
        </div>
      )}
    </PageContainer>
  );
}
