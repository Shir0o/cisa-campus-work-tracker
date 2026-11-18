import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, AppText, Button } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuth } from '../../lib/AuthProvider';
import { useLanguage } from '../../lib/LanguageProvider';

/**
 * The phone's counterpart to the web's "Access Restricted" screen. A signed-in
 * account with no role (a legacy Student or Community role reads as none) or
 * no approval yet sees this instead of the app, so it can never land in the
 * Full-timer shell. Signed out, it stays out of the way: login and the public
 * sign-up form render as before.
 */
export function AccessGate({ children }: { children: React.ReactNode }) {
  const { user, role, isApproved, logOut } = useAuth();
  const { colors, spacing } = useTheme();
  const { t } = useLanguage();

  if (!user || (role && isApproved)) return <>{children}</>;

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 8 }}>
        <Ionicons name="lock-closed-outline" size={32} color={colors.onSurfaceVariant} />
        <AppText variant="heading">{t('modals.contactDetails.access_restricted')}</AppText>
        <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center' }}>
          {t('settings.pending_approval')}
        </AppText>
        <Button title={t('mobile.common.log_out')} variant="secondary" onPress={() => void logOut()} />
      </View>
    </Screen>
  );
}
