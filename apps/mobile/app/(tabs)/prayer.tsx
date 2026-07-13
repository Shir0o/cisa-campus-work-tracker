import { useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { hasMinRole, type Contact } from '@cisa/core';
import { Screen, AppText, Button } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth } from '../../src/lib/AuthProvider';
import { usePrayerData } from '../../src/lib/usePrayerData';
import { PrayerThreadCard } from '../../src/components/prayer/PrayerThreadCard';
import { HoldPrayerSheet } from '../../src/components/prayer/HoldPrayerSheet';

// Prayer / "On our hearts" — the full team prayer list (design:
// views/prayer.jsx, screenshots/prayer*.png). Contact-detail navigation is a
// Phase 2 placeholder, matching My Day's onOpenContact.
export default function Prayer() {
  const { colors, spacing } = useTheme();
  const { uid, user, role } = useAuth();
  const isOperator = hasMinRole(role, 'operator');
  const data = usePrayerData(uid, user?.displayName ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const onOpenContact = (contact: Contact) => {
    Alert.alert(contact.name, "Contact details aren't wired up yet — coming in a later pass.");
  };

  const heldIds = useMemo(() => new Set(data.entries.map((e) => e.contact.id)), [data.entries]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: spacing.lg }}>
        <View style={{ gap: 4 }}>
          <AppText variant="label" color={colors.primary}>
            PRAYER
          </AppText>
          <AppText variant="title">Who we're carrying</AppText>
          <AppText variant="body" color={colors.onSurfaceVariant}>
            {data.answeredThisYear} {data.answeredThisYear === 1 ? 'prayer' : 'prayers'} answered this year.
          </AppText>
        </View>

        {isOperator && (
          <Button title="Hold someone in prayer" onPress={() => setPickerOpen(true)} full />
        )}

        {data.entries.length === 0 ? (
          <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center', paddingVertical: 24 }}>
            No one here yet — use "Hold someone in prayer" to start.
          </AppText>
        ) : (
          data.entries.map((e) => (
            <PrayerThreadCard
              key={e.contact.id}
              contact={e.contact}
              prayers={e.prayers}
              onOpenContact={onOpenContact}
              onRemove={() => data.stopHolding(e.contact.id)}
              onAddPrayer={(text) => data.addPrayer(e.contact.id, text)}
              onSetStatus={data.setStatus}
              onUpdateBurden={data.updateBurden}
              isOperator={isOperator}
            />
          ))
        )}
      </ScrollView>

      <HoldPrayerSheet
        visible={pickerOpen}
        contacts={data.contacts}
        heldIds={heldIds}
        onAdd={(contact) => {
          data.startHolding(contact);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </Screen>
  );
}
