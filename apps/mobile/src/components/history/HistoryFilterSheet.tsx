import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HISTORY_KINDS, type Bucket } from '@cisa/core';
import { AppText } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';

// "Filter history" bottom sheet — kind + team-member pill groups, adapted
// from the web's HistoryMobile.tsx filter sheet (a <select> becomes pills,
// since RN has no clean native select) onto the plain RN Modal pattern
// already used by prayer/HoldPrayerSheet.tsx.
export function HistoryFilterSheet({
  visible,
  kind,
  setKind,
  who,
  setWho,
  staff,
  onClose,
}: {
  visible: boolean;
  kind: 'all' | Bucket;
  setKind: (kind: 'all' | Bucket) => void;
  who: string;
  setWho: (who: string) => void;
  staff: string[];
  onClose: () => void;
}) {
  const { colors, radius, spacing, typography } = useTheme();

  const Pill = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors.outlineVariant,
        backgroundColor: active ? colors.primary : colors.surface,
      }}
    >
      <Text style={{ fontSize: 12.5, fontWeight: '600', color: active ? colors.onPrimary : colors.onSurfaceVariant }}>
        {label}
      </Text>
    </Pressable>
  );

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
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: spacing.lg }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: typography.fontSerif, fontSize: 18, fontWeight: '500', color: colors.onSurface }}>
                Filter history
              </Text>
              <AppText variant="caption">Narrow down logged moments by kind or who.</AppText>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={{ padding: 6 }}>
              <Ionicons name="close" size={18} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 32, gap: spacing.lg }}>
            <View style={{ gap: 10 }}>
              <AppText variant="label">Kind of moment</AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {HISTORY_KINDS.map((k) => (
                  <Pill key={k.id} label={k.label} active={kind === k.id} onPress={() => setKind(k.id)} />
                ))}
              </View>
            </View>

            <View style={{ gap: 10 }}>
              <AppText variant="label">Team member</AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Pill label="Whole team" active={who === 'all'} onPress={() => setWho('all')} />
                {staff.map((name) => (
                  <Pill key={name} label={name} active={who === name} onPress={() => setWho(name)} />
                ))}
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.outlineVariant }}>
              <Pressable
                onPress={() => {
                  setKind('all');
                  setWho('all');
                  onClose();
                }}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.outlineVariant,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.onSurfaceVariant }}>Reset all</Text>
              </Pressable>
              <Pressable
                onPress={onClose}
                style={{
                  flex: 2,
                  paddingVertical: 12,
                  borderRadius: radius.md,
                  backgroundColor: colors.primary,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.onPrimary }}>Apply filters</Text>
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
