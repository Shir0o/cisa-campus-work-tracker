import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { connectedLabel, relTime, type Contact, type InboxItem } from '@cisa/core';
import { AppText, Avatar, Card, Screen, SectionHead, StatusPill } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { toneColors } from '../../theme/tokens';
import { useAuth } from '../../lib/AuthProvider';
import { useTraineeLandingData } from '../../lib/useTraineeLandingData';
import { TeamPrayerRow, PersonalPrayerRow, AddPersonalPrayerRow } from '../myday/YourPrayers';

// One thing the full-timer has put on the trainee's plate: a nudge to follow up
// or a question awaiting a reply. "Open" jumps into the contact's conversation
// (placeholder until contact-detail navigation lands).
function WaitingRow({
  item,
  contactName,
  ftFirst,
  read,
  onOpen,
  onToggleHandled,
}: {
  item: InboxItem;
  contactName: string;
  ftFirst: string;
  read: boolean;
  onOpen: () => void;
  onToggleHandled: () => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const isNudge = item.kind === 'nudge';
  const { fg, soft } = toneColors(colors, isNudge ? 'amber' : 'accent');
  const title = isNudge
    ? `${ftFirst} nudged a follow-up about ${contactName}`
    : `${ftFirst} asked about ${contactName}`;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: read ? colors.outlineVariant : colors.primary + '4d',
        borderRadius: radius.lg,
        padding: spacing.md,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: soft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={isNudge ? 'notifications-outline' : 'help-circle-outline'} size={15} color={fg} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <Text style={{ flex: 1, fontSize: 14.5, fontWeight: '600', color: colors.onSurface }}>{title}</Text>
            {!read && <View style={{ marginTop: 5, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary }} />}
          </View>
          <Text style={{ fontSize: 11.5, color: colors.onSurfaceVariant }}>{relTime(item.at)}</Text>
          {item.body ? <Text style={{ fontSize: 13, color: colors.onSurfaceVariant, marginTop: 2 }}>{item.body}</Text> : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={onOpen}
          style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.primary }}
        >
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.onPrimary }}>Open {contactName.split(/\s+/)[0]}</Text>
        </Pressable>
        <Pressable
          onPress={onToggleHandled}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: radius.full,
            borderWidth: 1,
            borderColor: read ? colors.primary + '4d' : colors.outlineVariant,
            backgroundColor: read ? colors.primaryContainer : 'transparent',
          }}
        >
          <Ionicons name="checkmark" size={13} color={read ? colors.onPrimaryContainer : colors.onSurfaceVariant} />
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: read ? colors.onPrimaryContainer : colors.onSurfaceVariant }}>
            {read ? 'Handled' : 'Mark handled'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// Trainee landing: what the full-timer's flagged + the students in your care +
// the prayers you're holding. Ported from src/views/landings/LandingTrainee.tsx.
export function LandingTrainee() {
  const { colors, radius, spacing } = useTheme();
  const router = useRouter();
  const { uid, user } = useAuth();
  const data = useTraineeLandingData(uid, user?.displayName ?? null);
  const firstName = (user?.displayName || 'friend').split(' ')[0];

  const onOpenContact = (contact: Contact) => {
    router.push(`/contact/${contact.id}`);
  };

  const contactById = (id?: string) => data.contacts.find((c) => c.id === id);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: spacing.xl }}>
        <View style={{ gap: 6 }}>
          <AppText variant="title">Hi, {firstName}.</AppText>
          <AppText variant="body">
            You're caring for {data.myPeople.length} {data.myPeople.length === 1 ? 'student' : 'students'} this
            season.{' '}
            {data.ft
              ? `Here's what ${data.ftFirst}'s flagged for you, the people you've brought in, and what you're holding in prayer.`
              : "Here's your circle, and what you're holding in prayer."}
          </AppText>
        </View>

        {data.waiting.length > 0 && (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <AppText variant="heading">What's waiting on you</AppText>
              {data.waitingUnread > 0 && (
                <View style={{ backgroundColor: colors.stageAccentSoft, borderRadius: radius.full, paddingHorizontal: 9, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: colors.primary }}>{data.waitingUnread}</Text>
                </View>
              )}
            </View>
            <View style={{ gap: 10 }}>
              {data.waiting.map((item) => {
                const contact = contactById(item.contactId);
                return (
                  <WaitingRow
                    key={item.id}
                    item={item}
                    contactName={contact?.name || 'someone'}
                    ftFirst={data.ftFirst}
                    read={data.isWaitingRead(item.id)}
                    onOpen={() => {
                      if (contact) onOpenContact(contact);
                      data.markWaitingRead(item.id);
                    }}
                    onToggleHandled={() =>
                      data.isWaitingRead(item.id) ? data.markWaitingUnread(item.id) : data.markWaitingRead(item.id)
                    }
                  />
                );
              })}
            </View>
          </View>
        )}

        <View>
          <SectionHead title="Your people" action="See all" onAction={() => router.push('/directory')} />
          {data.myPeople.length === 0 ? (
            <Card>
              <AppText variant="body" style={{ textAlign: 'center' }}>
                No one's in your care yet — add a contact to gather your circle here.
              </AppText>
            </Card>
          ) : (
            <TraineePeopleList
              myPeople={data.myPeople}
              weighedIn={data.weighedIn}
              ftFirst={data.ftFirst}
              hasFt={!!data.ft}
              onOpenContact={onOpenContact}
            />
          )}
        </View>

        <View>
          <SectionHead title="Prayers you're holding" />
          <Card style={{ padding: 0 }}>
            <View style={{ paddingHorizontal: spacing.lg }}>
              {data.contactPrayers.length === 0 && data.activePersonalPrayers.length === 0 && (
                <AppText variant="body" style={{ textAlign: 'center', paddingVertical: 20 }}>
                  No prayers yet — add the first thing on your heart below.
                </AppText>
              )}
              {data.contactPrayers.map((p, i) => (
                <TeamPrayerRow
                  key={p.id}
                  prayer={p}
                  contact={contactById(p.contactId)}
                  first={i === 0}
                  onOpenContact={onOpenContact}
                  onSetStatus={(status, answer, answeredAt) => data.setPrayerStatus(p.id, status, answer, answeredAt)}
                />
              ))}
              {data.activePersonalPrayers.map((p, i) => (
                <PersonalPrayerRow
                  key={p.id}
                  prayer={p}
                  first={i === 0 && data.contactPrayers.length === 0}
                  contacts={data.myContacts}
                  onOpenContact={onOpenContact}
                  onUpdate={(patch) => data.updatePersonalPrayer(p.id, patch)}
                  onDelete={() => data.deletePersonalPrayer(p.id)}
                />
              ))}
              <AddPersonalPrayerRow onAdd={(title, contactId) => data.addPersonalPrayer(title, contactId)} />
            </View>
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}

function TraineePeopleList({
  myPeople,
  weighedIn,
  ftFirst,
  hasFt,
  onOpenContact,
}: {
  myPeople: { contact: Contact; days: number; note: string }[];
  weighedIn: Set<string>;
  ftFirst: string;
  hasFt: boolean;
  onOpenContact: (contact: Contact) => void;
}) {
  const { colors, radius } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {myPeople.map(({ contact, days }) => {
        const seen = weighedIn.has(contact.id) || !!contact.reviewed;
        return (
          <Pressable
            key={contact.id}
            onPress={() => onOpenContact(contact)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 13,
              backgroundColor: pressed ? colors.surfaceVariant : colors.surface,
              borderWidth: 1,
              borderColor: colors.outlineVariant,
              borderRadius: radius.lg,
              padding: 12,
            })}
          >
            <Avatar name={contact.name} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text numberOfLines={1} style={{ fontSize: 15.5, fontWeight: '500', color: colors.onSurface }}>
                {contact.name}
              </Text>
              <Text style={{ fontSize: 12.5, color: colors.onSurfaceVariant }}>
                {Number.isFinite(days) ? connectedLabel(days) : ''}
              </Text>
            </View>
            {hasFt && <StatusPill label={seen ? `${ftFirst} weighed in` : 'Awaiting a look'} tone={seen ? 'teal' : 'neutral'} />}
          </Pressable>
        );
      })}
    </View>
  );
}
