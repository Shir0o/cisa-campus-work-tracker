import { useMemo, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { relTime, type Contact, type InboxItem } from '@cisa/core';
import { AppText, Button } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { toneColors, type ToneKey } from '../../theme/tokens';

const IBX_ENCOURAGE: Record<string, string> = {
  '🙏': 'Praying for you both! Let me know if you need anything.',
  '❤️': 'Love seeing this! Praying for your next step with them.',
  '🌱': 'Such encouraging news. Let’s keep watering those seeds!',
  '✅': 'Awesome follow up! Let me know if I can support you here.',
};

const NODE_ICON: Record<InboxItem['type'], keyof typeof Ionicons.glyphMap> = {
  contact: 'people-outline',
  interaction: 'chatbubble-outline',
  thread: 'help-circle-outline',
};
const NODE_TONE: Record<InboxItem['type'], ToneKey> = {
  contact: 'teal',
  interaction: 'accent',
  thread: 'amber',
};

const firstNameOf = (full?: string) => (full || 'A teammate').trim().split(/\s+/)[0];

const COLLAPSED = 6;

// "From the team" relational inbox — full-timer oversight of the whole team's
// activity. Design: ibx-row-m (row → detail bottom-sheet).
export function FromTeamInbox({
  items,
  contacts,
  nameByUid,
  isRead,
  onOpenContact,
  onPostReply,
  onMarkRead,
  onMarkUnread,
  onMarkAllRead,
}: {
  items: InboxItem[];
  contacts: Contact[];
  nameByUid: Record<string, string>;
  isRead: (id: string) => boolean;
  onOpenContact: (contact: Contact, opts?: { tab: 'thread'; interactionId?: string | null }) => void;
  onPostReply: (item: InboxItem, kind: 'encouragement' | 'nudge', body: string) => void;
  onMarkRead: (id: string) => void;
  onMarkUnread: (id: string) => void;
  onMarkAllRead: () => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const [showAll, setShowAll] = useState(false);
  const [openItem, setOpenItem] = useState<InboxItem | null>(null);
  const [reacting, setReacting] = useState(false);

  const unreadCount = useMemo(() => items.filter((it) => !isRead(it.id)).length, [items, isRead]);
  if (items.length === 0) return null;

  const visible = showAll ? items : items.slice(0, Math.max(COLLAPSED, unreadCount));
  const hidden = items.length - visible.length;
  const contactById = (id: string) => contacts.find((c) => c.id === id);

  const closeSheet = () => {
    setOpenItem(null);
    setReacting(false);
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <AppText variant="heading" style={{ flexShrink: 1 }}>
          From the team
        </AppText>
        {unreadCount > 0 && (
          <View style={{ backgroundColor: colors.stageAccentSoft, borderRadius: radius.full, paddingHorizontal: 9, paddingVertical: 3 }}>
            <Text style={{ fontSize: 11.5, fontWeight: '700', color: colors.primary }}>{unreadCount} new</Text>
          </View>
        )}
        {unreadCount > 0 && (
          <Pressable onPress={onMarkAllRead} style={{ marginLeft: 'auto' }} hitSlop={8}>
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.primary }}>Mark all scanned</Text>
          </Pressable>
        )}
      </View>

      <View
        style={{
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.outlineVariant,
          borderRadius: radius.lg,
        }}
      >
        {visible.map((item, i) => {
          const contact = contactById(item.contactId);
          const actorFirst = firstNameOf(nameByUid[item.by]);
          const who = contact?.name || 'someone new';
          const summary =
            item.type === 'contact'
              ? `${actorFirst} added ${who}`
              : item.type === 'interaction'
                ? `${actorFirst} logged time with ${who}`
                : `${actorFirst} asked about ${who}`;
          const read = isRead(item.id);
          const { fg } = toneColors(colors, NODE_TONE[item.type]);

          return (
            <Pressable
              key={item.id}
              onPress={() => setOpenItem(item)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingVertical: 14,
                paddingHorizontal: 15,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.outlineVariant,
                opacity: read ? 0.6 : 1,
              }}
            >
              {!read && (
                <View style={{ position: 'absolute', left: 0, top: 14, bottom: 14, width: 3, borderRadius: 2, backgroundColor: fg }} />
              )}
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontSize: 14.5, fontWeight: '600', color: colors.onSurface }}>
                  {summary}
                </Text>
                {item.body ? (
                  <Text numberOfLines={2} style={{ fontSize: 12.5, color: colors.onSurfaceVariant, marginTop: 3 }}>
                    {item.body}
                  </Text>
                ) : null}
                <Text style={{ fontSize: 11, color: colors.onSurfaceVariant, marginTop: 5 }}>{relTime(item.at)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceVariant} />
            </Pressable>
          );
        })}
      </View>

      {hidden > 0 && !showAll && (
        <Pressable onPress={() => setShowAll(true)} style={{ paddingVertical: 12, alignItems: 'center' }}>
          <Text style={{ fontSize: 13.5, fontWeight: '600', color: colors.primary }}>Show {hidden} earlier</Text>
        </Pressable>
      )}
      {showAll && items.length > COLLAPSED && (
        <Pressable onPress={() => setShowAll(false)} style={{ paddingVertical: 12, alignItems: 'center' }}>
          <Text style={{ fontSize: 13.5, fontWeight: '600', color: colors.onSurfaceVariant }}>Show less</Text>
        </Pressable>
      )}

      <Modal visible={!!openItem} animationType="slide" transparent onRequestClose={closeSheet}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }} onPress={closeSheet}>
          {openItem && (
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: 14 }}
            >
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.outline, opacity: 0.4, alignSelf: 'center' }} />
              <View>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.onSurface }}>
                  {(() => {
                    const contact = contactById(openItem.contactId);
                    const actorFirst = firstNameOf(nameByUid[openItem.by]);
                    const who = contact?.name || 'someone new';
                    return openItem.type === 'contact'
                      ? `${actorFirst} added ${who}`
                      : openItem.type === 'interaction'
                        ? `${actorFirst} logged time with ${who}`
                        : `${actorFirst} asked about ${who}`;
                  })()}
                </Text>
                <Text style={{ fontSize: 12, color: colors.onSurfaceVariant, marginTop: 3 }}>{relTime(openItem.at)}</Text>
              </View>
              <AppText variant="body" color={colors.onSurfaceVariant}>
                {openItem.body || 'No details available.'}
              </AppText>

              {reacting ? (
                <View style={{ gap: 10 }}>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {Object.keys(IBX_ENCOURAGE).map((emoji) => (
                      <Pressable
                        key={emoji}
                        onPress={() => {
                          onPostReply(openItem, 'encouragement', IBX_ENCOURAGE[emoji]);
                          closeSheet();
                        }}
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 22,
                          borderWidth: 1,
                          borderColor: colors.outlineVariant,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ fontSize: 20 }}>{emoji}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Button title="Cancel" variant="ghost" onPress={() => setReacting(false)} full />
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  <SheetAction icon="heart-outline" label={`Encourage ${firstNameOf(nameByUid[openItem.by])}`} onPress={() => setReacting(true)} />
                  {contactById(openItem.contactId) && (
                    <SheetAction
                      icon="chatbubble-outline"
                      label="Open the conversation"
                      onPress={() => {
                        const contact = contactById(openItem.contactId)!;
                        onOpenContact(contact, { tab: 'thread', interactionId: openItem.interactionId ?? null });
                        onMarkRead(openItem.id);
                        closeSheet();
                      }}
                    />
                  )}
                  <SheetAction
                    icon="notifications-outline"
                    label={`Remind ${firstNameOf(nameByUid[openItem.by])}`}
                    onPress={() => {
                      const contactFirst = (contactById(openItem.contactId)?.name || 'them').split(/\s+/)[0];
                      onPostReply(openItem, 'nudge', `A gentle nudge to follow up with ${contactFirst} when you get a chance.`);
                      closeSheet();
                    }}
                  />
                  <SheetAction
                    icon="checkmark-circle-outline"
                    label={isRead(openItem.id) ? 'Mark unscanned' : 'Mark scanned'}
                    onPress={() => {
                      isRead(openItem.id) ? onMarkUnread(openItem.id) : onMarkRead(openItem.id);
                      closeSheet();
                    }}
                  />
                </View>
              )}
            </Pressable>
          )}
        </Pressable>
      </Modal>
    </View>
  );
}

function SheetAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.outlineVariant,
        backgroundColor: pressed ? colors.surfaceVariant : 'transparent',
      })}
    >
      <Ionicons name={icon} size={17} color={colors.onSurface} />
      <Text style={{ fontSize: 14.5, color: colors.onSurface }}>{label}</Text>
    </Pressable>
  );
}
