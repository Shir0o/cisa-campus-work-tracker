import { Pressable, ScrollView, Text } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

export type ContactDetailTab = 'overview' | 'interactions' | 'thread' | 'prayer' | 'comments' | 'history';

export interface ContactTabOption {
  id: ContactDetailTab;
  label: string;
  count?: number;
}

// The web modal's isMobile branch switches tabs via an HTML <select> — RN has
// no equivalent without a new dependency, so this is a horizontal pill row
// instead, matching the StageTabs/StagePills idiom already used elsewhere.
export function ContactTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: ContactTabOption[];
  value: ContactDetailTab;
  onChange: (tab: ContactDetailTab) => void;
}) {
  const { colors, radius } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingVertical: 2 }}
    >
      {tabs.map((tab) => {
        const on = tab.id === value;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onChange(tab.id)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: radius.full,
              borderWidth: 1,
              borderColor: on ? colors.primary : colors.outlineVariant,
              backgroundColor: on ? colors.primary : 'transparent',
            }}
          >
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: on ? colors.onPrimary : colors.onSurface }}>
              {tab.label}
              {tab.count != null ? <Text style={{ opacity: 0.7 }}> {tab.count}</Text> : null}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
