import { View } from 'react-native';
import { AppText, Figure } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';

// Quiet figures footer — design: dash-figures.
export function FiguresFooter({
  contacts,
  prayers,
  tasks,
  gatherings,
}: {
  contacts: number;
  prayers: number;
  tasks: number;
  gatherings: number;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={{
        paddingTop: spacing.lg,
        borderTopWidth: 1,
        borderTopColor: colors.outlineVariant,
        gap: spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}>
        <Figure n={contacts} label="contacts" />
        <Figure n={prayers} label="prayers" />
        <Figure n={tasks} label="tasks" />
        <Figure n={gatherings} label="gatherings" />
      </View>
      <AppText variant="caption" color={colors.onSurfaceVariant} style={{ fontStyle: 'italic' }}>
        Numbers are just a way of noticing people.
      </AppText>
    </View>
  );
}
