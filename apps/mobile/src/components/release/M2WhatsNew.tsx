// THE WHAT'S NEW ANNOUNCEMENT (issue #1021) - the phone's on-demand record.
//
// The "What's New" tile opens the latest release record: the same overview and
// categorised bullets the web modal and the store release notes compile from.
// It is a re-read, so it never marks the Release Nudge seen.
import React from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { releaseDateWords, type WhatsNewCategory, type WhatsNewItem } from '@cisa/core';
import { latestAnnouncement } from '../../lib/releases';
import { useV2Theme } from '../../theme/v2';

const CATEGORY_LABEL: Record<WhatsNewCategory, string> = {
  feature: 'New Features',
  ui: 'UI/UX Updates',
  fix: 'Bug Fixes',
};
const CATEGORY_ORDER: WhatsNewCategory[] = ['feature', 'ui', 'fix'];
const TITLE_PREFIX = "What's New in v";
const CTA = 'Got it';

export function M2WhatsNew({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { c, font, fs } = useV2Theme();
  const insets = useSafeAreaInsets();
  const release = latestAnnouncement('mobile');
  if (visible === false || release === null) return null;

  const groups: { category?: WhatsNewCategory; items: WhatsNewItem[] }[] = CATEGORY_ORDER.map(
    (category) => ({
      category: category as WhatsNewCategory | undefined,
      items: release.items.filter((i) => i.category === category),
    }),
  ).filter((g) => g.items.length > 0);
  const uncategorised = release.items.filter((i) => i.category === undefined);
  if (uncategorised.length > 0) groups.push({ items: uncategorised });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(26,33,43,0.5)' }} onPress={onClose} />
      <View
        testID="m2-whats-new"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '86%',
          backgroundColor: c.card.sheet,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingTop: 10,
          paddingBottom: 18 + insets.bottom,
          paddingHorizontal: 18,
        }}
      >
        <View
          style={{
            alignSelf: 'center',
            width: 40,
            height: 5,
            borderRadius: 3,
            backgroundColor: c.card.grab,
            marginBottom: 14,
          }}
        />
        <Text style={{ fontFamily: font.semi, fontSize: fs(20), lineHeight: fs(24), color: c.card.ink }}>
          {TITLE_PREFIX}{release.version}
        </Text>
        <Text style={{ fontFamily: font.medium, fontSize: fs(13), lineHeight: fs(19), color: c.card.ink3, marginTop: 4 }}>
          {release.title} ({releaseDateWords(release.date)})
        </Text>

        <ScrollView style={{ marginTop: 12 }} contentContainerStyle={{ paddingBottom: 8 }}>
          {release.overview ? (
            <Text style={{ fontFamily: font.medium, fontSize: fs(13.5), lineHeight: fs(20), color: c.card.ink3, marginBottom: 10 }}>
              {release.overview}
            </Text>
          ) : null}
          {groups.map((group, gi) => (
            <View key={gi} style={{ marginTop: gi === 0 ? 0 : 16 }}>
              {group.category ? (
                <Text style={{ fontFamily: font.semi, fontSize: fs(12), letterSpacing: 0.4, color: c.card.primary, textTransform: 'uppercase' }}>
                  {CATEGORY_LABEL[group.category]}
                </Text>
              ) : null}
              {group.items.map((item, ii) => (
                <View
                  key={ii}
                  style={{
                    flexDirection: 'row',
                    paddingVertical: 10,
                    borderTopWidth: ii === 0 ? 0 : 1,
                    borderTopColor: c.card.line,
                  }}
                >
                  <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.card.primary, marginTop: 7, marginRight: 8 }} />
                  <Text style={{ flex: 1, fontFamily: font.medium, fontSize: fs(14.5), lineHeight: fs(21), color: c.card.ink }}>
                    {item.text}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={CTA}
          onPress={onClose}
          style={({ pressed }) => ({
            width: '100%',
            marginTop: 12,
            paddingVertical: 14,
            borderRadius: 16,
            backgroundColor: c.card.primary,
            alignItems: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ fontFamily: font.semi, fontSize: fs(14), color: c.card.onPrimary }}>{CTA}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
