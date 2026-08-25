// Mobile v2 — the trainee's ☰ drawer (`.m2-drawer` in views/mobile/m2.jsx).
//
// The trainee's shell has no tab bar: the queue IS the app, and everything else
// — People, The Journey, Gatherings, The Board, Messages, Settings — lives
// behind this one button. The list is exactly TRAINEE_DRAWER from @cisa/core,
// in the design's order, and the foot line says why it's short.
import React from 'react';
import { Animated, Dimensions, Modal, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TRAINEE_DRAWER, roleLabel } from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useLanguage } from '../../lib/LanguageProvider';
import { useV2Theme } from '../../theme/v2';
import { PersonMark } from './atoms';

const WIDTH = Math.min(300, Dimensions.get('window').width * 0.82);

/** The ☰ itself. Drawn bars, not a glyph — v2's rule about text marks. */
export function DrawerButton({ onPress }: { onPress: () => void }) {
  const { c, fs } = useV2Theme();
  const { t } = useLanguage();
  return (
    <Pressable
      accessibilityLabel={t('mobile.drawer.menu')}
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        backgroundColor: c.room.chip,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ width: 16, height: 2, borderRadius: 1, backgroundColor: c.room.ink2 }} />
      ))}
    </Pressable>
  );
}

export function QueueDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { c, font, shadow, fs } = useV2Theme();
  const { user, uid, role } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const slide = React.useRef(new Animated.Value(-WIDTH)).current;

  const drawerLabel = (key: string) => {
    const labels: Record<string, string> = {
      people: t('mobile.nav.people'),
      journey: t('mobile.nav.the_journey'),
      messages: t('mobile.nav.messages'),
      ask: t('mobile.ask.title', 'Ask the team'),
      signup: t('mobile.nav.sign_up_form'),
      tutorial: t('mobile.nav.how_this_works'),
      settings: t('mobile.nav.your_app'),
    };
    return labels[key] ?? key;
  };

  React.useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 0 : -WIDTH,
      duration: 190,
      useNativeDriver: true,
    }).start();
  }, [visible, slide]);

  const go = (href: string) => {
    onClose();
    router.push(href as never);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.42)' }} onPress={onClose} />
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: WIDTH,
          backgroundColor: c.card.bg,
          transform: [{ translateX: slide }],
          ...shadow.card,
        }}
      >
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, paddingHorizontal: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 20 }}>
            <PersonMark name={user?.displayName || t('mobile.common.you')} id={uid} size={42} radius={14} fontSize={13} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{ fontFamily: font.extra, fontSize: fs(15.5), letterSpacing: -0.4, color: c.card.ink }}
                numberOfLines={1}
              >
                {user?.displayName ?? t('mobile.common.you')}
              </Text>
              <Text style={{ fontFamily: font.semi, fontSize: fs(12), color: c.card.ink3, marginTop: 2 }}>
                {roleLabel(role)}
              </Text>
            </View>
          </View>

          <View style={{ borderTopWidth: 1, borderTopColor: c.card.line }}>
            {TRAINEE_DRAWER.map((item) => (
              <Pressable
                key={item.key}
                onPress={() => go(item.href)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  minHeight: 52,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.card.ink3 }} />
                <Text style={{ fontFamily: font.bold, fontSize: fs(16), color: c.card.ink }}>{drawerLabel(item.key)}</Text>
              </Pressable>
            ))}
          </View>

          <Text
            style={{
              fontFamily: font.medium,
              fontSize: fs(12.5),
              lineHeight: fs(18),
              color: c.card.ink3,
              marginTop: 'auto',
              paddingBottom: 18,
            }}
          >
            {t('mobile.drawer.foot')}
          </Text>
        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}
