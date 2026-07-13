import { Alert } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { NAV_ITEMS } from '@cisa/core';
import { useTheme } from '../../src/theme/ThemeProvider';

// Bottom nav matches the design's mobile shell (views/mobile/app.jsx):
// Home · People · [Log] · Journey · Prayer, with a raised center capture
// action. "More" surfaces the rest of NAV_ITEMS (History, Settings, …) — the
// design's hamburger drawer is a later pass.
const labelFor = (href: string, fallback: string) =>
  NAV_ITEMS.find((n) => n.href === href)?.label ?? fallback;

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.outlineVariant,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: labelFor('/', 'Home'),
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="people"
        options={{
          title: labelFor('/directory', 'People'),
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="log"
        options={{
          title: 'Log',
          tabBarIcon: ({ color, size }) => <Ionicons name="add-circle" color={colors.primary} size={size + 6} />,
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            Alert.alert('Log a moment', "Quick capture isn't wired up yet — coming in a later pass.");
          },
        }}
      />
      <Tabs.Screen
        name="journey"
        options={{
          title: labelFor('/board', 'Journey'),
          tabBarIcon: ({ color, size }) => <Ionicons name="git-branch-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="prayer"
        options={{
          title: labelFor('/prayer', 'Prayer'),
          tabBarIcon: ({ color, size }) => <Ionicons name="heart-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="ellipsis-horizontal" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
