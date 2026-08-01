// Mobile v2 — "Where is {name} now?". The design's `M2MoveSheet`
// (views/mobile/screens.jsx): every step listed, the one they're on marked
// "now", and a line about when moving someone is the right call.
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { firstName, stageToneKey, type Contact } from '@cisa/core';
import { Sheet } from '../ui';
import { useV2Theme, type V2Room } from '../../theme/v2';
import { SecondaryButton } from '../queue/atoms';
import { Room } from '../v2/Widget';
import type { JourneyStage } from '../../lib/useJourneyData';

interface MoveStepSheetProps {
  visible: boolean;
  contact: Contact | null;
  stages: JourneyStage[];
  room: V2Room;
  onMove: (contactId: string, newStageLabel: string) => void;
  onClose: () => void;
}

/** Bottom sheets portal to the app root, outside the screen's provider, so this
 * one carries the room itself (see `Room` in components/v2/Widget). */
export function MoveStepSheet(props: MoveStepSheetProps) {
  return (
    <Room room={props.room}>
      <MoveStepSheetBody {...props} />
    </Room>
  );
}

function MoveStepSheetBody({ visible, contact, stages, room, onMove, onClose }: MoveStepSheetProps) {
  const { c, font, radius } = useV2Theme();
  // Keep the last-known contact rendered while the sheet animates closed, so
  // content doesn't blank out mid-slide when the caller clears `contact`.
  const [shown, setShown] = useState(contact);
  useEffect(() => {
    if (contact) setShown(contact);
  }, [contact]);

  if (!shown) return null;

  // "Unassigned" is where you stand when your stage isn't one of the real ones
  // — either blank, or a label that no longer exists. Matching only on blank
  // would leave a stale-labelled contact with no step marked "now".
  const isHere = (stage: JourneyStage) =>
    stage.id === 'uncategorized'
      ? !stages.some((s) => s.id !== 'uncategorized' && s.label === shown.stage)
      : stage.label === shown.stage;

  return (
    <Sheet visible={visible} onClose={onClose} maxHeightRatio={0.8} backgroundColor={c.card}>
      <Room room={room}>
        <View style={{ paddingHorizontal: 18, paddingTop: 4, paddingBottom: 24 }}>
          <Text style={{ fontFamily: font.extra, fontSize: 20, letterSpacing: -0.5, color: c.cardInk }}>
            Where is {firstName(shown.name)} now?
          </Text>
          <Text style={{ fontFamily: font.semi, fontSize: 13, lineHeight: 18, color: c.cardInk3, marginTop: 7 }}>
            Move them when something real has changed — not to tidy the board.
          </Text>

          <View style={{ gap: 8, marginTop: 16 }}>
            {stages.map((stage) => {
              const here = isHere(stage);
              return (
                <Pressable
                  key={stage.id}
                  onPress={() => {
                    if (!here) onMove(shown.id, stage.id === 'uncategorized' ? '' : stage.label);
                    onClose();
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    minHeight: 56,
                    paddingVertical: 12,
                    paddingHorizontal: 15,
                    borderRadius: radius.note,
                    backgroundColor: here ? c.card2 : 'transparent',
                    borderWidth: here ? 0 : 1,
                    borderColor: c.border,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <View
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: 5,
                      backgroundColor: c.tones[stageToneKey(stages, stage.label)].dot,
                    }}
                  />
                  <Text style={{ flex: 1, fontFamily: font.bold, fontSize: 15, color: c.cardInk }}>{stage.label}</Text>
                  {here && (
                    <Text style={{ fontFamily: font.bold, fontSize: 12, color: c.cardInk3 }}>now</Text>
                  )}
                </Pressable>
              );
            })}
          </View>

          <View style={{ marginTop: 16 }}>
            <SecondaryButton title="Leave it" onPress={onClose} />
          </View>
        </View>
      </Room>
    </Sheet>
  );
}
