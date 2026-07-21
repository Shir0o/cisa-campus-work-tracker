import { useState } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { NAV_ITEMS, canAccessRoute } from '@cisa/core';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth } from '../../src/lib/AuthProvider';
import { QuickCaptureSheet } from '../../src/components/quickcapture/QuickCaptureSheet';

// Bottom nav matches the design's mobile shell (views/mobile/app.jsx):
// Home · People · [Log] · Journey · Prayer, with a raised center capture
// action. "More" surfaces the rest of NAV_ITEMS (History, Settings, …) — the
// design's hamburger drawer is a later pass.
const labelFor = (href: string, fallback: string) =>
  NAV_ITEMS.find((n) => n.href === href)?.label ?? fallback;

export default function TabsLayout() {
  const { colors } = useTheme();
  const { role } = useAuth();
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  // Tabs tied to a gated NAV_ITEMS route drop out of the bar (href: null) when
  // the live role doesn't meet its minRole. Home/Prayer stay put — both are
  // viewer-open; More self-filters.
  const canPeople = canAccessRoute(role, '/directory');
  const canJourney = canAccessRoute(role, '/board');
  // Matches the desktop Quick Capture modal's own `role === 'viewer'` gate —
  // Community members don't log interactions.
  const canLog = role !== 'viewer';
  return (
    <>
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
            href: canPeople ? undefined : null,
          }}
        />
        <Tabs.Screen
          name="log"
          options={{
            title: 'Log',
            tabBarIcon: ({ color, size }) => <Ionicons name="add-circle" color={colors.primary} size={size + 6} />,
            href: canLog ? undefined : null,
          }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              setQuickCaptureOpen(true);
            },
          }}
        />
        <Tabs.Screen
          name="journey"
          options={{
            title: labelFor('/board', 'Journey'),
            tabBarIcon: ({ color, size }) => <Ionicons name="git-branch-outline" color={color} size={size} />,
            href: canJourney ? undefined : null,
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
      <QuickCaptureSheet visible={quickCaptureOpen} onClose={() => setQuickCaptureOpen(false)} />
    </>
  );
}
