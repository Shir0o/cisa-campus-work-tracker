import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Contact } from '@cisa/core';
import { AppText, Avatar } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';

// "Hold someone in prayer" bottom sheet — search + tap-to-add. Design:
// views/prayer.jsx's pickerBody / MdBottomSheet, adapted to the plain RN
// Modal pattern already used by myday/ContactsPickerSheet.tsx.
export function HoldPrayerSheet({
  visible,
  contacts,
  heldIds,
  onAdd,
  onClose,
}: {
  visible: boolean;
  contacts: Contact[];
  heldIds: Set<string>;
  onAdd: (contact: Contact) => void;
  onClose: () => void;
}) {
  const { colors, radius, spacing, typography } = useTheme();
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const addable = contacts.filter(
    (c) => !heldIds.has(c.id) && (query === '' || c.name.toLowerCase().includes(query)),
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
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg }}>
            <Text style={{ fontFamily: typography.fontSerif, fontSize: 18, fontWeight: '500', color: colors.onSurface }}>
              Hold someone in prayer
            </Text>
            <Pressable onPress={onClose} hitSlop={8} style={{ padding: 6 }}>
              <Ionicons name="close" size={18} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>
          <View style={{ paddingHorizontal: spacing.lg, marginTop: 6, marginBottom: 12 }}>
            <TextInput
              autoFocus
              value={q}
              onChangeText={setQ}
              placeholder="Search anyone to hold in prayer…"
              placeholderTextColor={colors.onSurfaceVariant}
              style={{
                borderWidth: 1,
                borderColor: colors.outlineVariant,
                borderRadius: radius.md,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 14.5,
                color: colors.onSurface,
                backgroundColor: colors.surfaceContainer,
              }}
            />
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 32, gap: 2 }}>
            {addable.length === 0 && (
              <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center', padding: 20 }}>
                {query ? 'No one matches that.' : "Everyone's already here."}
              </AppText>
            )}
            {addable.slice(0, 40).map((c) => (
              <Pressable
                key={c.id}
                onPress={() => {
                  onAdd(c);
                  setQ('');
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 10,
                  borderRadius: radius.md,
                  backgroundColor: pressed ? colors.surfaceVariant : 'transparent',
                })}
              >
                <Avatar name={c.name} size={32} />
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 14.5, color: colors.onSurface }}>
                  {c.name}
                </Text>
                <Ionicons name="add" size={16} color={colors.primary} />
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
