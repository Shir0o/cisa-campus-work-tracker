// Mobile v2 — one component, one branch per card kind. Ported from the design
// project's views/mobile/cards.jsx; every mutation goes through the same data
// modules the rest of the app writes with, so the desktop screens agree.
import React from 'react';
import { View } from 'react-native';
import {
  THREAD_REACTIONS,
  agoPhrase,
  daysAgoWords,
  firstName,
  personSubLine,
  prayerCarryLine,
  roleLabel,
  type QueueCard as QueueCardData,
} from '@cisa/core';
import { FocusCard } from './FocusCard';
import {
  AboutChip,
  Ask,
  Lead,
  LaterButton,
  NoteBlock,
  PrimaryButton,
  Quote,
  Reactions,
  Said,
  SecondaryButton,
  WhoBlock,
  Why,
} from './atoms';

export interface QueueCardApi {
  /** Can this role actually open The Board? A trainee can't, so the due card
   *  hides the button rather than offering a door that doesn't open. */
  canBoard: boolean;
  /** Dealt with — gone from the queue for the day. */
  handle: (cardId: string) => void;
  /** Not now — back of the queue. */
  later: (cardId: string) => void;
  markDone: (taskId: string) => void;
  pushToTomorrow: (taskId: string) => void;
  openBoardDoc: (docId?: string | null) => void;
  openContact: (contactId: string, tab?: 'thread' | 'prayer') => void;
  openReply: (card: QueueCardData) => void;
  openLog: (card: QueueCardData) => void;
  react: (card: QueueCardData, emoji: string) => void;
  text: (card: QueueCardData) => void;
}

export function QueueCard({
  card,
  me,
  api,
  header,
}: {
  card: QueueCardData;
  me: string;
  api: QueueCardApi;
  header?: React.ReactNode;
}) {
  const c = card.contact;
  const first = c ? firstName(c.name) : '';
  const later = () => api.later(card.id);

  // ── a to-do off The Board, due now ────────────────────────────────────────
  if (card.kind === 'due' && card.task) {
    const t = card.task;
    return (
      <FocusCard
        tone="due"
        label={card.label}
        ago={card.ago}
        header={header}
        onSwipeAway={later}
        foot={
          <>
            <PrimaryButton title="Mark it done" onPress={() => api.markDone(t.id)} />
            {api.canBoard && (
              <SecondaryButton
                title={t.sourceDocId ? 'Open the page' : 'Open The Board'}
                onPress={() => api.openBoardDoc(t.sourceDocId)}
              />
            )}
            <LaterButton label="Push to tomorrow" onPress={() => api.pushToTomorrow(t.id)} />
          </>
        }
      >
        <Lead>{t.title}</Lead>
        <Why>
          {t.createdByName
            ? `${firstName(t.createdByName)} put this on the page and put your name on it.`
            : 'This one has your name on it.'}
          {/* Naming a page they can't open just raises a question they can't
              answer — the design gates this line on canBoard too. */}
          {t.sourceDocTitle && api.canBoard ? ` It came from ${t.sourceDocTitle}.` : ''}
        </Why>
        <NoteBlock label="Why it matters today">
          Small promises are how people learn they're remembered. This is one of them.
        </NoteBlock>
      </FocusCard>
    );
  }

  // ── a message from the full-timer who cares for you ──────────────────────
  if (card.kind === 'msg' && card.msg) {
    const m = card.msg;
    const mine = (m.reactions || []).filter((r) => r.by === me).map((r) => r.emoji);
    return (
      <FocusCard
        tone="ask"
        label={card.label}
        ago={card.ago}
        header={header}
        onSwipeAway={later}
        foot={
          <>
            <PrimaryButton title="Write back" onPress={() => api.openReply(card)} />
            {!!c && <SecondaryButton title={`Open ${first}`} onPress={() => api.openContact(c.id, 'thread')} />}
            <LaterButton onPress={later} />
          </>
        }
      >
        <WhoBlock name={m.fromName} id={m.from} sub={`${roleLabel('admin')} · cares for you`} />
        <Quote>{m.body}</Quote>
        {!!c && <AboutChip name={c.name} id={c.id} detail={c.stage} onPress={() => api.openContact(c.id, 'thread')} />}
        <Reactions options={THREAD_REACTIONS} mine={mine} onPick={(e) => api.react(card, e)} />
      </FocusCard>
    );
  }

  // ── you said you'd follow up ─────────────────────────────────────────────
  if (card.kind === 'follow' && c && card.task) {
    return (
      <FocusCard
        tone="follow"
        label={card.label}
        ago={card.ago}
        header={header}
        onSwipeAway={later}
        foot={
          <>
            <PrimaryButton tone="warm" title={`Text ${first}`} onPress={() => api.text(card)} />
            <SecondaryButton title="Log what happened" onPress={() => api.openLog(card)} />
            <LaterButton onPress={later} />
          </>
        }
      >
        <WhoBlock name={c.name} id={c.id} sub={[personSubLine(c), c.pronouns].filter(Boolean).join(' · ')} />
        <Ask>{card.task.title}</Ask>
        {!!card.last && (
          <Why>
            You {agoPhrase(card.last)} — {card.last.content.split('. ')[0].toLowerCase()}. Nothing since.
          </Why>
        )}
        {!!c.notes && <NoteBlock label="What you wrote down">{c.notes}</NoteBlock>}
      </FocusCard>
    );
  }

  // ── gone quiet ───────────────────────────────────────────────────────────
  if (card.kind === 'quiet' && c) {
    const met = c.createdAt ? daysAgoWords(c.createdAt) : null;
    return (
      <FocusCard
        tone="follow"
        label={card.label}
        ago={card.ago}
        header={header}
        onSwipeAway={later}
        foot={
          <>
            <PrimaryButton tone="warm" title={`Text ${first}`} onPress={() => api.text(card)} />
            <SecondaryButton title="Log what happened" onPress={() => api.openLog(card)} />
            <LaterButton onPress={later} />
          </>
        }
      >
        <WhoBlock name={c.name} id={c.id} sub={[personSubLine(c), c.pronouns].filter(Boolean).join(' · ')} />
        <Ask>Reach out to {first} today.</Ask>
        <Why>
          {met ? `You met ${first} ${met}` : `You brought ${first} in`}
          {card.last ? ` and ${agoPhrase(card.last)}` : ''}. Nothing since. Early on, the second and third message are
          the ones that decide whether someone comes back.
        </Why>
        {!!c.notes && <NoteBlock label="What you wrote down">{c.notes}</NoteBlock>}
      </FocusCard>
    );
  }

  // ── a prayer to carry ────────────────────────────────────────────────────
  if (card.kind === 'pray' && card.prayer) {
    const p = card.prayer;
    return (
      <FocusCard
        tone="pray"
        label={card.label}
        ago={card.ago}
        header={header}
        onSwipeAway={later}
        foot={
          <>
            {/* Marks the card done for today. There is no shared "who prayed"
                record in the schema yet, so this claims nothing more. */}
            <PrimaryButton tone="deep" title="I prayed just now" onPress={() => api.handle(card.id)} />
            {!!c && <SecondaryButton title={`Open ${first}`} onPress={() => api.openContact(c.id, 'prayer')} />}
            <LaterButton onPress={later} />
          </>
        }
      >
        {!!c && <WhoBlock name={c.name} id={c.id} sub={personSubLine(c)} />}
        <Said>“{p.burden}”</Said>
        <Why>{prayerCarryLine(p, { me })}</Why>
      </FocusCard>
    );
  }

  return <View />;
}
