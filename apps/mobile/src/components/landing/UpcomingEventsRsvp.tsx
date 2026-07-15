import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { format, isValid } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { upcomingEventsForRsvp, type Event } from '@cisa/core';
import { AppText, SectionHead } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuth } from '../../lib/AuthProvider';
import { db } from '../../lib/firebase';
import { subscribeMyRsvps, setRsvp } from '../../lib/data/rsvp';

// Upcoming gatherings with a per-event RSVP toggle. Self-contained: subscribes
// to events and to the current user's RSVPs. Shared by the Student "Coming
// up" and Community "Open gatherings" landings.
export function UpcomingEventsRsvp({
  heading,
  sub,
  emptyText,
  linkLabel = 'Full calendar',
  onLink,
  count = 3,
}: {
  heading: string;
  sub?: string;
  emptyText: string;
  linkLabel?: string;
  onLink?: () => void;
  count?: number;
}) {
  const { colors, radius, spacing, typography } = useTheme();
  const { uid, user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [going, setGoing] = useState<Set<string>>(new Set());

  useEffect(() => {
    return onSnapshot(query(collection(db, 'events')), (snap) =>
      setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Event[]),
    );
  }, []);

  useEffect(() => {
    if (!uid) return;
    return subscribeMyRsvps(uid, setGoing);
  }, [uid]);

  const upcoming = useMemo(() => upcomingEventsForRsvp(events, count), [events, count]);

  const toggle = (eventId: string) => {
    if (!uid) return;
    const isGoing = going.has(eventId);
    setGoing((prev) => {
      const next = new Set(prev);
      if (isGoing) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
    void setRsvp(eventId, { uid, name: user?.displayName || '' }, !isGoing);
  };

  return (
    <View>
      <SectionHead title={heading} action={onLink ? linkLabel : undefined} onAction={onLink} />
      {sub ? (
        <AppText variant="caption" style={{ marginTop: -4, marginBottom: 8 }}>
          {sub}
        </AppText>
      ) : null}
      {upcoming.length > 0 ? (
        <View style={{ gap: 10 }}>
          {upcoming.map(({ ev, ms }) => {
            const d = new Date(ms);
            const meta = [isValid(d) ? format(d, 'EEEE') : '', ev.location, ev.type].filter(Boolean).join(' · ');
            const isGoing = going.has(ev.id);
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
                <Pressable
                  onPress={() => toggle(ev.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    borderRadius: radius.full,
                    backgroundColor: isGoing ? 'transparent' : colors.primary,
                    borderWidth: isGoing ? 1 : 0,
                    borderColor: colors.outlineVariant,
                  }}
                >
                  {isGoing && <Ionicons name="checkmark" size={14} color={colors.onSurface} />}
                  <Text style={{ fontSize: 13.5, fontWeight: '600', color: isGoing ? colors.onSurface : colors.onPrimary }}>
                    {isGoing ? 'Coming' : "I'll be there"}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : (
        <AppText variant="body" color={colors.onSurfaceVariant} style={{ paddingVertical: 8 }}>
          {emptyText}
        </AppText>
      )}
    </View>
  );
}
