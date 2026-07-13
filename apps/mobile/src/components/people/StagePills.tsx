import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { toneColors, toneForStage } from '../../theme/tokens';
import type { StagePillCount } from '../../lib/usePeopleData';

// Stage-filter pills — "Everyone" + one pill per stage, each showing a
// tone-colored dot and a live count. Design: views/contacts.jsx's `ppl-pill`
// row (both mobile and desktop show this).
export function StagePills({
  stageCounts,
  totalCount,
  value,
  onChange,
}: {
  stageCounts: StagePillCount[];
  totalCount: number;
  value: string;
  onChange: (value: string) => void;
}) {
  const { colors, radius } = useTheme();
  const stages = stageCounts.map((s) => s.stage);

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Pill label="Everyone" count={totalCount} on={value === 'all'} onPress={() => onChange('all')} />
      {stageCounts.map(({ stage, count }) => {
        const { fg } = toneColors(colors, toneForStage(stages, stage.label));
        const on = value === stage.label;
        return (
          <Pill
            key={stage.id}
            label={stage.label}
            count={count}
            on={on}
            dotColor={on ? colors.onPrimary : fg}
            onPress={() => onChange(stage.label)}
          />
        );
      })}
    </View>
  );
}

function Pill({
  label,
  count,
  on,
  dotColor,
  onPress,
}: {
  label: string;
  count: number;
  on: boolean;
  dotColor?: string;
  onPress: () => void;
}) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: on ? colors.primary : colors.outlineVariant,
        backgroundColor: on ? colors.primary : 'transparent',
      }}
    >
      {dotColor ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dotColor }} /> : null}
      <Text style={{ fontSize: 12.5, fontWeight: '600', color: on ? colors.onPrimary : colors.onSurface }}>
        {label} <Text style={{ opacity: 0.7 }}>{count}</Text>
      </Text>
    </Pressable>
  );
}
