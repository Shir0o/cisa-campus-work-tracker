// The strip that stays put while an admin is borrowing someone's view — the
// design's `imp-pill` (views/mobile/app.jsx): a name, a way to pick someone
// else, and a way back. Room-agnostic on purpose (Material tokens, not v2's
// palette): it floats over the trainee's green room, the full-timer's navy
// paper, and the member app alike, so it can't be styled AS any one of them.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { roleLabel, type AppRole } from '@cisa/core';
import { useTheme } from '../../theme/ThemeProvider';

export function ImpersonatePill({
  name,
  role,
  scope,
  onSwitch,
  onExit,
}: {
  name?: string;
  role: AppRole;
  scope: { people: string; pages: string };
  onSwitch: () => void;
  onExit: () => void;
}) {
  const { colors, typography, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const label = name || roleLabel(role);

  return (
    <View
      style={{
        position: 'absolute',
        left: 10,
        right: 10,
        top: insets.top + 6,
        backgroundColor: colors.surfaceContainerHighest,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.outlineVariant,
        paddingHorizontal: 12,
        paddingVertical: 8,
        gap: 6,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 6,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 12 }}>👁️</Text>
        <Text
          style={{
            flex: 1,
            fontFamily: typography.fontSansSemiBold,
            fontSize: 12.5,
            color: colors.onSurface,
          }}
          numberOfLines={1}
        >
          Seeing as {label}
        </Text>
        <Pressable
          onPress={onSwitch}
          hitSlop={6}
          style={({ pressed }) => ({
            minHeight: 30,
            paddingHorizontal: 10,
            borderRadius: radius.sm,
            backgroundColor: colors.surfaceVariant,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ fontFamily: typography.fontSansSemiBold, fontSize: 11.5, color: colors.onSurfaceVariant }}>
            Switch
          </Text>
        </Pressable>
        <Pressable
          onPress={onExit}
          hitSlop={6}
          style={({ pressed }) => ({
            minHeight: 30,
            paddingHorizontal: 10,
            borderRadius: radius.sm,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ fontFamily: typography.fontSansSemiBold, fontSize: 11.5, color: colors.onPrimary }}>
            Back to me
          </Text>
        </Pressable>
      </View>
      <Text
        style={{ fontFamily: typography.fontSans, fontSize: 10.5, lineHeight: 14, color: colors.onSurfaceVariant }}
        numberOfLines={2}
      >
        {scope.people}. {scope.pages}. Anything you do here is saved as them.
      </Text>
    </View>
  );
}
