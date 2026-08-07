// The full-screen picker — the design's `ImpersonateModal` (views/impersonate.jsx)
// and the mobile `imp-sheet` (views/mobile/app.jsx): "Borrow someone's view for
// a moment. This is yours alone." over a searchable, grouped roster. Each row
// says its blast radius (`impScope`) before you step in.
import React from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ImpersonateTarget } from '@cisa/core';
import type { ImpGroup } from '@cisa/core';
import { useTheme } from '../../theme/ThemeProvider';
import { PersonMark } from '../queue/atoms';

export function ImpersonateSheet({
  visible,
  groups,
  currentKey,
  query,
  onQueryChange,
  onPick,
  onClose,
  scopeFor,
}: {
  visible: boolean;
  groups: ImpGroup[];
  currentKey: string | null;
  query: string;
  onQueryChange: (q: string) => void;
  onPick: (target: ImpersonateTarget) => void;
  onClose: () => void;
  scopeFor: (target: ImpersonateTarget) => { people: string; pages: string };
}) {
  const { colors, typography, radius, spacing } = useTheme();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: spacing.sm,
          }}
        >
          <View style={{ flex: 1, paddingRight: spacing.md }}>
            <Text style={{ fontFamily: typography.fontSerif, fontSize: typography.size.lg, color: colors.onBackground }}>
              See it as they do
            </Text>
            <Text
              style={{
                fontFamily: typography.fontSans,
                fontSize: typography.size.sm,
                lineHeight: typography.size.sm * typography.lineHeight,
                color: colors.onSurfaceVariant,
                marginTop: 4,
              }}
            >
              Borrow someone's view for a moment. This is yours alone.
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            accessibilityLabel="Close"
            hitSlop={10}
            style={({ pressed }) => ({
              width: 32,
              height: 32,
              borderRadius: radius.full,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.surfaceVariant,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontSize: 15, color: colors.onSurfaceVariant }}>✕</Text>
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
          <TextInput
            value={query}
            onChangeText={onQueryChange}
            placeholder="Find a person…"
            placeholderTextColor={colors.onSurfaceVariant}
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              minHeight: 46,
              paddingHorizontal: spacing.md,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceContainer,
              borderWidth: 1,
              borderColor: colors.outlineVariant,
              fontFamily: typography.fontSans,
              fontSize: typography.size.base,
              color: colors.onSurface,
            }}
          />
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}>
          {groups.map((group) => (
            <View key={group.id} style={{ marginBottom: spacing.lg }}>
              <Text
                style={{
                  fontFamily: typography.fontSansSemiBold,
                  fontSize: typography.size.sm,
                  color: colors.onSurface,
                }}
              >
                {group.label}
              </Text>
              <Text
                style={{
                  fontFamily: typography.fontSans,
                  fontSize: typography.size.xs,
                  color: colors.onSurfaceVariant,
                  marginTop: 2,
                  marginBottom: spacing.sm,
                }}
              >
                {group.note}
              </Text>
              {group.items.map((target) => {
                const active = target.key === currentKey;
                const scope = scopeFor(target);
                return (
                  <Pressable
                    key={target.key}
                    onPress={() => onPick(target)}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      minHeight: 60,
                      paddingVertical: 8,
                      paddingHorizontal: spacing.sm,
                      borderRadius: radius.md,
                      backgroundColor: active ? colors.primaryContainer : 'transparent',
                      opacity: pressed ? 0.75 : 1,
                    })}
                  >
                    <PersonMark name={target.name} id={target.key} size={38} radius={13} fontSize={13} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={{ fontFamily: typography.fontSansSemiBold, fontSize: typography.size.base, color: colors.onSurface }}
                        numberOfLines={1}
                      >
                        {target.name}
                      </Text>
                      <Text
                        style={{ fontFamily: typography.fontSans, fontSize: typography.size.xs, color: colors.onSurfaceVariant }}
                        numberOfLines={1}
                      >
                        {target.sub}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', maxWidth: 132 }}>
                      {active ? (
                        <Text
                          style={{
                            fontFamily: typography.fontSansSemiBold,
                            fontSize: typography.size.xs,
                            color: colors.primary,
                          }}
                        >
                          You're here
                        </Text>
                      ) : (
                        <>
                          <Text
                            style={{ fontFamily: typography.fontSansSemiBold, fontSize: typography.size.xs, color: colors.onSurfaceVariant, textAlign: 'right' }}
                            numberOfLines={2}
                          >
                            {scope.people}
                          </Text>
                          <Text
                            style={{ fontFamily: typography.fontSans, fontSize: typography.size.xs, color: colors.onSurfaceVariant, textAlign: 'right' }}
                            numberOfLines={2}
                          >
                            {scope.pages}
                          </Text>
                        </>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
          {!groups.length && (
            <Text style={{ fontFamily: typography.fontSans, fontSize: typography.size.base, color: colors.onSurfaceVariant, paddingVertical: spacing.lg }}>
              Nobody by that name.
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
