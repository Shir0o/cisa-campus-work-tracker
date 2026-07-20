import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isTrainee, relTime, THREAD_KINDS, THREAD_REACTIONS, type ThreadKind, type ThreadMessage, type ThreadTone } from '@cisa/core';
import { AppText } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../theme/tokens';

const KIND_ICON: Record<ThreadKind, keyof typeof Ionicons.glyphMap> = {
  note: 'pencil-outline',
  comment: 'chatbubble-ellipses-outline',
  question: 'help-circle-outline',
  encouragement: 'heart-outline',
  nudge: 'notifications-outline',
};

// Compose kinds shift with who's looking: a trainee leans note/question; the
// full-timer leans comment/encourage/nudge. Both can post anything. Ported
// from web's src/components/Thread.tsx.
const TRAINEE_KINDS: ThreadKind[] = ['note', 'question', 'comment', 'encouragement'];
const FULLTIMER_KINDS: ThreadKind[] = ['comment', 'encouragement', 'question', 'nudge'];

// ThreadTone has a 'warn' value the shared ToneKey palette doesn't — resolve
// it straight from theme.warning rather than stretching ToneKey to cover it.
function threadToneColors(colors: ThemeColors, tone: ThreadTone): { fg: string; soft: string } {
  switch (tone) {
    case 'accent':
      return { fg: colors.stageAccent, soft: colors.stageAccentSoft };
    case 'teal':
      return { fg: colors.stageTeal, soft: colors.stageTealSoft };
    case 'amber':
      return { fg: colors.stageAmber, soft: colors.stageAmberSoft };
    case 'violet':
      return { fg: colors.stageViolet, soft: colors.stageVioletSoft };
    case 'warn':
      return { fg: colors.warning, soft: colors.warningContainer };
  }
}

// "Alongside" — the walking-together thread on a contact (or one of its
// interactions). No existing RN precedent (FromTeamInbox only renders inbox
// *summary* rows); this is a full port of web's Thread.tsx.
export function AlongsideThreadView({
  messages,
  meStaffId,
  compact,
  canPost,
  onPost,
  onToggleReaction,
}: {
  messages: ThreadMessage[];
  meStaffId: string;
  compact?: boolean;
  canPost: boolean;
  onPost: (input: { kind: ThreadKind; body: string }) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const composeKinds = isTrainee(meStaffId) ? TRAINEE_KINDS : FULLTIMER_KINDS;
  const [kind, setKind] = useState<ThreadKind>(composeKinds[0]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!composeKinds.includes(kind)) setKind(composeKinds[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meStaffId]);

  const post = () => {
    const body = draft.trim();
    if (!body) return;
    onPost({ kind, body });
    setDraft('');
  };

  return (
    <View style={{ gap: compact ? spacing.sm : spacing.md }}>
      {messages.length === 0 ? (
        <AppText variant="caption" style={{ fontStyle: 'italic' }}>
          {compact ? 'No notes on this conversation yet.' : 'Nothing here yet — start the conversation below.'}
        </AppText>
      ) : (
        messages.map((m) => {
          const meta = THREAD_KINDS[m.kind] ?? THREAD_KINDS.comment;
          const { fg, soft } = threadToneColors(colors, meta.tone);
          const mine = m.from === meStaffId;
          const tally: Record<string, number> = {};
          for (const r of m.reactions) tally[r.emoji] = (tally[r.emoji] || 0) + 1;
          const reactedByMe = (emoji: string) => m.reactions.some((r) => r.emoji === emoji && r.by === meStaffId);
          const unused = THREAD_REACTIONS.filter((e) => !tally[e]);

          return (
            <View key={m.id} style={{ flexDirection: 'row', gap: compact ? 10 : 12 }}>
              <View
                style={{
                  width: compact ? 26 : 30,
                  height: compact ? 26 : 30,
                  borderRadius: 9,
                  backgroundColor: soft,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 2,
                }}
              >
                <Ionicons name={KIND_ICON[m.kind] ?? 'chatbubble-ellipses-outline'} size={compact ? 14 : 15} color={fg} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '600', color: colors.onSurface }}>
                    {mine ? 'You' : (m.fromName || 'Someone').trim().split(/\s+/)[0]}
                  </Text>
                  <Text style={{ fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, color: fg }}>
                    {meta.label}
                  </Text>
                  <AppText variant="caption">{relTime(m.at)}</AppText>
                </View>
                <View
                  style={{
                    marginTop: 4,
                    padding: 12,
                    borderRadius: radius.md,
                    borderTopLeftRadius: 2,
                    backgroundColor: mine ? colors.stageAccentSoft : colors.surfaceContainerHigh,
                    borderWidth: 1,
                    borderColor: colors.outlineVariant,
                    borderLeftWidth: m.kind === 'nudge' ? 3 : 1,
                    borderLeftColor: m.kind === 'nudge' ? colors.warning : colors.outlineVariant,
                  }}
                >
                  <Text style={{ fontSize: 13.5, lineHeight: 19, color: colors.onSurface }}>{m.body}</Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {Object.keys(tally).map((emoji) => (
                    <Pressable
                      key={emoji}
                      onPress={() => onToggleReaction(m.id, emoji)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: radius.full,
                        borderWidth: 1,
                        borderColor: reactedByMe(emoji) ? colors.primary : colors.outlineVariant,
                        backgroundColor: reactedByMe(emoji) ? colors.primaryContainer : 'transparent',
                      }}
                    >
                      <Text style={{ fontSize: 12 }}>{emoji}</Text>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: colors.onSurfaceVariant }}>{tally[emoji]}</Text>
                    </Pressable>
                  ))}
                  {canPost &&
                    unused.map((emoji) => (
                      <Pressable key={emoji} onPress={() => onToggleReaction(m.id, emoji)} style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 13, opacity: 0.4 }}>{emoji}</Text>
                      </Pressable>
                    ))}
                </View>
              </View>
            </View>
          );
        })
      )}

      {canPost ? (
        <View style={{ marginTop: messages.length > 0 ? 4 : 0 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {composeKinds.map((k) => {
              const on = kind === k;
              return (
                <Pressable
                  key={k}
                  onPress={() => setKind(k)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: radius.full,
                    borderWidth: 1,
                    borderColor: on ? colors.primary : colors.outlineVariant,
                    backgroundColor: on ? colors.primaryContainer : 'transparent',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: on ? colors.onPrimaryContainer : colors.onSurfaceVariant }}>
                    {THREAD_KINDS[k].label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={placeholderFor(kind, meStaffId)}
            placeholderTextColor={colors.onSurfaceVariant}
            multiline
            numberOfLines={compact ? 2 : 3}
            style={{
              marginTop: 8,
              minHeight: compact ? 44 : 64,
              padding: 12,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.outlineVariant,
              backgroundColor: colors.surfaceContainerHigh,
              fontSize: 13.5,
              color: colors.onSurface,
              textAlignVertical: 'top',
            }}
          />
          <Pressable
            onPress={post}
            disabled={!draft.trim()}
            style={{
              alignSelf: 'flex-end',
              marginTop: 8,
              paddingHorizontal: 14,
              height: 32,
              borderRadius: radius.full,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: draft.trim() ? 1 : 0.5,
            }}
          >
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.onPrimary }}>Post</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function placeholderFor(kind: ThreadKind, meStaffId: string): string {
  switch (kind) {
    case 'question':
      return `Ask ${isTrainee(meStaffId) ? 'your full-timer' : 'them'} a question…`;
    case 'encouragement':
      return 'Say something encouraging…';
    case 'nudge':
      return 'Nudge a follow-up…';
    case 'note':
      return 'Leave a note…';
    default:
      return 'Add a comment…';
  }
}
