import { useEffect, useContext } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { BottomTabBarHeightCallbackContext, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { tabsForRole } from '@cisa/core';
import { Room } from '../../src/components/v2/Widget';
import { roomForRole, useV2Theme } from '../../src/theme/v2';
import { useAuth } from '../../src/lib/AuthProvider';
import { useLanguage } from '../../src/lib/LanguageProvider';
import { useMessagesData } from '../../src/lib/useMessagesData';

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
// screens that need a back row when they're NOT a tab (people, journey) read
// the same source rather than repeating the role checks.
//
// The bar is the design's `.mbr-tabs` (mobile.css), rendered as a CUSTOM tab
// bar: words, not invented icons, and the active tab is a soft PILL behind the
// word — the old 5px dot above the label read as a rendering glitch, so the
// design replaced it. react-navigation's default bar reserves a fixed 31×28
// icon box and draws the icon twice for an active/inactive crossfade, which
// can't hold a full-width pill — or a bar with no tabs at all, the trainee's
// shell — so the bar is drawn here instead.

/** One button in the design's `.mbr-tabs`: a full-width pill behind the word,
 *  with a violet unread dot beside Messages. */
function V2TabBar({ state, descriptors, navigation, insets, tabNames }: BottomTabBarProps & { tabNames: string[] }) {
  const { c, font, fs, mode } = useV2Theme();
  const onHeightChange = useContext(BottomTabBarHeightCallbackContext);

  const night = mode === 'dark';

  // `.mbr-tabs button.on` — the active tab is a soft VIOLET wash pill behind
  // the word (`--accent-soft`), and the resting ink is `room.ink3` by day, the
  // night floor (`room.faint`) after dark. Under Bento every role shares one
  // room, so there are no per-role (navy/paper) variants.
  const pill = c.card.reactOnBg;
  const activeInk = c.card.ask;
  // Resting ink is `--mb-ink4` — `room.ink3` by day, the night floor
  // (`--n-ink4`, `room.faint`) after dark.
  const idleInk = night ? c.room.faint : c.room.ink3;
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
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            // The dot carries no visible text; the count still reaches a screen
            // reader this way (the design clips the same text out of view).
            accessibilityLabel={unread ? `${label}, ${badge} unread` : label}
            style={({ pressed }) => [styles.tab, focused && { backgroundColor: pill }, pressed && { opacity: 0.8 }]}
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
              // `.mbr-tabs em` — the unread marker is a 6px violet DOT, not a
              // counted pill: "Messages" is too long a word for a number to sit
              // beside. The exact count lives on the Messages screen.
              <View
                accessible={false}
                style={{
                  alignSelf: 'flex-start',
                  marginTop: 11,
                  marginLeft: 5,
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: c.room.mark,
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
  // `.mbr-tabs button` — flex:1, 46 tall, the pill's 13px radius. Row layout
  // so the word and the unread dot sit side by side, as in the design.
  tab: {
    flex: 1,
    minHeight: 46,
    borderRadius: 13,
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
  const { t } = useLanguage();
  const messages = useMessagesData();

  const tabs = tabsForRole(role);
  const titleOf = (name: string) => tabs.find((tab) => tab.name === name)?.title;
  const mobileTitle = (name: string) =>
    t(`mobile.nav.${name === 'index' ? 'today' : name}`);

  // A tab this role doesn't have drops out of the bar — `href: null` keeps the
  // route reachable by push and by deep link, which is how the drawer and the
  // full-timer's More reach People, The Journey and the rest.
  const slot = (name: string, fallback: string) => {
    const title = titleOf(name);
    return title ? { title: mobileTitle(name), href: undefined } : { title: fallback, href: null };
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
      <Tabs.Screen name="people" options={slot('people', t('mobile.nav.people'))} />
      <Tabs.Screen name="prayer" options={slot('prayer', t('mobile.nav.prayer'))} />
      <Tabs.Screen
        name="messages"
        options={{
          ...slot('messages', t('mobile.nav.messages')),
          tabBarBadge: messages.unreadCount > 0 ? messages.unreadCount : undefined,
        }}
      />
      <Tabs.Screen name="more" options={slot('more', t('mobile.nav.more'))} />
      {/* Nobody has The Journey as a tab: the trainee reaches it from the
          drawer, the full-timer from More. */}
      <Tabs.Screen name="journey" options={{ title: t('mobile.nav.the_journey'), href: null }} />
    </Tabs>
  );
}
