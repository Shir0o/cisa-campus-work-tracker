// Mobile v2 — campus mode (#1715, design frame "D5 · Original, icon-aligned,
// raised"). During the on-campus window the trainee's home stops being Today's
// card stack and becomes three full-width raised actions: hand someone the
// sign-up form, add them yourself, or log a conversation with someone you
// already know. Titles only — the cards say what they are, nothing more.
//
// Props-driven on purpose: the caller owns the window, the data and the
// navigation; this screen only lays them out.
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { useLanguage } from '../../lib/LanguageProvider';
import { useV2Theme } from '../../theme/v2';
import { DrawerButton } from './QueueDrawer';
import { PersonMark } from './atoms';

export interface CampusModeScreenProps {
  /** e.g. "On campus until 3pm" — callers pass `onCampusHeadline`. */
  windowLabel: string;
  /** Contacts added or conversations logged since the window opened. */
  recent: Array<{ id: string; name: string; isNew: boolean }>;
  todayCount: number;
  todayFaces: Array<{ id: string; name: string }>;
  onMenu(): void;
  onSignUp(): void;
  onAddNew(): void;
  onLog(): void;
  onOpenToday(): void;
}

type Variant = 'primary' | 'plain' | 'inverse';

/** The large chevron — drawn, so its stroke can be thick. */
function Chevron({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9 5l7 7-7 7" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ActionCard({
  title,
  icon,
  variant,
  onPress,
}: {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  variant: Variant;
  onPress: () => void;
}) {
  const { c, font, mode, shadow, fs } = useV2Theme();
  // A translucent wash of the card's own ink, for the icon tile and the
  // chevron's circle.
  const onDarkWash = 'rgba(255, 255, 255, 0.16)';
  const onLightWash = 'rgba(26, 33, 43, 0.08)';
  const look = {
    primary: { bg: c.card.primary, edge: c.card.primaryEdge, ink: c.card.onPrimary, wash: onDarkWash, icon: c.card.onPrimary },
    plain: { bg: c.card.bg, edge: c.card.edge, ink: c.card.ink, wash: c.card.tones.ask.band, icon: c.card.ask },
    inverse: {
      bg: c.card.inverse,
      edge: c.card.inverseEdge,
      ink: c.card.onInverse,
      wash: mode === 'light' ? onDarkWash : onLightWash,
      icon: c.card.onInverse,
    },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 104,
        borderRadius: 24,
        backgroundColor: look.bg,
        borderWidth: variant === 'plain' ? 1 : 0,
        borderColor: c.card.border,
        borderBottomWidth: pressed ? 2 : 5,
        borderBottomColor: look.edge,
        paddingHorizontal: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        marginBottom: 12,
        transform: [{ translateY: pressed ? 3 : 0 }],
        ...(pressed ? shadow.raisedSmall : shadow.raised),
      })}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: look.wash,
        }}
      >
        <Ionicons name={icon} size={28} color={look.icon} />
      </View>
      <Text style={{ flex: 1, fontFamily: font.extra, fontSize: fs(19), color: look.ink }}>{title}</Text>
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: look.wash,
        }}
      >
        <Chevron size={26} color={look.ink} />
      </View>
    </Pressable>
  );
}

function SectionLabel({ children }: { children: string }) {
  const { c, font, fs } = useV2Theme();
  return (
    <Text
      style={{
        fontFamily: font.semi,
        fontSize: fs(11.5),
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        color: c.room.ink3,
        marginTop: 14,
        marginBottom: 10,
      }}
    >
      {children}
    </Text>
  );
}

export function CampusModeScreen({
  windowLabel,
  recent,
  todayCount,
  todayFaces,
  onMenu,
  onSignUp,
  onAddNew,
  onLog,
  onOpenToday,
}: CampusModeScreenProps) {
  const { c, font, shadow, fs } = useV2Theme();
  const { t } = useLanguage();
  const todayLabel = t('mobile.campus.people_to_reach').replace('{count}', String(todayCount));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.room.bg }}
      contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 16, paddingBottom: 16 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, marginBottom: 6 }}>
        <DrawerButton onPress={onMenu} />
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.room.mark }} />
        <Text style={{ flex: 1, fontFamily: font.semi, fontSize: fs(15), color: c.room.ink }}>{windowLabel}</Text>
      </View>

      <SectionLabel>{t('mobile.campus.someone_new')}</SectionLabel>
      <ActionCard
        title={t('mobile.campus.sign_up_form')}
        icon="phone-portrait-outline"
        variant="primary"
        onPress={onSignUp}
      />
      <ActionCard
        title={t('mobile.campus.add_someone_new')}
        icon="person-add-outline"
        variant="plain"
        onPress={onAddNew}
      />

      <SectionLabel>{t('mobile.campus.someone_you_know')}</SectionLabel>
      <ActionCard
        title={t('mobile.campus.log_conversation')}
        icon="create-outline"
        variant="inverse"
        onPress={onLog}
      />

      {recent.length > 0 && (
        <>
          <SectionLabel>{t('mobile.campus.added_this_window')}</SectionLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {recent.map((p) => (
              <View
                key={p.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingVertical: 5,
                  paddingLeft: 5,
                  paddingRight: 12,
                  borderRadius: 999,
                  backgroundColor: c.card.bg,
                  borderWidth: 1,
                  borderColor: c.card.border,
                }}
              >
                <PersonMark name={p.name} id={p.id} size={26} />
                <Text style={{ fontFamily: font.medium, fontSize: fs(13), color: c.card.ink }}>
                  {p.isNew ? `${p.name}${t('mobile.campus.new_suffix')}` : p.name}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      <View style={{ flex: 1, minHeight: 16 }} />

      {todayCount > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={todayLabel}
          onPress={onOpenToday}
          style={({ pressed }) => ({
            minHeight: 64,
            borderRadius: 20,
            backgroundColor: c.card.bg,
            borderWidth: 1,
            borderColor: c.card.border,
            borderBottomWidth: pressed ? 2 : 4,
            borderBottomColor: c.card.edge,
            paddingHorizontal: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            transform: [{ translateY: pressed ? 2 : 0 }],
            ...shadow.raisedSmall,
          })}
        >
          <View style={{ flexDirection: 'row' }}>
            {todayFaces.slice(0, 3).map((f, i) => (
              <View
                key={f.id}
                style={{ marginLeft: i === 0 ? 0 : -10, borderRadius: 17, borderWidth: 2, borderColor: c.card.bg }}
              >
                <PersonMark name={f.name} id={f.id} size={30} />
              </View>
            ))}
          </View>
          <Text style={{ flex: 1, fontFamily: font.semi, fontSize: fs(15), color: c.card.ink }}>{todayLabel}</Text>
          <Chevron size={22} color={c.card.ink2} />
        </Pressable>
      )}
    </ScrollView>
  );
}
