// Mobile v2 — the log sheet. The design's `M2LogSheet` (views/mobile/m2.jsx),
// and the screen mobile v2 exists for: a conversation written down in about
// twenty seconds, from wherever you are.
//
// Four modes, exactly as the design has them:
//   palette — two tiles, plus the people you probably saw today
//   new     — a name, where you met, one line to remember (+ "Fill in the rest")
//   convo   — who, what it was, what you'll want to remember
//   saved   — the quiet second beat: what does caring for them ask next?
//
// The saved step is the design's Aug-2026 revision. Saving no longer just
// toasts and closes: it lands on "Come back to {first}" (a to-do, and a real OS
// nudge on the morning it's due) and "Something to pray for", then Done / Log
// another / Open their page.
import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  FIRST_MET_PRESETS,
  QUICK_CAPTURE_KINDS,
  REMINDER_PRESETS,
  SIGNUP_SPIRITUAL_BACKGROUNDS,
  SIGNUP_YEARS,
  firstMetDate,
  firstName,
  followUpDefaultText,
  logSavedBeat,
  logSheetFootLine,
  newContactFromLog,
  prayerAddedLine,
  quickCaptureRecents,
  quickCaptureSearchMatches,
  reminderDueDate,
  reminderSetLine,
  type Contact,
  type FirstMetPreset,
  type LogSavedBeat,
  type OnCampusWindow,
  type QuickCaptureKindId,
  type ReminderPreset,
} from '@cisa/core';
import { Sheet } from '../ui';
import { useV2Theme, type V2Room } from '../../theme/v2';
import { Kicker, PersonMark, PrimaryButton, SecondaryButton } from '../queue/atoms';
import { Room, V2Input, V2TextArea } from '../v2/Widget';
import { useAuth } from '../../lib/AuthProvider';
import { useActiveSeason } from '../../lib/useActiveSeason';
import { useLogSheetData } from '../../lib/useLogSheetData';
import { addContact } from '../../lib/data/contacts';
import { addInteraction } from '../../lib/data/interactions';
import { addPrayer } from '../../lib/data/prayers';
import { addTodo, setTodoDone } from '../../lib/data/todos';
import { ensureNotificationPermission, scheduleTodoDueNotification } from '../../lib/notifications';

type Mode = 'palette' | 'new' | 'convo' | 'saved';

/** Who the saved step is about, and the words it landed on. */
interface Saved extends LogSavedBeat {
  contactId: string;
  contactName: string;
}

/** Everything the sheet forgets when it reopens, in one place so the reset is
 * one assignment rather than eighteen — and so "Log another" can reuse it
 * instead of growing a second reset path. */
interface Draft {
  mode: Mode;
  contact: Contact | null;
  query: string;
  kind: QuickCaptureKindId;
  body: string;
  name: string;
  where: string;
  note: string;
  // "Fill in the rest" — folded away until it's asked for.
  more: boolean;
  phone: string;
  email: string;
  year: string;
  major: string;
  /** The design's "Part of" → this app's `Contact.role` (its contact group). */
  group: string;
  stage: string;
  background: string;
  met: FirstMetPreset;
}

export interface LogSheetProps {
  visible: boolean;
  onClose: () => void;
  room: V2Room;
  /** Opens straight on the conversation, about this person — the person page's
   * **Log** and the queue's "Log what happened" both already know who. */
  initialContact?: Contact | null;
  /** Skips the palette. People's ＋ New passes `new`, the design's `init.start`. */
  start?: Exclude<Mode, 'palette'>;
  /** The to-do behind a "You said you'd follow up" card. Saving the log keeps
   * the promise, so the to-do is completed with it — the design's `init.taskId`. */
  taskId?: string | null;
  /** The queue card this sheet was opened from — the design's `init.cardId`.
   * Reported back through `onSaved` when the sheet finally closes, so the card
   * is handled once, and not before the saved step is done with. */
  cardId?: string | null;
  /** The caller's own toast, and the card to handle. The design's
   * `onDone(msg, cardId)` — fired on the way OUT, not at save time. */
  onSaved?: (message: string, cardId?: string | null) => void;
  /** The trainee's window, for the palette's foot. Only the queue has one. */
  onCampus?: OnCampusWindow;
  /** "Open {first}'s page →" on the saved step. Omitted by the person screen —
   * you're already there, so the design hides the link. */
  onOpenContact?: (contactId: string) => void;
}

/** Bottom sheets portal to the app root, outside the screen's provider, so this
 * one carries the room itself (the recipe `ContactPrayerSheet` established). */
export function LogSheet(props: LogSheetProps) {
  return (
    <Room room={props.room}>
      <LogSheetBody {...props} />
    </Room>
  );
}

function LogSheetBody({
  visible,
  onClose,
  room,
  initialContact,
  start,
  taskId,
  cardId,
  onSaved,
  onCampus,
  onOpenContact,
}: LogSheetProps) {
  const { c, font, radius, fs } = useV2Theme();
  const { uid, user } = useAuth();
  const season = useActiveSeason();
  const { contacts, stages, touches } = useLogSheetData(visible);

  const blank = (): Draft => ({
    mode: initialContact ? 'convo' : (start ?? 'palette'),
    contact: initialContact ?? null,
    query: '',
    kind: 'gospel',
    body: '',
    name: '',
    where: '',
    note: '',
    more: false,
    phone: '',
    email: '',
    year: '',
    major: '',
    group: '',
    stage: '',
    background: '',
    met: 'today',
  });

  const [draft, setDraft] = useState<Draft>(blank);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // ── the saved step ────────────────────────────────────────────────────────
  const [saved, setSaved] = useState<Saved | null>(null);
  const [expand, setExpand] = useState<'fu' | 'pr' | null>(null);
  const [fuText, setFuText] = useState('');
  const [fuPreset, setFuPreset] = useState<ReminderPreset>('few');
  const [fuSet, setFuSet] = useState<ReminderPreset | null>(null);
  const [burden, setBurden] = useState('');
  const [prSet, setPrSet] = useState(false);
  // The card is held in a ref, not state: `finish()` reads it once on the way
  // out, and "Log another" must not be able to hand the same card back twice.
  const cardRef = useRef<string | null>(cardId ?? null);

  // Reopening starts clean. The queue and the full-timer's home remount this by
  // person (`key`), but the person page and People keep one instance alive.
  //
  // Adjusted during render rather than in an effect (React's own recipe for
  // "reset state when a prop changes") — and only on the way OPEN: resetting on
  // close would blank the sheet's words underneath its dismiss animation.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      resetAll();
      cardRef.current = cardId ?? null;
    }
  }

  const { mode, contact, query, kind, body, name, where, note } = draft;

  // The design's `mine` / `matches`: your people, most recently touched first,
  // narrowed by name once you start typing.
  const mine = quickCaptureRecents(contacts, touches, uid, 6).map((r) => r.contact);
  const matches = query.trim() ? quickCaptureSearchMatches(contacts, query, 6) : mine;

  /** Back to a blank sheet — reopening, and "Log another", are the same reset. */
  function resetAll() {
    setDraft(blank());
    setSaving(false);
    setSaved(null);
    setExpand(null);
    setFuText('');
    setFuPreset('few');
    setFuSet(null);
    setBurden('');
    setPrSet(false);
  }

  /** The design's `land()`: hold what just happened and go quiet for a beat. */
  const land = (beat: LogSavedBeat, contactId: string, contactName: string) => {
    setSaved({ ...beat, contactId, contactName });
    setFuText(followUpDefaultText(contactName));
    setExpand(null);
    set('mode', 'saved');
  };

  /** The design's `finish()`: the toast and the queue card go out HERE, on the
   * way out — not at save time, so "Log another" can't fire them twice. */
  const finish = (openPage: boolean) => {
    const target = saved;
    onSaved?.(target?.toast ?? '', cardRef.current);
    cardRef.current = null;
    onClose();
    if (openPage && target) onOpenContact?.(target.contactId);
  };

  const saveConvo = async () => {
    if (!contact || !uid || saving) return;
    setSaving(true);
    try {
      await addInteraction(
        contact.id,
        contact.name,
        { content: body.trim(), dateTime: new Date().toISOString(), type: kind },
        { uid, name: user?.displayName ?? '', photoURL: user?.photoURL ?? null },
      );
      // A follow-up you said you'd do is a promise; logging it keeps it.
      if (taskId) await setTodoDone(taskId, true);
      const what = QUICK_CAPTURE_KINDS.find((k) => k.id === kind)?.label ?? 'Conversation';
      land(logSavedBeat({ kind: 'convo', name: contact.name, what }), contact.id, contact.name);
    } finally {
      setSaving(false);
    }
  };

  const saveContact = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const id = await addContact(
        newContactFromLog({
          name: trimmed,
          where,
          note,
          stageLabel: draft.stage || stages[0]?.label || 'Unassigned',
          tags: season.tags,
          // Everything below is only ever filled from "Fill in the rest".
          phone: draft.phone,
          email: draft.email,
          year: draft.year,
          major: draft.major,
          group: draft.group,
          background: draft.background,
          metISO: draft.more && draft.met !== 'today' ? firstMetDate(draft.met) : undefined,
        }),
        { uid, name: user?.displayName },
      );
      land(logSavedBeat({ kind: 'contact', name: trimmed, where }), id, trimmed);
    } finally {
      setSaving(false);
    }
  };

  /** "Come back to {first}" — a to-do assigned to me, about them. `contactId`
   * (not `source`, which is the Board-doc link) is what puts it back in the
   * queue as a "You said you'd follow up" card, and what the design means by
   * `about`. The OS nudge is what makes "your phone will nudge you that
   * morning" true rather than a promise the app can't keep. */
  const setFollowUp = async () => {
    if (!saved || !uid || saving) return;
    setSaving(true);
    try {
      const title = fuText.trim() || followUpDefaultText(saved.contactName);
      const dueDate = reminderDueDate(fuPreset);
      await addTodo(
        {
          title,
          assigneeId: uid,
          dueDate,
          contactId: saved.contactId,
          contactName: saved.contactName,
        },
        { uid, name: user?.displayName ?? '' },
      );
      if (await ensureNotificationPermission()) {
        await scheduleTodoDueNotification({ title, dueDate });
      }
      setFuSet(fuPreset);
      setExpand(null);
    } finally {
      setSaving(false);
    }
  };

  const savePrayer = async () => {
    if (!saved || !burden.trim() || saving) return;
    setSaving(true);
    try {
      await addPrayer(
        { contactId: saved.contactId, burden: burden.trim() },
        { uid, name: user?.displayName },
      );
      setPrSet(true);
      setExpand(null);
    } finally {
      setSaving(false);
    }
  };

  const head = (title: string, sub: string) => (
    <>
      <Text style={{ fontFamily: font.extra, fontSize: fs(20), letterSpacing: -0.5, color: c.cardInk }}>
        {title}
      </Text>
      <Text style={{ fontFamily: font.semi, fontSize: fs(13), lineHeight: fs(18), color: c.cardInk3, marginTop: 7 }}>
        {sub}
      </Text>
    </>
  );

  return (
    // A scrim tap on the saved step FINISHES rather than discards: the save
    // already happened, so dismissing it must still toast and hand the card
    // back. The design does the same.
    <Sheet
      visible={visible}
      onClose={mode === 'saved' ? () => finish(false) : onClose}
      maxHeightRatio={0.85}
      backgroundColor={c.card}
    >
      <Room room={room}>
        <View style={{ paddingHorizontal: 18, paddingTop: 4, paddingBottom: 24 }}>
          {mode === 'palette' && (
            <>
              {head('Log as you go', 'Nothing long. You can add the rest tonight.')}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                <Tile
                  icon="new"
                  label="Someone new"
                  caption="Name and where you met — that's it"
                  onPress={() => set('mode', 'new')}
                />
                <Tile
                  icon="convo"
                  label="A conversation"
                  caption="Who, and what you'll want to remember"
                  onPress={() => set('mode', 'convo')}
                />
              </View>

              {mine.length > 0 && (
                <View style={{ marginTop: 20, gap: 10 }}>
                  <Kicker>You saw them today</Kicker>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {mine.slice(0, 3).map((person) => (
                      <Pressable
                        key={person.id}
                        onPress={() => setDraft((d) => ({ ...d, contact: person, mode: 'convo' }))}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                          minHeight: 44,
                          paddingLeft: 7,
                          paddingRight: 14,
                          borderRadius: radius.chip,
                          backgroundColor: c.card2,
                        }}
                      >
                        <PersonMark name={person.name} id={person.id} size={26} radius={13} fontSize={10} />
                        <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.cardInk2 }}>
                          {firstName(person.name)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {!!onCampus && (
                <Text
                  style={{
                    fontFamily: font.semi,
                    fontSize: fs(12),
                    lineHeight: fs(17),
                    color: c.cardInk3,
                    marginTop: 20,
                  }}
                >
                  {logSheetFootLine(onCampus)}
                </Text>
              )}
            </>
          )}

          {mode === 'new' && (
            <>
              {head('Someone new', "Twenty seconds. They'll be yours to follow up.")}

              <View style={{ marginTop: 16, gap: 9 }}>
                <Kicker>Their name</Kicker>
                <V2Input
                  value={name}
                  onChangeText={(v) => set('name', v)}
                  placeholder="First and last, if you got it"
                />
              </View>
              <View style={{ marginTop: 14, gap: 9 }}>
                <Kicker>Where you met</Kicker>
                <V2Input
                  value={where}
                  onChangeText={(v) => set('where', v)}
                  placeholder="Org fair, dorm lounge, the Quad…"
                />
              </View>
              <View style={{ marginTop: 14, gap: 9 }}>
                <Kicker>Anything you'll want to remember</Kicker>
                <V2TextArea
                  value={note}
                  onChangeText={(v) => set('note', v)}
                  placeholder="One line is plenty."
                  minHeight={88}
                />
              </View>

              {/* The design's `.m2-disc` — the fuller picture, folded away
                  until it's asked for. Nothing here is required. */}
              <Disclosure
                open={draft.more}
                onPress={() => set('more', !draft.more)}
                label={draft.more ? "That's plenty for now" : 'Fill in the rest'}
                sub={draft.more ? '' : 'Only if you have it — nothing here is required'}
              />

              {draft.more && (
                <View style={{ gap: 14, marginTop: 14 }}>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1, gap: 9 }}>
                      <Kicker>Phone</Kicker>
                      <V2Input
                        value={draft.phone}
                        onChangeText={(v) => set('phone', v)}
                        placeholder="(000) 000-0000"
                        keyboardType="phone-pad"
                      />
                    </View>
                    <View style={{ flex: 1, gap: 9 }}>
                      <Kicker>Email</Kicker>
                      <V2Input
                        value={draft.email}
                        onChangeText={(v) => set('email', v)}
                        placeholder="name@umail.edu"
                        keyboardType="email-address"
                        autoCapitalize="none"
                      />
                    </View>
                  </View>

                  <ChipField label="Year">
                    {/* SIGNUP_YEARS, not the design's own list — one vocabulary
                        with the sign-up form and the web profile. */}
                    {SIGNUP_YEARS.map((y) => (
                      <Chip
                        key={y}
                        label={y}
                        on={draft.year === y}
                        onPress={() => set('year', draft.year === y ? '' : y)}
                      />
                    ))}
                  </ChipField>

                  <View style={{ gap: 9 }}>
                    <Kicker>Studying</Kicker>
                    <V2Input value={draft.major} onChangeText={(v) => set('major', v)} placeholder="Major" />
                  </View>

                  {/* The design picks "Part of" from a fellowships list this app
                      doesn't have; `Contact.role` IS its contact group, and its
                      own form types that free-hand, so this does too. */}
                  <View style={{ gap: 9 }}>
                    <Kicker>Part of</Kicker>
                    <V2Input
                      value={draft.group}
                      onChangeText={(v) => set('group', v)}
                      placeholder="e.g. Student, Faculty"
                    />
                  </View>

                  {stages.length > 0 && (
                    <ChipField label="Where they're at">
                      {stages.map((s) => (
                        <Chip
                          key={s.id}
                          label={s.label}
                          on={(draft.stage || stages[0]?.label) === s.label}
                          onPress={() => set('stage', s.label)}
                        />
                      ))}
                    </ChipField>
                  )}

                  <ChipField label="Faith, so far">
                    {SIGNUP_SPIRITUAL_BACKGROUNDS.map((b) => (
                      <Chip
                        key={b.value}
                        label={b.label}
                        on={draft.background === b.value}
                        onPress={() => set('background', draft.background === b.value ? '' : b.value)}
                      />
                    ))}
                  </ChipField>

                  <ChipField label="First met">
                    {FIRST_MET_PRESETS.map((p) => (
                      <Chip
                        key={p.key}
                        label={p.label}
                        on={draft.met === p.key}
                        onPress={() => set('met', p.key)}
                      />
                    ))}
                  </ChipField>
                </View>
              )}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton
                    title={saving ? 'Adding…' : `Add ${name.trim() ? firstName(name) : 'them'}`}
                    tone="warm"
                    onPress={() => void saveContact()}
                  />
                </View>
                <View style={{ width: 110 }}>
                  <SecondaryButton title="Back" onPress={() => (start ? onClose() : set('mode', 'palette'))} />
                </View>
              </View>
            </>
          )}

          {mode === 'convo' && !contact && (
            <>
              {head('A conversation', 'Who did you talk with?')}

              <View style={{ marginTop: 16, gap: 9 }}>
                <Kicker>Who</Kicker>
                <V2Input
                  value={query}
                  onChangeText={(v) => set('query', v)}
                  placeholder="Start typing a name"
                />
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                {matches.map((person) => (
                  <Chip key={person.id} label={person.name} on={false} onPress={() => set('contact', person)} />
                ))}
              </View>
              {matches.length === 0 && (
                <Text style={{ fontFamily: font.semi, fontSize: fs(13), color: c.cardInk3, marginTop: 14 }}>
                  No one by that name yet.
                </Text>
              )}

              <View style={{ marginTop: 18 }}>
                <SecondaryButton title="Back" onPress={() => (start ? onClose() : set('mode', 'palette'))} />
              </View>
            </>
          )}

          {mode === 'convo' && !!contact && (
            <>
              {head(`You and ${firstName(contact.name)}`, 'What will you want to remember?')}

              <View style={{ marginTop: 16, gap: 10 }}>
                <Kicker>What it was</Kicker>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {QUICK_CAPTURE_KINDS.map((k) => (
                    <Chip key={k.id} label={k.label} on={kind === k.id} onPress={() => set('kind', k.id)} />
                  ))}
                </View>
              </View>

              <View style={{ marginTop: 16, gap: 9 }}>
                <Kicker>What you'll want to remember</Kicker>
                <V2TextArea
                  value={body}
                  onChangeText={(v) => set('body', v)}
                  placeholder="What they said, what you noticed, what's next."
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton
                    title={saving ? 'Saving…' : 'Save it'}
                    onPress={() => void saveConvo()}
                  />
                </View>
                <View style={{ width: 110 }}>
                  <SecondaryButton
                    title="Back"
                    onPress={() => (initialContact ? onClose() : set('contact', null))}
                  />
                </View>
              </View>
            </>
          )}

          {/* ── the quiet second beat ─────────────────────────────────────── */}
          {mode === 'saved' && !!saved && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: c.green,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontFamily: font.bold, fontSize: fs(16), color: c.onGreen }}>✓</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: font.extra, fontSize: fs(18), letterSpacing: -0.4, color: c.cardInk }}>
                    {saved.head}
                  </Text>
                  <Text style={{ fontFamily: font.semi, fontSize: fs(12.5), color: c.cardInk3, marginTop: 4 }}>
                    {saved.sub}
                  </Text>
                </View>
              </View>

              <View style={{ marginTop: 22, gap: 10 }}>
                <Kicker>While you're here</Kicker>

                {fuSet ? (
                  <DoneRow
                    head={reminderSetLine(fuSet)}
                    sub="It's on your plate. Your phone will nudge you that morning."
                  />
                ) : (
                  <>
                    <Disclosure
                      open={expand === 'fu'}
                      onPress={() => setExpand(expand === 'fu' ? null : 'fu')}
                      label={`Come back to ${firstName(saved.contactName)}`}
                      sub="A nudge, so this doesn't slip past you"
                    />
                    {expand === 'fu' && (
                      <View style={{ gap: 12, paddingTop: 2 }}>
                        <V2Input
                          value={fuText}
                          onChangeText={setFuText}
                          placeholder={followUpDefaultText(saved.contactName)}
                        />
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          {REMINDER_PRESETS.map((p) => (
                            <Chip
                              key={p.key}
                              label={p.label}
                              on={fuPreset === p.key}
                              onPress={() => setFuPreset(p.key)}
                            />
                          ))}
                        </View>
                        <PrimaryButton
                          title={saving ? 'Setting…' : 'Remind me'}
                          onPress={() => void setFollowUp()}
                        />
                      </View>
                    )}
                  </>
                )}

                {prSet ? (
                  <DoneRow {...prayerAddedLine(saved.contactName)} />
                ) : (
                  <>
                    <Disclosure
                      open={expand === 'pr'}
                      onPress={() => setExpand(expand === 'pr' ? null : 'pr')}
                      label="Something to pray for"
                      sub={`Did ${firstName(saved.contactName)} carry anything today?`}
                    />
                    {expand === 'pr' && (
                      <View style={{ gap: 12, paddingTop: 2 }}>
                        <V2Input
                          value={burden}
                          onChangeText={setBurden}
                          placeholder="In their words, if you can"
                        />
                        <PrimaryButton
                          title={saving ? 'Saving…' : 'Start praying'}
                          tone="deep"
                          onPress={() => void savePrayer()}
                        />
                      </View>
                    )}
                  </>
                )}
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton title="Done" onPress={() => finish(false)} />
                </View>
                <View style={{ width: 130 }}>
                  <SecondaryButton title="Log another" onPress={resetAll} />
                </View>
              </View>

              {!!onOpenContact && (
                <Pressable
                  onPress={() => finish(true)}
                  style={({ pressed }) => ({
                    minHeight: 44,
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginTop: 6,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.link }}>
                    Open {firstName(saved.contactName)}'s page →
                  </Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      </Room>
    </Sheet>
  );
}

/** The design's `.m2-disc` / `.m2-sv` — a row that folds something open. Used
 * both for "Fill in the rest" and for the saved step's two offers. */
function Disclosure({
  open,
  onPress,
  label,
  sub,
}: {
  open: boolean;
  onPress: () => void;
  label: string;
  sub: string;
}) {
  const { c, font, radius, fs } = useV2Theme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 56,
        paddingHorizontal: 15,
        paddingVertical: 12,
        marginTop: 14,
        borderRadius: radius.note,
        backgroundColor: c.card2,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: font.bold, fontSize: fs(14), color: c.cardInk }}>{label}</Text>
        {!!sub && (
          <Text style={{ fontFamily: font.semi, fontSize: fs(12), lineHeight: fs(16), color: c.cardInk3, marginTop: 3 }}>
            {sub}
          </Text>
        )}
      </View>
      {/* Drawn, not typed — v2's rule about glyphs on tinted blocks. */}
      <View
        style={{
          width: 9,
          height: 9,
          borderRightWidth: 2,
          borderBottomWidth: 2,
          borderColor: c.cardInk3,
          transform: [{ rotate: open ? '-135deg' : '45deg' }, { translateY: open ? 2 : -2 }],
        }}
      />
    </Pressable>
  );
}

/** What a saved-step offer collapses to once it's been taken. */
function DoneRow({ head, sub }: { head: string; sub: string }) {
  const { c, font, radius, fs } = useV2Theme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 56,
        paddingHorizontal: 15,
        paddingVertical: 12,
        marginTop: 14,
        borderRadius: radius.note,
        backgroundColor: c.note,
      }}
    >
      <Text style={{ fontFamily: font.bold, fontSize: fs(14), color: c.green }}>✓</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: font.bold, fontSize: fs(14), color: c.noteInk }}>{head}</Text>
        <Text style={{ fontFamily: font.semi, fontSize: fs(12), lineHeight: fs(16), color: c.cardInk3, marginTop: 3 }}>
          {sub}
        </Text>
      </View>
    </View>
  );
}

/** A labelled row of pickable words. */
function ChipField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 9 }}>
      <Kicker>{label}</Kicker>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
    </View>
  );
}

/** One of the palette's two doors. The icons are DRAWN, never typed: the design
 * learned the hard way that a literal `+` or `…` on a tinted block renders
 * near-invisible (MOBILE-V2.md, "prefer shapes over glyphs"). */
function Tile({
  icon,
  label,
  caption,
  onPress,
}: {
  icon: 'new' | 'convo';
  label: string;
  caption: string;
  onPress: () => void;
}) {
  const { c, font, radius, fs } = useV2Theme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        gap: 10,
        padding: 14,
        borderRadius: radius.tile,
        backgroundColor: c.card2,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 13,
          backgroundColor: c.inverse,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: icon === 'convo' ? 3 : 0,
        }}
      >
        {icon === 'new' ? (
          <>
            <View style={{ position: 'absolute', width: 15, height: 2.5, borderRadius: 2, backgroundColor: c.onInverse }} />
            <View style={{ position: 'absolute', width: 2.5, height: 15, borderRadius: 2, backgroundColor: c.onInverse }} />
          </>
        ) : (
          [0, 1, 2].map((i) => (
            <View key={i} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c.onInverse }} />
          ))
        )}
      </View>
      <Text style={{ fontFamily: font.bold, fontSize: fs(14.5), color: c.cardInk }}>{label}</Text>
      <Text style={{ fontFamily: font.semi, fontSize: fs(12), lineHeight: fs(16), color: c.cardInk3 }}>
        {caption}
      </Text>
    </Pressable>
  );
}

/** The design's `.m2-chip` — a pickable word. Not `V2Seg`, which is a segmented
 * control over a fixed, always-visible set. */
function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { c, font, radius, fs } = useV2Theme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        minHeight: 40,
        justifyContent: 'center',
        paddingHorizontal: 14,
        borderRadius: radius.chip,
        borderWidth: 1.5,
        borderColor: on ? c.inverse : c.border,
        backgroundColor: on ? c.inverse : 'transparent',
      }}
    >
      <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: on ? c.onInverse : c.cardInk2 }}>
        {label}
      </Text>
    </Pressable>
  );
}
