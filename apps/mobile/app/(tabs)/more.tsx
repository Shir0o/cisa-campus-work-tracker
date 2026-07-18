import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { NAV_ITEMS, roleLabel, canAccessRoute } from '@cisa/core';
import { Screen, AppText, Card, StatusPill } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth } from '../../src/lib/AuthProvider';
import { useNotificationsData } from '../../src/lib/useNotificationsData';
import { useMessagesData } from '../../src/lib/useMessagesData';

// "More" surfaces the NAV_ITEMS destinations not in the bottom tabs — driven by
// the SHARED NAV_ITEMS + role labels from @cisa/core (the mobile drawer in the
// design), gated by the live role (canAccessRoute).
const TAB_HREFS = ['/', '/directory', '/board', '/prayer'];
// '/messages' IS a NAV_ITEMS entry (unlike Search/Notifications/Welcome
// form/Feedback below), but it gets the same bespoke-card treatment as
// Notifications (a live unread-room-count badge), so it's pulled out of the
// generic loop too.
const MANUAL_CARD_HREFS = ['/messages'];

export default function More() {
  const { colors, spacing } = useTheme();
  const { role } = useAuth();
  const router = useRouter();
  const notif = useNotificationsData();
  const messages = useMessagesData();
  const rest = NAV_ITEMS.filter(
    (n) => !TAB_HREFS.includes(n.href) && !MANUAL_CARD_HREFS.includes(n.href) && canAccessRoute(role, n.href),
  );
  // Only these destinations have a mobile screen to push to today; every
  // other NAV_ITEMS entry is still a no-op until its screen is built.
  const pushRoutes: Partial<Record<string, () => void>> = {
    '/history': () => router.push('/history'),
    '/answered': () => router.push('/answered'),
    '/attendance': () => router.push('/attendance'),
    '/settings': () => router.push('/settings'),
    '/coordination': () => router.push('/coordination'),
  };
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <AppText variant="title">More</AppText>
        {/* Not a NAV_ITEMS entry (on web it's a ⌘K overlay, not a routed
            page) — a manual card, same as Notifications below. */}
        <Card onPress={() => router.push('/search')}>
          <AppText variant="heading">Search</AppText>
          <AppText variant="caption" color={colors.onSurfaceVariant}>
            People, history, quick actions
          </AppText>
        </Card>
        {/* Notifications isn't a NAV_ITEMS entry (on web it's a global header
            overlay, not a routed destination), so it's a manual Card here
            rather than riding the loop below. */}
        <Card onPress={() => router.push('/notifications')}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText variant="heading">Notifications</AppText>
            {notif.unreadCount > 0 && <StatusPill label={String(notif.unreadCount)} tone="accent" />}
          </View>
        </Card>
        {/* '/messages' IS a NAV_ITEMS entry, but gets the same bespoke-card
            treatment as Notifications above (a live unread-room-count badge)
            rather than riding the generic loop below. */}
        <Card onPress={() => router.push('/messages')}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText variant="heading">Messages</AppText>
            {messages.unreadCount > 0 && <StatusPill label={String(messages.unreadCount)} tone="accent" />}
          </View>
        </Card>
        {/* Not a NAV_ITEMS entry (it's the public /signup form, same one a
            prospective student can fill out unauthenticated) — a manual card
            so a signed-in staffer can hand their phone to someone in person. */}
        <Card onPress={() => router.push('/signup')}>
          <AppText variant="heading">Welcome form</AppText>
          <AppText variant="caption" color={colors.onSurfaceVariant}>
            Sign up someone new
          </AppText>
        </Card>
        {/* Not a NAV_ITEMS entry either (on web it's reached only by direct
            URL, no in-app link) — unconditional like Notifications/Welcome
            form above, since '/feedback' is viewer-accessible. */}
        <Card onPress={() => router.push('/feedback')}>
          <AppText variant="heading">Leave a note</AppText>
          <AppText variant="caption" color={colors.onSurfaceVariant}>
            Ideas, friction, appreciation
          </AppText>
        </Card>
        {/* Admin-only review of every submitted note — gated explicitly since
            it isn't in NAV_ITEMS either (reuses the existing
            '/admin/feedback' permission key from ROUTE_MIN_ROLE). */}
        {canAccessRoute(role, '/admin/feedback') && (
          <Card onPress={() => router.push('/feedback-admin')}>
            <AppText variant="heading">Notes from the team</AppText>
            <AppText variant="caption" color={colors.onSurfaceVariant}>
              Review submitted feedback
            </AppText>
          </Card>
        )}
        {rest.map((n) => (
          <Card key={n.href} onPress={pushRoutes[n.href] ?? (() => {})}>
            <View style={{ gap: 2 }}>
              <AppText variant="heading">{n.label}</AppText>
              <AppText variant="caption" color={colors.onSurfaceVariant}>
                {n.href} · from {roleLabel(n.minRole)}
              </AppText>
            </View>
          </Card>
        ))}
        <AppText variant="caption" color={colors.onSurfaceVariant}>
          Labels come from the shared @cisa/core NAV_ITEMS — one source for web + mobile.
        </AppText>
      </ScrollView>
    </Screen>
  );
}
