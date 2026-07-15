import { Pressable, Text, View } from 'react-native';
import type { GatheringType } from '@cisa/core';
import { useTheme } from '../../theme/ThemeProvider';

// "All" + one pill per managed gathering kind (Weekly / Small Group / …).
// Design: views/contacts.jsx's pill row pattern, reused for gatherings.
export function GatheringTypeFilterPills({
  types,
  value,
  onChange,
}: {
  types: GatheringType[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { colors, radius } = useTheme();
  const options = ['All', ...types.map((t) => t.name)];

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((opt) => {
        const on = value === opt;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: radius.full,
              borderWidth: 1,
              borderColor: on ? colors.primary : colors.outlineVariant,
              backgroundColor: on ? colors.primary : 'transparent',
            }}
          >
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: on ? colors.onPrimary : colors.onSurface }}>
              {opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
