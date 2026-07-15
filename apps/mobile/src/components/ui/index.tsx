// First-pass RN primitive library. The web app had no formal primitive layer
// (three files in src/components/ui + inline Tailwind everywhere), so these are
// net-new, derived from src/components/landing/primitives.tsx and the design's
// "Field notes" language. Everything reads colors/spacing from the theme.
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Image,
  type ViewStyle,
  type TextStyle,
  type TextInputProps,
  type StyleProp,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
export function Avatar({ name, size = 44, photoURL }: { name: string; size?: number; photoURL?: string }) {
  const { colors } = useTheme();
  if (photoURL) {
    return (
      <Image
        source={{ uri: photoURL }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primaryContainer }}
      />
    );
  }
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

// ── IconButton ──────────────────────────────────────────────────────────────
// A round/square tonal icon tap-target — the message button on a person row,
// the nudge prompt's icon, and an inbox row's tonal node.
export function IconButton({
  name,
  onPress,
  size = 42,
  tone = 'accent',
  shape = 'rounded',
}: {
  name: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  size?: number;
  tone?: ToneKey;
  shape?: 'rounded' | 'circle';
}) {
  const { colors, radius } = useTheme();
  const { fg, soft } = toneColors(colors, tone);
  const base: ViewStyle = {
    width: size,
    height: size,
    borderRadius: shape === 'circle' ? size / 2 : radius.md,
    backgroundColor: soft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  };
  const icon = <Ionicons name={name} size={size * 0.42} color={fg} />;
  if (!onPress) return <View style={base}>{icon}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, { opacity: pressed ? 0.85 : 1 }]}>
      {icon}
    </Pressable>
  );
}

// ── Figure ──────────────────────────────────────────────────────────────────
// A quiet stat in the My Day figures footer — a serif number + caption label.
export function Figure({ n, label }: { n: number; label: string }) {
  const { colors, typography } = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ fontFamily: typography.fontSerif, fontSize: 22, fontWeight: '500', color: colors.onSurface }}>
        {n}
      </Text>
      <Text style={{ fontSize: 12, color: colors.onSurfaceVariant }}>{label}</Text>
    </View>
  );
}

// ── DuePresetPills ────────────────────────────────────────────────────────
export interface DuePreset {
  key: string;
  label: string;
  days: number | null;
}

export function DuePresetPills({
  presets,
  value,
  onPick,
}: {
  presets: DuePreset[];
  value: string;
  onPick: (key: string, days: number | null) => void;
}) {
  const { colors, radius } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {presets.map((p) => {
        const on = value === p.key;
        return (
          <Pressable
            key={p.key}
            onPress={() => onPick(p.key, p.days)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: radius.full,
              borderWidth: 1,
              borderColor: on ? colors.primary : colors.outlineVariant,
              backgroundColor: on ? colors.primary : 'transparent',
            }}
          >
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: on ? colors.onPrimary : colors.onSurface }}>
              {p.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── InlineInput ───────────────────────────────────────────────────────────
// A themed text input for the inline composers (add a task, add a prayer).
export function InlineInput(props: TextInputProps) {
  const { colors, radius } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={colors.onSurfaceVariant}
      {...props}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      style={[
        {
          borderWidth: 1,
          borderColor: focused ? colors.primary : colors.outlineVariant,
          borderRadius: radius.md,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: 14.5,
          color: colors.onSurface,
          backgroundColor: colors.surfaceContainer,
        },
        props.style,
      ]}
    />
  );
}
