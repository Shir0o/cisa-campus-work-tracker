import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { agoLabel, type Contact, type PersonalPrayer, type PersonalPrayerStatus, type PrayerRecord } from '@cisa/core';
import { AppText, Button, Card, InlineInput, SectionHead } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { toneColors, type ToneKey } from '../../theme/tokens';

// Contact prayers cycle "ongoing" / "answered" / "unanswered" (archive);
// personal prayers cycle "open" / "answered" / "archived" — same 3 semantic
// slots, different literal values. Design: pray-row / pray-status-btns.
const SEGMENTS: { label: string; tone: ToneKey }[] = [
  { label: 'ongoing', tone: 'accent' },
  { label: 'answered', tone: 'teal' },
  { label: 'archive', tone: 'neutral' },
];

function StatusSegments({ activeIndex, onPick, disabled }: { activeIndex: number; onPick: (i: number) => void; disabled?: boolean }) {
  const { colors, radius } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {SEGMENTS.map((seg, i) => {
        const on = i === activeIndex;
        const { fg, soft } = toneColors(colors, seg.tone);
        return (
          <Pressable
            key={seg.label}
            disabled={disabled}
            onPress={() => onPick(i)}
            style={{
              paddingHorizontal: 9,
              paddingVertical: 4,
              borderRadius: radius.full,
              borderWidth: 1,
              borderColor: on ? fg + '55' : colors.outlineVariant,
              backgroundColor: on ? soft : 'transparent',
              opacity: disabled ? (on ? 0.6 : 0.3) : 1,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '600', color: on ? fg : colors.onSurfaceVariant }}>{seg.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function AnsweredCard({
  answer,
  answeredAt,
  onEdit,
}: {
  answer?: string | null;
  answeredAt?: string | null;
  onEdit: () => void;
}) {
  const { colors, radius, typography } = useTheme();
  return (
    <View
      style={{
        marginTop: 8,
        padding: 12,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.success + '33',
        backgroundColor: colors.successContainer,
        gap: 4,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, color: colors.success }}>
          Answered{answeredAt ? ` · ${answeredAt}` : ''}
        </Text>
        <Pressable onPress={onEdit} hitSlop={6}>
          <Text style={{ fontSize: 11, color: colors.onSurfaceVariant, fontWeight: '500' }}>Edit testimony</Text>
        </Pressable>
      </View>
      {answer ? (
        <Text style={{ fontFamily: typography.fontSerif, fontSize: 14.5, fontStyle: 'italic', color: colors.onSurface }}>
          “{answer}”
        </Text>
      ) : null}
    </View>
  );
}

function TestimonyComposer({
  value,
  onChange,
  onSave,
  onSkip,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onSkip: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: 10, gap: 8 }}>
      <Text style={{ fontSize: 11, fontWeight: '600', textTransform: 'uppercase', color: colors.onSurfaceVariant }}>
        How was it answered?
      </Text>
      <InlineInput
        autoFocus
        multiline
        numberOfLines={2}
        value={value}
        onChangeText={onChange}
        placeholder="A sentence on how God answered — the testimony."
        style={{ minHeight: 60, textAlignVertical: 'top' }}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
        <Button title="Skip" variant="ghost" onPress={onSkip} />
        <Button title="Save" onPress={onSave} />
      </View>
    </View>
  );
}

function TeamPrayerRow({
  prayer,
  contact,
  first,
  onOpenContact,
  onSetStatus,
}: {
  prayer: PrayerRecord;
  contact?: Contact;
  first: boolean;
  onOpenContact: (contact: Contact) => void;
  onSetStatus: (status: PrayerRecord['status'], answer?: string, answeredAt?: string | null) => void;
}) {
  const { colors, spacing } = useTheme();
  const [answering, setAnswering] = useState(false);
  const [draft, setDraft] = useState(prayer.answer || '');
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const activeIndex = prayer.status === 'ongoing' ? 0 : prayer.status === 'answered' ? 1 : prayer.status === 'unanswered' ? 2 : -1;

  const pick = (i: number) => {
    if (prayer.prayerPage) return;
    if (i === 1) {
      onSetStatus('answered', prayer.answer || undefined, prayer.answeredAt || today);
      if (!prayer.answer) {
        setDraft('');
        setAnswering(true);
      }
    } else {
      setAnswering(false);
      onSetStatus(i === 0 ? 'ongoing' : 'unanswered');
    }
  };

  return (
    <View style={{ paddingVertical: 14, borderTopWidth: first ? 0 : 1, borderTopColor: colors.outlineVariant }}>
      <Text style={{ fontSize: 14.5, fontWeight: '500', color: colors.onSurface }}>{prayer.burden}</Text>
      {contact && (
        <Pressable onPress={() => onOpenContact(contact)} hitSlop={4}>
          <Text style={{ fontSize: 13, color: colors.primary, marginTop: 2 }}>for {contact.name}</Text>
        </Pressable>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <Text style={{ fontSize: 11.5, color: colors.onSurfaceVariant }}>{agoLabel(prayer.date)}</Text>
        <StatusSegments activeIndex={activeIndex} onPick={pick} disabled={prayer.prayerPage} />
      </View>
      {!answering && prayer.status === 'answered' && (prayer.answer || prayer.answeredAt) && (
        <AnsweredCard
          answer={prayer.answer}
          answeredAt={prayer.answeredAt}
          onEdit={prayer.prayerPage ? undefined : () => {
            setDraft(prayer.answer || '');
            setAnswering(true);
          }}
        />
      )}
      {answering && (
        <TestimonyComposer
          value={draft}
          onChange={setDraft}
          onSkip={() => setAnswering(false)}
          onSave={() => {
            onSetStatus('answered', draft.trim(), prayer.answeredAt || today);
            setAnswering(false);
          }}
        />
      )}
    </View>
  );
}

function PersonalPrayerRow({
  prayer,
  first,
  contacts,
  onOpenContact,
  onUpdate,
  onDelete,
}: {
  prayer: PersonalPrayer;
  first: boolean;
  contacts: Contact[];
  onOpenContact: (contact: Contact) => void;
  onUpdate: (patch: {
    title?: string;
    contactId?: string | null;
    status?: PersonalPrayerStatus;
    answeredAt?: string | null;
    answeredBody?: string | null;
  }) => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(prayer.title);
  const [answering, setAnswering] = useState(false);
  const [draft, setDraft] = useState(prayer.answeredBody || '');
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const linked = prayer.contactId ? contacts.find((c) => c.id === prayer.contactId) : null;

  const activeIndex = prayer.status === 'open' ? 0 : prayer.status === 'answered' ? 1 : 2;

  const pick = (i: number) => {
    if (i === 1) {
      onUpdate({ status: 'answered', answeredAt: prayer.answeredAt || today });
      if (!prayer.answeredBody) {
        setDraft('');
        setAnswering(true);
      }
    } else {
      setAnswering(false);
      onUpdate({ status: i === 0 ? 'open' : 'archived', answeredAt: null, answeredBody: null });
    }
  };

  const save = () => {
    const t = title.trim();
    if (!t) return;
    onUpdate({ title: t });
    setOpen(false);
  };

  return (
    <View style={{ paddingVertical: 14, borderTopWidth: first ? 0 : 1, borderTopColor: colors.outlineVariant }}>
      {open ? (
        <View style={{ gap: 8 }}>
          <InlineInput autoFocus value={title} onChangeText={setTitle} placeholder="What are you praying for?" />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable onPress={onDelete} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="trash-outline" size={14} color={colors.error} />
              <Text style={{ fontSize: 12.5, color: colors.error, fontWeight: '500' }}>Delete</Text>
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Cancel" variant="ghost" onPress={() => setOpen(false)} />
              <Button title="Save" onPress={save} disabled={!title.trim()} />
            </View>
          </View>
        </View>
      ) : (
        <Pressable onPress={() => setOpen(true)}>
          <Text style={{ fontSize: 14.5, fontWeight: '500', color: colors.onSurface }}>{prayer.title}</Text>
          {linked ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onOpenContact(linked);
              }}
              hitSlop={4}
            >
              <Text style={{ fontSize: 13, color: colors.primary, marginTop: 2 }}>for {linked.name}</Text>
            </Pressable>
          ) : (
            <Text style={{ fontSize: 13, color: colors.onSurfaceVariant, opacity: 0.7, marginTop: 2 }}>personal</Text>
          )}
        </Pressable>
      )}

      {!open && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <Text style={{ fontSize: 11.5, color: colors.onSurfaceVariant }}>{agoLabel(prayer.date)}</Text>
          <StatusSegments activeIndex={activeIndex} onPick={pick} />
        </View>
      )}
      {!open && !answering && prayer.status === 'answered' && (prayer.answeredBody || prayer.answeredAt) && (
        <AnsweredCard
          answer={prayer.answeredBody}
          answeredAt={prayer.answeredAt}
          onEdit={() => {
            setDraft(prayer.answeredBody || '');
            setAnswering(true);
          }}
        />
      )}
      {!open && answering && (
        <TestimonyComposer
          value={draft}
          onChange={setDraft}
          onSkip={() => setAnswering(false)}
          onSave={() => {
            onUpdate({ status: 'answered', answeredBody: draft.trim(), answeredAt: prayer.answeredAt || today });
            setAnswering(false);
          }}
        />
      )}
    </View>
  );
}

function AddPersonalPrayerRow({ onAdd }: { onAdd: (title: string, contactId: string | null) => void }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12 }}>
        <Ionicons name="add" size={16} color={colors.primary} />
        <AppText variant="body" color={colors.primary} style={{ fontWeight: '600' }}>
          Add a personal prayer
        </AppText>
      </Pressable>
    );
  }

  const commit = () => {
    const t = title.trim();
    if (!t) return;
    onAdd(t, null);
    setTitle('');
    setOpen(false);
  };

  return (
    <View style={{ paddingVertical: 14, gap: 8 }}>
      <InlineInput autoFocus value={title} onChangeText={setTitle} placeholder="What would you like to pray for?" />
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
        <Button title="Cancel" variant="ghost" onPress={() => setOpen(false)} />
        <Button title="Add" onPress={commit} disabled={!title.trim()} />
      </View>
    </View>
  );
}

// Your prayers — contact (shared) + personal prayers. Design: pray-row.
export function YourPrayers({
  contactPrayers,
  activePersonalPrayers,
  contacts,
  onOpenContact,
  onOpenPicker,
  onSetStatus,
  onAddPersonal,
  onUpdatePersonal,
  onDeletePersonal,
}: {
  contactPrayers: PrayerRecord[];
  activePersonalPrayers: PersonalPrayer[];
  contacts: Contact[];
  onOpenContact: (contact: Contact) => void;
  onOpenPicker: () => void;
  onSetStatus: (id: string, status: PrayerRecord['status'], answer?: string, answeredAt?: string | null) => void;
  onAddPersonal: (title: string, contactId: string | null) => void;
  onUpdatePersonal: (
    id: string,
    patch: { title?: string; contactId?: string | null; status?: PersonalPrayerStatus; answeredAt?: string | null; answeredBody?: string | null },
  ) => void;
  onDeletePersonal: (id: string) => void;
}) {
  const { colors, spacing } = useTheme();
  const empty = contactPrayers.length === 0 && activePersonalPrayers.length === 0;

  return (
    <View>
      <SectionHead title="Your prayers" action="Your contacts" onAction={onOpenPicker} />
      <Card style={{ padding: 0 }}>
        <View style={{ paddingHorizontal: spacing.lg }}>
          {empty && (
            <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center', paddingVertical: 20 }}>
              No prayers held currently.
            </AppText>
          )}
          {contactPrayers.map((p, i) => (
            <TeamPrayerRow
              key={p.id}
              prayer={p}
              contact={contacts.find((c) => c.id === p.contactId)}
              first={i === 0}
              onOpenContact={onOpenContact}
              onSetStatus={(status, answer, answeredAt) => onSetStatus(p.id, status, answer, answeredAt)}
            />
          ))}
          {activePersonalPrayers.map((p, i) => (
            <PersonalPrayerRow
              key={p.id}
              prayer={p}
              first={contactPrayers.length === 0 && i === 0}
              contacts={contacts}
              onOpenContact={onOpenContact}
              onUpdate={(patch) => onUpdatePersonal(p.id, patch)}
              onDelete={() => onDeletePersonal(p.id)}
            />
          ))}
          <AddPersonalPrayerRow onAdd={onAddPersonal} />
        </View>
      </Card>
    </View>
  );
}
