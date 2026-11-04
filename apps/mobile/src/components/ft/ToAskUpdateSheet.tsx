// Mobile v2 — "Post an update" on a To ask line (#1649). A short note about
// what the Full-timer heard, and where else it goes: only this line, the
// contact's page (logged for the Trainee), or a reply in the Thread. The footer
// is pinned, so Cancel and Post never scroll under the keyboard.
import React from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import type { ToAskUpdateDest } from '@cisa/core';
import { Sheet } from '../ui';
import { useLanguage } from '../../lib/LanguageProvider';
import { useV2Theme, v2SheetChrome, type V2ToneKey } from '../../theme/v2';
import { PrimaryButton, SecondaryButton } from '../queue/atoms';
import { Room, V2TextArea } from '../v2/Widget';

export interface ToAskUpdateTarget {
  /** The line, as the screen shows it. */
  text: string;
  tone: V2ToneKey;
  chip: string;
  contactName: string | null;
  traineeName: string | null;
  dests: ToAskUpdateDest[];
}

interface Props {
  visible: boolean;
  target: ToAskUpdateTarget | null;
  onClose: () => void;
  onPost: (text: string, dest: ToAskUpdateDest, alsoAsked: boolean) => void;
}

/** Bottom sheets portal to the app root, outside the screen's provider, so this
 *  one carries the room itself. Keyed by the caller per line, so the draft
 *  starts empty. */
export function ToAskUpdateSheet(props: Props) {
  return (
    <Room room="ft">
      <UpdateSheetBody {...props} />
    </Room>
  );
}

function UpdateSheetBody({ visible, target, onClose, onPost }: Props) {
  const { c, font, radius, fs } = useV2Theme();
  const { t } = useLanguage();
  const [text, setText] = React.useState('');
  const [dest, setDest] = React.useState<ToAskUpdateDest>('line');
  const [alsoAsked, setAlsoAsked] = React.useState(true);

  const contact = target?.contactName || t('mobile.toAsk.this_person');
  const trainee = target?.traineeName ?? null;
  const placeholder =
    trainee && target?.contactName
      ? t('mobile.toAsk.update_placeholder').replace('{trainee}', trainee).replace('{contact}', target.contactName)
      : target?.contactName
        ? t('mobile.toAsk.update_placeholder_contact').replace('{contact}', target.contactName)
        : t('mobile.toAsk.update_placeholder_plain');

  const label = (d: ToAskUpdateDest) =>
    d === 'contact'
      ? t('mobile.toAsk.dest_contact').replace('{contact}', contact)
      : d === 'thread'
        ? t('mobile.toAsk.dest_thread')
        : t('mobile.toAsk.dest_line');
  const sub = (d: ToAskUpdateDest) =>
    d === 'contact'
      ? trainee
        ? t('mobile.toAsk.dest_contact_for_sub').replace('{trainee}', trainee)
        : t('mobile.toAsk.dest_contact_sub')
      : d === 'thread'
        ? t('mobile.toAsk.dest_thread_sub')
        : t('mobile.toAsk.dest_line_sub');

  const canPost = text.trim().length > 0;
  const tone = target ? c.card.tones[target.tone] : null;

  const footer = (
    <Room room="ft">
      <View
        style={{
          flexDirection: 'row',
          gap: 10,
          paddingHorizontal: 18,
          paddingTop: 12,
          paddingBottom: 18,
          backgroundColor: c.card.sheet,
          borderTopWidth: 1,
          borderTopColor: c.card.line,
        }}
      >
        <View style={{ flex: 1 }}>
          <SecondaryButton title={t('mobile.toAsk.cancel')} onPress={onClose} />
        </View>
        <View style={{ flex: 1.4 }}>
          <PrimaryButton
            title={t('mobile.toAsk.post')}
            disabled={!canPost}
            onPress={() => onPost(text, dest, alsoAsked)}
          />
        </View>
      </View>
    </Room>
  );

  return (
    <Sheet visible={visible} onClose={onClose} maxHeightRatio={0.9} footer={footer} {...v2SheetChrome(c)}>
      <Room room="ft">
        {!!target && (
          <View style={{ paddingHorizontal: 18, paddingTop: 4, paddingBottom: 8 }}>
            {!!trainee && (
              <Text
                style={{
                  fontFamily: font.semi,
                  fontSize: fs(11),
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  color: c.card.ink3,
                }}
              >
                {t('mobile.toAsk.for_name').replace('{name}', trainee)}
              </Text>
            )}
            <Text
              style={{
                fontFamily: font.semi,
                fontSize: fs(21),
                letterSpacing: -0.3,
                color: c.card.ink,
                marginTop: trainee ? 4 : 0,
              }}
            >
              {t('mobile.toAsk.post_update')}
            </Text>
            <Text style={{ fontFamily: font.medium, fontSize: fs(15), lineHeight: fs(22), color: c.card.ink2, marginTop: 10 }}>
              {target.text}
            </Text>
            {!!target.chip && !!tone && (
              <View
                style={{
                  alignSelf: 'flex-start',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 7,
                  marginTop: 8,
                  paddingVertical: 4,
                  paddingHorizontal: 10,
                  borderRadius: radius.chip,
                  backgroundColor: tone.band,
                }}
              >
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tone.dot }} />
                <Text style={{ flexShrink: 1, fontFamily: font.semi, fontSize: fs(12), color: tone.text }}>{target.chip}</Text>
              </View>
            )}

            <Text style={{ fontFamily: font.semi, fontSize: fs(13), color: c.card.ink2, marginTop: 20, marginBottom: 8 }}>
              {t('mobile.toAsk.what_did_you_hear')}
            </Text>
            <V2TextArea value={text} onChangeText={setText} placeholder={placeholder} minHeight={96} autoFocus />

            {target.dests.length > 1 && (
              <View accessibilityRole="radiogroup" style={{ marginTop: 20 }}>
                <Text style={{ fontFamily: font.semi, fontSize: fs(13), color: c.card.ink2, marginBottom: 8 }}>
                  {t('mobile.toAsk.update_dest')}
                </Text>
                <View style={{ gap: 8 }}>
                  {target.dests.map((d) => {
                    const on = d === dest;
                    return (
                      <Pressable
                        key={d}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        accessibilityLabel={label(d)}
                        onPress={() => setDest(d)}
                        style={({ pressed }) => ({
                          minHeight: 56,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 12,
                          paddingVertical: 10,
                          paddingHorizontal: 14,
                          borderRadius: radius.row,
                          borderWidth: on ? 1.5 : 1,
                          borderColor: on ? c.card.primary : c.card.border,
                          backgroundColor: on ? c.card.reactOnBg : c.card.bg,
                          opacity: pressed ? 0.85 : 1,
                        })}
                      >
                        <View
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 10,
                            borderWidth: 1.5,
                            borderColor: on ? c.card.primary : c.card.ink3,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {on && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.card.primary }} />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: font.semi, fontSize: fs(15), color: c.card.ink }}>{label(d)}</Text>
                          <Text style={{ fontFamily: font.medium, fontSize: fs(12.5), lineHeight: fs(17), color: c.card.ink3, marginTop: 1 }}>
                            {sub(d)}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: alsoAsked }}
              accessibilityLabel={t('mobile.toAsk.also_asked')}
              onPress={() => setAlsoAsked((v) => !v)}
              style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 }}
            >
              <Text style={{ flex: 1, fontFamily: font.semi, fontSize: fs(15), color: c.card.ink }}>
                {t('mobile.toAsk.also_asked')}
              </Text>
              <Switch
                value={alsoAsked}
                onValueChange={setAlsoAsked}
                trackColor={{ false: c.card.border, true: c.card.primary }}
                thumbColor={c.card.onPrimary}
              />
            </Pressable>
          </View>
        )}
      </Room>
    </Sheet>
  );
}
