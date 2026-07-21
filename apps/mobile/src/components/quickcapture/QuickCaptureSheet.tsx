import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  DAY_MS,
  QUICK_CAPTURE_KINDS,
  REMINDER_PRESETS,
  connectedLabel,
  daysSince,
  getUserInitials,
  quickCaptureRecents,
  quickCaptureSearchMatches,
  reminderDueDate,
  type Contact,
  type QuickCaptureKindId,
  type ReminderPreset,
  type Stage,
  type Touch,
} from '@cisa/core';
import { AppText, Avatar, Button, InlineInput, Sheet } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuth } from '../../lib/AuthProvider';
import { useActiveSeason } from '../../lib/useActiveSeason';
import { subscribeContacts, subscribeStages, subscribeTouches, addContact } from '../../lib/data/contacts';
import { addInteraction } from '../../lib/data/interactions';
import { addTodo } from '../../lib/data/todos';
import { addPrayer } from '../../lib/data/prayers';
import { sendNotification } from '../../lib/firebase';

type Step = 'who' | 'newname' | 'note' | 'done';

// The Log tab's Quick Capture flow — "log a moment in seconds". Design
// oracle: the Claude Design project's dedicated mobile file
// views/quick-capture.jsx, NOT the desktop LogInteractionModal.tsx (a
// different, batch multi-contact flow — this is single-contact,
// purpose-built for the tab bar's center FAB). See MIGRATION.md.
export function QuickCaptureSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, radius, spacing } = useTheme();
  const { uid, user } = useAuth();
  const season = useActiveSeason();
  const router = useRouter();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [touches, setTouches] = useState<Touch[]>([]);

  const [step, setStep] = useState<Step>('who');
  const [query, setQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [newName, setNewName] = useState('');

  const [kind, setKind] = useState<QuickCaptureKindId>('gospel');
  const [note, setNote] = useState('');
  // No native date-picker dependency exists in the app (matching the
  // existing task due-date composer's DUE_PRESETS, which also sticks to
  // fixed presets) — a Today/Yesterday toggle covers the realistic "logging
  // this after the fact" case without one.
  const [loggedYesterday, setLoggedYesterday] = useState(false);
  const [saving, setSaving] = useState(false);

  const [savedContact, setSavedContact] = useState<Contact | null>(null);
  const [remindText, setRemindText] = useState('');
  const [remindPreset, setRemindPreset] = useState<ReminderPreset>('tom');
  const [reminderSet, setReminderSet] = useState(false);
  const [remindSubmitting, setRemindSubmitting] = useState(false);
  const [prayerOpen, setPrayerOpen] = useState(false);
  const [prayerText, setPrayerText] = useState('');
  const [prayerSaved, setPrayerSaved] = useState(false);
  const [prayerSubmitting, setPrayerSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const unsubContacts = subscribeContacts(setContacts);
    const unsubStages = subscribeStages(setStages);
    const unsubTouches = subscribeTouches(setTouches);
    return () => {
      unsubContacts();
      unsubStages();
      unsubTouches();
    };
  }, [visible]);

  const reset = () => {
    setStep('who');
    setQuery('');
    setSelectedContact(null);
    setIsNew(false);
    setNewName('');
    setKind('gospel');
    setNote('');
    setLoggedYesterday(false);
    setSavedContact(null);
    setRemindText('');
    setRemindPreset('tom');
    setReminderSet(false);
    setPrayerOpen(false);
    setPrayerText('');
    setPrayerSaved(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const recents = useMemo(() => quickCaptureRecents(contacts, touches, uid, 6), [contacts, touches, uid]);
  const matches = useMemo(() => quickCaptureSearchMatches(contacts, query, 8), [contacts, query]);
  const trimmedQuery = query.trim();
  const exactMatch = trimmedQuery && contacts.some((c) => c.name.toLowerCase() === trimmedQuery.toLowerCase());

  const touchDaysFor = (contactId: string): number | null => {
    const t = touches.filter((x) => x.contactId === contactId).sort((a, b) => b.ms - a.ms)[0];
    return t ? daysSince(t.ms) : null;
  };

  const pickExisting = (c: Contact) => {
    setSelectedContact(c);
    setIsNew(false);
    setStep('note');
  };

  const startNew = (name: string) => {
    setNewName(name);
    setIsNew(true);
    setStep('newname');
  };

  const personName = isNew ? newName || 'New friend' : selectedContact?.name ?? '';

  const handleSave = async () => {
    if (saving || !uid) return;
    setSaving(true);
    try {
      let contact: Contact;
      if (isNew) {
        const name = newName.trim();
        const stageValue = stages[0]?.label ?? 'Unassigned';
        const input = {
          name,
          role: '',
          location: '',
          email: '',
          phone: '',
          stage: stageValue,
          tags: season.tags,
          notes: '',
          spiritualBackground: '',
          initials: getUserInitials(name),
        };
        const id = await addContact(input, { uid, name: user?.displayName });
        contact = {
          id,
          ...input,
          lastSeen: 'Just now',
          createdBy: uid,
          createdByName: user?.displayName ?? null,
        } as Contact;
      } else if (selectedContact) {
        contact = selectedContact;
      } else {
        return;
      }

      const dateTime = new Date(Date.now() - (loggedYesterday ? DAY_MS : 0)).toISOString();
      await addInteraction(
        contact.id,
        contact.name,
        { content: note.trim(), dateTime, type: kind },
        { uid, name: user?.displayName ?? '', photoURL: user?.photoURL ?? null },
      );

      setSavedContact(contact);
      setRemindText(`Follow up with ${contact.name.split(' ')[0]}`);
      setStep('done');
    } finally {
      setSaving(false);
    }
  };

  const handleSetReminder = async () => {
    if (!savedContact || !uid || remindSubmitting) return;
    setRemindSubmitting(true);
    try {
      const title = remindText.trim() || `Follow up with ${savedContact.name.split(' ')[0]}`;
      await addTodo(
        {
          title,
          assigneeId: uid,
          dueDate: reminderDueDate(remindPreset),
          contactId: savedContact.id,
          contactName: savedContact.name,
        },
        { uid, name: user?.displayName ?? '' },
      );
      if (savedContact.createdBy && savedContact.createdBy !== uid) {
        void sendNotification({
          userId: savedContact.createdBy,
          title: `${(user?.displayName || 'Someone').split(' ')[0]} logged time with ${savedContact.name}`,
          message: title,
          type: 'info',
          targetId: savedContact.id,
        });
      }
      setReminderSet(true);
    } finally {
      setRemindSubmitting(false);
    }
  };

  const handleSavePrayer = async () => {
    if (!savedContact || !prayerText.trim() || prayerSubmitting) return;
    setPrayerSubmitting(true);
    try {
      await addPrayer({ contactId: savedContact.id, burden: prayerText }, { uid, name: user?.displayName });
      setPrayerSaved(true);
    } finally {
      setPrayerSubmitting(false);
    }
  };

  const logAnother = () => reset();

  const openContactPage = () => {
    const id = savedContact?.id;
    handleClose();
    if (id) router.push(`/contact/${id}`);
  };

  return (
    <Sheet visible={visible} onClose={handleClose} maxHeightRatio={0.9}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        {step === 'who' ? (
          <>
            <SheetHeader title="Log a moment" onClose={handleClose} />
            <InlineInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder="Who did you talk to?"
            />
            <View style={{ gap: 6 }}>
              {!trimmedQuery ? (
                <>
                  <AppText variant="label">Recent</AppText>
                  {recents.map(({ contact }) => (
                    <PersonRow
                      key={contact.id}
                      contact={contact}
                      meta={
                        touchDaysFor(contact.id) != null
                          ? connectedLabel(touchDaysFor(contact.id)!)
                          : contact.role || 'No conversations yet'
                      }
                      onPress={() => pickExisting(contact)}
                    />
                  ))}
                </>
              ) : (
                <>
                  {matches.map((contact) => (
                    <PersonRow
                      key={contact.id}
                      contact={contact}
                      meta={[contact.role, contact.stage].filter(Boolean).join(' · ')}
                      onPress={() => pickExisting(contact)}
                    />
                  ))}
                  {matches.length === 0 ? <AppText variant="caption">No one by that name yet.</AppText> : null}
                </>
              )}
              <Pressable
                onPress={() => startNew(trimmedQuery)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 10,
                  borderTopWidth: 1,
                  borderTopColor: colors.outlineVariant,
                  marginTop: 4,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="add" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.onSurface }}>
                    {trimmedQuery && !exactMatch ? `Add "${trimmedQuery}" as a new face` : 'Someone new'}
                  </Text>
                  <AppText variant="caption">A first encounter — just a name to start</AppText>
                </View>
              </Pressable>
            </View>
          </>
        ) : null}

        {step === 'newname' ? (
          <>
            <SheetHeader title="A new face" onBack={() => setStep('who')} onClose={handleClose} />
            <AppText variant="label">What's their name?</AppText>
            <InlineInput
              autoFocus
              value={newName}
              onChangeText={setNewName}
              placeholder="First and last, or whatever you caught"
              onSubmitEditing={() => newName.trim() && setStep('note')}
            />
            <AppText variant="caption">
              You can fill in the rest later, back at your desk. Right now — just capture them.
            </AppText>
            <Button title="Continue" onPress={() => setStep('note')} disabled={!newName.trim()} full />
          </>
        ) : null}

        {step === 'note' ? (
          <>
            <SheetHeader
              title={personName}
              onBack={() => setStep(isNew ? 'newname' : 'who')}
              onClose={handleClose}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {QUICK_CAPTURE_KINDS.map((k) => {
                const on = kind === k.id;
                return (
                  <Pressable
                    key={k.id}
                    onPress={() => setKind(k.id)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: radius.full,
                      borderWidth: 1,
                      borderColor: on ? colors.primary : colors.outlineVariant,
                      backgroundColor: on ? colors.primary : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: 12.5, fontWeight: '600', color: on ? colors.onPrimary : colors.onSurface }}>
                      {k.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={isNew ? 'How did you meet? What stood out?' : 'What happened? Anything to remember…'}
              placeholderTextColor={colors.onSurfaceVariant}
              multiline
              numberOfLines={3}
              style={{
                minHeight: 72,
                padding: 10,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.outlineVariant,
                backgroundColor: colors.surfaceContainer,
                fontSize: 13,
                color: colors.onSurface,
                textAlignVertical: 'top',
              }}
            />
            <Pressable
              onPress={() => setLoggedYesterday((v) => !v)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}
            >
              <Ionicons name="time-outline" size={14} color={colors.onSurfaceVariant} />
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.onSurfaceVariant }}>
                {loggedYesterday ? 'Yesterday — tap for today' : 'Today — tap for yesterday'}
              </Text>
            </Pressable>
            <Button title={saving ? 'Saving…' : 'Save'} onPress={handleSave} disabled={saving} full />
          </>
        ) : null}

        {step === 'done' && savedContact ? (
          <>
            <SheetHeader title="Saved" onClose={handleClose} />
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.onSurface }}>
                  Logged with {savedContact.name.split(' ')[0]}
                </Text>
                <AppText variant="caption">Added to your history.</AppText>
              </View>
            </View>

            {!reminderSet ? (
              <View style={{ gap: 8, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceContainerHigh }}>
                <AppText variant="label">Want a nudge to follow up?</AppText>
                <InlineInput value={remindText} onChangeText={setRemindText} placeholder="What should you remember to do?" />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {REMINDER_PRESETS.map((p) => {
                    const on = remindPreset === p.key;
                    return (
                      <Pressable
                        key={p.key}
                        onPress={() => setRemindPreset(p.key)}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: radius.full,
                          borderWidth: 1,
                          borderColor: on ? colors.primary : colors.outlineVariant,
                          backgroundColor: on ? colors.primary : 'transparent',
                        }}
                      >
                        <Text style={{ fontSize: 12.5, fontWeight: '600', color: on ? colors.onPrimary : colors.onSurface }}>
                          {p.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Button
                  title={remindSubmitting ? 'Setting…' : 'Set reminder'}
                  onPress={handleSetReminder}
                  disabled={remindSubmitting}
                />
              </View>
            ) : (
              <ConfirmRow label="Reminder set" sub="On your day." />
            )}

            {prayerOpen ? (
              !prayerSaved ? (
                <View style={{ gap: 8, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceContainerHigh }}>
                  <AppText variant="label">What are we praying for {savedContact.name.split(' ')[0]}?</AppText>
                  <InlineInput
                    autoFocus
                    value={prayerText}
                    onChangeText={setPrayerText}
                    placeholder="e.g. Peace before her bio midterm"
                  />
                  <Button
                    title={prayerSubmitting ? 'Adding…' : 'Add prayer'}
                    onPress={handleSavePrayer}
                    disabled={!prayerText.trim() || prayerSubmitting}
                  />
                </View>
              ) : (
                <ConfirmRow label="Prayer added" sub={`We'll hold it for ${savedContact.name.split(' ')[0]}.`} />
              )
            ) : null}

            <View style={{ flexDirection: 'row', gap: 16 }}>
              {!prayerOpen ? (
                <Pressable onPress={() => setPrayerOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="heart-outline" size={15} color={colors.primary} />
                  <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.primary }}>Add a prayer</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={logAnother} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="add" size={15} color={colors.primary} />
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.primary }}>Log another</Text>
              </Pressable>
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title={`Open ${savedContact.name.split(' ')[0]}'s page`} variant="ghost" onPress={openContactPage} style={{ flex: 1 }} />
              <Button title="Done" onPress={handleClose} style={{ flex: 1 }} />
            </View>
          </>
        ) : null}
      </View>
    </Sheet>
  );
}

function SheetHeader({
  title,
  onBack,
  onClose,
}: {
  title: string;
  onBack?: () => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={8} style={{ padding: 4 }}>
          <Ionicons name="chevron-back" size={20} color={colors.onSurfaceVariant} />
        </Pressable>
      ) : (
        <View style={{ width: 28 }} />
      )}
      <AppText variant="heading" numberOfLines={1} style={{ flex: 1, textAlign: 'center' }}>
        {title}
      </AppText>
      <Pressable onPress={onClose} hitSlop={8} style={{ padding: 4 }}>
        <Ionicons name="close" size={20} color={colors.onSurfaceVariant} />
      </Pressable>
    </View>
  );
}

function PersonRow({ contact, meta, onPress }: { contact: Contact; meta: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
      <Avatar name={contact.name} size={40} photoURL={contact.avatar} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.onSurface }}>{contact.name}</Text>
        {meta ? <AppText variant="caption">{meta}</AppText> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceVariant} />
    </Pressable>
  );
}

function ConfirmRow({ label, sub }: { label: string; sub: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13.5, fontWeight: '600', color: colors.onSurface }}>{label}</Text>
        <AppText variant="caption">{sub}</AppText>
      </View>
    </View>
  );
}
