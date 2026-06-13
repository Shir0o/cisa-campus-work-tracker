import React, { useState, useEffect, useMemo } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  limit,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
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
  Tag,
  Pencil,
  Users,
  Search,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../lib/utils";
import ContactDetailsModal from "../components/modals/ContactDetailsModal";

// ── the work of care, in four warm kinds ──────────────────────────────
type Bucket = "steps" | "prayer" | "talk" | "gather";

const KINDS: { id: "all" | Bucket; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "steps", label: "Steps forward" },
  { id: "prayer", label: "Prayer" },
  { id: "talk", label: "Conversations" },
  { id: "gather", label: "Gatherings" },
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
  user: string;
  userPhoto?: string;
  action: string;
  target: string;
  contactId?: string;
  type: Activity["type"];
  description?: string;
  createdAt: string;
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
const humanize = (a: Hist): Humanized => {
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
  if (act.startsWith("updated attendance for event")) {
    return { bucket: "gather", icon: Calendar, lead: "noted who gathered at", showTarget: true };
  }
  if (act.startsWith("submitted feedback")) {
    return { bucket: "talk", icon: MessageSquare, lead: "shared some feedback", showTarget: false, detail: quote(desc) };
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
const dayInfo = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  const md = d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  if (diff === 0) return { label: "Today", sub: md };
  if (diff === 1) return { label: "Yesterday", sub: md };
  if (diff > 1 && diff < 7) return { label: d.toLocaleDateString(undefined, { weekday: "long" }), sub: md };
  return { label: md, sub: d.toLocaleDateString(undefined, { weekday: "long" }) };
};

const relTime = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const dd = Math.floor(h / 24);
  if (dd < 7) return `${dd}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const firstName = (name: string) => (name || "Someone").split(" ")[0];

export default function History() {
  useAuth();
  const [activities, setActivities] = useState<Hist[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const [kind, setKind] = useState<"all" | Bucket>("all");
  const [who, setWho] = useState("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    const unsubscribeContacts = onSnapshot(
      query(collection(db, "contacts")),
      (snapshot) => {
        setContacts(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Contact[]);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, "contacts"),
    );

    const unsubscribeActivities = onSnapshot(
      query(collection(db, "activities"), orderBy("createdAt", "desc"), limit(100)),
      (snapshot) => {
        setActivities(
          snapshot.docs.map((d) => {
            const data = d.data() as SystemActivity;
            return {
              id: d.id,
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
      (error) => handleFirestoreError(error, OperationType.LIST, "activities"),
    );

    return () => {
      unsubscribeContacts();
      unsubscribeActivities();
    };
  }, []);

  const openContact = (contactId?: string) => {
    if (!contactId) return;
    const c = contacts.find((x) => x.id === contactId);
    if (c) setSelectedContact(c);
  };

  // Distinct staff for the "Whole team ▾" select.
  const staff = useMemo(() => {
    const names = new Set<string>();
    activities.forEach((a) => a.user && names.add(a.user));
    return [...names].sort();
  }, [activities]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return activities.filter((a) => {
      if (who !== "all" && a.user !== who) return false;
      if (kind !== "all" && humanize(a).bucket !== kind) return false;
      if (needle) {
        const hay = `${a.user} ${a.action} ${a.target} ${a.description || ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [activities, who, kind, q]);

  // One continuous stream, with a small marker wherever the day changes.
  const rows = useMemo(() => {
    const out: ({ type: "date"; at: string; key: string } | { type: "item"; a: Hist; key: string })[] = [];
    let lastDay: string | null = null;
    filtered.forEach((a) => {
      const k = new Date(a.createdAt).toDateString();
      if (k !== lastDay) {
        out.push({ type: "date", at: a.createdAt, key: "d:" + k });
        lastDay = k;
      }
      out.push({ type: "item", a, key: a.id });
    });
    return out;
  }, [filtered]);

  const peopleRemembered = useMemo(
    () => new Set(activities.filter((a) => a.contactId).map((a) => a.contactId)).size,
    [activities],
  );
  const todayLong = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      {/* Header */}
      <header className="mb-8">
        <div className="font-sans text-[11px] uppercase tracking-[0.08em] text-on-surface-variant mb-2">
          {todayLong}
        </div>
        <h1 className="font-serif text-3xl text-on-surface">Looking back</h1>
        <p className="text-base text-on-surface-variant leading-relaxed mt-2 max-w-2xl">
          A record of the small, faithful work of the last little while — conversations had, prayers begun, steps
          taken. <span className="text-on-surface font-medium">{activities.length}</span>{" "}
          {activities.length === 1 ? "moment" : "moments"} across the team, touching{" "}
          <span className="text-on-surface font-medium">{peopleRemembered}</span> of the people in our care.
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
                  ? "bg-surface text-on-surface shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>

        <label className="inline-flex items-center gap-2 h-10 pl-3 pr-2 rounded-full bg-surface border border-outline-variant text-sm text-on-surface focus-within:border-primary transition-colors">
          <Users className="w-3.5 h-3.5 text-on-surface-variant shrink-0" />
          <select
            value={who}
            onChange={(e) => setWho(e.target.value)}
            className="bg-transparent outline-none pr-1 text-on-surface cursor-pointer"
          >
            <option value="all">Whole team</option>
            {staff.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a moment or a name…"
            className="pl-10 pr-4 h-10 w-full rounded-full bg-surface border border-outline-variant focus:border-primary outline-none transition-colors text-sm text-on-surface placeholder:text-on-surface-variant/60"
          />
        </div>
      </div>

      {/* The stream */}
      {loading ? (
        <div className="text-center py-16 text-on-surface-variant">Gathering the last few days…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16">
          <h3 className="font-serif text-xl text-on-surface mb-1">Nothing here yet for that filter</h3>
          <p className="text-sm text-on-surface-variant">Try widening it.</p>
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
                      <span className="font-serif text-lg text-on-surface leading-none">{d.label}</span>
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
                              className="font-medium text-on-surface hover:text-primary hover:underline transition-colors"
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
                      <div className="text-[13.5px] text-on-surface-variant/90 leading-relaxed mt-1">{h.detail}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quiet figures footer */}
      {!loading && activities.length > 0 && (
        <div className="mt-12 pt-6 border-t border-outline-variant flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-xl text-on-surface">{activities.length}</span>
            <span className="text-[13px] text-on-surface-variant">moments noted</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-xl text-on-surface">{peopleRemembered}</span>
            <span className="text-[13px] text-on-surface-variant">people remembered</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-xl text-on-surface">{staff.length}</span>
            <span className="text-[13px] text-on-surface-variant">hands at work</span>
          </div>
          <span className="text-[13px] text-on-surface-variant/70 italic ml-auto">
            We write it down so nothing — and no one — is forgotten.
          </span>
        </div>
      )}

      <ContactDetailsModal
        isOpen={selectedContact !== null}
        onClose={() => setSelectedContact(null)}
        contact={selectedContact}
      />
    </div>
  );
}
