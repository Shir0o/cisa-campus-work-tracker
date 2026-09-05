import React, { useEffect, useMemo, useState } from "react";
import { collectionGroup, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../../lib/firebase";
import {
  Users,
  MessageSquare,
  HelpCircle,
  Heart,
  Bell,
  Check,
  ClipboardList,
  ChevronDown,
  ChevronRight,
  Send,
} from "lucide-react";
import { cn, relTime } from "../../lib/utils";
import { useAuth } from "../AuthProvider";
import type { Contact, Interaction, Notification } from "../../types";
import { Avatar } from "./primitives";
import {
  buildAttentionItems,
  attentionStacksFor,
  worklistGroupsFor,
  partitionAttentionStacks,
  attentionPhrase,
  filterAttentionStacks,
  actorsInStacks,
  isRestingFilter,
  soleTeamOf,
  worklistVerbFor,
  openAsksIn,
  wantsAReply,
  encouragementSummary,
  type AttentionStack,
  type AttentionItem,
  type WorklistVerb,
  type WorklistBucket,
} from "../../lib/attention";
import { TEAMS, teamLabelKey, rosterOnTeam } from "../../lib/teams";
import { useLanguage } from "../LanguageProvider";
import { InboxState } from "../../lib/inboxState";
import { Translate } from "../Translate";
import { UndoSnackbar } from "../UndoSnackbar";
import { useUndoSnack } from "../../hooks/useUndoSnack";
import { COMPOSE_KINDS, ComposeKindPicker, type ComposeKind } from "../ComposeKindPicker";
import {
  addThreadMessage,
  closeFollowUpAsk,
  daysOpen,
  reopenFollowUpAsk,
  subscribeAllThreads,
  type ThreadMessageWithContact,
} from "../../lib/threads";

// ── The feed is the worklist (#813) ─────────────────────────────────────────
// Two independent facts per card:
//
//   seen      — you opened the person. The accent dot, and nothing else.
//   completed — you are finished with this. The header count is everything NOT
//               completed, seen or not.
//
// They used to be one gesture: "I followed up" marked every id in the stack
// done and "Comment" marked the whole stack scanned, so opening something made
// the number fall and an inbox built on it would have lied. Both now live per
// person on the server (`lib/inboxState.ts`), so a laptop and a phone agree.
//
// Drawn in docs/design/followup-reach/Inbox.dc.html — including the verb table
// below, which exists because "I followed up" on a card about a note claims you
// texted the student, which you did not.

const IBX_ENCOURAGE: Record<string, string> = {
  "🙏": "Praying for you both! Let me know if you need anything.",
  "❤️": "Love seeing this! Praying for your next step with them.",
  "🌱": "Such encouraging news. Let's keep watering those seeds!",
  "✅": "Awesome follow up! Let me know if I can support you here.",
};

const NODE: Record<string, { cls: string; Icon: typeof Users }> = {
  contact: { cls: "text-stage-teal bg-stage-teal-soft", Icon: Users },
  interaction: { cls: "text-stage-accent bg-stage-accent-soft", Icon: MessageSquare },
  thread: { cls: "text-stage-amber bg-stage-amber-soft", Icon: HelpCircle },
  task: { cls: "text-stage-violet bg-stage-violet-soft", Icon: ClipboardList },
  notification: { cls: "text-stage-accent bg-stage-accent-soft", Icon: Bell },
};

/** One word per completion, chosen by what the card is about. */
const VERB_LABEL: Record<WorklistVerb, string> = {
  reviewed: "whatsNew.verb_reviewed",
  answered: "whatsNew.verb_answered",
  followedUp: "whatsNew.verb_followed_up",
  gotIt: "whatsNew.verb_got_it",
};

/** What the Undo snackbar says, in the same word as the button that ran. */
const VERB_SNACK: Record<WorklistVerb, string> = {
  reviewed: "whatsNew.snack_reviewed",
  answered: "whatsNew.snack_answered",
  followedUp: "whatsNew.snack_followed_up",
  gotIt: "whatsNew.snack_got_it",
};

const GROUP_LABEL: Record<WorklistBucket, string> = {
  newPeople: "whatsNew.group_new_people",
  everythingElse: "whatsNew.group_everything_else",
};

/** "Talked" — this stack holds a logged conversation, not just a new face
 *  (#727). It reads `stack.kinds`, which has carried the item types per stack
 *  since the day it was written and had no reader until now.
 *
 *  It stands on colour rather than on a border on purpose: the card's own
 *  unread emphasis is a 1px `--outline-variant` border on an identical fill
 *  (1.04:1 in light theme) and does not render, so a bordered marker would
 *  inherit the same problem. See docs/design/news-filters/Highlight.dc.html. */
function TalkedChip({ stack, label }: { stack: AttentionStack; label: string }) {
  if (!stack.kinds.includes("interaction")) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-stage-accent bg-stage-accent-soft shrink-0">
      <MessageSquare className="w-3 h-3" />
      {label}
    </span>
  );
}

/** The items behind a card, for when the summary line is not enough. Read-only:
 *  seen is set by opening the person, never by ticking a row here. */
function AttentionSubItem({ item }: { item: AttentionItem }) {
  const { t } = useLanguage();
  const nodeInfo = NODE[item.type] || { cls: "text-stage-accent bg-stage-accent-soft", Icon: Users };
  const Icon = nodeInfo.Icon;
  const fallback =
    item.type === "contact"
      ? t("whatsNew.item_new_contact")
      : item.type === "thread"
        ? t("whatsNew.item_message")
        : t("whatsNew.item_interaction");

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border bg-surface border-outline-variant/60">
      <span
        className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5",
          nodeInfo.cls,
        )}
      >
        <Icon className="w-3.5 h-3.5" />
      </span>
      <div className="min-w-0 text-sm">
        <div className="font-medium text-on-surface">{item.title || fallback}</div>
        {item.body && (
          <Translate
            as="p"
            className="text-xs text-on-surface-variant line-clamp-2 mt-0.5"
            text={item.body}
          />
        )}
        <span className="text-[11px] text-on-surface-variant/70 mt-1 block">
          {relTime(item.at)}
        </span>
      </div>
    </div>
  );
}

/** Write back without leaving the list. The comment icon used to open the whole
 *  contact modal, which loses your place in a worklist you are working down. */
function CardComposer({
  contact,
  uid,
  meName,
  mobile,
  onPosted,
  onCancel,
}: {
  contact: Contact;
  uid: string;
  meName: string;
  mobile?: boolean;
  onPosted: (kind: ComposeKind) => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [kind, setKind] = useState<ComposeKind>("comment");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const post = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    await addThreadMessage(
      contact.id,
      { interactionId: null, scope: null, from: uid, fromName: meName, kind, body },
      {
        contactName: contact.name,
        stakeholders: {
          createdBy: contact.createdBy ?? null,
          coCreators: contact.coCreators ?? null,
          owner: contact.owner ?? null,
        },
      },
    );
    setBusy(false);
    setDraft("");
    onPosted(kind);
  };

  return (
    <div className="mt-3 pt-3 border-t border-outline-variant/60">
      <ComposeKindPicker value={kind} onChange={setKind} dense={mobile} />
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={t(COMPOSE_KINDS[kind].placeholder)}
        rows={mobile ? 3 : 2}
        autoFocus
        className="w-full p-2.5 rounded-xl bg-surface-container-high border border-outline-variant/40 text-sm text-on-surface placeholder:text-on-surface-variant/50 resize-none focus:outline-none focus:border-primary/40 transition-colors"
      />
      <div className={cn("mt-2 flex items-center gap-2", mobile ? "flex-col-reverse" : "justify-end")}>
        <button
          type="button"
          onClick={onCancel}
          className={cn(
            "px-3 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors cursor-pointer",
            mobile ? "w-full min-h-11" : "h-8",
          )}
        >
          {t("actions.cancel")}
        </button>
        <button
          type="button"
          onClick={post}
          disabled={!draft.trim() || busy}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 px-3 rounded-full bg-primary text-on-primary text-xs font-medium hover:opacity-90 transition disabled:opacity-50 cursor-pointer",
            mobile ? "w-full min-h-11" : "h-8",
          )}
        >
          <Send className="w-3.5 h-3.5" /> {t("thread.send_post")}
        </button>
      </div>
    </div>
  );
}

function WorklistCard({
  stack,
  contact,
  staffNameMap,
  uid,
  meName,
  completed,
  onOpenContact,
  onComplete,
  onToast,
  mobile,
}: {
  stack: AttentionStack;
  contact?: Contact;
  staffNameMap: Record<string, string>;
  uid: string;
  meName: string;
  completed: boolean;
  onOpenContact?: (contactId: string, initialTab?: "overview" | "thread" | "history") => void;
  onComplete: (stack: AttentionStack, verb: WorklistVerb) => void;
  onToast?: (msg: string) => void;
  mobile?: boolean;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [reactOpen, setReactOpen] = useState(false);

  const newest = stack.items[0];
  const verb = worklistVerbFor(stack);
  const openAsks = openAsksIn(stack);
  const hasOpenAsk = openAsks.length > 0;
  const rowTeam = soleTeamOf(stack);

  const phrases = stack.items.slice(0, 3).map((it) => attentionPhrase(it, staffNameMap));
  const moreCount = stack.items.length - phrases.length;
  if (hasOpenAsk) phrases.push(t("whatsNew.nobody_yet"));
  else if (stack.seen && !completed) phrases.push(t("whatsNew.opened_not_finished"));

  const latestText =
    newest.type === "thread"
      ? newest.body
      : newest.type === "contact"
        ? contact?.notes || ""
        : newest.body || contact?.notes || "";

  const openThem = () => {
    // Seen is set here and only here — opening the person is the whole of it.
    InboxState.markSeen(uid, stack.id);
    if (stack.contactId && onOpenContact) onOpenContact(stack.contactId);
  };

  const handleEncourage = async (emoji: string) => {
    if (!stack.contactId) return;
    const body = IBX_ENCOURAGE[emoji];
    if (!body) return;
    try {
      await addThreadMessage(stack.contactId, {
        from: uid,
        fromName: meName,
        kind: "encouragement",
        body,
        interactionId: newest.interactionId ?? null,
      });
      onToast?.(t("whatsNew.encouragement_posted"));
    } catch {
      onToast?.(t("whatsNew.could_not_post_encouragement"));
    }
  };

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 transition-all duration-200",
        completed
          ? "bg-surface/60 border-outline-variant/40 opacity-60"
          : stack.seen
            ? "bg-surface/60 border-outline-variant/40"
            : "bg-surface border-outline-variant shadow-xs",
        hasOpenAsk && !completed && "border-l-2 border-l-warning",
      )}
    >
      <div className="flex items-start gap-3.5">
        <Avatar contact={contact || ({ name: "Person" } as Contact)} size={mobile ? "sm" : "md"} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={openThem}
                className="font-medium text-base text-on-surface hover:text-accent transition-colors truncate text-left cursor-pointer"
              >
                {contact?.name || (stack.contactId ? t("whatsNew.a_contact") : t("whatsNew.activity"))}
              </button>
              {!stack.seen && !completed && (
                <span className="w-2 h-2 rounded-full bg-accent shrink-0 inline-block" />
              )}
              <TalkedChip stack={stack} label={t("whatsNew.talked")} />
              {rowTeam && (
                <span className="text-[11px] text-on-surface-variant border border-outline-variant rounded-full px-1.5 py-px shrink-0">
                  {t(teamLabelKey(rowTeam))}
                </span>
              )}
            </div>
            <span className="text-xs text-on-surface-variant/80 shrink-0">{relTime(stack.at)}</span>
          </div>

          <div className="text-xs text-on-surface-variant font-medium mt-1">
            {phrases.join(" · ")}
            {moreCount > 0 && ` · ${t("whatsNew.n_more").replace("{n}", String(moreCount))}`}
          </div>

          {hasOpenAsk && !completed && (
            <div className="text-[11px] font-medium text-warning mt-1">
              {t("whatsNew.open_days").replace("{n}", String(daysOpen(openAsks[0])))}
            </div>
          )}

          {latestText && (
            <Translate
              as="p"
              className="text-xs text-on-surface-variant/90 mt-1 line-clamp-2 whitespace-pre-line bg-surface-variant/40 rounded-lg p-2"
              text={latestText}
            />
          )}

          {completed ? (
            <div className="flex items-center gap-1.5 mt-2.5 text-xs font-medium text-success">
              <Check className="w-3.5 h-3.5" />
              {verb ? t(VERB_LABEL[verb]) : t("whatsNew.verb_got_it")}
            </div>
          ) : (
            <div
              className={cn(
                "mt-3 flex items-center gap-2",
                mobile ? "flex-wrap" : "flex-wrap",
              )}
            >
              {/* Two words, as drawn: what finishes this, and how to answer it.
                  Everything else is an icon. */}
              <div
                className={cn(
                  "flex items-center gap-2",
                  mobile ? "grid grid-cols-2 w-full" : "flex-wrap",
                )}
              >
                {verb && (
                  <button
                    type="button"
                    onClick={() => onComplete(stack, verb)}
                    className={cn(
                      "inline-flex items-center justify-center gap-1.5 px-3 rounded-full bg-primary text-on-primary text-xs font-medium hover:bg-primary/90 transition-colors shadow-xs cursor-pointer",
                      mobile ? "min-h-11" : "py-1.5",
                    )}
                  >
                    <Check className="w-3.5 h-3.5" /> {t(VERB_LABEL[verb])}
                  </button>
                )}

                {stack.contactId && contact && (
                  <button
                    type="button"
                    onClick={() => setComposing((v) => !v)}
                    className={cn(
                      "inline-flex items-center justify-center gap-1.5 px-3 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors cursor-pointer",
                      mobile ? "min-h-11" : "py-1.5",
                    )}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    {wantsAReply(stack) ? t("whatsNew.write_back") : t("whatsNew.comment")}
                  </button>
                )}
              </div>

              <div className={cn("flex items-center gap-1.5", mobile ? "w-full" : "ml-auto")}>
                {stack.items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setOpen(!open)}
                    className={cn(
                      "inline-flex items-center justify-center gap-1 px-2.5 rounded-full border border-outline-variant text-[11px] font-medium text-on-surface-variant hover:bg-surface-variant transition-colors cursor-pointer",
                      mobile ? "min-h-11 flex-1" : "py-1",
                    )}
                  >
                    <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
                    {open
                      ? t("whatsNew.hide")
                      : t("whatsNew.all_n").replace("{n}", String(stack.items.length))}
                  </button>
                )}

                {/* A request to go and see someone is not a thing to react to. */}
                {stack.contactId && !hasOpenAsk && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setReactOpen(!reactOpen)}
                      title={t("whatsNew.tell_them_it_landed")}
                      aria-label={t("whatsNew.encourage")}
                      className={cn(
                        "rounded-lg border border-outline-variant flex items-center justify-center text-on-surface-variant hover:bg-surface-variant hover:text-on-surface transition-colors cursor-pointer",
                        mobile ? "w-11 h-11" : "w-8 h-8",
                      )}
                    >
                      <Heart className="w-3.5 h-3.5 text-stage-accent" />
                    </button>
                    {reactOpen && (
                      <div className="absolute right-0 bottom-full mb-1 z-20 flex gap-1 p-1 bg-surface rounded-full shadow-lg border border-outline-variant">
                        {Object.keys(IBX_ENCOURAGE).map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => {
                              void handleEncourage(emoji);
                              setReactOpen(false);
                            }}
                            className="w-7 h-7 rounded-full hover:bg-surface-variant flex items-center justify-center text-sm cursor-pointer"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {stack.contactId && (
                  <button
                    type="button"
                    onClick={openThem}
                    title={t("whatsNew.open_their_page")}
                    aria-label={t("whatsNew.open_their_page")}
                    className={cn(
                      "rounded-lg border border-outline-variant flex items-center justify-center text-on-surface-variant hover:bg-surface-variant hover:text-on-surface transition-colors cursor-pointer",
                      mobile ? "w-11 h-11" : "w-8 h-8",
                    )}
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {open && !completed && (
            <div className="mt-3.5 pt-3 border-t border-outline-variant/60 flex flex-col gap-2">
              {stack.items.map((it) => (
                <AttentionSubItem key={it.id} item={it} />
              ))}
            </div>
          )}
        </div>
      </div>

      {composing && contact && !completed && (
        <CardComposer
          contact={contact}
          uid={uid}
          meName={meName}
          mobile={mobile}
          onCancel={() => setComposing(false)}
          onPosted={() => {
            setComposing(false);
            InboxState.markSeen(uid, stack.id);
            onToast?.(t("whatsNew.posted"));
          }}
        />
      )}
    </div>
  );
}

export default function AttentionFeed({
  contacts = [],
  interactions: propsInteractions,
  threads: propsThreads,
  tasks = [],
  notifications = [],
  staffNameMap: propsStaffNameMap,
  personalContactIds,
  onOpenContact,
  onToast,
  mobile,
  className,
}: {
  contacts?: Contact[];
  interactions?: Interaction[];
  threads?: ThreadMessageWithContact[];
  tasks?: Array<{
    id: string;
    title: string;
    status: string;
    assigneeId?: string | null;
    dueDate?: string | null;
    contactId?: string | null;
    createdById?: string | null;
  }>;
  notifications?: Notification[];
  staffNameMap?: Record<string, string>;
  /** The reader's own "keeping them" set — the fourth, private tie (#813). */
  personalContactIds?: Set<string> | null;
  onOpenContact?: (
    c: Contact,
    opts?: { tab?: "overview" | "thread" | "history"; interactionId?: string | null },
  ) => void;
  onToast?: (msg: string) => void;
  mobile?: boolean;
  className?: string;
}) {
  const { user, effectiveUserId, role } = useAuth();
  const { t } = useLanguage();
  const uid = effectiveUserId || user?.uid || "u1";
  const meName = user?.displayName || propsStaffNameMap?.[uid] || "Someone";
  const [showAllOnYou, setShowAllOnYou] = useState(false);
  const [showAllTeam, setShowAllTeam] = useState(false);
  // The filter cuts on WHO DID IT (#727) — a team, then optionally one person
  // inside it. One row governs the whole feed, not each column.
  const [team, setTeam] = useState<string | null>(null);
  const [pickedWho, setPickedWho] = useState<string | null>(null);
  // New = not yet opened. It defaults off: "opened, but not finished" is a real
  // state, and hiding it behind a filter is how work goes missing.
  const [newOnly, setNewOnly] = useState(false);
  const [liveInteractions, setLiveInteractions] = useState<Interaction[]>([]);
  const [liveThreads, setLiveThreads] = useState<ThreadMessageWithContact[]>([]);
  // Completed HERE, this visit. A card you finish greys in place and clears when
  // you leave — never under your cursor while you are still reading it.
  const [completedHere, setCompletedHere] = useState<Set<string>>(new Set());
  const { undoSnack, showUndoSnack, closeUndoSnack } = useUndoSnack();

  // Seen and completed change under the memos below, not in the props, so the
  // derivation has to be told. Without the tick in its dependency list,
  // `allStacks` would keep the seen flags it was built with and the accent dot
  // would outlive the click that cleared it.
  const [inboxTick, setInboxTick] = useState(0);
  useEffect(() => InboxState.subscribe(() => setInboxTick((n) => n + 1)), []);

  useEffect(() => {
    if (propsInteractions) return;
    try {
      const unsubInteractions = onSnapshot(
        query(collectionGroup(db, "interactions"), orderBy("createdAt", "desc"), limit(500)),
        (snap) =>
          setLiveInteractions(
            snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Record<string, unknown>),
              contactId: d.ref.path.split("/")[1],
            })) as Interaction[],
          ),
        (e) => handleFirestoreError(e, OperationType.LIST, "interactions (collectionGroup)"),
      );
      return () => unsubInteractions();
    } catch {
      // Degrade gracefully in test environments without live firestore
    }
  }, [propsInteractions]);

  useEffect(() => {
    if (propsThreads) return;
    try {
      const unsubThreads = subscribeAllThreads(setLiveThreads);
      return () => unsubThreads();
    } catch {
      // Degrade gracefully in test environments without live firestore
    }
  }, [propsThreads]);

  const interactions = propsInteractions || liveInteractions;
  // Team-scope Discussion is Full-timer-only; hide it from any other role even
  // before the security rules filter it out server-side.
  const threads = useMemo(
    () => (propsThreads || liveThreads).filter((m) => m.scope !== "team" || role === "admin"),
    [propsThreads, liveThreads, role],
  );

  const staffNameMap = useMemo(() => {
    if (propsStaffNameMap) return propsStaffNameMap;
    const m: Record<string, string> = {};
    for (const c of contacts) if (c.createdBy && c.createdByName) m[c.createdBy] ??= c.createdByName;
    for (const i of interactions) {
      const u = i.userId ?? i.createdById;
      const n = i.userName ?? i.createdByName;
      if (u && n) m[u] ??= n;
    }
    for (const m2 of threads) if (m2.from && m2.fromName) m[m2.from] ??= m2.fromName;
    return m;
  }, [propsStaffNameMap, contacts, interactions, threads]);

  const contactMap = useMemo(() => {
    const map = new Map<string, Contact>();
    contacts.forEach((c) => map.set(c.id, c));
    return map;
  }, [contacts]);

  const handleOpenContact = (contactId: string, initialTab?: "overview" | "thread" | "history") => {
    if (!onOpenContact) return;
    const c = contactMap.get(contactId);
    if (c) {
      onOpenContact(c, { tab: initialTab });
      return;
    }
    // Orphan reference (e.g. an activity that points at a deleted contact):
    // skip the open entirely rather than passing the raw string id downstream,
    // which would otherwise build `/people/${string}` → `/people/undefined`.
  };

  const rawItems = useMemo(
    () =>
      buildAttentionItems({
        role,
        uid,
        contacts,
        interactions,
        threads,
        tasks,
        notifications,
        personalContactIds,
      }),
    [role, uid, contacts, interactions, threads, tasks, notifications, personalContactIds],
  );

  const allStacks = useMemo(() => {
    void inboxTick; // the seen axis, read from the store inside
    return attentionStacksFor(rawItems, uid);
  }, [rawItems, uid, inboxTick]);

  // Praise is summarised, never a card: needing to dismiss an encouragement is
  // worse than the encouragement is worth.
  const encouraged = useMemo(
    () => encouragementSummary(threads, uid, contacts, personalContactIds),
    [threads, uid, contacts, personalContactIds],
  );

  // The teammates the select offers: the team's roster, so a teammate who has
  // done nothing this week is still offerable — that is exactly the person the
  // "nothing from them" state exists for. Anyone with news but no team stays
  // listed too, so the select can never hide something the feed is showing.
  const teammateOptions = useMemo(() => {
    const byUid = new Map<string, string>();
    for (const m of rosterOnTeam(team)) byUid.set(m.uid, m.name);
    for (const id of actorsInStacks(allStacks, team)) {
      if (!byUid.has(id)) byUid.set(id, staffNameMap[id] || "Someone");
    }
    return [...byUid.entries()]
      .map(([id, name]) => ({ uid: id, name: staffNameMap[id] || name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allStacks, team, staffNameMap]);

  // A teammate picked inside one team is meaningless under another: the chip
  // wins, and the select falls back to the whole team rather than to nothing.
  const who = pickedWho && teammateOptions.some((o) => o.uid === pickedWho) ? pickedWho : null;

  const filter = useMemo(() => ({ team, who }), [team, who]);

  // Completed work leaves the list — but only work that was already completed
  // when this visit began. What you finish while you are looking at it stays put
  // and greys, with an Undo.
  const isCompleted = (stack: AttentionStack) => InboxState.isCompleted(uid, stack.id);
  const stillListed = (stack: AttentionStack) =>
    !isCompleted(stack) || completedHere.has(stack.id);

  // Partition ONCE on the unfiltered feed, then narrow each side. The two-column
  // shape is decided on the unfiltered partition, so narrowing to one team never
  // collapses the layout underneath the person doing the narrowing.
  const allSides = useMemo(
    () => partitionAttentionStacks(allStacks, contacts, uid, role, personalContactIds),
    [allStacks, contacts, uid, role, personalContactIds],
  );

  const narrow = (side: AttentionStack[]) =>
    filterAttentionStacks(side, filter).filter(
      (s) => stillListed(s) && (!newOnly || !s.seen || completedHere.has(s.id)),
    );

  const onYou = narrow(allSides.onYou);
  const aroundTeam = narrow(allSides.aroundTeam);
  const stacks = [...onYou, ...aroundTeam];
  const hasTeamColumn = allSides.aroundTeam.length > 0;

  if (allStacks.length === 0 && encouraged.count === 0) {
    return null;
  }

  // The number that must never fall when you merely open something: everything
  // still to work through, seen or not.
  const toWorkThrough = stacks.filter((s) => !isCompleted(s)).length;
  const onYouOpen = onYou.filter((s) => !isCompleted(s)).length;
  const aroundTeamOpen = aroundTeam.filter((s) => !isCompleted(s)).length;
  const anyUnseen = stacks.some((s) => !s.seen);
  const resting = isRestingFilter(filter);
  const teamLabel = team ? t(teamLabelKey(team)) : "";
  // The name comes from the option list, not from the activity-built name map:
  // the teammate this state is about is precisely the one with no activity.
  const whoName = who
    ? (teammateOptions.find((o) => o.uid === who)?.name || "Someone").trim().split(/\s+/)[0]
    : "";

  const COLLAPSED_LIMIT = 5;
  const visibleOnYou = showAllOnYou ? onYou : onYou.slice(0, COLLAPSED_LIMIT);
  const hiddenOnYouCount = onYou.length - visibleOnYou.length;

  const visibleAroundTeam = showAllTeam ? aroundTeam : aroundTeam.slice(0, COLLAPSED_LIMIT);
  const hiddenTeamCount = aroundTeam.length - visibleAroundTeam.length;

  const onYouGroups = worklistGroupsFor(visibleOnYou);
  const aroundTeamGroups = worklistGroupsFor(visibleAroundTeam);

  /** Seen only. It must never claim you reviewed anyone. */
  const handleMarkAllSeen = () => {
    // What's on screen, not what's behind the filter — "all" means all of what
    // the person is looking at.
    InboxState.markSeen(
      uid,
      stacks.map((s) => s.id),
    );
  };

  const handleComplete = (stack: AttentionStack, verb: WorklistVerb) => {
    // A follow-up ask is closed once, for everyone tied to the contact: the
    // thing tracked is the errand, not five people's reading of it.
    const asks = verb === "followedUp" && stack.contactId ? openAsksIn(stack) : [];
    for (const ask of asks) {
      void closeFollowUpAsk(stack.contactId!, ask.id.replace(/^thread:/, ""), {
        uid,
        name: meName,
      });
    }
    InboxState.markCompleted(uid, stack.id);
    setCompletedHere((prev) => new Set(prev).add(stack.id));

    const name = (stack.contactId && contactMap.get(stack.contactId)?.name) || t("whatsNew.this_one");
    showUndoSnack(t(VERB_SNACK[verb]).replace("{name}", name), () => {
      InboxState.undoCompleted(uid, stack.id);
      setCompletedHere((prev) => {
        const next = new Set(prev);
        next.delete(stack.id);
        return next;
      });
      for (const ask of asks) {
        void reopenFollowUpAsk(stack.contactId!, ask.id.replace(/^thread:/, ""));
      }
    });
  };

  const clearFilter = () => {
    setTeam(null);
    setPickedWho(null);
  };

  // If mobile or the team column is empty (e.g. trainee view where all items are
  // onYou), render stacked
  const isSingleColumn = mobile || !hasTeamColumn;

  const renderCards = (group: { bucket: WorklistBucket; stacks: AttentionStack[] }) => (
    <div key={group.bucket} className="flex flex-col gap-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/70 px-1">
        {t(GROUP_LABEL[group.bucket])}
      </div>
      <div className="flex flex-col gap-3">
        {group.stacks.map((stack) => (
          <WorklistCard
            key={stack.id}
            stack={stack}
            contact={stack.contactId ? contactMap.get(stack.contactId) : undefined}
            staffNameMap={staffNameMap}
            uid={uid}
            meName={meName}
            completed={isCompleted(stack)}
            onOpenContact={handleOpenContact}
            onComplete={handleComplete}
            onToast={onToast}
            mobile={mobile}
          />
        ))}
      </div>
    </div>
  );

  return (
    <section className={cn("flex flex-col gap-4", className)}>
      {/* ── The worklist header — the count, the two views, and Mark all seen ── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <h2 className="font-serif text-xl text-on-surface font-semibold m-0">
              {t("whatsNew.title")}
            </h2>
            {toWorkThrough > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-accent/15 text-accent">
                {t("whatsNew.to_work_through").replace("{n}", String(toWorkThrough))}
              </span>
            )}
            <span className="text-xs text-on-surface-variant">{t("whatsNew.sub")}</span>
          </div>
          <div className="flex items-center gap-3">
            <div
              role="group"
              aria-label={t("whatsNew.filter_by_state")}
              className="inline-flex gap-0.5 p-0.5 rounded-full bg-surface-variant"
            >
              <button
                type="button"
                aria-pressed={newOnly}
                onClick={() => setNewOnly(true)}
                className={cn(
                  "px-3 py-1 rounded-full text-[11.5px] transition-colors cursor-pointer",
                  newOnly
                    ? "bg-surface text-on-surface font-semibold shadow-xs"
                    : "text-on-surface-variant font-medium hover:text-on-surface",
                )}
              >
                {t("whatsNew.filter_new")}
              </button>
              <button
                type="button"
                aria-pressed={!newOnly}
                onClick={() => setNewOnly(false)}
                className={cn(
                  "px-3 py-1 rounded-full text-[11.5px] transition-colors cursor-pointer",
                  !newOnly
                    ? "bg-surface text-on-surface font-semibold shadow-xs"
                    : "text-on-surface-variant font-medium hover:text-on-surface",
                )}
              >
                {t("whatsNew.filter_all")}
              </button>
            </div>
            {anyUnseen && (
              <button
                type="button"
                onClick={handleMarkAllSeen}
                className="text-xs font-medium text-accent hover:underline cursor-pointer"
              >
                {t("whatsNew.mark_all_seen")}
              </button>
            )}
          </div>
        </div>

        {/* Praise, summarised. Nothing here asks anything of you. */}
        {encouraged.count > 0 && (
          <p className="text-xs text-on-surface-variant m-0 flex items-center gap-1.5">
            <Heart className="w-3.5 h-3.5 text-stage-accent shrink-0" />
            {(encouraged.count > encouraged.names.length
              ? t("whatsNew.encouraged_you_many").replace("{n}", String(encouraged.count))
              : t("whatsNew.encouraged_you")
            ).replace("{names}", encouraged.names.join(", "))}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div
            role="group"
            aria-label={t("whatsNew.filter_by_team")}
            className="inline-flex flex-wrap gap-1 p-1 rounded-full bg-surface-container-low border border-outline-variant"
          >
            <button
              type="button"
              onClick={() => setTeam(null)}
              aria-pressed={!team}
              className={cn(
                "text-[13px] px-3 py-1.5 rounded-full transition-colors cursor-pointer",
                !team ? "bg-background text-on-surface" : "text-on-surface-variant hover:text-on-surface",
              )}
            >
              {t("teams.everyone")}
            </button>
            {TEAMS.map((tm) => (
              <button
                key={tm.id}
                type="button"
                onClick={() => setTeam(tm.id)}
                aria-pressed={team === tm.id}
                className={cn(
                  "text-[13px] px-3 py-1.5 rounded-full transition-colors cursor-pointer",
                  team === tm.id
                    ? "bg-background text-on-surface"
                    : "text-on-surface-variant hover:text-on-surface",
                )}
              >
                {t(teamLabelKey(tm.id), tm.label)}
              </button>
            ))}
          </div>

          <label
            className={cn(
              "inline-flex items-center gap-2 h-10 pl-3 pr-2 rounded-full bg-surface border text-sm text-on-surface focus-within:border-primary transition-colors",
              who ? "border-primary" : "border-outline-variant",
            )}
          >
            <Users className="w-3.5 h-3.5 text-on-surface-variant shrink-0" />
            <select
              value={who ?? "all"}
              onChange={(e) => setPickedWho(e.target.value === "all" ? null : e.target.value)}
              aria-label={t("whatsNew.filter_by_person")}
              className="bg-transparent outline-none pr-1 text-on-surface cursor-pointer"
            >
              <option value="all">
                {team
                  ? t("whatsNew.whole_named_team").replace("{team}", teamLabel)
                  : t("whatsNew.whole_team")}
              </option>
              {teammateOptions.map((o) => (
                <option key={o.uid} value={o.uid}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>

          {!resting && (
            <button
              type="button"
              onClick={clearFilter}
              className="text-xs font-medium text-accent hover:underline cursor-pointer"
            >
              {t("whatsNew.clear")}
            </button>
          )}
        </div>
      </div>

      {/* The feed can be filtered down to nothing. Say so — vanishing reads as
          a bug, not as a filter. */}
      {stacks.length === 0 ? (
        <div className="bg-surface border border-outline-variant/60 rounded-3xl px-6 py-11 text-center flex flex-col items-center gap-3.5">
          <div className="flex flex-col gap-1">
            <h3 className="font-serif text-xl text-on-surface font-semibold m-0">
              {newOnly && resting
                ? t("whatsNew.nothing_new")
                : who
                  ? t("whatsNew.nothing_from_person").replace("{name}", whoName)
                  : t("whatsNew.nothing_from_team").replace("{team}", teamLabel)}
            </h3>
            <p className="text-sm text-on-surface-variant m-0">
              {newOnly && resting
                ? t("whatsNew.try_all")
                : who && team
                  ? t("whatsNew.try_whole_team").replace("{team}", teamLabel)
                  : t("whatsNew.try_everyone")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => (newOnly && resting ? setNewOnly(false) : clearFilter())}
            className="px-3.5 py-1.5 rounded-full border border-outline-variant bg-background text-[13px] font-medium text-on-surface hover:bg-surface-variant transition-colors cursor-pointer"
          >
            {newOnly && resting ? t("whatsNew.show_all") : t("whatsNew.show_everyone")}
          </button>
        </div>
      ) : (
        <div
          className={cn(
            isSingleColumn
              ? "flex flex-col gap-6"
              : "grid grid-cols-1 lg:grid-cols-12 gap-6 items-start",
          )}
        >
          {/* ── Left Column: "On you" ── */}
          <section
            aria-label={t("whatsNew.on_you")}
            className={cn(
              "bg-surface border border-outline-variant/60 rounded-3xl p-5 sm:p-6 flex flex-col gap-4 shadow-xs",
              !isSingleColumn && "lg:col-span-6",
            )}
          >
            <div className="flex items-baseline justify-between gap-3 flex-wrap border-b border-outline-variant/40 pb-3">
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <h3 className="font-serif text-lg text-on-surface font-semibold m-0">
                  {t("whatsNew.on_you")}
                </h3>
                <span className="text-xs text-on-surface-variant">
                  {onYou.length === 0
                    ? t("whatsNew.nothing_waiting")
                    : t(onYou.length === 1 ? "whatsNew.because_you_carry_one" : "whatsNew.because_you_carry").replace(
                        "{n}",
                        String(onYou.length),
                      )}
                </span>
                {onYouOpen > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-accent/15 text-accent">
                    {t("whatsNew.to_work_through").replace("{n}", String(onYouOpen))}
                  </span>
                )}
              </div>
            </div>

            {onYou.length === 0 ? (
              <p className="text-xs text-on-surface-variant italic py-2">
                {t("whatsNew.all_clear_here")}
              </p>
            ) : (
              <div className="flex flex-col gap-5">{onYouGroups.map(renderCards)}</div>
            )}

            {hiddenOnYouCount > 0 && !showAllOnYou && (
              <button
                type="button"
                onClick={() => setShowAllOnYou(true)}
                className="mt-1 py-1.5 text-xs font-medium text-accent hover:underline text-center cursor-pointer"
              >
                {t(
                  hiddenOnYouCount === 1 ? "whatsNew.show_more_person" : "whatsNew.show_more_people",
                ).replace("{n}", String(hiddenOnYouCount))}
              </button>
            )}

            {showAllOnYou && onYou.length > COLLAPSED_LIMIT && (
              <button
                type="button"
                onClick={() => setShowAllOnYou(false)}
                className="mt-1 py-1.5 text-xs font-medium text-accent hover:underline text-center cursor-pointer"
              >
                {t("whatsNew.show_less")}
              </button>
            )}
          </section>

          {/* ── Right Column: "Around the team" ── */}
          {!isSingleColumn && (
            <section
              aria-label={t("whatsNew.around_the_team")}
              className="bg-surface border border-outline-variant/60 rounded-3xl p-5 sm:p-6 flex flex-col gap-4 shadow-xs lg:col-span-6"
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap border-b border-outline-variant/40 pb-3">
                <div className="flex items-baseline gap-2.5 flex-wrap">
                  <h3 className="font-serif text-lg text-on-surface font-semibold m-0">
                    {t("whatsNew.around_the_team")}
                  </h3>
                  {aroundTeamOpen > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-accent/15 text-accent">
                      {t("whatsNew.to_work_through").replace("{n}", String(aroundTeamOpen))}
                    </span>
                  )}
                  <span className="text-xs text-on-surface-variant">
                    {t("whatsNew.around_the_team_sub")}
                  </span>
                </div>
              </div>

              {aroundTeam.length === 0 ? (
                <p className="text-xs text-on-surface-variant italic py-2">
                  {t("whatsNew.no_team_touches")}
                </p>
              ) : (
                <div className="flex flex-col gap-5">{aroundTeamGroups.map(renderCards)}</div>
              )}

              {hiddenTeamCount > 0 && !showAllTeam && (
                <div className="mt-2 pt-3 border-t border-dashed border-outline-variant flex items-center justify-between gap-3">
                  <span className="text-xs text-on-surface-variant">
                    {t(
                      hiddenTeamCount === 1
                        ? "whatsNew.older_update_across_team"
                        : "whatsNew.older_updates_across_team",
                    ).replace("{n}", String(hiddenTeamCount))}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAllTeam(true)}
                    className="px-3 py-1 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors cursor-pointer"
                  >
                    {t("whatsNew.show_them")}
                  </button>
                </div>
              )}

              {showAllTeam && aroundTeam.length > COLLAPSED_LIMIT && (
                <button
                  type="button"
                  onClick={() => setShowAllTeam(false)}
                  className="mt-1 py-1.5 text-xs font-medium text-accent hover:underline text-center cursor-pointer"
                >
                  {t("whatsNew.show_less")}
                </button>
              )}
            </section>
          )}
        </div>
      )}

      <UndoSnackbar undoSnack={undoSnack} onClose={closeUndoSnack} />
    </section>
  );
}
