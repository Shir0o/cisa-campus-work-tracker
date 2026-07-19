import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Contact } from '@cisa/core';
import { AppText, Sheet } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { toneColors, toneForStage } from '../../theme/tokens';
import type { JourneyStage } from '../../lib/useJourneyData';

// "Where is {name} now?" bottom sheet — tap a stage to move the contact.
export function MoveSheet({
  visible,
  contact,
  stages,
  onMove,
  onClose,
}: {
  visible: boolean;
  contact: Contact | null;
  stages: JourneyStage[];
  onMove: (contactId: string, newStageLabel: string) => void;
  onClose: () => void;
}) {
  const { colors, radius, spacing, typography } = useTheme();
  // Keep the last-known contact rendered while the sheet animates closed, so
  // content doesn't blank out mid-slide when the caller clears `contact`.
  const [shown, setShown] = useState(contact);
  useEffect(() => {
    if (contact) setShown(contact);
  }, [contact]);

  if (!shown) return null;

  const isHere = (stage: JourneyStage) =>
    stage.id === 'uncategorized' ? !shown.stage : stage.label === shown.stage;

  return (
    <Sheet visible={visible} onClose={onClose} maxHeightRatio={0.8}>
      <View style={{ paddingHorizontal: spacing.lg, gap: 2 }}>
        <Text style={{ fontFamily: typography.fontSerif, fontSize: 18, fontWeight: '500', color: colors.onSurface }}>
          Where is {shown.name.split(' ')[0]} now?
        </Text>
        <AppText variant="caption" color={colors.onSurfaceVariant}>
          Move them to the step that fits today.
        </AppText>
      </View>

      <View style={{ padding: spacing.lg, gap: 8 }}>
        {stages.map((stage) => {
          const here = isHere(stage);
          const { fg } = toneColors(colors, toneForStage(stages, stage.label));
          return (
            <Pressable
              key={stage.id}
              onPress={() => {
                if (!here) onMove(shown.id, stage.id === 'uncategorized' ? '' : stage.label);
                onClose();
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 14,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: here ? colors.primary : colors.outlineVariant,
                backgroundColor: here ? colors.primaryContainer : colors.surface,
              }}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: fg }} />
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '500', color: colors.onSurface }}>{stage.label}</Text>
              {here ? (
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary, textTransform: 'uppercase' }}>
                  here now
                </Text>
              ) : (
                <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceVariant} />
              )}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}
