import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { groupPrayerThread, type Contact, type PrayerRecord } from '@cisa/core';
import { AppText, Avatar, Button, Card, InlineInput } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { AnsweredCard, StatusSegments, TestimonyComposer } from '../myday/YourPrayers';

const EARLIER_CAP = 4;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function SectionEyebrow({ label, nudge, style }: { label: string; nudge?: string; style?: { marginTop: number } }) {
  const { colors } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }, style]}>
      <Text style={{ fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, color: colors.onSurfaceVariant }}>
        {label}
      </Text>
      {nudge && (
        <Text style={{ fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, color: colors.error }}>
          {nudge}
        </Text>
      )}
    </View>
  );
}

// One dated prayer: burden text (with inline edit), and the 3-way status
// mark — always enabled here (unlike My Day's condensed TeamPrayerRow, which
// disables the toggle for prayerPage prayers; the full Prayer tab is the
// canonical place to mark status regardless of where a burden was created).
function PrayerItemRow({
  prayer,
  variant,
  needsMark,
  onSetStatus,
  onUpdateBurden,
  isOperator,
}: {
  prayer: PrayerRecord;
  variant: 'week' | 'last' | 'earlier';
  needsMark?: boolean;
  onSetStatus: (status: PrayerRecord['status'], answer?: string, answeredAt?: string | null) => void;
  onUpdateBurden: (text: string) => void;
  isOperator: boolean;
}) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(prayer.burden);
  const [answering, setAnswering] = useState(false);
  const [howDraft, setHowDraft] = useState(prayer.answer || '');
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const activeIndex =
    prayer.status === 'ongoing' ? 0 : prayer.status === 'answered' ? 1 : prayer.status === 'unanswered' ? 2 : -1;

  const pick = (i: number) => {
    if (i === 1) {
      onSetStatus('answered', prayer.answer || undefined, prayer.answeredAt || today);
      if (!prayer.answer) {
        setHowDraft('');
        setAnswering(true);
      }
    } else {
      setAnswering(false);
      onSetStatus(i === 0 ? 'ongoing' : 'unanswered');
    }
  };

  const saveBurden = () => {
    const t = draft.trim();
    if (t) onUpdateBurden(t);
    setEditing(false);
  };

  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 12, color: colors.onSurfaceVariant }}>{formatDate(prayer.date)}</Text>
        {variant === 'last' && needsMark && (
          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.error }}>Needs an update</Text>
        )}
        {!editing && isOperator && (
          <Pressable
            onPress={() => {
              setDraft(prayer.burden);
              setEditing(true);
            }}
            style={{ marginLeft: 'auto' }}
            hitSlop={6}
          >
            <Text style={{ fontSize: 12.5, color: colors.primary, fontWeight: '500' }}>Edit</Text>
          </Pressable>
        )}
      </View>

      {editing ? (
        <View style={{ marginTop: 6, gap: 8 }}>
          <InlineInput
            autoFocus
            multiline
            numberOfLines={3}
            value={draft}
            onChangeText={setDraft}
            style={{ minHeight: 64, textAlignVertical: 'top' }}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Save" onPress={saveBurden} disabled={!draft.trim()} />
            <Button title="Cancel" variant="ghost" onPress={() => setEditing(false)} />
          </View>
        </View>
      ) : (
        <Text style={{ fontSize: 14, color: colors.onSurface, marginTop: 6, lineHeight: 20 }}>{prayer.burden}</Text>
      )}

      {!editing && !answering && prayer.status === 'answered' && (prayer.answer || prayer.answeredAt) && (
        <AnsweredCard
          answer={prayer.answer}
          answeredAt={prayer.answeredAt}
          onEdit={isOperator ? () => {
            setHowDraft(prayer.answer || '');
            setAnswering(true);
          } : undefined}
        />
      )}
      {answering && (
        <TestimonyComposer
          value={howDraft}
          onChange={setHowDraft}
          onSkip={() => setAnswering(false)}
          onSave={() => {
            onSetStatus('answered', howDraft.trim(), prayer.answeredAt || today);
            setAnswering(false);
          }}
        />
      )}

      {isOperator && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <Text style={{ fontSize: 11, color: colors.onSurfaceVariant }}>
            {variant === 'last' && needsMark ? 'Where did it land?' : 'Mark'}
          </Text>
          <StatusSegments activeIndex={activeIndex} onPick={pick} />
        </View>
      )}
    </View>
  );
}

// Empty state for the week: a quiet invitation to write what we're holding.
function AddThisWeek({ name, onAdd }: { name: string; onAdd: (text: string) => void }) {
  const { colors, radius } = useTheme();
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState('');

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: colors.outlineVariant,
          borderRadius: radius.md,
          marginTop: 6,
        }}
      >
        <Ionicons name="add" size={16} color={colors.onSurfaceVariant} />
        <AppText variant="body" color={colors.onSurfaceVariant} style={{ flex: 1 }}>
          Write what we're holding for {name} this week
        </AppText>
      </Pressable>
    );
  }

  return (
    <View style={{ marginTop: 6, gap: 8 }}>
      <InlineInput
        autoFocus
        multiline
        numberOfLines={3}
        value={val}
        onChangeText={setVal}
        placeholder={`What are we praying for ${name} this week?`}
        style={{ minHeight: 64, textAlignVertical: 'top' }}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          title="Add prayer"
          disabled={!val.trim()}
          onPress={() => {
            const t = val.trim();
            if (!t) return;
            onAdd(t);
            setVal('');
            setOpen(false);
          }}
        />
        <Button
          title="Cancel"
          variant="ghost"
          onPress={() => {
            setVal('');
            setOpen(false);
          }}
        />
      </View>
    </View>
  );
}

// One person: this week, last week, and everything earlier folded away.
// Design: views/prayer.jsx's PrayerThread / screenshots/prayer*.png.
export function PrayerThreadCard({
  contact,
  prayers,
  onOpenContact,
  onRemove,
  onAddPrayer,
  onSetStatus,
  onUpdateBurden,
  isOperator,
}: {
  contact: Contact;
  prayers: PrayerRecord[];
  onOpenContact: (contact: Contact) => void;
  onRemove: () => void;
  onAddPrayer: (text: string) => void;
  onSetStatus: (prayerId: string, status: PrayerRecord['status'], answer?: string, answeredAt?: string | null) => void;
  onUpdateBurden: (prayerId: string, text: string) => void;
  isOperator: boolean;
}) {
  const { colors, spacing } = useTheme();
  const [showEarlier, setShowEarlier] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const { weekItem, lastItem, earlier, needsMark } = groupPrayerThread(prayers);
  const ongoingCount = prayers.filter((p) => p.status === 'ongoing').length;
  const firstName = contact.name.split(' ')[0];

  return (
    <Card style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <Pressable onPress={() => onOpenContact(contact)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <Avatar name={contact.name} size={40} />
          <View style={{ flex: 1 }}>
            <AppText variant="heading" numberOfLines={1}>
              {contact.name}
            </AppText>
            <AppText variant="caption" color={colors.onSurfaceVariant} numberOfLines={1}>
              {contact.role || 'Unassigned'}
            </AppText>
          </View>
        </Pressable>
        {isOperator && (
          confirmRemove ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={onRemove} hitSlop={6}>
                <Text style={{ color: colors.error, fontSize: 12.5, fontWeight: '600' }}>Remove</Text>
              </Pressable>
              <Pressable onPress={() => setConfirmRemove(false)} hitSlop={6}>
                <Text style={{ color: colors.onSurfaceVariant, fontSize: 12.5 }}>Keep</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setConfirmRemove(true)} hitSlop={8} accessibilityLabel={`Remove ${firstName} from this page`}>
              <Ionicons name="close" size={16} color={colors.onSurfaceVariant} />
            </Pressable>
          )
        )}
      </View>

      <AppText
        variant="caption"
        color={ongoingCount > 0 ? colors.stageAccent : colors.success}
        style={{ marginTop: 4 }}
      >
        {ongoingCount > 0 ? `${ongoingCount} ongoing` : 'At rest'} · {prayers.length} {prayers.length === 1 ? 'prayer' : 'prayers'} in all
      </AppText>

      <SectionEyebrow label="This week" style={{ marginTop: 14 }} />
      {weekItem ? (
        <PrayerItemRow
          prayer={weekItem}
          variant="week"
          onSetStatus={(s, a, at) => onSetStatus(weekItem.id, s, a, at)}
          onUpdateBurden={(t) => onUpdateBurden(weekItem.id, t)}
          isOperator={isOperator}
        />
      ) : isOperator ? (
        <AddThisWeek name={firstName} onAdd={onAddPrayer} />
      ) : (
        <AppText variant="caption" color={colors.onSurfaceVariant} style={{ marginTop: 6, fontStyle: 'italic' }}>
          No prayer recorded for this week
        </AppText>
      )}

      {lastItem && (
        <>
          <SectionEyebrow label="Last week" nudge={needsMark ? 'Needs an update' : undefined} style={{ marginTop: 16 }} />
          <PrayerItemRow
            prayer={lastItem}
            variant="last"
            needsMark={needsMark}
            onSetStatus={(s, a, at) => onSetStatus(lastItem.id, s, a, at)}
            onUpdateBurden={(t) => onUpdateBurden(lastItem.id, t)}
            isOperator={isOperator}
          />
        </>
      )}

      {earlier.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Pressable onPress={() => setShowEarlier((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name={showEarlier ? 'chevron-down' : 'chevron-forward'} size={12} color={colors.onSurfaceVariant} />
            <Text style={{ fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, color: colors.onSurfaceVariant }}>
              {showEarlier ? 'Hide' : 'Earlier'} — {earlier.length} {earlier.length === 1 ? 'prayer' : 'prayers'}
            </Text>
          </Pressable>
          {showEarlier && (
            <View style={{ marginTop: 4 }}>
              {earlier.slice(0, EARLIER_CAP).map((p) => (
                <PrayerItemRow
                  key={p.id}
                  prayer={p}
                  variant="earlier"
                  onSetStatus={(s, a, at) => onSetStatus(p.id, s, a, at)}
                  onUpdateBurden={(t) => onUpdateBurden(p.id, t)}
                  isOperator={isOperator}
                />
              ))}
              {earlier.length > EARLIER_CAP && (
                <AppText variant="caption" color={colors.onSurfaceVariant} style={{ marginTop: 8 }}>
                  {earlier.length - EARLIER_CAP} older {earlier.length - EARLIER_CAP === 1 ? 'prayer' : 'prayers'}
                </AppText>
              )}
            </View>
          )}
        </View>
      )}
    </Card>
  );
}
