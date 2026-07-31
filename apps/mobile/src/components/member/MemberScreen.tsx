// Mobile v2 — the member app's screen shell and its small shared pieces.
//
// Members stand in the SAME room as the trainee (the design's `.m2 deck mem`
// carries no `blue`; only the full-timer app forces navy), so there is no new
// palette here — every screen wraps itself in `Room room="queue"` and reads the
// green one. What differs is the shape: a member scrolls, they don't queue.
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { useV2Theme } from '../../theme/v2';
import { Room } from '../v2/Widget';

/** Every member screen is two components — the provider has to sit ABOVE
 * anything calling useV2Theme(). See Room's own note. */
export function MemberRoom({ children }: { children: React.ReactNode }) {
  return <Room room="queue">{children}</Room>;
}

/** The one scroll a member screen is. `head` rides at the top on the room
 * itself, not on a card. */
export function MemberScreen({
  loading,
  error,
  children,
}: {
  loading?: boolean;
  error?: string | null;
  children: React.ReactNode;
}) {
  const { c, font } = useV2Theme();
  if (loading) {
    return (
      <SafeAreaView
        edges={['top']}
        style={{ flex: 1, backgroundColor: c.room, justifyContent: 'center' }}
      >
        <ActivityIndicator color={c.roomInk2} />
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 18,
          paddingTop: 10,
          paddingBottom: 44,
          gap: 22,
        }}
        showsVerticalScrollIndicator={false}
      >
        {!!error && (
          <Text style={{ fontFamily: font.semi, fontSize: 13, color: c.tones.follow.text }}>
            {error}
          </Text>
        )}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

/** The way back out of a PUSHED member screen. All four of the design's tabs —
 * Today, Prayer, Messages, You — are bottom-tab destinations now, so this is
 * only for the deep-link routes that land on one ('/settings' → You): there's
 * nothing to go back to from a tab, and a dead chevron reads as broken. */
export function MemberBack() {
  const { c, font } = useV2Theme();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.back()}
      hitSlop={10}
      style={({ pressed }) => ({
        alignSelf: 'flex-start',
        minHeight: 44,
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text style={{ fontFamily: font.bold, fontSize: 14, color: c.roomInk2 }}>← Back</Text>
    </Pressable>
  );
}

/** Today's date, the greeting, and one honest line. */
export function MemberHead({
  greeting,
  intro,
  showDate = true,
}: {
  greeting: string;
  intro?: string;
  showDate?: boolean;
}) {
  const { c, font } = useV2Theme();
  return (
    <View>
      {showDate && (
        <Text
          style={{
            fontFamily: font.bold,
            fontSize: 10.5,
            letterSpacing: 1.26,
            textTransform: 'uppercase',
            color: c.roomInk3,
          }}
        >
          {format(new Date(), 'EEEE, MMMM d')}
        </Text>
      )}
      {/* Manrope 800, not Instrument Serif: the Jul 26 revision put every v2
          screen head on one type voice, reserving the serif for the trainee's
          single end-of-queue headline. */}
      <Text
        style={{
          fontFamily: font.extra,
          fontSize: 28,
          lineHeight: 32,
          letterSpacing: -0.9,
          color: c.roomInk,
          marginTop: showDate ? 6 : 0,
        }}
      >
        {greeting}
      </Text>
      {!!intro && (
        <Text
          style={{
            fontFamily: font.medium,
            fontSize: 14.5,
            lineHeight: 21,
            color: c.roomInk2,
            marginTop: 8,
          }}
        >
          {intro}
        </Text>
      )}
    </View>
  );
}

/** The quiet italic-ish line that closes a member screen. */
export function MemberFoot({ children }: { children: string }) {
  const { c, font } = useV2Theme();
  return (
    <Text
      style={{
        fontFamily: font.medium,
        fontSize: 12.5,
        lineHeight: 18,
        color: c.roomFaint,
        marginTop: 2,
      }}
    >
      {children}
    </Text>
  );
}
