import { View } from 'react-native';
import { ROLE_CARDS, type AppRole } from '@cisa/core';
import { AppText, Card, Chip } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';

// Static "Roles & access" reference — ported verbatim from web's
// RolesReference (never removed, reskin only per its own comment there).
export function RolesReference({ currentRole }: { currentRole: AppRole | null }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="heading">Roles & access</AppText>
      {ROLE_CARDS.map((card) => {
        const isYou = card.key === currentRole;
        return (
          <Card key={card.key} style={isYou ? { borderColor: colors.primary, borderWidth: 1.5 } : undefined}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 6 }}>
              <AppText variant="label" style={{ fontWeight: '700' }}>
                {card.label}
              </AppText>
              {isYou && <Chip label="Your role" tone="accent" />}
            </View>
            <AppText variant="body" color={colors.onSurfaceVariant}>
              {card.description}
            </AppText>
            <AppText variant="caption" color={colors.onSurfaceVariant} style={{ marginTop: 6 }}>
              Sees: {card.access.join(' · ')}
            </AppText>
          </Card>
        );
      })}
    </View>
  );
}
