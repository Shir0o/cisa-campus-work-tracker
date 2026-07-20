import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { formatPhoneNumber, validatePhoneNumber, type Contact, type ContactEditFields, type Stage } from '@cisa/core';
import { AppText, Button, InlineInput } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';

const SPIRITUAL_BACKGROUNDS = ['Exploring', 'Christian', 'Catholic', 'Other', 'None'];

// Contact Detail's edit form — a full-screen swap-in (matching the web
// modal's in-place isEditing swap, not a bottom sheet). Same field set as
// people/AddContactSheet.tsx; kept as a local duplicate of its Field/PillRow
// helpers rather than extracting a shared component, so the already-shipped
// AddContactSheet stays untouched.
export function ContactEditForm({
  contact,
  stages,
  onSave,
  onDelete,
  onCancel,
}: {
  contact: Contact;
  stages: Stage[];
  onSave: (edits: ContactEditFields) => Promise<void>;
  onDelete: () => Promise<void>;
  onCancel: () => void;
}) {
  const { colors, spacing, typography } = useTheme();
  const [nameParts] = useState(() => splitName(contact.name));
  const [firstName, setFirstName] = useState(nameParts.first);
  const [lastName, setLastName] = useState(nameParts.last);
  const [role, setRole] = useState(contact.role || '');
  const [location, setLocation] = useState(contact.location || '');
  const [email, setEmail] = useState(contact.email || '');
  const [phone, setPhone] = useState(contact.phone || '');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [stage, setStage] = useState(contact.stage || 'Unassigned');
  const [tagsText, setTagsText] = useState((contact.tags || []).join(', '));
  const [spiritualBackground, setSpiritualBackground] = useState(contact.spiritualBackground || '');
  const [notes, setNotes] = useState(contact.notes || '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const canSave = firstName.trim().length > 0 && !phoneError && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const tags = tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await onSave({ firstName, lastName, role, location, email, phone, stage, tags, notes, spiritualBackground });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete contact?', `This removes ${contact.name} and their history. This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await onDelete();
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
          paddingBottom: spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: colors.outlineVariant,
        }}
      >
        <Pressable onPress={onCancel} hitSlop={8}>
          <AppText variant="body" color={colors.onSurfaceVariant}>
            Cancel
          </AppText>
        </Pressable>
        <Text style={{ fontFamily: typography.fontSerif, fontSize: 17, fontWeight: '500', color: colors.onSurface }}>
          Edit details
        </Text>
        <Pressable onPress={handleSave} disabled={!canSave} hitSlop={8}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: canSave ? colors.primary : colors.onSurfaceVariant }}>
            {saving ? 'Saving…' : 'Save'}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}>
        <Field label="FIRST NAME">
          <InlineInput value={firstName} onChangeText={setFirstName} placeholder="e.g. Alex" />
        </Field>
        <Field label="LAST NAME">
          <InlineInput value={lastName} onChangeText={setLastName} placeholder="e.g. Johnson" />
        </Field>
        <Field label="CONTACT GROUP">
          <InlineInput value={role} onChangeText={setRole} placeholder="e.g. Student, Faculty" />
        </Field>
        <Field label={tagsIncludeNewSignUp(tagsText) ? 'RESIDENCE HALL' : 'FIRST MET'}>
          <InlineInput value={location} onChangeText={setLocation} placeholder="e.g. Campus Coffee" />
        </Field>
        <Field label="EMAIL">
          <InlineInput value={email} onChangeText={setEmail} placeholder="alex@campus.edu" keyboardType="email-address" autoCapitalize="none" />
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
          <PillRow options={['Unassigned', ...stages.map((s) => s.label)]} value={stage} onChange={setStage} />
        </Field>
        <Field label="TAGS (COMMA SEPARATED)">
          <InlineInput value={tagsText} onChangeText={setTagsText} placeholder="e.g. Lead, Fall2023" />
        </Field>
        <Field label="SPIRITUAL BACKGROUND">
          <PillRow options={SPIRITUAL_BACKGROUNDS} value={spiritualBackground} onChange={setSpiritualBackground} allowEmpty />
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

        <View style={{ paddingTop: spacing.md }}>
          <Button
            title={deleting ? 'Deleting…' : 'Delete contact'}
            onPress={handleDelete}
            disabled={deleting}
            full
            style={{ backgroundColor: colors.error }}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(' ');
  if (parts.length <= 1) return { first: fullName, last: '' };
  const last = parts.pop() || '';
  return { first: parts.join(' '), last };
}

function tagsIncludeNewSignUp(tagsText: string): boolean {
  return tagsText
    .split(',')
    .map((t) => t.trim())
    .includes('New Sign Up');
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
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: value === '' ? colors.onPrimary : colors.onSurface }}>Select…</Text>
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
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: on ? colors.onPrimary : colors.onSurface }}>{opt}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
