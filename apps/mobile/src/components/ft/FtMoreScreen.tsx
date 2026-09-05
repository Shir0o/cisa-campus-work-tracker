// Mobile v2 — the full-timer's "More" tab. The design's `FtMore`
// (views/mobile/ft.jsx): the screens you sometimes want on the move, as a plain
// list. People and Messages aren't here — they're tabs of their own.
//
// The list is exactly FT_MORE from @cisa/core and nothing else. The heavier
// work (Board pages, gatherings, kinds) is read-mostly on the phone, which the
// foot line says out loud.
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from '../ui/SafeArea';
import { FT_MORE, roleLabel } from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useLanguage } from '../../lib/LanguageProvider';
import { useV2Theme } from '../../theme/v2';
import { Room } from '../v2/Widget';
import { useImpersonateSheet } from '../impersonate/ImpersonateLayer';
import { FeedbackSheet } from '../feedback/FeedbackSheet';
import { M2Release } from '../release/M2Release';

export function FtMoreScreen() {
  return (
    <Room room="ft">
      <FtMore />
    </Room>
  );
}

function FtMore() {
  const { c, font, radius, fs } = useV2Theme();
  const { user, role, isOwner } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const { open: openImpersonateSheet } = useImpersonateSheet();
  const [feedbackOpen, setFeedbackOpen] = React.useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = React.useState(false);

  const moreLabel = (key: string) => {
    const labels: Record<string, string> = {
      journey: t('mobile.nav.the_journey'),
      gatherings: t('nav.gatherings'),
      prayers: t('mobile.nav.prayer_log'),
      board: t('mobile.nav.the_board'),
      outreach: t('nav.outreach'),
      signup: t('mobile.nav.sign_up_form'),
      tutorial: t('mobile.nav.how_this_works'),
      settings: t('mobile.nav.settings'),
    };
    return labels[key] ?? key;
  };


  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room.bg }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 32 }}>
        <View style={{ paddingTop: 14, paddingBottom: 22 }}>
          <Text
            style={{
              fontFamily: font.bold,
              fontSize: fs(10.5),
              
              
              color: c.room.ink3,
            }}
          >
            {roleLabel(role)}
          </Text>
          <Text
            style={{
              fontFamily: font.extra,
              fontSize: fs(28),
              lineHeight: fs(32),
              letterSpacing: -0.9,
              color: c.room.ink,
              marginTop: 6,
            }}
          >
            {user?.displayName ?? 'You'}
          </Text>
          <Text
            style={{
              fontFamily: font.medium,
              fontSize: fs(14.5),
              lineHeight: fs(21),
              color: c.room.ink2,
              marginTop: 8,
            }}
          >
            {t('mobile.ft_more.intro')}
          </Text>
        </View>

        <View style={{ backgroundColor: c.widget.bg, borderRadius: radius.tile, ...c.widget.shadow }}>
          {FT_MORE.map((item, i) => (
            <Pressable
              key={item.key}
              onPress={() => router.push(item.href as never)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                minHeight: 58,
                paddingHorizontal: 18,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: c.widget.line,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontFamily: font.bold, fontSize: fs(15.5), color: c.widget.ink, flex: 1 }}>
                {moreLabel(item.key)}
              </Text>
              {/* Drawn, not a glyph — v2's rule about text marks in tinted blocks. */}
              <View
                style={{
                  width: 9,
                  height: 9,
                  borderRightWidth: 2,
                  borderTopWidth: 2,
                  borderColor: c.widget.ink3,
                  transform: [{ rotate: '45deg' }],
                }}
              />
            </Pressable>
          ))}
          {isOwner && (
            <Pressable
              onPress={openImpersonateSheet}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                minHeight: 58,
                paddingHorizontal: 18,
                borderTopWidth: 1,
                borderTopColor: c.widget.line,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontFamily: font.bold, fontSize: fs(15.5), color: c.widget.ink, flex: 1 }}>
                {t('mobile.ft_more.see_it_as_they_do')}
              </Text>
              <View
                style={{
                  width: 9,
                  height: 9,
                  borderRightWidth: 2,
                  borderTopWidth: 2,
                  borderColor: c.widget.ink3,
                  transform: [{ rotate: '45deg' }],
                }}
              />
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('mobile.ft_more.whats_new', "What's New")}
            onPress={() => setWhatsNewOpen(true)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              minHeight: 58,
              paddingHorizontal: 18,
              borderTopWidth: 1,
              borderTopColor: c.widget.line,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontFamily: font.bold, fontSize: fs(15.5), color: c.widget.ink, flex: 1 }}>
              {t('mobile.ft_more.whats_new', "What's New")}
            </Text>
            <View
              style={{
                width: 9,
                height: 9,
                borderRightWidth: 2,
                borderTopWidth: 2,
                borderColor: c.widget.ink3,
                transform: [{ rotate: '45deg' }],
              }}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('mobile.ft_more.tell_us_how_its_going', "Tell us how it's going")}
            onPress={() => setFeedbackOpen(true)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              minHeight: 58,
              paddingHorizontal: 18,
              borderTopWidth: 1,
              borderTopColor: c.widget.line,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontFamily: font.bold, fontSize: fs(15.5), color: c.widget.ink, flex: 1 }}>
              {t('mobile.ft_more.tell_us_how_its_going', "Tell us how it's going")}
            </Text>
            <View
              style={{
                width: 9,
                height: 9,
                borderRightWidth: 2,
                borderTopWidth: 2,
                borderColor: c.widget.ink3,
                transform: [{ rotate: '45deg' }],
              }}
            />
          </Pressable>
        </View>

        <Text
          style={{
            fontFamily: font.medium,
            fontSize: fs(13),
            lineHeight: fs(19),
            color: c.room.faint,
            marginTop: 22,
          }}
        >
          {t('mobile.ft_more.foot')}
        </Text>
      </ScrollView>
      <FeedbackSheet visible={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <M2Release
        role={role}
        forceOpen={whatsNewOpen}
        onClose={() => setWhatsNewOpen(false)}
      />
    </SafeAreaView>
  );
}
