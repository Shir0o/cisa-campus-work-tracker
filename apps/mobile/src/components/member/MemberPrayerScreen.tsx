// Mobile v2 — the member's Prayer screen. Ported from the design project's
// `MbrPrayer` (views/mobile/member.jsx).
//
// The two roles get near-opposite screens, and that's the point:
//   student   — their own two lists. What they've asked the team to pray for
//               (real, staff see it) and the people on their heart (private,
//               owner-only in firestore.rules — nobody on the team can read it).
//   community — a read-only window into what the team is carrying, with one
//               action: "I'm praying for this".
// A member never sees the staff prayer page, and a student's own list is never
// shared. That's enforced by what useMemberPrayerData subscribes to, not by
// hiding things here.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { memberAgo, type MemberRole } from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useMemberPrayerData } from '../../lib/useMemberPrayerData';
import { useV2Theme } from '../../theme/v2';
import { Snackbar } from '../ui';
import { Sech } from '../v2/Widget';
import { MemberFoot, MemberHead, MemberRoom, MemberScreen } from './MemberScreen';
import { AskSheet, OnYourHeartSheet } from './AskSheet';

export function MemberPrayerScreen({ role }: { role: MemberRole }) {
  return (
    <MemberRoom>
      <MemberPrayer role={role} />
    </MemberRoom>
  );
}

/** The one-way "I prayed just now" chip, shared by every list on this screen. */
function CarryButton({
  carried,
  label,
  onPress,
}: {
  carried: boolean;
  label: string;
  onPress: () => void;
}) {
  const { c, font, radius, fs } = useV2Theme();
  return (
    <Pressable
      onPress={() => !carried && onPress()}
      disabled={carried}
      style={({ pressed }) => ({
        alignSelf: 'flex-start',
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: 16,
        marginTop: 10,
        borderRadius: radius.chip,
        borderWidth: 1.5,
        borderColor: carried ? 'transparent' : c.deep,
        backgroundColor: carried ? c.card2 : 'transparent',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text
        style={{ fontFamily: font.bold, fontSize: fs(13.5), color: carried ? c.cardInk3 : c.deep }}
      >
        {carried ? 'Prayed today ✓' : label}
      </Text>
    </Pressable>
  );
}

/** One entry in any of the lists: a line, a quiet meta line, and its actions. */
function PrayerCard({
  title,
  meta,
  quiet,
  children,
}: {
  title: string;
  meta?: string;
  quiet?: boolean;
  children?: React.ReactNode;
}) {
  const { c, font, radius, shadow, fs } = useV2Theme();
  return (
    <View
      style={{
        backgroundColor: c.card,
        borderRadius: radius.tile,
        padding: 16,
        opacity: quiet ? 0.75 : 1,
        ...shadow.soft,
      }}
    >
      <Text
        style={{ fontFamily: font.bold, fontSize: fs(15.5), lineHeight: fs(22), color: c.cardInk }}
      >
        {title}
      </Text>
      {!!meta && (
        <Text style={{ fontFamily: font.medium, fontSize: fs(12.5), color: c.cardInk3, marginTop: 4 }}>
          {meta}
        </Text>
      )}
      {children}
    </View>
  );
}

function InlineLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { c, font, fs } = useV2Theme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        minHeight: 44,
        justifyContent: 'center',
        opacity: pressed ? 0.55 : 1,
      })}
    >
      <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.link }}>{label}</Text>
    </Pressable>
  );
}

function MemberPrayer({ role }: { role: MemberRole }) {
  const { c, font, radius, shadow, fs } = useV2Theme();
  const { uid, user } = useAuth();
  const data = useMemberPrayerData(uid, user?.displayName ?? null, role);
  const [sheet, setSheet] = React.useState<'ask' | 'heart' | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);

  if (role === 'community') {
    return (
      <>
        <MemberScreen loading={data.loading} error={data.error}>
          <MemberHead
            greeting="Prayer"
            intro="A window into what the team is holding. Yours to carry too — this page is only for reading."
            showDate={false}
          />
          <View style={{ gap: 10 }}>
            {data.holding.length === 0 && (
              <Text
                style={{ fontFamily: font.medium, fontSize: fs(14.5), lineHeight: fs(21), color: c.roomInk2 }}
              >
                Nothing open right now.
              </Text>
            )}
            {data.holding.map((row) => (
              <PrayerCard key={row.prayerId} title={row.burden} meta={`For ${row.who}`}>
                <CarryButton
                  carried={data.carriedToday(row.prayerId)}
                  label="I'm praying for this"
                  onPress={() => {
                    data.markCarried(row.prayerId);
                    setToast('Thank you for carrying that.');
                  }}
                />
              </PrayerCard>
            ))}
          </View>
          <MemberFoot>Names, not cases. Thank you for holding them.</MemberFoot>
        </MemberScreen>
        {!!toast && <Snackbar message={toast} onDismiss={() => setToast(null)} />}
      </>
    );
  }

  return (
    <>
      <MemberScreen loading={data.loading} error={data.error}>
        <MemberHead
          greeting="Prayer"
          intro="Something you'd like prayed for, and the people on your own heart."
          showDate={false}
        />

        <Pressable
          onPress={() => setSheet('ask')}
          style={({ pressed }) => ({
            backgroundColor: c.tones.pray.band,
            borderRadius: radius.tile,
            padding: 18,
            opacity: pressed ? 0.85 : 1,
            ...shadow.soft,
          })}
        >
          <Text style={{ fontFamily: font.extra, fontSize: fs(16.5), color: c.tones.pray.text }}>
            Ask the team to pray
          </Text>
          <Text
            style={{
              fontFamily: font.medium,
              fontSize: fs(13),
              lineHeight: fs(19),
              color: c.tones.pray.text,
              opacity: 0.8,
              marginTop: 3,
            }}
          >
            The team will see it — nobody else
          </Text>
        </Pressable>

        {data.asks.open.length > 0 && (
          <View>
            <Sech label="What you've asked" count={data.asks.open.length} />
            <View style={{ gap: 10 }}>
              {data.asks.open.map((ask) => (
                <PrayerCard
                  key={ask.id}
                  title={ask.body}
                  meta={`The team is praying · ${memberAgo(ask.createdAt)}`}
                >
                  <InlineLink
                    label="God answered this →"
                    onPress={() => {
                      void data.markAskAnswered(ask.id);
                      setToast('Thank God. Marked answered.');
                    }}
                  />
                </PrayerCard>
              ))}
            </View>
          </View>
        )}

        <View>
          <Sech label="People on your heart" count={data.onYourHeart.open.length} />
          <Text
            style={{
              fontFamily: font.medium,
              fontSize: fs(13),
              lineHeight: fs(19),
              color: c.roomInk3,
              marginTop: -4,
              marginBottom: 10,
            }}
          >
            Just between you and God. Nobody on the team sees this.
          </Text>
          <View style={{ gap: 10 }}>
            {data.onYourHeart.open.length === 0 && (
              <Text
                style={{ fontFamily: font.medium, fontSize: fs(14.5), lineHeight: fs(21), color: c.roomInk2 }}
              >
                Nobody yet — add the first person below.
              </Text>
            )}
            {data.onYourHeart.open.map((p) => (
              <PrayerCard key={p.id} title={p.title} meta={`Since ${memberAgo(p.date)}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <CarryButton
                    carried={data.carriedToday(p.id)}
                    label="I prayed just now"
                    onPress={() => {
                      data.markCarried(p.id);
                      setToast('Thank you for carrying that.');
                    }}
                  />
                  <InlineLink
                    label="Answered"
                    onPress={() => {
                      void data.markHeartAnswered(p.id);
                      setToast('Answered — kept for looking back.');
                    }}
                  />
                </View>
              </PrayerCard>
            ))}
          </View>
          <Pressable
            onPress={() => setSheet('heart')}
            style={({ pressed }) => ({
              minHeight: 48,
              marginTop: 10,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.button,
              borderWidth: 1.5,
              borderColor: c.roomChip,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ fontFamily: font.bold, fontSize: fs(14.5), color: c.roomInk2 }}>
              Add someone
            </Text>
          </Pressable>
        </View>

        {(data.onYourHeart.answered.length > 0 || data.asks.answered.length > 0) && (
          <View>
            <Sech label="Looking back" />
            <View style={{ gap: 10 }}>
              {data.asks.answered.map((a) => (
                <PrayerCard key={a.id} title={a.body} meta="Answered" quiet />
              ))}
              {data.onYourHeart.answered.map((p) => (
                <PrayerCard key={p.id} title={p.title} meta="Answered" quiet />
              ))}
            </View>
          </View>
        )}

        <MemberFoot>Small, honest prayers, kept up over time.</MemberFoot>
      </MemberScreen>

      <AskSheet
        visible={sheet === 'ask'}
        onClose={() => setSheet(null)}
        onSend={(body) => {
          void data.askTheTeam(body);
          setSheet(null);
          setToast("Sent. They're praying with you.");
        }}
      />
      <OnYourHeartSheet
        visible={sheet === 'heart'}
        onClose={() => setSheet(null)}
        onAdd={(title) => {
          void data.addToYourHeart(title);
          setSheet(null);
          setToast('Added — held in prayer.');
        }}
      />
      {!!toast && <Snackbar message={toast} onDismiss={() => setToast(null)} />}
    </>
  );
}
