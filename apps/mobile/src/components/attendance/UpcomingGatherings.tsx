import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { format, isValid } from 'date-fns';
import type { Event } from '@cisa/core';
import { AppText, SectionHead } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { subscribeEventRsvps } from '../../lib/data/rsvp';

// Read-only "N going" count for one upcoming event — a self-contained
// subscription, one per visible row (mirrors the web app's RsvpCountComponent).
function GoingCount({ eventId }: { eventId: string }) {
  const { colors } = useTheme();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => subscribeEventRsvps(eventId, (rsvps) => setCount(rsvps.length)), [eventId]);

  return (
    <AppText variant="caption" color={colors.onSurfaceVariant}>
      {count === null ? '' : `${count} going`}
    </AppText>
  );
}

// "Coming up" — the staff/roster view of upcoming gatherings, read-only
// (unlike the landings' personal RSVP toggle). Design:
// src/views/AttendanceMobile.tsx's Coming up section.
export function UpcomingGatherings({ upcoming }: { upcoming: { ev: Event; ms: number }[] }) {
  const { colors, radius, spacing, typography } = useTheme();

  return (
    <View>
      <SectionHead title="Coming up" />
      {upcoming.length === 0 ? (
        <AppText variant="body" color={colors.onSurfaceVariant} style={{ paddingVertical: 8 }}>
          Nothing on the calendar just yet.
        </AppText>
      ) : (
        <View style={{ gap: 10 }}>
          {upcoming.map(({ ev, ms }) => {
            const d = new Date(ms);
            const meta = [isValid(d) ? format(d, 'EEEE') : '', ev.location, ev.type].filter(Boolean).join(' · ');
            return (
              <View
                key={ev.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.outlineVariant,
                  borderRadius: radius.lg,
                  padding: spacing.md,
                }}
              >
                <View style={{ width: 44, alignItems: 'center' }}>
                  <Text style={{ fontFamily: typography.fontSerif, fontSize: 22, color: colors.onSurface, lineHeight: 24 }}>
                    {isValid(d) ? format(d, 'd') : '–'}
                  </Text>
                  <Text style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, color: colors.onSurfaceVariant, marginTop: 2 }}>
                    {isValid(d) ? format(d, 'MMM') : ''}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: typography.fontSerif, fontSize: 16.5, color: colors.onSurface }}>
                    {ev.name}
                  </Text>
                  {meta ? (
                    <Text numberOfLines={1} style={{ fontSize: 11.5, color: colors.onSurfaceVariant, marginTop: 2 }}>
                      {meta}
                    </Text>
                  ) : null}
                </View>
                <GoingCount eventId={ev.id} />
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
