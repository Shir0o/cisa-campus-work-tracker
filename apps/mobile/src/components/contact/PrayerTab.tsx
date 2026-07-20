import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { PrayerRecord } from '@cisa/core';
import { AppText } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';

// Contact Detail's Prayer tab — read + add only (no status cycling/burden
// editing here, unlike the standalone Prayer tab's PrayerThreadCard). Design
// oracle: ContactDetailsModal.tsx's "prayer" tab body.
export function PrayerTab({
  prayers,
  loading,
  canWrite,
  firstName,
  onAdd,
}: {
  prayers: PrayerRecord[];
  loading: boolean;
  canWrite: boolean;
  firstName: string;
  onAdd: (input: { burden: string; context?: string }) => Promise<void>;
}) {
  const { colors, radius, spacing } = useTheme();
  const [composing, setComposing] = useState(false);
  const [burden, setBurden] = useState('');
  const [context, setContext] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!burden.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onAdd({ burden, context });
      setBurden('');
      setContext('');
      setComposing(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText variant="heading">Prayers we're holding</AppText>
        {canWrite ? (
          <Pressable
            onPress={() => setComposing((v) => !v)}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1, borderColor: colors.outlineVariant }}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.onSurface }}>{composing ? 'Cancel' : '+ Add prayer'}</Text>
          </Pressable>
        ) : null}
      </View>

      {composing ? (
        <View style={{ gap: 8, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceContainerHigh, borderWidth: 1, borderColor: colors.outlineVariant }}>
          <TextInput
            autoFocus
            value={burden}
            onChangeText={setBurden}
            placeholder={`What are we praying for ${firstName}?`}
            placeholderTextColor={colors.onSurfaceVariant}
            style={{ height: 40, paddingHorizontal: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainer, fontSize: 13.5, color: colors.onSurface }}
          />
          <TextInput
            value={context}
            onChangeText={setContext}
            placeholder="Any background worth knowing as we pray… (optional)"
            placeholderTextColor={colors.onSurfaceVariant}
            multiline
            numberOfLines={2}
            style={{ minHeight: 56, padding: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainer, fontSize: 13, color: colors.onSurface, textAlignVertical: 'top' }}
          />
          <Pressable
            onPress={submit}
            disabled={!burden.trim() || submitting}
            style={{ alignSelf: 'flex-end', paddingHorizontal: 14, height: 32, borderRadius: radius.full, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', opacity: burden.trim() ? 1 : 0.5 }}
          >
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.onPrimary }}>{submitting ? 'Adding…' : 'Add prayer'}</Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <AppText variant="body" color={colors.onSurfaceVariant}>
          Loading…
        </AppText>
      ) : prayers.length === 0 ? (
        <View style={{ padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.outlineVariant, alignItems: 'center' }}>
          <AppText variant="caption">No prayers recorded for {firstName} yet.</AppText>
        </View>
      ) : (
        prayers.map((p) => {
          const answered = p.status === 'answered';
          const heldDays = p.date ? Math.max(0, Math.floor((Date.now() - new Date(p.date).getTime()) / 86_400_000)) : null;
          const tone = answered ? colors.stageTeal : p.status === 'unanswered' ? colors.onSurfaceVariant : colors.stageViolet;
          const toneSoft = answered ? colors.stageTealSoft : p.status === 'unanswered' ? colors.surfaceVariant : colors.stageVioletSoft;
          return (
            <View key={p.id} style={{ padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceContainerHigh, borderWidth: 1, borderColor: colors.outlineVariant }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, backgroundColor: toneSoft }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone }} />
                  <Text style={{ fontSize: 11, fontWeight: '600', color: tone }}>{answered ? 'answered' : p.status === 'unanswered' ? 'closed' : 'open'}</Text>
                </View>
                {heldDays != null ? (
                  <AppText variant="caption">
                    held {heldDays} {heldDays === 1 ? 'day' : 'days'}
                  </AppText>
                ) : null}
              </View>
              <Text style={{ fontSize: 13.5, lineHeight: 19, color: colors.onSurface }}>{p.burden}</Text>
            </View>
          );
        })
      )}
    </View>
  );
}
