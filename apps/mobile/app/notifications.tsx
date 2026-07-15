import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen, AppText, SectionHead } from '../src/components/ui';
import { useTheme } from '../src/theme/ThemeProvider';
import { useAuth } from '../src/lib/AuthProvider';
import { useNotificationsData } from '../src/lib/useNotificationsData';
import { NotificationRow } from '../src/components/notifications/NotificationRow';

const FOOTER_HEIGHT = 56;

// Notifications — "what's stirring": the signed-in user's personal +
// broadcast notification stream. Web hosts this as an always-open dropdown
// panel from a header bell; mobile has no persistent header today, so this
// is a pushed (non-tab) route reached from "More", following Answered/
// History's back-nav pattern. The footer CTA is pinned to the screen bottom
// (not scroll content) so it stays reachable on a long list, unlike web's
// floating panel where it's always visible by construction.
export default function Notifications() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { role } = useAuth();
  const data = useNotificationsData();

  const isStaff = role === 'admin' || role === 'manager';
  const isEmpty = data.unread.length === 0 && data.read.length === 0;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingTop: spacing.sm,
          paddingBottom: isEmpty ? 40 : 40 + FOOTER_HEIGHT,
          gap: spacing.lg,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md }}>
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="title">What's stirring</AppText>
            <AppText variant="body" color={colors.onSurfaceVariant}>
              {data.unreadCount > 0
                ? `${data.unreadCount} ${data.unreadCount === 1 ? 'thing' : 'things'} since you last looked`
                : "You're all caught up"}
            </AppText>
          </View>
          {data.unreadCount > 0 && (
            <Pressable onPress={data.markAllAsRead} hitSlop={8} style={{ paddingTop: 4 }}>
              <AppText variant="label" color={colors.primary} style={{ fontWeight: '700' }}>
                Mark all read
              </AppText>
            </Pressable>
          )}
        </View>

        {data.error ? (
          <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center', paddingVertical: 24 }}>
            {data.error}
          </AppText>
        ) : data.loading ? (
          <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center', paddingVertical: 24 }}>
            Gathering your notifications…
          </AppText>
        ) : isEmpty ? (
          <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
            <Ionicons name="heart-outline" size={40} color={colors.onSurfaceVariant} style={{ opacity: 0.4 }} />
            <AppText variant="heading" style={{ textAlign: 'center' }}>
              Nothing needs you right now
            </AppText>
            <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center' }}>
              A quiet inbox is a kind of grace. We'll let you know when something stirs.
            </AppText>
          </View>
        ) : (
          <>
            {data.unread.length > 0 && (
              <View style={{ gap: spacing.xs }}>
                <SectionHead title="Worth a look" />
                {data.unread.map((n) => (
                  <NotificationRow
                    key={n.id}
                    notif={n}
                    onPress={() => data.markAsRead(n.id)}
                    onSetAside={() => data.setAside(n)}
                  />
                ))}
              </View>
            )}
            {data.read.length > 0 && (
              <View style={{ gap: spacing.xs }}>
                <SectionHead title="Earlier" />
                {data.read.map((n) => (
                  <NotificationRow
                    key={n.id}
                    notif={n}
                    onPress={() => data.markAsRead(n.id)}
                    onSetAside={() => data.setAside(n)}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {!isEmpty && (
        <Pressable
          onPress={() => router.push(isStaff ? '/history' : '/prayer')}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: FOOTER_HEIGHT,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            backgroundColor: colors.surface,
            borderTopWidth: 1,
            borderTopColor: colors.outlineVariant,
          }}
        >
          <AppText variant="label" color={colors.primary} style={{ fontWeight: '700' }}>
            {isStaff ? 'See the whole record in History' : 'Open Prayer'}
          </AppText>
          <Ionicons name="arrow-forward" size={14} color={colors.primary} />
        </Pressable>
      )}
    </Screen>
  );
}
