import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatPhoneNumber, getUserInitials, validatePhoneNumber, type NewContactInput, type Stage } from '@cisa/core';
import { AppText, Button, Sheet, InlineInput } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import type { ActiveSeason } from '../../lib/useActiveSeason';

const SPIRITUAL_BACKGROUNDS = ['Christian', 'Catholic', 'Other', 'None'];

// "Add someone" bottom sheet — new-contact form. Design: views/contacts.jsx's
// header "Add someone" button (mobile branch unreachable at build time — the
// design MCP was down; built against web's NewContactModal.tsx field set and
// the HoldPrayerSheet Modal chrome instead).
export function AddContactSheet({
  visible,
  stages,
  season,
  defaultStage,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  stages: Stage[];
  season: ActiveSeason;
  defaultStage?: string;
  onSubmit: (input: NewContactInput) => Promise<void>;
  onClose: () => void;
}) {
  const { colors, radius, spacing, typography } = useTheme();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('');
  const [location, setLocation] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [stage, setStage] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [spiritualBackground, setSpiritualBackground] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const stageValue = stage || defaultStage || stages[0]?.label || 'Unassigned';

  const reset = () => {
    setFirstName('');
    setLastName('');
    setRole('');
    setLocation('');
    setEmail('');
    setPhone('');
    setPhoneError(null);
    setStage('');
    setTagsText('');
    setSpiritualBackground('');
    setNotes('');
  };

  const handlePhoneBlur = () => {
    if (!phone) {
      setPhoneError(null);
      return;
    }
    const formatted = formatPhoneNumber(phone);
    setPhone(formatted);
    if (!validatePhoneNumber(phone)) {
      const digits = phone.replace(/[^\d]/g, '');
      if (digits.length < 10) setPhoneError('Phone number too short (need 10 digits)');
      else if (digits.length > 10) setPhoneError('Phone number too long (need 10 digits)');
      else setPhoneError(null);
    } else {
      setPhoneError(null);
    }
  };

  const canSubmit = firstName.trim().length > 0 && notes.trim().length > 0 && !phoneError && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const fullName = `${firstName} ${lastName}`.trim();
      const manualTags = tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const input: NewContactInput = {
        name: fullName,
        role,
        location,
        email,
        phone,
        stage: stageValue,
        tags: Array.from(new Set([...manualTags, ...season.tags])),
        notes,
        spiritualBackground,
        initials: getUserInitials(fullName),
      };
      await onSubmit(input);
      reset();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      maxHeightRatio={0.9}
      footer={
        <View
          style={{
            flexDirection: 'row',
            gap: 12,
            padding: spacing.lg,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.outlineVariant,
            backgroundColor: colors.surface,
          }}
        >
          <Button title="Cancel" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
          <Button
            title={submitting ? 'Adding…' : 'Add contact'}
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={{ flex: 2 }}
          />
        </View>
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg }}>
        <View style={{ flex: 1, gap: 2, paddingRight: 12 }}>
          <Text style={{ fontFamily: typography.fontSerif, fontSize: 18, fontWeight: '500', color: colors.onSurface }}>
            New contact
          </Text>
          <AppText variant="caption" color={colors.primary}>
            {season.label}
            {season.clubRush ? ' · club rush' : ''} — tagged for this season's cohort
          </AppText>
        </View>
        <Pressable onPress={onClose} hitSlop={8} style={{ padding: 6 }}>
          <Ionicons name="close" size={18} color={colors.onSurfaceVariant} />
        </Pressable>
      </View>

      <View style={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 8 }}>
        <Field label="FIRST NAME">
          <InlineInput value={firstName} onChangeText={setFirstName} placeholder="e.g. Alex" />
        </Field>
        <Field label="LAST NAME">
          <InlineInput value={lastName} onChangeText={setLastName} placeholder="e.g. Johnson" />
        </Field>
        <Field label="CONTACT GROUP">
          <InlineInput value={role} onChangeText={setRole} placeholder="e.g. Student, Faculty" />
        </Field>
        <Field label="FIRST MET / RESIDENCE">
          <InlineInput value={location} onChangeText={setLocation} placeholder="e.g. Campus Coffee, Miller Hall" />
        </Field>
        <Field label="EMAIL">
          <InlineInput
            value={email}
            onChangeText={setEmail}
            placeholder="alex@campus.edu"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </Field>
        <Field label="PHONE" error={phoneError}>
          <InlineInput
            value={phone}
            onChangeText={(t) => {
              setPhone(t);
              if (phoneError) setPhoneError(null);
            }}
            onBlur={handlePhoneBlur}
            placeholder="(555) 000-0000"
            keyboardType="phone-pad"
          />
        </Field>
        <Field label="PIPELINE STAGE">
          <PillRow options={['Unassigned', ...stages.map((s) => s.label)]} value={stageValue} onChange={setStage} />
        </Field>
        <Field label="TAGS (COMMA SEPARATED)">
          <InlineInput value={tagsText} onChangeText={setTagsText} placeholder="e.g. Gospel, Fall2023" />
        </Field>
        <Field label="SPIRITUAL BACKGROUND">
          <PillRow
            options={SPIRITUAL_BACKGROUNDS}
            value={spiritualBackground}
            onChange={setSpiritualBackground}
            allowEmpty
          />
        </Field>
        <Field label="NOTES">
          <InlineInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Add some context about this contact…"
            multiline
            numberOfLines={4}
            style={{ minHeight: 90, textAlignVertical: 'top' }}
          />
        </Field>
      </View>
    </Sheet>
  );
}

function Field({ label, error, children }: { label: string; error?: string | null; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <AppText variant="label" color={colors.onSurfaceVariant}>
        {label}
      </AppText>
      {children}
      {error ? (
        <AppText variant="caption" color={colors.error}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

function PillRow({
  options,
  value,
  onChange,
  allowEmpty,
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  allowEmpty?: boolean;
}) {
  const { colors, radius } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {allowEmpty && (
        <Pressable
          onPress={() => onChange('')}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: radius.full,
            borderWidth: 1,
            borderColor: value === '' ? colors.primary : colors.outlineVariant,
            backgroundColor: value === '' ? colors.primary : 'transparent',
          }}
        >
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: value === '' ? colors.onPrimary : colors.onSurface }}>
            Select…
          </Text>
        </Pressable>
      )}
      {options.map((opt) => {
        const on = value === opt;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
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
              {opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
