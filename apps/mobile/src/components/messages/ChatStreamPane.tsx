// A chat room's written stream on the phone (ADR 0033): the body of a DM, a
// group or an announcement, and of one of its Threads. Rows, not bubbles — left
// aligned, your own under your own name — over the core stream model, with the
// composer pinned at the foot. The staff screen and the member screen each own
// their header and hand this the room's live data; a Thread is the same pane
// given the `parentId` it hangs off.
//
// What chat adds to the shared row (the web's chat adapter, in spirit): an
// announcement's pinned post first under its strip, a neutral Full-timer badge,
// a taken-back message's label, centred system notices, and in an announcement
// Got it / Reply in thread on every post (S4, S8).
import React, { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { buildStream, buildThread, canPostToRoom, ftAssignees, firstName, memberRoleOf, type StreamRow } from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useLanguage } from '../../lib/LanguageProvider';
import type { useChatThreadData } from '../../lib/useChatThreadData';
import {
  goneLabelOf,
  heldPosts,
  isPostAcknowledged,
  mentionParts,
  pinnedLabelOf,
  toChatStreamMessage,
  type ChatStreamMessage,
} from '../../lib/chatStream';
import { addTodo } from '../../lib/data/todos';
import { useV2Theme, v2SheetChrome } from '../../theme/v2';
import { FtTodoSheet } from '../ft/FtTodoSheet';
import { Snackbar, Sheet } from '../ui';
import { useTranslate } from '../Translate';
import { StreamList, Divider } from '../stream/StreamList';
import { StreamRowView, ThreadChip, type StreamRowProps } from '../stream/StreamRow';
import { StreamComposer } from '../stream/StreamComposer';
import { StreamActionSheet } from '../stream/StreamActionSheet';
import { repliesLabel } from '../stream/format';
import { ThreadSkeleton } from './ThreadSkeleton';

type ChatThreadData = ReturnType<typeof useChatThreadData>;
type ChatRow = StreamRow<ChatStreamMessage>;

/** Where a Thread opens: a pushed screen over the room (T2). */
export const chatThreadHref = (roomId: string, parentId: string) => `/messages/${roomId}/thread?parent=${parentId}`;

export function ChatStreamPane({
  roomId,
  data,
  parentId = null,
  top,
}: {
  roomId: string;
  data: ChatThreadData;
  /** Given, this is that message's Thread rather than the room's stream. */
  parentId?: string | null;
  /** Above the stream inside the scroll — a DM's link to the person's page. */
  top?: React.ReactNode;
}) {
  const { c, font, radius, fs } = useV2Theme();
  const router = useRouter();
  const { uid, role, user } = useAuth();
  const { t } = useLanguage();
  const scroller = useRef<ScrollView>(null);
  const [held, setHeld] = useState<ChatRow | null>(null);
  const [takeBack, setTakeBack] = useState<ChatRow | null>(null);
  const [todoFrom, setTodoFrom] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Read once per visit: "Today" is said against it.
  const [now] = useState(Date.now);

  const me = uid ?? '';
  const staff = !memberRoleOf(role);
  const { room } = data;
  const inThread = parentId !== null;
  const isAnnouncement = room?.type === 'announcement';
  const isMember = !!room && room.memberIds.includes(me);
  const isFullTimer = role === 'admin';
  const canPost = !room || canPostToRoom(room, uid, isFullTimer);
  const canReply = !!room && canPostToRoom(room, uid, isFullTimer, 'reply');
  const viewer = { uid: me, role };
  const nameOf = (id: string, fallback: string) => data.usersCache[id]?.displayName || fallback;
  const who = { me, nameOf, t };
  // Whose @name lights up: the room's people, as the web's chat does.
  const mentionNames = (room?.memberIds ?? []).map((id) => data.usersCache[id]?.displayName ?? '').filter(Boolean);

  const all = useMemo(() => data.messages.map(toChatStreamMessage), [data.messages]);
  const pinnedHeld = inThread ? [] : heldPosts(all, isAnnouncement);
  const heldIds = new Set(pinnedHeld.map((m) => m.id));
  const items = inThread
    ? []
    : buildStream({ messages: all.filter((m) => !heldIds.has(m.id)), viewer, now, lastReadAt: data.lastReadAt });
  const heldRows = pinnedHeld.map((m) => buildThread({ messages: all, viewer, now }, m.id)!.parent);
  const thread = inThread ? buildThread({ messages: all, viewer, now }, parentId) : null;

  const openThread = (row: ChatRow) => router.push(chatThreadHref(roomId, row.message.id) as never);

  const postActions = (row: ChatRow) => {
    const post = row.message.source;
    if (!isAnnouncement || row.message.parentId || post.type === 'system') return null;
    const acked = isPostAcknowledged(post, me);
    const gotIt = isMember && post.senderId !== me;
    const reply = inThread ? null : row.thread ? (
      <ThreadChip thread={row.thread} now={now} onPress={() => openThread(row)} />
    ) : canReply ? (
      <PostButton icon="arrow-undo-outline" label={t('mobile.stream.reply_in_thread')} onPress={() => openThread(row)} />
    ) : null;
    if (!gotIt && !reply) return null;
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 6 }}>
        {gotIt && (
          <PostButton
            icon={acked ? 'checkmark' : undefined}
            label={t(acked ? 'mobile.messages.you_said_got_it' : 'mobile.messages.got_it')}
            done={acked}
            onPress={() => void data.acknowledge(post)}
          />
        )}
        {reply}
      </View>
    );
  };

  const rowProps: Omit<StreamRowProps<ChatStreamMessage>, 'row'> = {
    now,
    onLongPress: setHeld,
    onOpenThread: inThread ? undefined : openThread,
    avatarUrl: (m) => m.source.senderPhoto || data.usersCache[m.source.senderId]?.photoURL,
    badge: (m) => (isAnnouncement && !m.parentId && m.source.type !== 'system' ? t('mobile.messages.full_timer_badge') : null),
    goneLabel: (m) => goneLabelOf(m, who),
    notice: (m) => m.source.type === 'system',
    renderBody: (row, style) => <Body row={row} style={style} staff={staff} names={mentionNames} />,
    renderFooter: isAnnouncement ? postActions : undefined,
  };

  const copy = (row: ChatRow) => {
    void Clipboard.setStringAsync(row.message.body);
    setToast(t('mobile.stream.copied'));
  };
  const pinnable = !!held && isAnnouncement && !held.message.parentId;
  const heldPinned = !!held?.message.source.pinned;

  const empty = !data.loading && !data.error && (inThread ? !thread : items.length === 0 && heldRows.length === 0);

  return (
    <>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
      >
        <ScrollView
          ref={scroller}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12, gap: 10, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          // A stream opens on its newest message, just above the composer (G4).
          onContentSizeChange={() => {
            if (!inThread) scroller.current?.scrollToEnd({ animated: false });
          }}
        >
          {top}
          {data.error ? (
            <Text style={{ fontFamily: font.semi, fontSize: fs(13), color: c.card.tones.follow.text }}>{data.error}</Text>
          ) : data.loading ? (
            <ThreadSkeleton />
          ) : empty ? (
            <Text
              style={{
                fontFamily: font.medium,
                fontSize: fs(14.5),
                lineHeight: fs(21),
                color: c.room.ink2,
                textAlign: 'center',
                paddingVertical: 24,
              }}
            >
              {inThread ? t('mobile.stream.thread_gone') : t('mobile.messages.nothing_here_yet')}
            </Text>
          ) : (
            <View style={{ backgroundColor: c.card.bg, borderRadius: radius.tile, paddingHorizontal: 14, paddingVertical: 8 }}>
              {thread ? (
                <>
                  <StreamRowView row={thread.parent} {...rowProps} />
                  {thread.replies.length > 0 && (
                    <Divider
                      label={
                        <Text style={{ fontFamily: font.semi, fontSize: fs(12), color: c.card.ink2 }}>
                          {repliesLabel(thread.replies.length, t)}
                        </Text>
                      }
                    />
                  )}
                  {thread.replies.map((row) => (
                    <StreamRowView key={row.message.id} row={row} {...rowProps} />
                  ))}
                </>
              ) : (
                <>
                  {heldRows.map((row) => (
                    <View key={`pin:${row.message.id}`}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 2 }}>
                        <Ionicons name="pin" size={13} color={c.card.ink2} />
                        <Text style={{ flex: 1, fontFamily: font.semi, fontSize: fs(12), color: c.card.ink2 }}>
                          {pinnedLabelOf(row.message, who)}
                        </Text>
                      </View>
                      <StreamRowView row={row} {...rowProps} />
                    </View>
                  ))}
                  <StreamList items={items} {...rowProps} />
                </>
              )}
            </View>
          )}
        </ScrollView>

        {inThread ? (
          canReply && !!thread && (
            <StreamComposer
              placeholder={t('mobile.stream.reply_placeholder')}
              label={t('mobile.stream.reply_label')}
              onSend={({ body }) => void data.send(body, parentId)}
            />
          )
        ) : canPost ? (
          <StreamComposer
            audience={isAnnouncement && room ? t('mobile.messages.announcement_audience').replace('{n}', String(room.memberIds.length)) : undefined}
            placeholder={
              isAnnouncement
                ? t('mobile.messages.placeholder_announcement')
                : staff
                  ? t('mobile.messages.write_a_message')
                  : t('mobile.messages.say_it_out_loud')
            }
            label={t('mobile.messages.compose_label')}
            onSend={({ body }) => void data.send(body)}
          />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 18 }}>
            <Ionicons name="megaphone-outline" size={16} color={c.room.ink3} />
            <Text style={{ flexShrink: 1, fontFamily: font.medium, fontSize: fs(13.5), lineHeight: fs(20), color: c.room.ink3 }}>
              {t('mobile.messages.announcement_footer')}
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Long-press (G7): the hover toolbar's actions, phone-shaped. Replies are
          one level deep, so a reply offers no Reply in thread. */}
      <StreamActionSheet
        row={held}
        visible={!!held}
        onClose={() => setHeld(null)}
        onReply={canReply && !inThread && !held?.message.parentId ? openThread : undefined}
        onMakeTodo={staff ? (row) => setTodoFrom(row.message.body) : undefined}
        onCopy={copy}
        onDelete={(row) => setTakeBack(row)}
        onPin={pinnable ? (row) => void data.pin(row.message.id, !row.message.source.pinned) : undefined}
        pinned={heldPinned}
      />

      <TakeBackSheet
        visible={!!takeBack}
        onClose={() => setTakeBack(null)}
        onConfirm={() => {
          const id = takeBack?.message.id;
          setTakeBack(null);
          if (id) void data.remove(id);
        }}
      />

      {staff && (
        <FtTodoSheet
          key={todoFrom ?? 'none'}
          visible={todoFrom !== null}
          contact={null}
          initialTitle={todoFrom ?? undefined}
          me={me}
          assignees={ftAssignees(data.users, uid)}
          onClose={() => setTodoFrom(null)}
          onSave={(input) => {
            setTodoFrom(null);
            void addTodo(input, { uid: me, name: user?.displayName || 'Someone' });
            setToast(
              input.assigneeId === uid
                ? t('mobile.stream.todo_mine')
                : t('mobile.stream.todo_theirs').replace(
                    '{name}',
                    firstName(data.users.find((m) => m.uid === input.assigneeId)?.displayName ?? ''),
                  ),
            );
          }}
        />
      )}
      {!!toast && <Snackbar message={toast} onDismiss={() => setToast(null)} />}
    </>
  );
}

/** A message's words — translated for staff, who can — and what it carries. */
function Body({
  row,
  style,
  staff,
  names,
}: {
  row: ChatRow;
  style: React.ComponentProps<typeof Text>['style'];
  staff: boolean;
  names: string[];
}) {
  const { c, font, radius, fs } = useV2Theme();
  const router = useRouter();
  const { message } = row;
  const { translatedText } = useTranslate(message.body, { enabled: staff });
  return (
    <>
      <Text style={style}>
        {mentionParts(translatedText, names).map((part, i) =>
          part.mention ? (
            <Text key={i} style={{ fontFamily: font.bold, color: c.card.link }}>
              {part.text}
            </Text>
          ) : (
            part.text
          ),
        )}
      </Text>
      {staff &&
        (message.source.attachments ?? []).map((a) => {
          const isContact = a.type === 'contact';
          return (
            <Pressable
              key={`${a.type}:${a.id}`}
              onPress={isContact ? () => router.push(`/contact/${a.id}` as never) : undefined}
              style={({ pressed }) => ({
                alignSelf: 'flex-start',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                marginTop: 7,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: radius.chip,
                backgroundColor: c.card.bg2,
                opacity: pressed && isContact ? 0.75 : 1,
              })}
            >
              <Text style={{ fontFamily: font.semi, fontSize: fs(11.5), color: c.card.ink2 }}>{a.name}</Text>
            </Pressable>
          );
        })}
    </>
  );
}

/** Got it / Reply in thread under an announcement post — 44px each. */
function PostButton({
  icon,
  label,
  done,
  onPress,
}: {
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  done?: boolean;
  onPress: () => void;
}) {
  const { c, font, fs } = useV2Theme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={done === undefined ? undefined : { selected: done }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 16,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: done ? c.card.green : c.card.border,
        backgroundColor: c.card.bg,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {!!icon && <Ionicons name={icon} size={15} color={done ? c.card.green : c.card.ink2} />}
      <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: done ? c.card.green : c.card.ink2 }}>{label}</Text>
    </Pressable>
  );
}

/** The one confirm before a message is taken back for everyone. */
function TakeBackSheet({ visible, onClose, onConfirm }: { visible: boolean; onClose: () => void; onConfirm: () => void }) {
  const { c, font, fs } = useV2Theme();
  const { t } = useLanguage();
  return (
    <Sheet visible={visible} onClose={onClose} maxHeightRatio={0.4} {...v2SheetChrome(c)}>
      {visible && (
        <View style={{ paddingHorizontal: 20, paddingBottom: 24, gap: 14 }}>
          <Text style={{ fontFamily: font.medium, fontSize: fs(15), lineHeight: fs(22), color: c.card.ink }}>
            {t('mobile.messages.take_back_prompt')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('mobile.messages.take_back_no')}
              onPress={onClose}
              style={{ minHeight: 44, paddingHorizontal: 18, borderRadius: 999, justifyContent: 'center', backgroundColor: c.card.bg2 }}
            >
              <Text style={{ fontFamily: font.bold, fontSize: fs(14), color: c.card.ink2 }}>{t('mobile.messages.take_back_no')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('mobile.messages.take_back_yes')}
              onPress={onConfirm}
              style={{ minHeight: 44, paddingHorizontal: 18, borderRadius: 999, justifyContent: 'center', backgroundColor: c.card.tones.follow.text }}
            >
              <Text style={{ fontFamily: font.bold, fontSize: fs(14), color: c.card.bg }}>{t('mobile.messages.take_back_yes')}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </Sheet>
  );
}
