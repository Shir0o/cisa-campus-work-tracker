import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Contact } from '@cisa/core';
import { AppText } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { toneColors, toneForStage } from '../../theme/tokens';
import type { JourneyStage } from '../../lib/useJourneyData';

// "Where is {name} now?" bottom sheet — tap a stage to move the contact.
// Modal + scrim chrome copied from people/AddContactSheet.tsx (the only sheet
// pattern in the app; @gorhom/bottom-sheet isn't integrated yet).
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
  if (!contact) return null;

  const isHere = (stage: JourneyStage) =>
    stage.id === 'uncategorized' ? !contact.stage : stage.label === contact.stage;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            maxHeight: '80%',
          }}
        >
          <View
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.outline,
              opacity: 0.4,
              alignSelf: 'center',
              marginVertical: 12,
            }}
          />
          <View style={{ paddingHorizontal: spacing.lg, gap: 2 }}>
            <Text
              style={{ fontFamily: typography.fontSerif, fontSize: 18, fontWeight: '500', color: colors.onSurface }}
            >
              Where is {contact.name.split(' ')[0]} now?
            </Text>
            <AppText variant="caption" color={colors.onSurfaceVariant}>
              Move them to the step that fits today.
            </AppText>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 8 }}>
            {stages.map((stage) => {
              const here = isHere(stage);
              const { fg } = toneColors(colors, toneForStage(stages, stage.label));
              return (
                <Pressable
                  key={stage.id}
                  onPress={() => {
                    if (!here) onMove(contact.id, stage.id === 'uncategorized' ? '' : stage.label);
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
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: '500', color: colors.onSurface }}>
                    {stage.label}
                  </Text>
                  {here ? (
                    <Text
                      style={{ fontSize: 11, fontWeight: '700', color: colors.primary, textTransform: 'uppercase' }}
                    >
                      here now
                    </Text>
                  ) : (
                    <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceVariant} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
