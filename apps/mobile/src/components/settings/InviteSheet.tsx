import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { roleOptionsFor, type AppRole } from '@cisa/core';
import { AppText, Button, Sheet, InlineInput } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';

// "Add someone by email" bottom sheet — ported from web's InviteModal.
// Pre-adds an email + role; they're matched automatically when they sign up.
export function InviteSheet({
  visible,
  isAdmin,
  submitting,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  isAdmin: boolean;
  submitting: boolean;
  onSubmit: (email: string, role: AppRole) => void;
  onClose: () => void;
}) {
  const { colors, radius, spacing, typography } = useTheme();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AppRole>('operator');
  const options = roleOptionsFor(isAdmin);

  // Reset each time the sheet opens, so a prior session (or a just-completed
  // submit) doesn't leave stale values behind.
  useEffect(() => {
    if (visible) {
      setEmail('');
      setRole('operator');
    }
  }, [visible]);

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md }}>
        <View style={{ gap: 2 }}>
          <Text style={{ fontFamily: typography.fontSerif, fontSize: 18, fontWeight: '500', color: colors.onSurface }}>
            Add someone by email
          </Text>
          <AppText variant="caption" color={colors.onSurfaceVariant}>
            Pre-add an email and they're matched automatically when they sign up.
          </AppText>
        </View>
        <View style={{ gap: 6 }}>
          <AppText variant="label" color={colors.onSurfaceVariant}>
            Email
          </AppText>
          <InlineInput
            value={email}
            onChangeText={setEmail}
            placeholder="their@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoFocus
          />
        </View>
        <View style={{ gap: 6 }}>
          <AppText variant="label" color={colors.onSurfaceVariant}>
            Role
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {options.map((o) => {
              const on = role === o.value;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => setRole(o.value)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: radius.full,
                    borderWidth: 1,
                    borderColor: on ? colors.primary : colors.outlineVariant,
                    backgroundColor: on ? colors.primary : 'transparent',
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: on ? colors.onPrimary : colors.onSurface }}>
                    {o.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
          <Button title="Cancel" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
          <Button
            title={submitting ? 'Adding…' : 'Pre-add'}
            disabled={submitting || !email.trim()}
            onPress={() => onSubmit(email, role)}
            style={{ flex: 1.4 }}
          />
        </View>
      </View>
    </Sheet>
  );
}
