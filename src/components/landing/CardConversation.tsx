import React, { useEffect, useMemo, useState } from "react";
import { cn } from "../../lib/utils";
import type { Contact } from "../../types";
import Thread, { firstName, type TeamMemberLike } from "../Thread";
import { countFor, type ThreadMessage } from "../../lib/threads";
import { useLanguage } from "../LanguageProvider";

// ── The conversation strip on a card (#1012) ────────────────────────────────
// "Around the team" told a Full-timer *that* something happened and never
// *what was said*. It subscribed to every thread in the product and rendered
// none of them: pressing Comment wrote a real message that then appeared
// nowhere, because `buildAttentionItems` drops thread items on contacts the
// reader is not tied to. The only feedback for writing was the card going
// dimmer (#966).
//
// The strip is a reader on the card, not a change to the feed. It renders from
// the messages the page already holds and passes down — `buildAttentionItems`
// and `partitionAttentionStacks` are untouched, so no stack moves between
// "On you" and "Around the team" (ADR 0015 decision 6, ADR 0022 decision 7).
//
// It carries both of the contact's staff threads as tabs, in the order the
// contact detail page uses, and reuses that page's renderer rather than
// growing a second one — so mentions and the compose-kind picker
// come along unchanged. The composer writes into whichever tab is open, which
// is the one genuinely new capability and the one risk worth naming: the two
// audiences differ in exactly the way that matters, so the strip says whose
// eyes a message will reach before Post is pressed.

/** How long a just-posted message wears its marker. Long enough to find it,
 *  short enough that it is not a second unread state. */
const JUST_POSTED_MS = 8_000;

type Tab = "conversation" | "team";

/**
 * What a card knows about a contact's threads: the messages the page holds,
 * plus the ones the reader has just written.
 *
 * The page's subscription is live, so a posted message does arrive on its own
 * — but only after a round trip, and the whole point of #966 is that the
 * appearing message *is* the confirmation. So the writer's own message shows
 * at once under a placeholder id, and when the write returns the real id the
 * twin takes it on. The subscription then delivers a document the twin already
 * answers to, and it drops out by identity.
 *
 * Matching on the words instead would confuse two identical messages for one:
 * post "ok" twice and the second would vanish until its own write returned.
 *
 * This lives beside the strip rather than inside it because the count on the
 * action row's toggle has to agree with it: a message that appeared in the
 * strip while the button still read "Comment" would be two signals
 * contradicting each other over the same fact.
 */
export function useCardThread(threads: ThreadMessage[]) {
  const [pending, setPending] = useState<ThreadMessage[]>([]);
  const [justPosted, setJustPosted] = useState<ReadonlySet<string>>(new Set());

  const messages = useMemo(() => {
    // An encouragement is a heart, not a contribution to the conversation:
    // it stays summarised on the card and never pads the thread out (#1012
    // story 17). It is excluded from the count on the toggle for the same
    // reason — four hearts must not read as four things someone said.
    const said = threads.filter((m) => m.kind !== "encouragement");
    const landed = new Set(said.map((m) => m.id));
    const twinless = pending.filter((m) => !landed.has(m.id));
    return [...said, ...twinless].sort((a, b) => a.at.localeCompare(b.at));
  }, [threads, pending]);

  useEffect(() => {
    if (justPosted.size === 0) return;
    const timer = setTimeout(() => setJustPosted(new Set()), JUST_POSTED_MS);
    return () => clearTimeout(timer);
  }, [justPosted]);

  const notePosted = (m: ThreadMessage, landed: Promise<string | null>) => {
    setPending((prev) => [...prev, m]);
    setJustPosted((prev) => new Set([...prev, m.id]));
    // The twin takes on the real id, so the arriving document replaces it
    // rather than doubling it — and the "Just posted" marker, which is keyed
    // on the id, survives the swap instead of vanishing on the round trip.
    void landed.then((realId) => {
      if (!realId) return;
      setPending((prev) => prev.map((x) => (x.id === m.id ? { ...x, id: realId } : x)));
      setJustPosted((prev) => {
        if (!prev.has(m.id)) return prev;
        const next = new Set(prev);
        next.delete(m.id);
        next.add(realId);
        return next;
      });
    });
  };

  return { messages, justPosted, notePosted };
}

export function CardConversation({
  contact,
  uid,
  messages,
  justPosted,
  onPosted,
  teamMembers,
}: {
  contact: Contact;
  uid: string;
  /** From `useCardThread` — the page's messages plus the reader's own. */
  messages: ThreadMessage[];
  justPosted: ReadonlySet<string>;
  onPosted: (message: ThreadMessage, landed: Promise<string | null>) => void;
  teamMembers?: TeamMemberLike[];
}) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>("conversation");

  const conversationCount = countFor(messages, null, null);
  const teamCount = countFor(messages, null, "team");

  const who = firstName(contact.name);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "conversation", label: t("modals.contactDetails.follow_up"), count: conversationCount },
    { id: "team", label: t("modals.contactDetails.discussion"), count: teamCount },
  ];

  return (
    <div className="mt-3 pt-3 border-t border-outline-variant/60">
      <div
        role="tablist"
        aria-label={t("whatsNew.which_thread")}
        className="inline-flex gap-0.5 p-0.5 rounded-full bg-surface-variant"
      >
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            role="tab"
            aria-selected={tab === tb.id}
            onClick={() => setTab(tb.id)}
            className={cn(
              // A comfortable target on a phone, where the page renders the
              // same strip on the same card, and the compact pill from the
              // width the filter row uses upward.
              "rounded-full text-[11.5px] transition-colors cursor-pointer px-3 min-h-11 sm:min-h-0 sm:py-1",
              tab === tb.id
                ? "bg-surface text-on-surface font-semibold shadow-xs"
                : "text-on-surface-variant font-medium hover:text-on-surface",
            )}
          >
            {tb.label}
            {tb.count > 0 && <span className="ml-1 tabular-nums opacity-70">{tb.count}</span>}
          </button>
        ))}
      </div>

      {/* Whose eyes this reaches, said before Post rather than after. The two
          audiences differ in exactly the way that matters: one is everyone
          tied to the person, the other is staff only. */}
      <p className="text-[11px] text-on-surface-variant/80 mt-2 mb-2">
        {tab === "team"
          ? t("whatsNew.audience_full_timers")
          : t("whatsNew.audience_conversation").replace("{name}", who)}
      </p>

      {/* Keyed on the tab, so switching audience starts a fresh composer: a
          half-written note for staff must not follow the reader into the
          thread everyone tied to the person can read. */}
      <Thread
        key={tab}
        contactId={contact.id}
        interactionId={null}
        scope={tab === "team" ? "team" : null}
        meStaffId={uid}
        contactName={contact.name}
        compact
        teamMembers={teamMembers}
        messages={messages}
        highlightIds={justPosted}
        highlightLabel={t("whatsNew.just_posted")}
        contactStakeholders={{
          createdBy: contact.createdBy ?? null,
          coCreators: contact.coCreators ?? null,
        }}
        onPosted={onPosted}
      />
    </div>
  );
}

export default CardConversation;
