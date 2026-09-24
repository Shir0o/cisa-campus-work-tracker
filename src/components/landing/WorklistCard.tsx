import React, { useState } from "react";
import {
  Users,
  MessageSquare,
  HelpCircle,
  Heart,
  Mail,
  Phone,
  Bell,
  Check,
  ClipboardList,
  ChevronDown,
  ChevronRight,
  Send,
} from "lucide-react";
import { cn, relTime } from "../../lib/utils";
import type { Contact } from "../../types";
import { Avatar } from "./primitives";
import {
  attentionPhrase,
  soleTeamOf,
  worklistVerbFor,
  openAsksIn,
  wantsAReply,
  type AttentionStack,
  type AttentionItem,
  type WorklistVerb,
  type WorklistBucket,
} from "../../lib/attention";
import { teamLabelKey } from "../../lib/teams";
import { useLanguage } from "../LanguageProvider";
import { InboxState } from "../../lib/inboxState";
import { Translate } from "../Translate";
import { COMPOSE_KINDS, ComposeKindPicker, type ComposeKind } from "../ComposeKindPicker";
import {
  addThreadMessage,
  closeFollowUpAsk,
  countFor,
  daysOpen,
  reopenFollowUpAsk,
  type ThreadMessage,
} from "../../lib/threads";
import { CardConversation, useCardThread } from "./CardConversation";
import type { TeamMemberLike } from "../Thread";
import KindChip from "../ui/KindChip";

// ── The worklist card (#813, #1012) ─────────────────────────────────────────
// Two independent facts per card, on "On you":
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
// "Around the team" keeps only the deliberate half. There, one state —
// **Reviewed** — is set by the card's own button and by "Mark all reviewed",
// and by nothing else: not by opening the person, not by writing to them. That
// is the `reviewedOnly` prop, and it is a prop rather than a rule inside this
// component precisely so that "On you" keeps both axes, all four verbs, the
// no-button case and the dot (ADR 0022 decision 8; ADR 0015 decision 5 warned
// against one component carrying two pages' worth of behaviour).
//
// Drawn in docs/design/followup-reach/Inbox.dc.html and
// docs/design/around-conversation/ — including the verb table below, which
// exists because "I followed up" on a card about a note claims you texted the
// student, which you did not.

/** A stable empty list, so a card with no messages does not rebuild its view
 *  of the conversation on every render. */
const EMPTY_MESSAGES: ThreadMessage[] = [];

const IBX_ENCOURAGE: Record<string, string> = {
  "❤️": "Love seeing this! Praying for your next step with them.",
};

const NODE: Record<string, { cls: string; Icon: typeof Users }> = {
  contact: { cls: "text-stage-teal bg-stage-teal-soft", Icon: Users },
  interaction: { cls: "text-stage-accent bg-stage-accent-soft", Icon: MessageSquare },
  thread: { cls: "text-stage-amber bg-stage-amber-soft", Icon: HelpCircle },
  task: { cls: "text-stage-violet bg-stage-violet-soft", Icon: ClipboardList },
  notification: { cls: "text-stage-accent bg-stage-accent-soft", Icon: Bell },
};

/** One word per completion, chosen by what the card is about. */
export const VERB_LABEL: Record<WorklistVerb, string> = {
  reviewed: "whatsNew.verb_reviewed",
  answered: "whatsNew.verb_answered",
  followedUp: "whatsNew.verb_followed_up",
  gotIt: "whatsNew.verb_got_it",
};

/** What the Undo snackbar says, in the same word as the button that ran. */
export const VERB_SNACK: Record<WorklistVerb, string> = {
  reviewed: "whatsNew.snack_reviewed",
  answered: "whatsNew.snack_answered",
  followedUp: "whatsNew.snack_followed_up",
  gotIt: "whatsNew.snack_got_it",
};

export const GROUP_LABEL: Record<WorklistBucket, string> = {
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

export function WorklistCard({
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
  showReach,
  reviewedOnly,
  threads,
  teamMembers,
  conversationOpen,
  onToggleConversation,
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
  showReach?: boolean;
  /** One state on this card — Reviewed — instead of two (#1012). No accent
   *  dot, no seen-based dimming, and neither opening the person nor writing to
   *  them records anything: a glance is not the same as having dealt with
   *  someone. "Around the team" passes this; "On you" never does. */
  reviewedOnly?: boolean;
  /** Every message on this contact, from the page's own subscription. Given
   *  together with `onToggleConversation`, the action row's Comment button
   *  becomes `Conversation · N` and toggles the strip (#1012). */
  threads?: ThreadMessage[];
  teamMembers?: TeamMemberLike[];
  /** The page owns which card is expanded, so opening a second closes the
   *  first — a top-aligned three-up grid strands its neighbours otherwise. */
  conversationOpen?: boolean;
  onToggleConversation?: () => void;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [reactOpen, setReactOpen] = useState(false);

  // The strip replaces the swap-in composer when the page hands down both the
  // messages to read and the ownership of which card is open.
  const hasStrip = !!(onToggleConversation && stack.contactId && contact);
  const stripOpen = hasStrip && !!conversationOpen && !completed;
  // The card's own view of the conversation, so the count on the toggle and
  // the messages in the strip are one fact rather than two.
  const { messages, justPosted, notePosted } = useCardThread(threads ?? EMPTY_MESSAGES);
  const conversationCount = countFor(messages, null, null);
  // Under one state every un-reviewed card would carry a dot, so a dot would
  // mark nothing. The pill carries the count; the dimmed treatment marks the
  // reviewed ones.
  const showDot = !reviewedOnly && !stack.seen && !completed;

  const newest = stack.items[0];
  const verb = worklistVerbFor(stack);
  const openAsks = openAsksIn(stack);
  const hasOpenAsk = openAsks.length > 0;
  const rowTeam = soleTeamOf(stack);

  const phrases = stack.items.slice(0, 3).map((it) => attentionPhrase(it, staffNameMap));
  const moreCount = stack.items.length - phrases.length;
  if (hasOpenAsk) phrases.push(t("whatsNew.nobody_yet"));
  else if (!reviewedOnly && stack.seen && !completed) phrases.push(t("whatsNew.opened_not_finished"));

  const latestText =
    newest.type === "thread"
      ? newest.body
      : newest.type === "contact"
        ? contact?.notes || ""
        : newest.body || contact?.notes || "";

  const openThem = () => {
    // Seen is set here and only here — opening the person is the whole of it.
    // Except where the page keeps one state: there, opening is a glance, and
    // recording a glance as having dealt with someone would make the count a
    // lie (#1012).
    if (!reviewedOnly) InboxState.markSeen(uid, stack.id);
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
          : !reviewedOnly && stack.seen
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
              {showDot && (
                <span className="w-2 h-2 rounded-full bg-accent shrink-0 inline-block" />
              )}
              {/* Without this, a teammate adding a Local saint reads exactly
                  like one adding a student met on campus (#1152). */}
              {contact && <KindChip contact={contact} />}
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
            /* The two-line clamp exists so collapsed cards tile evenly in
             * the three-up grid. An open card has left that constraint, so
             * the same gesture that reveals the strip unclamps the body —
             * which is the long interaction note that used to cost the
             * reader their filters (#965). */
            <Translate
              as="p"
              className={cn(
                "text-xs text-on-surface-variant/90 mt-1 whitespace-pre-line bg-surface-variant/40 rounded-lg p-2",
                !stripOpen && "line-clamp-2",
              )}
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
                  /* The same control, carrying a count and toggling the strip
                     rather than swapping itself for a composer. Nothing is
                     added to the action row, and with no messages it still
                     reads "Comment" — a zero is never displayed as a count. */
                  <button
                    type="button"
                    aria-expanded={hasStrip ? stripOpen : undefined}
                    onClick={() => (hasStrip ? onToggleConversation!() : setComposing((v) => !v))}
                    className={cn(
                      "inline-flex items-center justify-center gap-1.5 px-3 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors cursor-pointer",
                      mobile ? "min-h-11" : "py-1.5",
                    )}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    {hasStrip
                      ? conversationCount > 0
                        ? t("whatsNew.conversation_n").replace("{n}", String(conversationCount))
                        : t("whatsNew.comment")
                      : wantsAReply(stack)
                        ? t("whatsNew.write_back")
                        : t("whatsNew.comment")}
                  </button>
                )}
                {showReach && contact && contact.phone && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(`tel:${contact.phone}`);
                    }}
                    className={cn(
                      "inline-flex items-center justify-center gap-1.5 px-3 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors cursor-pointer",
                      mobile ? "min-h-11" : "py-1.5",
                    )}
                  >
                    <Phone className="w-3.5 h-3.5" /> {t("whatsNew.reach_call")}
                  </button>
                )}
                {showReach && contact && contact.email && (
                  <a
                    href={`mailto:${contact.email}`}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      "inline-flex items-center justify-center gap-1.5 px-3 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors cursor-pointer",
                      mobile ? "min-h-11" : "py-1.5",
                    )}
                  >
                    <Mail className="w-3.5 h-3.5" /> {t("whatsNew.reach_email")}
                  </a>
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

      {stripOpen && contact && (
        <CardConversation
          contact={contact}
          uid={uid}
          messages={messages}
          justPosted={justPosted}
          teamMembers={teamMembers}
          onPosted={(m, landed) => {
            notePosted(m, landed);
            // The message appearing is the confirmation; the toast is a
            // second, quieter one (ADR 0022).
            onToast?.(t("whatsNew.posted"));
          }}
        />
      )}

      {!hasStrip && composing && contact && !completed && (
        <CardComposer
          contact={contact}
          uid={uid}
          meName={meName}
          mobile={mobile}
          onCancel={() => setComposing(false)}
          onPosted={() => {
            setComposing(false);
            // Writing to someone is not the same as being finished with them,
            // so the page that keeps one state records nothing here (#1012).
            if (!reviewedOnly) InboxState.markSeen(uid, stack.id);
            onToast?.(t("whatsNew.posted"));
          }}
        />
      )}
    </div>
  );
}
