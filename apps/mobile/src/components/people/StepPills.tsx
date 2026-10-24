// The Step pills under People's search (ADR 0047) — the old Journey's step
// picker (the design's `.m2j-step`), now a filter on the directory.
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { stageToneKey, type Stage, type StageToneKey, type StepPill as StepPillTab } from '@cisa/core';
import { useV2Theme } from '../../theme/v2';

/** One pill — dot · name · how many stand there (or match the search). */
function StepPill({
  tab,
  tone,
  active,
  onPress,
  onLayout,
}: {
  tab: StepPillTab;
  tone: StageToneKey;
  active: boolean;
  onPress: () => void;
  onLayout: (x: number) => void;
}) {
  const { c, font, fs } = useV2Theme();
  // `.m2j-step`: the dot rides ABOVE the label, and the chosen step inverts —
  // near-white on the night room, near-black on paper. A tint difference alone
  // is invisible in the dark rooms.
  return (
    <Pressable
      onPress={onPress}
      onLayout={(e) => onLayout(e.nativeEvent.layout.x)}
      accessibilityRole="button"
      accessibilityLabel={`${tab.label}, ${tab.count}`}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => ({
        minHeight: 56,
        justifyContent: 'center',
        paddingVertical: 11,
        paddingHorizontal: 14,
        borderRadius: 16,
        backgroundColor: active ? c.card.inverse : c.card.bg2,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 3,
          backgroundColor: c.card.tones[tone].dot,
          opacity: active ? 1 : 0.55,
        }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 8 }}>
        <Text style={{ fontFamily: font.bold, fontSize: fs(13.5), color: active ? c.card.onInverse : c.card.ink2 }}>
          {tab.label}
        </Text>
        <Text style={{ fontFamily: font.extra, fontSize: fs(12), color: active ? c.card.onInverse : c.card.ink3 }}>
          {tab.count}
        </Text>
      </View>
    </Pressable>
  );
}

export function StepPills({
  pills,
  stages,
  activeId,
  onSelect,
}: {
  pills: StepPillTab[];
  stages: Stage[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  // Keep the chosen pill in view. The design's note: set scrollLeft directly —
  // scrollIntoView fights the shell's own scrolling.
  const strip = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});
  useEffect(() => {
    const x = offsets.current[activeId];
    if (x != null) strip.current?.scrollTo({ x: Math.max(0, x - 12), animated: true });
  }, [activeId]);

  return (
    <ScrollView
      ref={strip}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginTop: 14 }}
      contentContainerStyle={{ gap: 8, paddingRight: 14 }}
    >
      {pills.map((tab) => (
        <StepPill
          key={tab.id}
          tab={tab}
          tone={stageToneKey(stages, tab.label)}
          active={tab.id === activeId}
          onPress={() => onSelect(tab.id)}
          onLayout={(x) => {
            offsets.current[tab.id] = x;
          }}
        />
      ))}
    </ScrollView>
  );
}
