import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FEEDBACK_KINDS, type FeedbackKind } from '@cisa/core';
import { AppText } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { toneColors } from '../../theme/tokens';
import { FEEDBACK_TONE_MAP, FEEDBACK_ICON } from './tone';

// Kind selector for the submit form — 4 tonal cards, 2 per row. Mirrors web's
// SubmitFeedback.tsx grid of FEEDBACK_KINDS buttons.
export function FeedbackKindPicker({
  value,
  onChange,
}: {
  value: FeedbackKind;
  onChange: (kind: FeedbackKind) => void;
}) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {FEEDBACK_KINDS.map((k) => {
        const on = value === k.id;
        const { fg, soft } = toneColors(colors, FEEDBACK_TONE_MAP[k.tone]);
        return (
          <Pressable
            key={k.id}
            onPress={() => onChange(k.id)}
            style={{
              flexBasis: '47%',
              flexGrow: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              padding: spacing.sm + 2,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: on ? 'transparent' : colors.outlineVariant,
              backgroundColor: on ? soft : colors.surface,
            }}
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: radius.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: on ? soft : colors.surfaceContainer,
              }}
            >
              <Ionicons name={FEEDBACK_ICON[k.id]} size={16} color={on ? fg : colors.onSurfaceVariant} />
            </View>
            <AppText variant="label" color={on ? fg : colors.onSurface} style={{ flexShrink: 1, fontWeight: '600' }}>
              {k.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
