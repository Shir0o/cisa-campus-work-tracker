import { Tabs } from 'expo-router';
import { Text, View } from 'react-native';
import { shellForRole, tabsForRole } from '@cisa/core';
import { Room } from '../../src/components/v2/Widget';
import { useV2Theme } from '../../src/theme/v2';
import { useAuth } from '../../src/lib/AuthProvider';
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
// The bar wears the v2 room (the design's `.mbr-tabs`): words, not invented
// icons, with a small active dot in the icon slot and a terracotta unread badge
// on Messages.

/** One button: the design's 5px active dot over the word. Both live in the icon
 *  slot (`tabBarShowLabel` is off) — react-navigation reserves a fixed height
 *  for an icon and puts the label under it, which leaves a 5px dot floating
 *  with the word crushed against the floor of the bar. */
function TabButton({ focused, color, label }: { focused: boolean; color: string; label: string }) {
  const { font, fs } = useV2Theme();
  return (
    <View style={{ alignItems: 'center', gap: 5 }}>
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 3,
          backgroundColor: focused ? color : 'transparent',
        }}
      />
      <Text style={{ fontFamily: font.semi, fontSize: fs(11.5), lineHeight: fs(16), color }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const button =
  (label: string) =>
  ({ focused, color }: { focused: boolean; color: string }) => (
    <TabButton focused={focused} color={color} label={label} />
  );

export default function TabsLayout() {
  const { role } = useAuth();
  // The full-timer stands in the paper/navy room; everyone else in the green
  // one. Screens that set their own Room still win inside.
  return (
    <Room room={shellForRole(role) === 'ft' ? 'ft' : 'queue'}>
      <RoleTabs />
    </Room>
  );
}

function RoleTabs() {
  const { c, font, fs } = useV2Theme();
  const { role } = useAuth();
  const messages = useMessagesData();

  const shell = shellForRole(role);
  const tabs = tabsForRole(role);
  const titleOf = (name: string) => tabs.find((t) => t.name === name)?.title;
  // A tab this role doesn't have drops out of the bar — `href: null` keeps the
  // route reachable by push and by deep link, which is how the drawer and the
  // full-timer's More reach People, The Journey and the rest.
  const slot = (name: string, fallback: string) => {
    const title = titleOf(name);
    return title ? { title, href: undefined } : { title: fallback, href: null };
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.roomInk,
        tabBarInactiveTintColor: c.roomInk3,
        tabBarShowLabel: false,
        tabBarStyle:
          // The trainee's shell has no bar at all: the queue is the screen, and
          // ☰ carries everything else.
          shell === 'queue'
            ? { display: 'none' }
            : { backgroundColor: c.room, borderTopColor: c.roomChip, borderTopWidth: 1 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          // Home is the one screen every shell keeps reachable — for the
          // trainee it's the whole app, and the hidden bar is what makes the
          // missing tabs invisible rather than `href: null`.
          title: titleOf('index') ?? 'Today',
          tabBarIcon: button(titleOf('index') ?? 'Today'),
        }}
      />
      <Tabs.Screen name="people" options={{ ...slot('people', 'People'), tabBarIcon: button('People') }} />
      <Tabs.Screen name="prayer" options={{ ...slot('prayer', 'Prayer'), tabBarIcon: button('Prayer') }} />
      <Tabs.Screen
        name="messages"
        options={{
          ...slot('messages', 'Messages'),
          tabBarIcon: button('Messages'),
          tabBarBadge: messages.unreadCount > 0 ? messages.unreadCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: c.window,
            color: c.onWindow,
            fontFamily: font.bold,
            fontSize: fs(10),
          },
        }}
      />
      <Tabs.Screen
        name="more"
        options={{ ...slot('more', 'More'), tabBarIcon: button(titleOf('more') ?? 'More') }}
      />
      {/* Nobody has The Journey as a tab: the trainee reaches it from the
          drawer, the full-timer from More. */}
      <Tabs.Screen name="journey" options={{ title: 'The Journey', href: null }} />
    </Tabs>
  );
}
