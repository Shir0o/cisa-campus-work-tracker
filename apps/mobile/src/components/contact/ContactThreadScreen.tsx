// A Thread on the phone (ADR 0033, T2–T4): replies to one Conversation message,
// one level deep, as a pushed screen with a back control to where it lives.
// Header: "Thread" over the person's name. The parent sits on top, then "N
// replies", the replies, and a reply box pinned at the foot. An Interaction's
// Thread is cut (cut-or-keep §24).
import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { buildThread, canSeeContact, type StreamRow, type ThreadMessage } from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useLanguage } from '../../lib/LanguageProvider';
import { useContactDetailData } from '../../lib/useContactDetailData';
import { useInboxReads } from '../../lib/data/inboxReads';
import { conversationMessages } from '../../lib/contactStreams';
import { roomForRole, useV2Theme } from '../../theme/v2';
import { SafeAreaView } from '../ui/SafeArea';
import { KeyboardAvoidingView } from '../ui/KeyboardAvoidingView';
import { KeyboardScrollView } from '../ui/KeyboardField';
import { Snackbar } from '../ui';
import { Room, V2Empty } from '../v2/Widget';
import { StreamRowView } from '../stream/StreamRow';
import { Divider } from '../stream/StreamList';
import { StreamComposer } from '../stream/StreamComposer';
import { StreamActionSheet } from '../stream/StreamActionSheet';
import { repliesLabel } from '../stream/format';

export interface ContactThreadScreenProps {
  contactId: string;
  /** A Conversation message's Thread. */
  parentId?: string | null;
}

export function ContactThreadScreen(props: ContactThreadScreenProps) {
  const { role } = useAuth();
  return (
    <Room room={roomForRole(role)}>
      <ThreadBody {...props} />
    </Room>
  );
}

function ThreadBody({ contactId, parentId }: ContactThreadScreenProps) {
  const { c, font, radius, fs } = useV2Theme();
  const router = useRouter();
  const { uid, role, isImpersonating } = useAuth();
  const { t } = useLanguage();
  const data = useContactDetailData(contactId);
  const [held, setHeld] = useState<StreamRow<ThreadMessage> | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // The message being rewritten, if any (author-only, open threads only).
  const [editingMessage, setEditingMessage] = useState<ThreadMessage | null>(null);

  const canWrite = !isImpersonating;
  const viewer = { uid: uid ?? '', role: canWrite ? role : null };
  // Read once per visit: "Today" and "Open N days" are said against it.
  const [now] = useState(Date.now);
  const streamName = t('mobile.contact.conversation');

  const thread = buildThread(
    { messages: conversationMessages(data.threadMessages), viewer, now },
    parentId ?? '',
  );

  const back = () => (router.canGoBack() ? router.back() : router.replace(`/contact/${contactId}` as never));
  const contact = data.contact;
  const visible = !!contact && canSeeContact(role, uid, contact);

  // Seeing a Thread reads what it shows (#1793), so Today drops its card.
  const reads = useInboxReads();
  const shown = thread
    ? [thread.parent, ...thread.replies].map((r) => r.message.id).join(',')
    : '';
  useEffect(() => {
    if (!uid || !visible || !shown) return;
    reads.markAll(uid, shown.split(',').map((id) => 'thread:' + id));
  }, [uid, visible, shown, reads]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, minHeight: 56 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('mobile.stream.back_to').replace('{name}', streamName)}
          onPress={back}
          style={({ pressed }) => ({
            minHeight: 44,
            minWidth: 44,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 6,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Ionicons name="chevron-back" size={22} color={c.room.ink} />
          <Text style={{ fontFamily: font.semi, fontSize: fs(15), color: c.room.ink }}>{streamName}</Text>
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center', marginRight: 44 }}>
          <Text style={{ fontFamily: font.extra, fontSize: fs(16), color: c.room.ink }}>{t('mobile.stream.thread_title')}</Text>
          {!!contact && <Text style={{ fontFamily: font.medium, fontSize: fs(12), color: c.room.ink2 }}>{contact.name}</Text>}
        </View>
      </View>

      {data.loading ? null : !visible || !thread ? (
        <View style={{ paddingHorizontal: 14 }}>
          <V2Empty>{t('mobile.stream.thread_gone')}</V2Empty>
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <KeyboardScrollView contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
            <View style={{ backgroundColor: c.card.bg, borderRadius: radius.tile, paddingHorizontal: 14, paddingVertical: 10 }}>
              <StreamRowView
                row={thread.parent}
                now={now}
                readOnly={!canWrite}
                onLongPress={setHeld}
                onCloseAsk={(row) => void data.closeAsk(row.message)}
                nameOf={(uid) => data.teamMembers.find((m) => m.uid === uid)?.displayName ?? ''}
                editingId={editingMessage?.id ?? null}
                onSaveEdit={async (body) => {
                  if (!editingMessage) return;
                  await data.editThreadMessage(editingMessage, body);
                  setEditingMessage(null);
                }}
                onCancelEdit={() => setEditingMessage(null)}
                editFailure={t('mobile.stream.edit_failed')}
              />
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
                <StreamRowView
                  key={row.message.id}
                  row={row}
                  now={now}
                  readOnly={!canWrite}
                  onLongPress={setHeld}
                  onCloseAsk={(r) => void data.closeAsk(r.message)}
                  nameOf={(uid) => data.teamMembers.find((m) => m.uid === uid)?.displayName ?? ''}
                  editingId={editingMessage?.id ?? null}
                  onSaveEdit={async (body) => {
                    if (!editingMessage) return;
                    await data.editThreadMessage(editingMessage, body);
                    setEditingMessage(null);
                  }}
                  onCancelEdit={() => setEditingMessage(null)}
                  editFailure={t('mobile.stream.edit_failed')}
                />
              ))}
            </View>
          </KeyboardScrollView>

          {canWrite && (
            <StreamComposer
              placeholder={t('mobile.stream.reply_placeholder')}
              label={t('mobile.stream.reply_label')}
              candidates={data.teamMembers.map((m) => ({
                uid: m.uid,
                name: m.displayName,
                role: m.role,
              }))}
              onSend={({ body, mentionedUserIds }) =>
                void data.postThreadMessage({
                  interactionId: null,
                  parentId: parentId ?? null,
                  kind: 'comment',
                  body,
                  mentionedUserIds,
                })
              }
            />
          )}
        </KeyboardAvoidingView>
      )}

      {/* Long-press (G7). Replies are one level deep, so no Reply in thread here. */}
      <StreamActionSheet
        row={held}
        visible={!!held}
        onClose={() => setHeld(null)}
        onCopy={(row) => {
          void Clipboard.setStringAsync(row.message.body);
          setToast(t('mobile.stream.copied'));
        }}
        onDelete={canWrite ? (row) => void data.deleteThreadMessage(row.message) : undefined}
        // Author-only.
        onEdit={canWrite && held?.message.from === uid ? (row) => setEditingMessage(row.message) : undefined}
      />
      {!!toast && <Snackbar message={toast} onDismiss={() => setToast(null)} />}
    </SafeAreaView>
  );
}
