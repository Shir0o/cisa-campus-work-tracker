import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { NAV_ITEMS } from '@cisa/core';
import { useTheme } from '../../src/theme/ThemeProvider';

// Bottom nav is a curated subset of the full NAV_ITEMS (the rest live under
// "More"). Labels are pulled from the shared NAV_ITEMS so web + native stay in
// sync.
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
