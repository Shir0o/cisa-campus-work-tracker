import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { toneColors, toneForStage } from '../../theme/tokens';
import type { JourneyTab } from '../../lib/useJourneyData';

// Horizontal-scrolling stage switcher — one tab per stage plus a synthetic
// "Unassigned" tab, each with a tone dot + live count. Design: web's
// src/views/OutreachBoardMobile.tsx "Switcher tabs" row (tap-to-switch;
// swipe-between-tabs is a later addition, not needed for a correct v1).
export function StageTabs({
  tabs,
  activeIndex,
  onChange,
}: {
  tabs: JourneyTab[];
  activeIndex: number;
  onChange: (index: number) => void;
}) {
  const { colors, radius } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingVertical: 2 }}
    >
      {tabs.map((tab, i) => {
        const on = i === activeIndex;
        const { fg } = toneColors(colors, toneForStage(tabs, tab.label));
        return (
          <Pressable
            key={tab.id}
            onPress={() => onChange(i)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: radius.full,
              borderWidth: 1,
              borderColor: on ? colors.primary : colors.outlineVariant,
              backgroundColor: on ? colors.primary : 'transparent',
            }}
          >
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: on ? colors.onPrimary : fg }} />
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: on ? colors.onPrimary : colors.onSurface }}>
              {tab.label} <Text style={{ opacity: 0.7 }}>{tab.count}</Text>
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
