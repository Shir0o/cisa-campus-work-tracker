import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  emptySignUpForm,
  signUpYearValue,
  validateSignUpBasics,
  validateSignUpInterests,
  SIGNUP_GENDERS,
  SIGNUP_INTERESTS,
  SIGNUP_SPIRITUAL_BACKGROUNDS,
  SIGNUP_YEARS,
  SEASON_ORDER,
  SEASONS,
  type SignUpFormState,
} from '@cisa/core';
import { Screen, AppText, Button } from '../src/components/ui';
import { useTheme } from '../src/theme/ThemeProvider';
import { useActiveSeason, type ActiveSeason } from '../src/lib/useActiveSeason';
import { useAuth } from '../src/lib/AuthProvider';
import { submitSignUp } from '../src/lib/data/signup';

export default function SignUp() {
  const { colors, spacing, radius, mode } = useTheme();
  const paper = mode === 'dark' ? colors.background : '#eceae6';
  const router = useRouter();
  const season = useActiveSeason();
  const { user, role } = useAuth();
  const isManager = role === 'admin' || role === 'manager';

  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState<SignUpFormState>(emptySignUpForm);
  const [botField, setBotField] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof SignUpFormState>(k: K, v: SignUpFormState[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));
  const toggleInterest = (i: string) =>
    setForm((prev) => ({
      ...prev,
      interests: prev.interests.includes(i) ? prev.interests.filter((x) => x !== i) : [...prev.interests, i],
    }));

  const resetForm = () => {
    setForm(emptySignUpForm);
    setBotField('');
    setError(null);
    setSubmitted(false);
  };

  const handleSubmit = async () => {
    setError(null);

    // Anti-abuse: honeypot — silently "succeed" with no write.
    if (botField) {
      setSubmitted(true);
      return;
    }

    const errBasics = validateSignUpBasics(form);
    if (errBasics) {
      setError(errBasics);
      return;
    }

    const errInterests = validateSignUpInterests(form);
    if (errInterests) {
      setError(errInterests);
      return;
    }

    setLoading(true);
    try {
      const byActor = user ? { uid: user.uid, name: user.displayName || user.email } : undefined;
      await submitSignUp(form, season.tags, byActor);
      setSubmitted(true);
    } catch {
      setError('Something went wrong sending that — mind trying again?');
    } finally {
      setLoading(false);
    }
  };

  const firstName = form.name.trim().split(' ')[0] || 'friend';
  const yearValue = signUpYearValue(form);

  const inputStyle = {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14.5,
    color: colors.onSurface,
    backgroundColor: colors.surfaceContainer,
  };

  if (submitted) {
    return (
      <Screen style={{ backgroundColor: paper }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: spacing.xl, justifyContent: 'center', alignItems: 'center' }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 20,
              backgroundColor: colors.primaryContainer,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: spacing.lg,
            }}
          >
            <Ionicons name="checkmark-circle" size={30} color={colors.primary} />
          </View>
          <AppText variant="title">Thank you for signing up, {firstName}.</AppText>
          <AppText
            variant="body"
            color={colors.onSurfaceVariant}
            style={{ marginTop: spacing.sm, textAlign: 'center', maxWidth: 320 }}
          >
            We will be in contact!
          </AppText>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: spacing.xl }}>
            <Button title="Back to app" variant="ghost" onPress={() => router.replace('/')} />
            <Button title="Add another" onPress={resetForm} />
          </View>
        </ScrollView>
      </Screen>
    );
  }

  const isFormValid =
    form.name.trim() &&
    form.gender &&
    yearValue &&
    form.major.trim() &&
    form.phone.trim() &&
    form.email.trim() &&
    form.interests.length > 0;

  return (
    <Screen style={{ backgroundColor: paper }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
        <AppText variant="title">Tell us about you.</AppText>
        <AppText variant="body" color={colors.onSurfaceVariant}>
          Just the basics. Fields marked with * are required.
        </AppText>

        {!isManager && (
          <AppText variant="body" color={colors.onSurfaceVariant}>
            Christian Fellowship · {season.label}
            {season.clubRush ? ' · Club rush' : ''}
          </AppText>
        )}

        {isManager && <SeasonManagerCard season={season} />}

        {error && (
          <View style={{ backgroundColor: colors.errorContainer, borderRadius: radius.md, padding: 12 }}>
            <AppText variant="body" color={colors.onErrorContainer}>
              {error}
            </AppText>
          </View>
        )}

        <Field label="Full name" required>
          <TextInput
            style={inputStyle}
            value={form.name}
            onChangeText={(v) => set('name', v)}
            placeholder="e.g. Naomi Park"
            placeholderTextColor={colors.onSurfaceVariant}
          />
        </Field>
        <Field label="Gender" required>
          <PillRow options={SIGNUP_GENDERS} value={form.gender} onChange={(v) => set('gender', v)} />
        </Field>
        <Field label="Year" required>
          <PillRow options={SIGNUP_YEARS} value={form.year} onChange={(v) => set('year', v)} />
          {form.year === 'Other' && (
            <TextInput
              style={[inputStyle, { marginTop: spacing.sm }]}
              value={form.yearOther}
              onChangeText={(v) => set('yearOther', v)}
              placeholder="Tell us where you're at — gap year, post-grad…"
              placeholderTextColor={colors.onSurfaceVariant}
              autoFocus
            />
          )}
        </Field>
        <Field label="Major" required>
          <TextInput
            style={inputStyle}
            value={form.major}
            onChangeText={(v) => set('major', v)}
            placeholder="Computer Science"
            placeholderTextColor={colors.onSurfaceVariant}
          />
        </Field>
        <Field label="Cell number" required>
          <TextInput
            style={inputStyle}
            value={form.phone}
            onChangeText={(v) => set('phone', v)}
            placeholder="(___) ___-____"
            keyboardType="phone-pad"
            placeholderTextColor={colors.onSurfaceVariant}
          />
        </Field>
        <Field label="Email" required>
          <TextInput
            style={inputStyle}
            value={form.email}
            onChangeText={(v) => set('email', v)}
            placeholder="you@umail.edu"
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor={colors.onSurfaceVariant}
          />
        </Field>
        <Field label="Where are you with faith right now? (optional)">
          <PillRow
            options={SIGNUP_SPIRITUAL_BACKGROUNDS.map((o) => o.label)}
            value={SIGNUP_SPIRITUAL_BACKGROUNDS.find((o) => o.value === form.spiritualBackground)?.label ?? ''}
            onChange={(label) =>
              set('spiritualBackground', SIGNUP_SPIRITUAL_BACKGROUNDS.find((o) => o.label === label)?.value ?? '')
            }
          />
        </Field>
        <Field label="What are you drawn to?" required>
          <MultiPillRow options={SIGNUP_INTERESTS} value={form.interests} onToggle={toggleInterest} />
        </Field>
        <Field label="Anything we can pray for? (optional)">
          <TextInput
            style={[inputStyle, { minHeight: 72, textAlignVertical: 'top' }]}
            value={form.prayerRequest}
            onChangeText={(v) => set('prayerRequest', v)}
            placeholder="Totally optional. We hold these confidentially."
            placeholderTextColor={colors.onSurfaceVariant}
            multiline
          />
        </Field>
        <Field label="Anything else? (optional)">
          <TextInput
            style={[inputStyle, { minHeight: 56, textAlignVertical: 'top' }]}
            value={form.notes}
            onChangeText={(v) => set('notes', v)}
            placeholder="Allergies, schedule conflicts, questions…"
            placeholderTextColor={colors.onSurfaceVariant}
            multiline
          />
        </Field>

        {/* Anti-abuse honeypot: off-screen, still reachable by scripted bots */}
        <View
          style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <TextInput value={botField} onChangeText={setBotField} />
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm }}>
          <Button title="Cancel" variant="ghost" onPress={() => router.replace('/')} />
          <Button
            title={loading ? 'Sending…' : 'Send it'}
            onPress={handleSubmit}
            disabled={loading || !isFormValid}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <AppText variant="label" color={colors.onSurfaceVariant}>
        {label}
        {required && <Text style={{ color: colors.error }}> *</Text>}
      </AppText>
      {children}
    </View>
  );
}

function PillRow({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  const { colors, radius } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
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

function MultiPillRow({
  options,
  value,
  onToggle,
}: {
  options: string[];
  value: string[];
  onToggle: (v: string) => void;
}) {
  const { colors, radius } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((opt) => {
        const on = value.includes(opt);
        return (
          <Pressable
            key={opt}
            onPress={() => onToggle(opt)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: radius.full,
              borderWidth: 1,
              borderColor: on ? colors.primary : colors.outlineVariant,
              backgroundColor: on ? colors.primary : 'transparent',
            }}
          >
            {on && <Ionicons name="checkmark" size={12} color={colors.onPrimary} />}
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: on ? colors.onPrimary : colors.onSurface }}>{opt}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SeasonManagerCard({ season }: { season: ActiveSeason }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surfaceContainerLow,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.outlineVariant,
        padding: spacing.md,
        gap: spacing.sm,
      }}
    >
      <View style={{ gap: 6 }}>
        <AppText variant="label" color={colors.onSurfaceVariant}>
          Tagging sign-ups for
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {SEASON_ORDER.map((id) => {
            const on = season.activeId === id;
            return (
              <Pressable
                key={id}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => season.setSeason(id)}
                style={{
                  minWidth: 58,
                  height: 40,
                  paddingHorizontal: 14,
                  borderRadius: radius.full,
                  borderWidth: 1.5,
                  borderColor: on ? colors.primary : colors.outlineVariant,
                  backgroundColor: on ? colors.primary : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: on ? colors.onPrimary : colors.onSurface,
                  }}
                >
                  {SEASONS[id].label}
                  {id === season.autoId ? ' · now' : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {!season.isAuto && (
          <Pressable onPress={season.resetSeason} style={{ alignSelf: 'flex-start', paddingVertical: 2 }}>
            <AppText variant="caption" color={colors.primary}>
              Back to the current term
            </AppText>
          </Pressable>
        )}
      </View>

      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: season.clubRush }}
        onPress={season.toggleClubRush}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          borderRadius: radius.md,
          borderWidth: 1.5,
          borderColor: colors.outlineVariant,
          backgroundColor: colors.surfaceContainer,
          paddingVertical: 10,
          paddingHorizontal: 12,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.onSurface }}>
            Club rush
          </Text>
          <Text style={{ fontSize: 12, color: colors.onSurfaceVariant }}>
            New sign-ups also get a “Club Rush” tag.
          </Text>
        </View>
        <View
          style={{
            width: 44,
            height: 26,
            borderRadius: 13,
            backgroundColor: season.clubRush ? colors.primary : colors.outline,
            padding: 3,
          }}
        >
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: colors.surface,
              transform: [{ translateX: season.clubRush ? 18 : 0 }],
            }}
          />
        </View>
      </Pressable>
    </View>
  );
}
