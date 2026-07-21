import { Text, View } from 'react-native';
import { format } from 'date-fns';
import { toLocalDate, type Event } from '@cisa/core';
import { AppText, Card, SectionHead } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';

// Your week — featured gathering + the rest of the week. Design: md-huddle.
export function YourWeek({ thisWeek }: { thisWeek: { ev: Event; ms: number }[] }) {
  const { colors, radius, typography } = useTheme();
  const featured = thisWeek[0];
  const rest = thisWeek.slice(1);
  const featuredDate = featured ? toLocalDate(featured.ev.date) : null;

  return (
    <View>
      <SectionHead title="Your week" />
      {!featured ? (
        <Card>
          <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center' }}>
            Nothing on the calendar this week.
          </AppText>
        </Card>
      ) : (
        <View style={{ gap: 10 }}>
          <View
            style={{
              backgroundColor: colors.stageAccentSoft,
              borderWidth: 1,
              borderColor: colors.primary + '33',
              borderRadius: radius.lg,
              padding: 18,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1, color: colors.primary, textTransform: 'uppercase' }}>
              {featuredDate ? format(featuredDate, 'EEEE, MMM d') : 'This week'}
              {featured.ev.location ? ` · ${featured.ev.location}` : ''}
            </Text>
            <Text
              style={{
                fontFamily: typography.fontSerif,
                fontSize: 21,
                fontWeight: '500',
                color: colors.onSurface,
                marginTop: 6,
                marginBottom: 6,
              }}
            >
              {featured.ev.name}
            </Text>
            <AppText variant="caption" color={colors.onSurfaceVariant} style={{ lineHeight: 18 }}>
              A good chance to be present with the people in your care.
            </AppText>
          </View>

          {rest.length > 0 && (
            <Card style={{ padding: 0 }}>
              {rest.map(({ ev }, i) => {
                const d = toLocalDate(ev.date);
                return (
                  <View
                    key={ev.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 14,
                      padding: 14,
                      borderTopWidth: i === 0 ? 0 : 1,
                      borderTopColor: colors.outlineVariant,
                    }}
                  >
                    <View style={{ width: 40, alignItems: 'center' }}>
                      <Text style={{ fontFamily: typography.fontSerif, fontSize: 20, color: colors.onSurface, lineHeight: 22 }}>
                        {d ? format(d, 'd') : '–'}
                      </Text>
                      <Text style={{ fontSize: 10, color: colors.onSurfaceVariant, textTransform: 'uppercase' }}>
                        {d ? format(d, 'MMM') : ''}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ fontWeight: '500', color: colors.onSurface }}>
                        {ev.name}
                      </Text>
                      <Text numberOfLines={1} style={{ fontSize: 12.5, color: colors.onSurfaceVariant, marginTop: 2 }}>
                        {ev.location || 'No location set'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </Card>
          )}
        </View>
      )}
    </View>
  );
}
