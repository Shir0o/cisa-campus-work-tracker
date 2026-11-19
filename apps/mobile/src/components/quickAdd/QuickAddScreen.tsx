// Quick add (cut-or-keep §26): one box, parsed into a preview where every
// field can be changed and nothing saves until Save. Reached from the app
// icon's long-press shortcut, so it opens on the box itself.
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  QUICK_ADD_STEPS,
  SIGNUP_YEARS,
  quickAddCanSave,
  type QuickAddContactDraft,
  type QuickAddInteractionDraft,
  type QuickAddMatch,
  type QuickAddReminderDraft,
} from '@cisa/core';
import { SafeAreaView } from '../ui/SafeArea';
import { Room } from '../v2/Widget';
import { PrimaryButton, SecondaryButton } from '../queue/atoms';
import { useV2Theme } from '../../theme/v2';
import { roomForRole } from '../../theme/v2';
import { useAuth } from '../../lib/AuthProvider';
import { useLanguage } from '../../lib/LanguageProvider';
import { requestQuickAddParse } from '../../lib/quickAddParse';
import { saveQuickAdd } from '../../lib/data/quickAdd';
import { MULTILINE_FIELD_MAX_HEIGHT } from '../ui/KeyboardField';

type Phase = 'input' | 'parsing' | 'preview' | 'saving' | 'saved';

const emptyContact = (): QuickAddContactDraft => ({
  name: '',
  phone: '',
  email: '',
  year: '',
  step: '',
  tags: [],
});

export function QuickAddScreen() {
  const { role } = useAuth();
  return (
    <Room room={roomForRole(role)}>
      <QuickAddBody />
    </Room>
  );
}

function QuickAddBody() {
  const { c, font, radius, fs } = useV2Theme();
  const { user, uid } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('input');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [contact, setContact] = useState<QuickAddContactDraft>(emptyContact);
  const [matches, setMatches] = useState<QuickAddMatch[]>([]);
  const [matchId, setMatchId] = useState<string | null>(null);
  // Several people matched: nothing is chosen yet, so Save waits for a tap.
  const [awaitingChoice, setAwaitingChoice] = useState(false);
  const [interaction, setInteraction] = useState<QuickAddInteractionDraft | null>(null);
  const [prayer, setPrayer] = useState('');
  const [reminder, setReminder] = useState<QuickAddReminderDraft | null>(null);

  const set = <K extends keyof QuickAddContactDraft>(key: K, value: QuickAddContactDraft[K]) =>
    setContact((current) => ({ ...current, [key]: value }));
  const setTalk = (key: keyof QuickAddInteractionDraft, value: string) =>
    setInteraction((current) => (current ? { ...current, [key]: value } : current));

  const canSave = quickAddCanSave({ matchId, contact, awaitingMatchChoice: awaitingChoice });
  const picked = matches.find((match) => match.id === matchId) ?? null;

  const handleParse = async () => {
    if (!text.trim()) {
      setError(t('mobile.quickAdd.note_required'));
      return;
    }
    setError(null);
    setPhase('parsing');
    try {
      let token: string | null = null;
      try {
        token = (await user?.getIdToken()) ?? null;
      } catch {
        token = null;
      }
      const result = await requestQuickAddParse(text, token);
      const nextMatches = Array.isArray(result.match) ? result.match : [];
      setContact({ ...emptyContact(), ...(result.contact || {}) });
      setMatches(nextMatches);
      // One candidate is the person; several stay unchosen so the preview asks.
      setMatchId(nextMatches.length === 1 ? nextMatches[0].id : null);
      setAwaitingChoice(nextMatches.length > 1);
      setInteraction(result.interaction ?? null);
      setPrayer(result.prayer ?? '');
      setReminder(result.reminder ?? null);
      setPhase('preview');
    } catch (e: any) {
      setError(e?.message || t('mobile.quickAdd.parse_failed'));
      setPhase('input');
    }
  };

  const handleSave = async () => {
    if (!canSave || phase === 'saving') return;
    setError(null);
    setPhase('saving');
    try {
      await saveQuickAdd(
        {
          matchId,
          matchName: picked?.name ?? null,
          contact,
          interaction,
          prayer,
          reminder,
        },
        { uid, name: user?.displayName ?? null },
      );
      setPhase('saved');
    } catch (e: any) {
      setError(e?.message || t('mobile.quickAdd.save_failed'));
      setPhase('preview');
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.room.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: 40, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontFamily: font.extra, fontSize: fs(24), letterSpacing: -0.6, color: c.room.ink }}>
          {t('mobile.quickAdd.title')}
        </Text>
        <Text style={{ fontFamily: font.semi, fontSize: fs(13), lineHeight: fs(19), color: c.room.ink3 }}>
          {t('mobile.quickAdd.subtitle')}
        </Text>

        {error && (
          <View
            accessibilityRole="alert"
            style={{
              padding: 12,
              borderRadius: radius.note,
              backgroundColor: c.card.bg2,
              borderWidth: 1,
              borderColor: c.card.border,
            }}
          >
            <Text style={{ fontFamily: font.semi, fontSize: fs(13), color: c.card.ink }}>{error}</Text>
          </View>
        )}

        {(phase === 'input' || phase === 'parsing') && (
          <>
            <Field
              label={t('mobile.quickAdd.note_label')}
              value={text}
              onChange={setText}
              placeholder={t('mobile.quickAdd.placeholder')}
              multiline
              minHeight={150}
            />
            {phase === 'parsing' ? (
              <View style={{ alignItems: 'center', paddingVertical: 18, gap: 10 }}>
                <ActivityIndicator color={c.room.ink2} />
                <Text style={{ fontFamily: font.semi, fontSize: fs(13), color: c.room.ink3 }}>
                  {t('mobile.quickAdd.parsing')}
                </Text>
              </View>
            ) : (
              <PrimaryButton
                title={t('mobile.quickAdd.parse')}
                onPress={() => void handleParse()}
                disabled={!text.trim()}
              />
            )}
          </>
        )}

        {phase === 'preview' && (
          <>
            {matches.length > 0 && (
              <View style={{ gap: 9 }}>
                <Kicker>{t('mobile.quickAdd.matches')}</Kicker>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Choice
                    label={t('mobile.quickAdd.new_person')}
                    selected={!awaitingChoice && matchId === null}
                    onPress={() => {
                      setMatchId(null);
                      setAwaitingChoice(false);
                    }}
                  />
                  {matches.map((match) => (
                    <Choice
                      key={match.id}
                      label={match.name}
                      selected={matchId === match.id}
                      onPress={() => {
                        setMatchId(match.id);
                        setAwaitingChoice(false);
                      }}
                    />
                  ))}
                </View>
                <Text style={{ fontFamily: font.semi, fontSize: fs(12), color: c.room.ink3 }}>
                  {t('mobile.quickAdd.match_hint')}
                </Text>
              </View>
            )}

            <Kicker>{t('mobile.quickAdd.contact')}</Kicker>
            <Field label={t('mobile.quickAdd.name')} value={contact.name} onChange={(v) => set('name', v)} />
            <Field
              label={t('mobile.quickAdd.phone')}
              value={contact.phone}
              onChange={(v) => set('phone', v)}
              keyboardType="phone-pad"
            />
            <Field
              label={t('mobile.quickAdd.email')}
              value={contact.email}
              onChange={(v) => set('email', v)}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Kicker>{t('mobile.quickAdd.year')}</Kicker>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {SIGNUP_YEARS.map((year) => (
                <Choice
                  key={year}
                  label={year}
                  selected={contact.year === year}
                  onPress={() => set('year', contact.year === year ? '' : year)}
                />
              ))}
            </View>

            <Field label={t('mobile.quickAdd.step')} value={contact.step} onChange={(v) => set('step', v)} />
            <Field
              label={t('mobile.quickAdd.tags')}
              value={contact.tags.join(', ')}
              onChange={(v) =>
                set(
                  'tags',
                  v
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                )
              }
              placeholder={t('mobile.quickAdd.tags_hint')}
            />

            {!canSave && (
              <Text style={{ fontFamily: font.semi, fontSize: fs(12.5), color: c.room.ink3 }}>
                {t('mobile.quickAdd.no_name')}
              </Text>
            )}

            {interaction && (
              <>
                <Kicker>{t('mobile.quickAdd.interaction')}</Kicker>
                <Field
                  label={t('mobile.quickAdd.interaction_type')}
                  value={interaction.type}
                  onChange={(v) => setTalk('type', v)}
                />
                <Field
                  label={t('mobile.quickAdd.interaction_when')}
                  value={interaction.when}
                  onChange={(v) => setTalk('when', v)}
                />
                <Field
                  label={t('mobile.quickAdd.interaction_notes')}
                  value={interaction.notes}
                  onChange={(v) => setTalk('notes', v)}
                  multiline
                  minHeight={88}
                />
              </>
            )}

            <Kicker>{t('mobile.quickAdd.prayer')}</Kicker>
            <Field
              label={t('mobile.quickAdd.prayer_text')}
              value={prayer}
              onChange={setPrayer}
              placeholder={t('mobile.quickAdd.prayer_hint')}
            />

            {reminder && (
              <>
                <Kicker>{t('mobile.quickAdd.reminder')}</Kicker>
                <Field
                  label={t('mobile.quickAdd.reminder_when')}
                  value={reminder.when}
                  onChange={(v) => setReminder((current) => (current ? { ...current, when: v } : current))}
                />
                <Field
                  label={t('mobile.quickAdd.reminder_text')}
                  value={reminder.text}
                  onChange={(v) => setReminder((current) => (current ? { ...current, text: v } : current))}
                />
              </>
            )}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title={t('mobile.quickAdd.save')}
                  onPress={() => void handleSave()}
                  disabled={!canSave}
                />
              </View>
              <View style={{ width: 110 }}>
                <SecondaryButton title={t('mobile.quickAdd.back')} onPress={() => setPhase('input')} />
              </View>
            </View>
          </>
        )}

        {phase === 'saving' && (
          <View style={{ alignItems: 'center', paddingVertical: 36, gap: 10 }}>
            <ActivityIndicator color={c.room.ink2} />
            <Text style={{ fontFamily: font.semi, fontSize: fs(13), color: c.room.ink3 }}>
              {t('mobile.quickAdd.saving')}
            </Text>
          </View>
        )}

        {phase === 'saved' && (
          <View style={{ gap: 14, paddingVertical: 30, alignItems: 'center' }}>
            <Text style={{ fontFamily: font.extra, fontSize: fs(22), color: c.room.ink }}>
              {t('mobile.quickAdd.saved')}
            </Text>
            <Text
              style={{
                fontFamily: font.semi,
                fontSize: fs(13),
                lineHeight: fs(19),
                color: c.room.ink3,
                textAlign: 'center',
              }}
            >
              {t('mobile.quickAdd.saved_desc')}
            </Text>
            <View style={{ alignSelf: 'stretch', marginTop: 8 }}>
              <PrimaryButton title={t('mobile.quickAdd.done')} onPress={() => router.replace('/')} />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  minHeight,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  minHeight?: number;
  keyboardType?: 'default' | 'phone-pad' | 'email-address';
  autoCapitalize?: 'none' | 'sentences';
}) {
  const { c, font, radius, fs } = useV2Theme();
  return (
    <View style={{ gap: 7 }}>
      <Text style={{ fontFamily: font.bold, fontSize: fs(11), color: c.room.ink3 }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.room.ink3}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? (multiline ? 'sentences' : 'words')}
        style={{
          minHeight: minHeight ?? 48,
          ...(multiline ? { maxHeight: MULTILINE_FIELD_MAX_HEIGHT } : null),
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderRadius: radius.chip,
          borderWidth: 1,
          borderColor: c.card.border,
          backgroundColor: c.card.bg,
          color: c.card.ink,
          fontFamily: font.medium,
          fontSize: fs(15),
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { c, font, radius, fs } = useV2Theme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: 40,
        justifyContent: 'center',
        paddingHorizontal: 14,
        borderRadius: radius.chip,
        borderWidth: 1.5,
        borderColor: selected ? c.card.inverse : c.card.border,
        backgroundColor: selected ? c.card.inverse : 'transparent',
      }}
    >
      <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: selected ? c.card.onInverse : c.card.ink2 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function Kicker({ children }: { children: string }) {
  const { c, font, fs } = useV2Theme();
  return (
    <Text style={{ fontFamily: font.bold, fontSize: fs(10.5), color: c.room.ink3, marginTop: 6 }}>
      {children}
    </Text>
  );
}
