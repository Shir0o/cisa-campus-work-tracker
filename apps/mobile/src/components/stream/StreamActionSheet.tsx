// Long-press on a stream row (G7, phone): the hover toolbar's actions in a
// sheet — Reply in thread, Make a to-do, Copy text, and Delete for the author
// or a Full-timer. Which of them show is the caller's to say: an action is
// offered only when its handler is given, and Delete only when the stream
// model allows it (`row.canDelete`) — never a parent whose replies remain.
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StreamMessage, StreamRow } from '@cisa/core';
import { useLanguage } from '../../lib/LanguageProvider';
import { useV2Theme, v2SheetChrome } from '../../theme/v2';
import { Sheet } from '../ui';
import { timeOf } from './format';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function StreamActionSheet<M extends StreamMessage>({
  row,
  visible,
  onClose,
  onReply,
  onMakeTodo,
  onCopy,
  onDelete,
}: {
  /** The row pressed. */
  row: StreamRow<M> | null;
  visible: boolean;
  onClose: () => void;
  onReply?: (row: StreamRow<M>) => void;
  onMakeTodo?: (row: StreamRow<M>) => void;
  onCopy: (row: StreamRow<M>) => void;
  /** Offered only where `row.canDelete`. */
  onDelete?: (row: StreamRow<M>) => void;
}) {
  const { c, font, fs } = useV2Theme();
  const { t, language } = useLanguage();
  const act = (fn: (r: StreamRow<M>) => void) => () => {
    if (!row) return;
    onClose();
    fn(row);
  };

  return (
    <Sheet visible={visible} onClose={onClose} maxHeightRatio={0.55} {...v2SheetChrome(c)}>
      {row && visible && (
        <View accessibilityLabel={t('mobile.stream.message_actions')} style={{ paddingHorizontal: 8, paddingBottom: 20 }}>
          <View style={{ marginHorizontal: 8, marginBottom: 8, padding: 12, borderRadius: 16, backgroundColor: c.card.bg2 }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Text style={{ fontFamily: font.bold, fontSize: fs(14), color: c.card.ink }}>{row.message.fromName}</Text>
              <Text style={{ fontFamily: font.medium, fontSize: fs(11.5), color: c.card.ink3 }}>{timeOf(row.message.at, language)}</Text>
            </View>
            <Text numberOfLines={3} style={{ fontFamily: font.medium, fontSize: fs(14), lineHeight: fs(20), color: c.card.ink2, marginTop: 2 }}>
              {row.message.body}
            </Text>
          </View>
          {onReply && <Action icon="chatbubble-outline" label={t('mobile.stream.reply_in_thread')} onPress={act(onReply)} />}
          {onMakeTodo && <Action icon="checkbox-outline" label={t('mobile.stream.make_todo')} onPress={act(onMakeTodo)} />}
          <Action icon="copy-outline" label={t('mobile.stream.copy_text')} onPress={act(onCopy)} />
          {onDelete && row.canDelete && (
            <Action icon="trash-outline" label={t('mobile.stream.delete_message')} danger onPress={act(onDelete)} />
          )}
        </View>
      )}
    </Sheet>
  );
}

function Action({ icon, label, danger, onPress }: { icon: IconName; label: string; danger?: boolean; onPress: () => void }) {
  const { c, font, fs } = useV2Theme();
  const color = danger ? c.card.tones.follow.text : c.card.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingHorizontal: 16,
        borderRadius: 14,
        backgroundColor: pressed ? c.card.bg2 : 'transparent',
      })}
    >
      <Ionicons name={icon} size={20} color={color} />
      <Text style={{ fontFamily: font.semi, fontSize: fs(15), color }}>{label}</Text>
    </Pressable>
  );
}
