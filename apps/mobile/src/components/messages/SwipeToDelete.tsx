// Swipe-to-delete for a conversation row — "delete for me", a per-user hide.
// Shared by the staff list (MessagesScreen) and the member list
// (MemberMessagesScreen). Deleting writes the user's uid into the room's
// `deletedFor` array — nobody else sees a change, and the conversation comes
// back on its own when anyone sends a new message in it (core's sendMessage
// clears `deletedFor`).
import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useLanguage } from '../../lib/LanguageProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { useV2Theme } from '../../theme/v2';

export function SwipeToDelete({
  onHide,
  onDeleteForEveryone,
  children,
}: {
  onHide: () => void;
  onDeleteForEveryone?: () => void;
  children: React.ReactNode;
}) {
  const { c, font, radius, fs } = useV2Theme();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const methodsRef = useRef<SwipeableMethods | null>(null);
  const [confirming, setConfirming] = useState(false);

  const close = () => methodsRef.current?.close();

  return (
    <ReanimatedSwipeable
      friction={1.5}
      rightThreshold={40}
      overshootRight={false}
      containerStyle={{ borderRadius: radius.tile, overflow: 'hidden' }}
      onSwipeableWillClose={() => setConfirming(false)}
      renderRightActions={(_progress, _translation, methods) => {
        methodsRef.current = methods;
        return (
          <View
            style={{
              width: 140,
              borderTopRightRadius: radius.tile,
              borderBottomRightRadius: radius.tile,
              overflow: 'hidden',
            }}
          >
            {!confirming ? (
              <Pressable
                onPress={() => setConfirming(true)}
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.error }}
              >
                <Text style={{ fontFamily: font.extra, fontSize: fs(13), color: '#fff' }}>{t('mobile.common.delete')}</Text>
              </Pressable>
            ) : (
              <View style={{ flex: 1, backgroundColor: c.room.bg, padding: 5, gap: 4 }}>
                <Text
                  style={{ fontFamily: font.semi, fontSize: fs(9), color: c.room.ink3, textAlign: 'center' }}
                  numberOfLines={1}
                >
                  {onDeleteForEveryone ? t('mobile.messages.delete_conversation') : t('mobile.messages.delete_for_me')}
                </Text>
                <View style={{ flexDirection: 'row', flex: 1, gap: 4 }}>
                  <Pressable
                    onPress={() => {
                      setConfirming(false);
                      close();
                    }}
                    style={{ flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: c.room.chip }}
                  >
                    <Text style={{ fontFamily: font.bold, fontSize: fs(11), color: c.room.ink2 }}>{t('mobile.messages.keep')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setConfirming(false);
                      close();
                      if (onDeleteForEveryone) {
                        onDeleteForEveryone();
                      } else {
                        onHide();
                      }
                    }}
                    style={{ flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: colors.error }}
                  >
                    <Text style={{ fontFamily: font.extra, fontSize: fs(11), color: '#fff' }}>{t('mobile.common.delete')}</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        );
      }}
    >
      {children}
    </ReanimatedSwipeable>
  );
}
