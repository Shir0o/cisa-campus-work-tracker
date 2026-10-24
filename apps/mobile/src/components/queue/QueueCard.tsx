// Mobile v2 — one component, one branch per card kind. Each branch says what
// the card holds once; the card shows it clamped (notes to 3 lines, prayer
// burdens and Full-timer messages to 4, never reworded) and tapping it opens the
// same body in full, with recent history and the same actions at its foot. Ported from the design
// Ported from the design project's views/mobile/cards.jsx; every mutation goes through the same data
// modules the rest of the app writes with, so the desktop screens agree.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  agoPhrase,
  daysAgoWords,
  firstName,
  personSubLine,
  prayerCarryLine,
  roleLabel,
  type Interaction,
  type QueueCard as QueueCardData,
} from '@cisa/core';
import { Sheet } from '../ui';
import { useV2Theme, v2SheetChrome } from '../../theme/v2';
import { useLanguage } from '../../lib/LanguageProvider';
import { FocusCard } from './FocusCard';
import { Translate, useTranslate } from '../Translate';
import {
  AboutChip,
  Ask,
  CardAction,
  CardPrimary,
  Kicker,
  LaterTodayButton,
  Lead,
  NoteBlock,
  Quote,
  Said,
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
  /** `card` is passed from a msg card, so opening the person reads its stream. */
  openContact: (contactId: string, tab?: 'thread' | 'prayer', card?: QueueCardData) => void;
  openReply: (card: QueueCardData) => void;
  /** Read every text on a msg card, nothing written back — done for today. */
  seenIt: (card: QueueCardData) => void;
  openLog: (card: QueueCardData) => void;
  text: (card: QueueCardData) => void;
}

export function QueueCard({
  card,
  me,
  api,
  header,
  history = [],
}: {
  card: QueueCardData;
  me: string;
  api: QueueCardApi;
  header?: React.ReactNode;
  /** Recent conversations with this card's person, newest first — sheet only. */
  history?: Interaction[];
}) {
  const { c: pal, font, radius, fs } = useV2Theme();
  const { t: tr } = useLanguage();
  const c = card.contact;
  const first = c ? firstName(c.name) : '';
  const later = () => api.later(card.id);
  const { translatedText: translatedNotes } = useTranslate(c?.notes);
  // The sheet mounts on first open and stays, so closing it can animate.
  const [reading, setReading] = React.useState(false);
  const [opened, setOpened] = React.useState(false);
  const read = () => {
    setOpened(true);
    setReading(true);
  };

  const shape = cardShape();
  if (!shape) return <View />;

  // In the sheet, an action closes it first, so you land back on Today.
  const foot = (inSheet: boolean) => {
    const run = (fn: () => void) => () => {
      if (inSheet) setReading(false);
      fn();
    };
    return (
      <>
        <CardPrimary {...shape.primary} onPress={run(shape.primary.onPress)} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {shape.actions.map((a) => (
            <CardAction key={a.title} {...a} onPress={run(a.onPress)} />
          ))}
          <LaterTodayButton onPress={run(later)} />
        </View>
      </>
    );
  };

  const notes = (full: boolean) =>
    shape.notes &&
    !!c?.notes && (
      <>
        <NoteBlock label={tr('mobile.queue.what_you_wrote_down')} lines={full ? undefined : 3}>
          {translatedNotes}
        </NoteBlock>
        {!full && (
          <Pressable onPress={read} accessibilityRole="link" hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ fontFamily: font.bold, fontSize: fs(14), color: pal.card.link }}>
              {tr('mobile.queue.more_about').replace('{name}', first)}
            </Text>
          </Pressable>
        )}
      </>
    );

  return (
    <>
      <FocusCard
        tone={shape.tone}
        label={card.label}
        ago={card.ago}
        header={header}
        onRead={read}
        readLabel={first ? tr('mobile.queue.read_all_about').replace('{name}', first) : tr('mobile.queue.read_whole_card')}
        foot={foot(false)}
      >
        {shape.body(false)}
        {notes(false)}
      </FocusCard>
      {opened && (
        <Sheet visible={reading} onClose={() => setReading(false)} maxHeightRatio={0.94} {...v2SheetChrome(pal)}
          footer={<View style={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: 18, gap: 10, backgroundColor: pal.card.sheet }}>{foot(true)}</View>}
        >
          <View style={{ paddingHorizontal: 22, paddingBottom: 12 }}>
            {shape.body(true)}
            {notes(true)}
            {history.length > 0 && (
              <View style={{ marginTop: 24, gap: 12 }}>
                <Kicker>{tr('mobile.queue.recent')}</Kicker>
                {history.map((i) => (
                  <View key={i.id} style={{ gap: 3 }}>
                    <Text style={{ fontFamily: font.bold, fontSize: fs(12.5), color: pal.card.ink3 }}>
                      {daysAgoWords(i.dateTime)}
                    </Text>
                    <Text style={{ fontFamily: font.medium, fontSize: fs(15), lineHeight: fs(22), color: pal.card.ink2 }}>
                      {i.content}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </Sheet>
      )}
    </>
  );

  function cardShape(): {
    tone: React.ComponentProps<typeof FocusCard>['tone'];
    body: (full: boolean) => React.ReactNode;
    /** Shows "What you wrote down" — the person cards only. */
    notes?: boolean;
    primary: React.ComponentProps<typeof CardPrimary>;
    actions: React.ComponentProps<typeof CardAction>[];
  } | null {
    // ── a to-do off The Board, due now ──────────────────────────────────────
    if (card.kind === 'due' && card.task) {
      const t = card.task;
      return {
        tone: 'due',
        primary: { title: 'Mark it done', icon: 'checkmark-circle', onPress: () => api.markDone(t.id) },
        actions: [
          ...(api.canBoard
            ? [
                {
                  title: t.sourceDocId ? 'Open the page' : 'Open The Board',
                  icon: 'document-text-outline' as const,
                  onPress: () => api.openBoardDoc(t.sourceDocId),
                },
              ]
            : []),
          { title: 'Push to tomorrow', icon: 'calendar-outline', onPress: () => api.pushToTomorrow(t.id) },
        ],
        body: () => (
          <>
            <Lead><Translate text={t.title} /></Lead>
            <Why>
              {t.createdByName
                ? `${firstName(t.createdByName)} put this on the page and put your name on it.`
                : 'This one has your name on it.'}
              {/* Naming a page they can't open just raises a question they can't
                  answer — the design gates this line on canBoard too. */}
              {t.sourceDocTitle && api.canBoard ? ` It came from ${t.sourceDocTitle}.` : ''}
            </Why>
          </>
        ),
      };
    }

    // ── a message from the full-timer who cares for you ────────────────────
    if (card.kind === 'msg' && card.msg) {
      const m = card.msg;
      // One card per stream (#1793): the featured text leads, the rest fold
      // beneath it. The main button is whatever the texts ask for.
      const rest = (card.msgs ?? []).filter((x) => x.id !== m.id);
      const writers = new Set(rest.map((x) => x.from));
      const restLabel =
        writers.size === 1
          ? tr('mobile.queue.more_from').replace('{count}', String(rest.length)).replace('{name}', firstName(rest[0].fromName))
          : tr('mobile.queue.more_here').replace('{count}', String(rest.length));
      const writeBack = { title: 'Write back', icon: 'chatbubble-outline' as const, onPress: () => api.openReply(card) };
      const seenIt = { title: tr('mobile.queue.seen_it'), icon: 'checkmark' as const, onPress: () => api.seenIt(card) };
      return {
        tone: 'ask',
        primary: card.needsReply ? writeBack : { ...seenIt, tone: 'inverse' },
        actions: [card.needsReply ? seenIt : writeBack],
        body: (full) => (
          <>
            <WhoBlock name={m.fromName} id={m.from} sub={`${roleLabel('admin')} · cares for you`} />
            <Quote lines={full ? undefined : 4}>{m.body}</Quote>
            {rest.length > 0 && (
              <View style={{ marginTop: 16, gap: 8, backgroundColor: pal.card.bg2, borderRadius: radius.note, paddingVertical: 12, paddingHorizontal: 14 }}>
                <Kicker>{restLabel}</Kicker>
                {rest.map((x) => (
                  <Text key={x.id} numberOfLines={full ? undefined : 2} style={{ fontFamily: font.medium, fontSize: fs(14), lineHeight: fs(20), color: pal.card.ink2 }}>
                    {x.body}
                  </Text>
                ))}
              </View>
            )}
            {!!c && <AboutChip name={c.name} id={c.id} detail={c.stage} onPress={() => api.openContact(c.id, 'thread', card)} />}
          </>
        ),
      };
    }

    // ── you said you'd follow up / gone quiet ──────────────────────────────
    if ((card.kind === 'follow' && c && card.task) || (card.kind === 'quiet' && c)) {
      const met = card.kind === 'quiet' && c.createdAt ? daysAgoWords(c.createdAt) : null;
      return {
        tone: 'follow',
        notes: true,
        primary: { title: `Text ${first}`, icon: 'chatbubble-ellipses-outline', tone: 'warm', onPress: () => api.text(card) },
        actions: [{ title: 'Log what happened', icon: 'create-outline', onPress: () => api.openLog(card) }],
        body: () => (
          <>
            <WhoBlock name={c.name} id={c.id} sub={[personSubLine(c), c.pronouns].filter(Boolean).join(' · ')} />
            {card.kind === 'follow' && card.task ? (
              <>
                <Ask>{card.task.title}</Ask>
                {!!card.last && (
                  <Why>
                    You {agoPhrase(card.last)} — {card.last.content.split('. ')[0].toLowerCase()}. Nothing since.
                  </Why>
                )}
              </>
            ) : (
              <>
                <Ask>Reach out to {first} today.</Ask>
                <Why>
                  {met ? `You met ${first} ${met}` : `You brought ${first} in`}
                  {card.last ? ` and ${agoPhrase(card.last)}` : ''}. Nothing since.
                </Why>
              </>
            )}
          </>
        ),
      };
    }

    // ── a prayer to carry ──────────────────────────────────────────────────
    if (card.kind === 'pray' && card.prayer) {
      const p = card.prayer;
      return {
        tone: 'pray',
        // Marks the card done for today. There is no shared "who prayed"
        // record in the schema yet, so this claims nothing more.
        primary: {
          title: c ? `Prayed for ${first}` : 'Prayed for this',
          icon: 'heart-outline',
          tone: 'deep',
          onPress: () => api.handle(card.id),
        },
        actions: c ? [{ title: `Open ${first}`, icon: 'person-outline', onPress: () => api.openContact(c.id, 'prayer') }] : [],
        body: (full) => (
          <>
            {!!c && <WhoBlock name={c.name} id={c.id} sub={personSubLine(c)} />}
            <Said lines={full ? undefined : 4}>“{p.burden}”</Said>
            <Why>{prayerCarryLine(p, { me })}</Why>
          </>
        ),
      };
    }

    return null;
  }
}
