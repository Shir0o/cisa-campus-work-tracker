import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Contact, Stage } from '@cisa/core';
import { AppText, Avatar, StatusPill } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { toneForStage } from '../../theme/tokens';

// "Your personal contacts" bottom sheet — design: myd-picker.
export function ContactsPickerSheet({
  visible,
  contacts,
  stages,
  personalContactIds,
  onToggle,
  onClose,
}: {
  visible: boolean;
  contacts: Contact[];
  stages: Stage[];
  personalContactIds: Set<string>;
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const { colors, radius, spacing, typography } = useTheme();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            maxHeight: '85%',
          }}
        >
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.outline, opacity: 0.4, alignSelf: 'center', marginVertical: 12 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg }}>
            <Text style={{ fontFamily: typography.fontSerif, fontSize: 18, fontWeight: '500', color: colors.onSurface }}>
              Your personal contacts
            </Text>
            <Pressable onPress={onClose} hitSlop={8} style={{ padding: 6 }}>
              <Ionicons name="close" size={18} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>
          <AppText variant="caption" color={colors.onSurfaceVariant} style={{ paddingHorizontal: spacing.lg, marginTop: 6, marginBottom: 12, lineHeight: 18 }}>
            Prayers and reminders for these contacts appear in your day. Everyone is still visible on the People page.
          </AppText>
          <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 32, gap: 2 }}>
            {contacts.map((c) => {
              const checked = personalContactIds.has(c.id);
              return (
                <Pressable
                  key={c.id}
                  onPress={() => onToggle(c.id)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 10,
                    borderRadius: radius.md,
                    backgroundColor: checked ? colors.stageAccentSoft : pressed ? colors.surfaceVariant : 'transparent',
                  })}
                >
                  <Avatar name={c.name} size={32} />
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 14.5, color: colors.onSurface }}>
                    {c.name}
                  </Text>
                  {c.stage ? <StatusPill label={c.stage} tone={toneForStage(stages, c.stage)} /> : null}
                  {checked && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
