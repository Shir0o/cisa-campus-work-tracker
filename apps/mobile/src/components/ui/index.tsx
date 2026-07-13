// First-pass RN primitive library. The web app had no formal primitive layer
// (three files in src/components/ui + inline Tailwind everywhere), so these are
// net-new, derived from src/components/landing/primitives.tsx and the design's
// "Field notes" language. Everything reads colors/spacing from the theme.
import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  type ViewStyle,
  type TextStyle,
  type StyleProp,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { getUserInitials } from '@cisa/core';
import { useTheme } from '../../theme/ThemeProvider';
import { toneColors, type ToneKey } from '../../theme/tokens';

// ── Screen ──────────────────────────────────────────────────────────────────
export function Screen({
  children,
  edges = ['top'],
  style,
}: {
  children: React.ReactNode;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: colors.background }, style]}>
      {children}
    </SafeAreaView>
  );
}

// ── Text ────────────────────────────────────────────────────────────────────
type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption';

export function AppText({
  children,
  variant = 'body',
  color,
  style,
  numberOfLines,
}: {
  children: React.ReactNode;
  variant?: TextVariant;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const { colors, typography } = useTheme();
  const serif = variant === 'display' || variant === 'title' || variant === 'heading';
  const size: Record<TextVariant, number> = {
    display: typography.size.xxl,
    title: typography.size.xl,
    heading: typography.size.lg,
    body: typography.size.base,
    label: typography.size.sm,
    caption: typography.size.xs,
  };
  const base: TextStyle = {
    fontFamily: serif ? typography.fontSerif : typography.fontSans,
    fontSize: size[variant],
    fontWeight: serif ? '500' : variant === 'label' ? '600' : '400',
    color: color ?? (variant === 'caption' || variant === 'label' ? colors.onSurfaceVariant : colors.onSurface),
  };
  return (
    <Text numberOfLines={numberOfLines} style={[base, style]}>
      {children}
    </Text>
  );
}

// ── Button ──────────────────────────────────────────────────────────────────
type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  full,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius, spacing } = useTheme();
  const bg =
    variant === 'primary' ? colors.primary : variant === 'secondary' ? colors.surfaceVariant : 'transparent';
  const fg =
    variant === 'primary' ? colors.onPrimary : variant === 'secondary' ? colors.onSurface : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: radius.full,
          paddingVertical: 12,
          paddingHorizontal: spacing.lg,
          minHeight: 44,
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: full ? 'stretch' : 'flex-start',
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          borderWidth: variant === 'ghost' ? 1 : 0,
          borderColor: colors.outlineVariant,
        },
        style,
      ]}
    >
      <Text style={{ color: fg, fontWeight: '600', fontSize: 15 }}>{title}</Text>
    </Pressable>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────
export function Card({
  children,
  onPress,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius, spacing } = useTheme();
  const cardStyle: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    padding: spacing.lg,
  };
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [cardStyle, { opacity: pressed ? 0.9 : 1 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[cardStyle, style]}>{children}</View>;
}

// ── Chip ────────────────────────────────────────────────────────────────────
export function Chip({ label, tone = 'neutral' }: { label: string; tone?: ToneKey }) {
  const { colors, radius } = useTheme();
  const { fg, soft } = toneColors(colors, tone);
  return (
    <View
      style={{
        backgroundColor: soft,
        borderRadius: radius.full,
        paddingHorizontal: 10,
        paddingVertical: 4,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ color: fg, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

// ── Avatar ──────────────────────────────────────────────────────────────────
export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.primaryContainer,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: colors.onPrimaryContainer, fontWeight: '600', fontSize: size * 0.36 }}>
        {getUserInitials(name)}
      </Text>
    </View>
  );
}

// ── SectionHead ─────────────────────────────────────────────────────────────
export function SectionHead({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
      }}
    >
      <AppText variant="heading">{title}</AppText>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ── StatusPill ──────────────────────────────────────────────────────────────
export function StatusPill({ label, tone = 'accent' }: { label: string; tone?: ToneKey }) {
  const { colors, radius } = useTheme();
  const { fg, soft } = toneColors(colors, tone);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: soft,
        borderRadius: radius.full,
        paddingHorizontal: 10,
        paddingVertical: 4,
        alignSelf: 'flex-start',
      }}
    >
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: fg }} />
      <Text style={{ color: fg, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}
