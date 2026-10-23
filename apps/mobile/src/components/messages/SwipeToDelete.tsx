// Swipe-to-delete for a conversation row — "delete for me", a per-user hide.
// Shared by the staff list (MessagesScreen) and the member list
// (MemberMessagesScreen). Deleting writes the user's uid into the room's
// `deletedFor` array — nobody else sees a change, and the conversation comes
// back on its own when anyone sends a new message in it (core's sendMessage
// clears `deletedFor`).
//
// Holding the row opens the conversation's sheet (#1706), the same shape as a
// held message's sheet in a thread; the swipe's Delete button opens that sheet
// too, so the choice and its confirm live in one full-size place.
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useLanguage } from '../../lib/LanguageProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { useV2Theme, v2SheetChrome } from '../../theme/v2';
import { Sheet } from '../ui';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function SwipeToDelete({
  title,
  onHide,
  onDeleteForEveryone,
  children,
}: {
  /** The conversation's name, heading the sheet. */
  title: string;
  onHide: () => void;
  onDeleteForEveryone?: () => void;
  /** The row; wire `openActions` to its `onLongPress`. */
  children: (openActions: () => void) => React.ReactNode;
}) {
  const { c, font, radius, fs } = useV2Theme();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const [sheetOpen, setSheetOpen] = useState(false);

  const openActions = () => setSheetOpen(true);
  const act = (fn: () => void) => () => {
    setSheetOpen(false);
    fn();
  };

  return (
    <>
      <ReanimatedSwipeable
        friction={1.5}
        rightThreshold={40}
        // A hold wobbles a few px; only a real drag should start the swipe.
        dragOffsetFromRight={-24}
        overshootRight={false}
        containerStyle={{ borderRadius: radius.tile, overflow: 'hidden' }}
        renderRightActions={(_progress, _translation, methods) => {
          return (
            <View style={{ width: 94, paddingLeft: 6 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('mobile.common.delete')}
                onPress={() => {
                  methods.close();
                  openActions();
                }}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  borderRadius: radius.tile,
                  backgroundColor: colors.error,
                }}
              >
                <Ionicons name="trash-outline" size={20} color={colors.onError} />
                <Text style={{ fontFamily: font.extra, fontSize: fs(13), color: colors.onError }}>{t('mobile.common.delete')}</Text>
              </Pressable>
            </View>
          );
        }}
      >
        {children(openActions)}
      </ReanimatedSwipeable>

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)} maxHeightRatio={0.5} {...v2SheetChrome(c)}>
        {sheetOpen && (
          <View accessibilityLabel={t('mobile.messages.conversation_actions')} style={{ paddingHorizontal: 8, paddingBottom: 20 }}>
            <Text
              numberOfLines={1}
              style={{ fontFamily: font.semi, fontSize: fs(13), color: c.card.ink3, paddingHorizontal: 16, paddingBottom: 8 }}
            >
              {title}
            </Text>
            <Action icon="trash-outline" label={t('mobile.messages.delete_for_me')} danger onPress={act(onHide)} />
            {onDeleteForEveryone && (
              <Action
                icon="ban-outline"
                label={t('mobile.messages.delete_for_everyone')}
                danger
                onPress={act(onDeleteForEveryone)}
              />
            )}
            <Action label={t('mobile.common.cancel')} onPress={() => setSheetOpen(false)} />
          </View>
        )}
      </Sheet>
    </>
  );
}

function Action({ icon, label, danger, onPress }: { icon?: IconName; label: string; danger?: boolean; onPress: () => void }) {
  const { c, font, fs } = useV2Theme();
  const color = danger ? c.card.tones.follow.text : c.card.ink2;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: icon ? 'flex-start' : 'center',
        gap: 14,
        paddingHorizontal: 16,
        borderRadius: 14,
        backgroundColor: pressed ? c.card.bg2 : 'transparent',
      })}
    >
      {icon && <Ionicons name={icon} size={20} color={color} />}
      <Text style={{ fontFamily: font.semi, fontSize: fs(15), color }}>{label}</Text>
    </Pressable>
  );
}
