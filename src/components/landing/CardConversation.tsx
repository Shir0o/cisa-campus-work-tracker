import React, { useEffect, useMemo, useState } from "react";
import type { Contact } from "../../types";
import Stream from "../stream/Stream";
import FromEntryTodoComposer from "../todos/FromEntryTodoComposer";
import { conversationAdapter } from "../stream/conversationAdapter";
import type { TeamMemberLike } from "../stream/types";
import type { ThreadMessage } from "../../lib/threads";
import { useAuth } from "../AuthProvider";
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
// It reuses the contact page's Conversation renderer rather than growing a
// second one, so mentions come along unchanged. The Full-timers tab is cut
// (cut-or-keep §24).

/** How long a just-posted message wears its marker. Long enough to find it,
 *  short enough that it is not a second unread state. */
const JUST_POSTED_MS = 8_000;

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
  const { user, role } = useAuth();
  // The message a to-do is being made from (the row toolbar).
  const [todoFrom, setTodoFrom] = useState<string | null>(null);

  // The strip reads through the same adapter as the contact page, over the
  // messages this card was handed — no second subscription (#1012).
  const adapter = conversationAdapter({
    contactId: contact.id,
    contactName: contact.name,
    messages,
    me: { uid, name: user?.displayName || "Someone", role },
    teamMembers: teamMembers ?? [],
    onPosted,
    t,
  });

  return (
    <div className="mt-3 pt-3 border-t border-outline-variant/60">
      {/* A Thread replaces the strip with a back arrow. The audience line sits
          above the box, where it is read before Post rather than after. */}
      <Stream
        adapter={adapter}
        viewer={{ uid, role }}
        threadMode="replace"
        compact
        highlightIds={justPosted}
        onMakeTodo={(m) => setTodoFrom(m.body)}
      />
      {todoFrom !== null && (
        <FromEntryTodoComposer
          text={todoFrom}
          contactId={contact.id}
          contactName={contact.name}
          source={null}
          team={(teamMembers ?? []).map((m) => ({ uid: m.id, name: m.name }))}
          meUid={uid}
          meName={user?.displayName || "Someone"}
          onClose={() => setTodoFrom(null)}
        />
      )}
    </div>
  );
}

export default CardConversation;
