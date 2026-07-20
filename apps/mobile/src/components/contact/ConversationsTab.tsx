import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { countFor, threadsFor, type Interaction, type ThreadKind, type ThreadMessage } from '@cisa/core';
import { AppText } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { AlongsideThreadView } from './AlongsideThreadView';

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'chat', label: 'Chat / Message' },
  { value: 'call', label: 'Phone Call' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'email', label: 'Email' },
];

// Contact Detail's "Conversations" tab — the interaction log, with a
// per-interaction "Alongside" thread toggle. Design oracle:
// ContactDetailsModal.tsx's "interactions" tab body.
export function ConversationsTab({
  interactions,
  loading,
  threadMessages,
  meStaffId,
  canWrite,
  isAdmin,
  initialOpenThreadId,
  onAdd,
  onUpdate,
  onPostThread,
  onToggleReaction,
}: {
  interactions: Interaction[];
  loading: boolean;
  threadMessages: ThreadMessage[];
  meStaffId: string;
  canWrite: boolean;
  isAdmin: boolean;
  initialOpenThreadId?: string | null;
  onAdd: (input: { content: string; dateTime: string; type: string }) => Promise<void>;
  onUpdate: (interactionId: string, patch: { content: string; dateTime: string; type: string }) => Promise<void>;
  onPostThread: (interactionId: string | null, input: { kind: ThreadKind; body: string }) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const [composing, setComposing] = useState(false);
  const [content, setContent] = useState('');
  const [type, setType] = useState('chat');
  const [openThread, setOpenThread] = useState<string | null>(initialOpenThreadId ?? null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const submit = async () => {
    if (!content.trim()) return;
    await onAdd({ content, dateTime: new Date().toISOString(), type });
    setContent('');
    setComposing(false);
  };

  const saveEdit = async (interaction: Interaction) => {
    if (!editContent.trim()) return;
    await onUpdate(interaction.id, { content: editContent, dateTime: interaction.dateTime, type: interaction.type || 'interaction' });
    setEditingId(null);
  };

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText variant="heading">Every conversation</AppText>
        {canWrite ? (
          <Pressable
            onPress={() => setComposing((v) => !v)}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1, borderColor: colors.outlineVariant }}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.onSurface }}>{composing ? 'Cancel' : '+ Log interaction'}</Text>
          </Pressable>
        ) : null}
      </View>

      {composing ? (
        <View style={{ gap: 8, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceContainerHigh, borderWidth: 1, borderColor: colors.outlineVariant }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {TYPE_OPTIONS.map((opt) => {
              const on = type === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setType(opt.value)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: radius.full,
                    borderWidth: 1,
                    borderColor: on ? colors.primary : colors.outlineVariant,
                    backgroundColor: on ? colors.primaryContainer : 'transparent',
                  }}
                >
                  <Text style={{ fontSize: 11.5, fontWeight: '600', color: on ? colors.onPrimaryContainer : colors.onSurfaceVariant }}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="Describe the interaction…"
            placeholderTextColor={colors.onSurfaceVariant}
            multiline
            numberOfLines={3}
            style={{ minHeight: 64, padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainer, fontSize: 13, color: colors.onSurface, textAlignVertical: 'top' }}
          />
          <Pressable
            onPress={submit}
            disabled={!content.trim()}
            style={{ alignSelf: 'flex-end', paddingHorizontal: 14, height: 32, borderRadius: radius.full, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', opacity: content.trim() ? 1 : 0.5 }}
          >
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.onPrimary }}>Log Interaction</Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <AppText variant="body" color={colors.onSurfaceVariant}>
          Loading…
        </AppText>
      ) : interactions.length === 0 ? (
        <View style={{ padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.outlineVariant, alignItems: 'center' }}>
          <AppText variant="caption">No interactions logged yet.</AppText>
        </View>
      ) : (
        [...interactions].reverse().map((interaction) => {
          const count = countFor(threadMessages, interaction.id);
          const editing = editingId === interaction.id;
          return (
            <View key={interaction.id} style={{ gap: 6 }}>
              {editing ? (
                <View style={{ gap: 8, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceContainerHigh, borderWidth: 1, borderColor: colors.primary }}>
                  <TextInput
                    value={editContent}
                    onChangeText={setEditContent}
                    multiline
                    numberOfLines={3}
                    style={{ minHeight: 56, padding: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainer, fontSize: 13, color: colors.onSurface, textAlignVertical: 'top' }}
                  />
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
                    <Pressable onPress={() => setEditingId(null)}>
                      <Text style={{ fontSize: 11.5, fontWeight: '700', color: colors.onSurfaceVariant }}>Cancel</Text>
                    </Pressable>
                    <Pressable onPress={() => saveEdit(interaction)} disabled={!editContent.trim()}>
                      <Text style={{ fontSize: 11.5, fontWeight: '700', color: colors.primary }}>Save</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 11.5, fontWeight: '700', color: colors.onSurface, textTransform: 'uppercase' }}>{interaction.userName}</Text>
                      <AppText variant="caption">{new Date(interaction.dateTime).toLocaleDateString()}</AppText>
                    </View>
                    {canWrite && (isAdmin || meStaffId === interaction.userId) ? (
                      <Pressable
                        onPress={() => {
                          setEditingId(interaction.id);
                          setEditContent(interaction.content);
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>Edit</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <View style={{ padding: 10, borderRadius: radius.md, borderTopLeftRadius: 2, backgroundColor: colors.surfaceContainerHigh, borderWidth: 1, borderColor: colors.outlineVariant }}>
                    <Text style={{ fontSize: 13.5, lineHeight: 19, color: colors.onSurface }}>{interaction.content}</Text>
                  </View>
                  <Pressable
                    onPress={() => setOpenThread(openThread === interaction.id ? null : interaction.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                  >
                    <Ionicons name="footsteps-outline" size={14} color={colors.onSurfaceVariant} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.onSurfaceVariant, textTransform: 'uppercase' }}>
                      {count > 0 ? `Alongside · ${count}` : 'Think this through together'}
                    </Text>
                  </Pressable>
                  {openThread === interaction.id ? (
                    <View style={{ marginLeft: 12, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: colors.outlineVariant }}>
                      <AlongsideThreadView
                        messages={threadsFor(threadMessages, interaction.id)}
                        meStaffId={meStaffId}
                        compact
                        canPost={canWrite}
                        onPost={(input) => onPostThread(interaction.id, input)}
                        onToggleReaction={onToggleReaction}
                      />
                    </View>
                  ) : null}
                </>
              )}
            </View>
          );
        })
      )}
    </View>
  );
}
