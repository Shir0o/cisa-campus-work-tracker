import { useEffect, useContext } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { BottomTabBarHeightCallbackContext, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { tabsForRole, type ShellTab } from '@cisa/core';
import { Room } from '../../src/components/v2/Widget';
import { roomForRole, useV2Theme } from '../../src/theme/v2';
import { useAuth } from '../../src/lib/AuthProvider';
import { useLanguage } from '../../src/lib/LanguageProvider';
import { useMessagesData } from '../../src/lib/useMessagesData';
import { translate } from '../../src/lib/i18n';

// The shell — one of three, chosen by role, from the design project
// (`MOBILE-V2.md`; `views/mobile/{m2,member,ft}.jsx`):
//
//   Trainee    no bar at all — the queue fills the screen and ☰ opens a drawer
//              (src/components/queue/QueueDrawer.tsx)
//   Student    Today · Prayer · Messages · You
//   Community  What's on · Prayer · Messages · You
//   Full-timer Today · People · Messages · More
//
// Which route each tab sits on lives in @cisa/core's `tabsForRole`, so the
// screens that need a back row when they're NOT a tab (people) read
// the same source rather than repeating the role checks.
//
// The bar is the design's `.mbr-tabs` (mobile.css), rendered as a CUSTOM tab
// bar: words, not invented icons, and the active tab is a high-contrast PILL
// behind the word following the Inversion Rule (solid ink inversion).

/**
 * Resolves the localized display title for a tab route based on role-configured
 * tabs from `tabsForRole` (e.g. Student "You" vs Full-timer "More", Community
 * "What's on" vs Student "Today").
 */
export function getMobileTabTitle(tabs: ShellTab[], name: string, language: string = 'en'): string {
  const tab = tabs.find((t) => t.name === name);
  const lang = language === 'es' ? 'es' : 'en';
  if (tab?.title === "What's on") return translate('mobile.nav.whats_on', lang);
  if (tab?.title === 'You') return translate('mobile.nav.you', lang);
  return translate(`mobile.nav.${name === 'index' ? 'today' : name}`, lang);
}

/** One button in the design's `.mbr-tabs`: a full-width pill behind the word,
 *  with a high-contrast unread dot beside Messages. */
export function V2TabBar({ state, descriptors, navigation, insets, tabNames }: BottomTabBarProps & { tabNames: string[] }) {
  const { c, font, fs } = useV2Theme();
  const { t } = useLanguage();
  const onHeightChange = useContext(BottomTabBarHeightCallbackContext);

  // Selection and activation follow the Inversion Rule (DESIGN.md):
  // solid ink inversion (solid black ink with paper-white text),
  // which guarantees peak contrast (15.2:1) under bright campus sunlight.
  const pill = c.card.inverse;
  const activeInk = c.card.onInverse;
  // Resting ink uses the room's secondary ink (ink2), guaranteeing WCAG AA
  // (≥4.5:1 contrast ratio: 6.19:1 by day, 8.3:1 by night) against c.room.bg.
  const idleInk = c.room.ink2;
  // `.mbr-tabs` — the bar wears the room itself, split from the canvas by the
  // datebox hairline.
  const bar = { backgroundColor: c.room.bg, borderTopColor: c.room.dateboxLine };

  // Only the routes this role actually tabs render; the rest stay reachable by
  // push and deep link (`href: null` on the screens below).
  const routes = state.routes.filter((route) => tabNames.includes(route.name));

  // The trainee's shell has no bar at all — report a zero height so the queue
  // fills the screen instead of leaving the default 49px gap.
  useEffect(() => {
    if (routes.length === 0) onHeightChange?.(0);
  }, [routes.length, onHeightChange]);
  if (routes.length === 0) return null;

  return (
    <View
      testID="tab-bar-container"
      accessibilityRole="tablist"
      style={[styles.bar, bar, { paddingBottom: 9 + insets.bottom }]}
      onLayout={(e) => onHeightChange?.(e.nativeEvent.layout.height)}
    >
      {routes.map((route) => {
        const { options } = descriptors[route.key];
        const focused = state.index === state.routes.indexOf(route);
        const label = (options.tabBarLabel as string | undefined) ?? options.title ?? route.name;
        const badge = options.tabBarBadge;
        const unread = typeof badge === 'number' && badge > 0;
        return (
          <Pressable
            key={route.key}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
            }}
            hitSlop={4}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            // Screen readers receive a fully localized label for badge state.
            accessibilityLabel={
              unread
                ? t('mobile.nav.unread_tab').replace('{label}', label).replace('{count}', String(badge))
                : label
            }
            style={({ pressed }) => [
              styles.tab,
              focused && { backgroundColor: pill },
              pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] },
            ]}
          >
            <Text
              style={{
                fontFamily: font.bold,
                fontSize: fs(12),
                letterSpacing: -0.12,
                lineHeight: fs(16),
                color: focused ? activeInk : idleInk,
              }}
              numberOfLines={1}
            >
              {label}
            </Text>
            {unread && (
              // 6px dot centered beside label with label ink contrast on dark pill when focused.
              <View
                accessible={false}
                style={{
                  alignSelf: 'center',
                  marginLeft: 5,
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: focused ? activeInk : c.room.mark,
                }}
              />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // `.mbr-tabs` — gap 4, 7px above the buttons, 9px sides and below
  // (safe-area bottom added at render time), hairline on top.
  bar: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 9,
    paddingTop: 7,
    borderTopWidth: 1,
  },
  // `.mbr-tabs button` — flex:1, 48 tall (Material 3 minimum touch target),
  // interactive 16px radius (Bento token scale). Row layout so the word and the
  // unread dot sit side by side.
  tab: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default function TabsLayout() {
  const { role } = useAuth();
  // The full-timer stands in the paper/navy room; members stand in the trainee's
  // green one and take their own look from `V2Palette.widget`, not from a room
  // of their own (see theme/v2.ts). Screens that set their own Room still win
  // inside.
  return (
    <Room room={roomForRole(role)}>
      <RoleTabs />
    </Room>
  );
}

function RoleTabs() {
  const { role } = useAuth();
  const { language } = useLanguage();
  const messages = useMessagesData();

  const tabs = tabsForRole(role);
  const mobileTitle = (name: string) => getMobileTabTitle(tabs, name, language);

  // A tab this role doesn't have drops out of the bar — `href: null` keeps the
  // route reachable by push and by deep link, which is how the drawer and the
  // full-timer's More reach People and the rest.
  const slot = (name: string, fallback: string) => {
    const tab = tabs.find((t) => t.name === name);
    return tab ? { title: mobileTitle(name), href: undefined } : { title: fallback, href: null };
  };
  const tabNames = tabs.map((tab) => tab.name);

  return (
    <Tabs
      // The design's `.mbr-tabs` — `tabBar` is a navigator-level config prop,
      // not a screen option, so it sits on the navigator itself.
      tabBar={(props) => <V2TabBar {...props} tabNames={tabNames} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: mobileTitle('index') }} />
      <Tabs.Screen name="people" options={slot('people', mobileTitle('people'))} />
      <Tabs.Screen name="prayer" options={slot('prayer', mobileTitle('prayer'))} />
      <Tabs.Screen
        name="messages"
        options={{
          ...slot('messages', mobileTitle('messages')),
          tabBarBadge: messages.unreadCount > 0 ? messages.unreadCount : undefined,
        }}
      />
      <Tabs.Screen name="more" options={slot('more', mobileTitle('more'))} />
      {/* Not a screen any more: this route only redirects old links to People,
          where The Journey is the Step pills (ADR 0047). */}
      <Tabs.Screen name="journey" options={{ title: translate('mobile.nav.the_journey', language === 'es' ? 'es' : 'en'), href: null }} />
    </Tabs>
  );
}
