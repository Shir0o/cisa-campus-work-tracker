import { View } from 'react-native';
import { AppText } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';

// A warm one-line summary of the group's rhythm. Design:
// src/views/AttendanceMobile.tsx's header block.
export function GatheringHero({ count, avgPer }: { count: number; avgPer: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <AppText variant="title">Gatherings</AppText>
      <AppText variant="body" color={colors.onSurfaceVariant}>
        We've come together {count} {count === 1 ? 'time' : 'times'}
        {avgPer > 0 ? `, averaging ${avgPer} ${avgPer === 1 ? 'person' : 'people'}` : ''}.
      </AppText>
    </View>
  );
}
