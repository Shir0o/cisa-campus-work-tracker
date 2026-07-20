import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { Comment } from '@cisa/core';
import { AppText } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';

// Contact Detail's "Discussion" tab — team comments, one level of replies.
// Design oracle: ContactDetailsModal.tsx's "comments" tab body.
export function DiscussionTab({
  comments,
  loading,
  canWrite,
  onAdd,
}: {
  comments: Comment[];
  loading: boolean;
  canWrite: boolean;
  onAdd: (input: { text: string; parentId?: string | null }) => Promise<void>;
}) {
  const { colors, radius, spacing } = useTheme();
  const [draft, setDraft] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!draft.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onAdd({ text: draft, parentId: replyingTo });
      setDraft('');
      setReplyingTo(null);
    } finally {
      setSubmitting(false);
    }
  };

  const topLevel = comments.filter((c) => !c.parentId);
  const repliesFor = (id: string) => comments.filter((c) => c.parentId === id);
  const replyTarget = replyingTo ? comments.find((c) => c.id === replyingTo) : null;

  return (
    <View style={{ gap: spacing.md }}>
      <AppText variant="heading">Team discussion</AppText>

      {loading ? (
        <AppText variant="body" color={colors.onSurfaceVariant}>
          Loading…
        </AppText>
      ) : topLevel.length === 0 ? (
        <View style={{ padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.outlineVariant, alignItems: 'center' }}>
          <AppText variant="caption">No comments yet. Start the conversation.</AppText>
        </View>
      ) : (
        topLevel.map((comment) => (
          <View key={comment.id} style={{ gap: 8 }}>
            <CommentRow comment={comment} onReply={canWrite ? () => setReplyingTo(comment.id) : undefined} />
            {repliesFor(comment.id).length > 0 ? (
              <View style={{ marginLeft: 20, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: colors.outlineVariant, gap: 8 }}>
                {repliesFor(comment.id).map((reply) => (
                  <CommentRow key={reply.id} comment={reply} small />
                ))}
              </View>
            ) : null}
          </View>
        ))
      )}

      {canWrite ? (
        <View style={{ gap: 6 }}>
          {replyTarget ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <AppText variant="caption">Replying to {replyTarget.userName}</AppText>
              <Pressable onPress={() => setReplyingTo(null)}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.error }}>Cancel</Text>
              </Pressable>
            </View>
          ) : null}
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={replyTarget ? 'Type your reply…' : 'Add a comment to the discussion…'}
            placeholderTextColor={colors.onSurfaceVariant}
            multiline
            numberOfLines={3}
            style={{ minHeight: 72, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerHigh, fontSize: 13.5, color: colors.onSurface, textAlignVertical: 'top' }}
          />
          <Pressable
            onPress={submit}
            disabled={!draft.trim() || submitting}
            style={{ alignSelf: 'flex-end', paddingHorizontal: 14, height: 32, borderRadius: radius.full, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', opacity: draft.trim() ? 1 : 0.5 }}
          >
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.onPrimary }}>{submitting ? 'Sending…' : 'Send'}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function CommentRow({ comment, small, onReply }: { comment: Comment; small?: boolean; onReply?: () => void }) {
  const { colors, radius } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: small ? 8 : 10 }}>
      <View
        style={{
          width: small ? 24 : 30,
          height: small ? 24 : 30,
          borderRadius: (small ? 24 : 30) / 2,
          backgroundColor: colors.secondaryContainer,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: small ? 10 : 12, fontWeight: '600', color: colors.onSecondaryContainer }}>
          {(comment.userName || '?').charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text style={{ fontSize: small ? 11 : 12, fontWeight: '700', color: colors.onSurface, textTransform: 'uppercase' }}>{comment.userName}</Text>
          <AppText variant="caption">{new Date(comment.createdAt).toLocaleDateString()}</AppText>
        </View>
        <View
          style={{
            marginTop: 4,
            padding: small ? 8 : 10,
            borderRadius: radius.md,
            borderTopLeftRadius: 2,
            backgroundColor: colors.surfaceContainerHigh,
            borderWidth: 1,
            borderColor: colors.outlineVariant,
          }}
        >
          <Text style={{ fontSize: small ? 12.5 : 13.5, lineHeight: small ? 17 : 19, color: colors.onSurface }}>{comment.text}</Text>
        </View>
        {onReply ? (
          <Pressable onPress={onReply} style={{ marginTop: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.onSurfaceVariant }}>Reply</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
