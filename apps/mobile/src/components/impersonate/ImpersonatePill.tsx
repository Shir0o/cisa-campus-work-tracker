// The strip that stays put while an admin is borrowing someone's view — the
// design's `imp-pill` (views/mobile/app.jsx): a name, a way to pick someone
// else, and a way back. Room-agnostic on purpose (Material tokens, not v2's
// palette): it sits above the trainee's green room, the full-timer's navy
// paper, and the member app alike, so it can't be styled AS any one of them.
//
// It takes real space at the top of the screen rather than floating over it.
// The design never has to make this call — its `.imp-pill` renders in the OUTER
// preview shell, over the phone FRAME, and the app inside the frame carries no
// banner at all (views/mobile/app.jsx passes the borrowed role in on the iframe
// URL). On a real device there is no "outside the phone", so we follow the
// design's other impersonation strip instead: the web `.imp-bar`, which is
// in-flow and has never covered anything. ImpersonateLayer owns the layout;
// this strip owns the top safe-area inset while it is showing.
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
        backgroundColor: colors.surfaceContainerHighest,
        borderBottomWidth: 1,
        borderBottomColor: colors.outlineVariant,
        paddingTop: insets.top + 8,
        paddingHorizontal: 12,
        paddingBottom: 8,
        gap: 6,
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
