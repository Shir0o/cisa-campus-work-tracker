// The one composer box (ADR 0033, C1–C5), phone edition: the audience line
// above it, then one box holding — on a Conversation only — the kind chips, the
// staged attachments, the words, the @ and attach tools, and send. A selected
// Follow-up ask chip takes the amber and its own placeholder, and the audience
// line says the ask's reach. It holds its own draft; sending clears it.
//
// @mention candidates are the stream's own (ADR 0007) and the picked ones
// reconcile against the body as sent — a name edited out notifies nobody. A
// hand-typed "@Firstname" still only highlights in the body (display only).
// There is no keyboard shortcut hint: "⌘↵ to post" means nothing on a touch
// screen (see DRIFT.md row 44).
import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../../lib/LanguageProvider';
import { useV2Theme } from '../../theme/v2';
import {
  extractMentionCandidate,
  filterMentionCandidates,
  reconcileMentionedUsers,
  type MentionUser,
} from '../../lib/mentions';

/** Comment · Question · Ask a follow-up (#813); `nudge` is a Follow-up ask. */
export type StreamComposeKind = 'comment' | 'question' | 'nudge';
const KINDS: { kind: StreamComposeKind; label: string; placeholder: string }[] = [
  { kind: 'comment', label: 'mobile.stream.kind_comment', placeholder: 'mobile.stream.placeholder_comment' },
  { kind: 'question', label: 'mobile.stream.kind_question', placeholder: 'mobile.stream.placeholder_question' },
  { kind: 'nudge', label: 'mobile.stream.kind_follow_up', placeholder: 'mobile.stream.placeholder_follow_up' },
];

/** A file or contact card staged to go with the next post (C5). */
export interface StreamStagedItem {
  key: string;
  label: string;
  kind: 'contact' | 'file';
}

export function StreamComposer({
  audience,
  askAudience,
  locked,
  kinds,
  placeholder,
  label,
  candidates,
  staged,
  onAttach,
  onUnstage,
  onSend,
}: {
  /** Whose eyes a message reaches (C3). */
  audience?: string;
  /** The same while a Follow-up ask is being written. */
  askAudience?: string;
  /** A lock before the audience line — the Full-timers stream. */
  locked?: boolean;
  /** Kind chips inside the box — a Conversation only. */
  kinds?: boolean;
  /** Without kinds; with kinds each kind has its own. */
  placeholder?: string;
  /** The field's accessible name. */
  label: string;
  /** Who may be @mentioned here (ADR 0007); none means no @ tool. */
  candidates?: MentionUser[];
  /** Staged files and contact cards, above the text, each removable (C5). */
  staged?: StreamStagedItem[];
  /** The paperclip — offered only where the source takes attachments (chat). */
  onAttach?: () => void;
  onUnstage?: (key: string) => void;
  onSend: (input: { body: string; kind: StreamComposeKind; mentionedUserIds: string[] }) => void;
}) {
  const { c, font, radius, fs } = useV2Theme();
  const { t } = useLanguage();
  const [kind, setKind] = useState<StreamComposeKind>('comment');
  const [body, setBody] = useState('');
  const [sel, setSel] = useState(0);
  const [picked, setPicked] = useState<Array<{ uid: string; name: string }>>([]);

  const roster = candidates ?? [];
  const hasStaged = !!staged && staged.length > 0;
  const ask = kinds && kind === 'nudge';
  const line = ask && askAudience ? askAudience : audience;
  const hint = kinds ? t(KINDS.find((k) => k.kind === kind)!.placeholder) : placeholder;

  const mention = useMemo(() => extractMentionCandidate(body, sel), [body, sel]);
  const matches = useMemo(
    () => (mention ? filterMentionCandidates(roster, mention.query, false) : []),
    [mention, roster],
  );
  const choosing = !!mention && matches.length > 0;

  const change = (value: string) => {
    setBody(value);
  };

  const pick = (user: MentionUser) => {
    if (!mention) return;
    const before = body.slice(0, mention.atIndex);
    const after = body.slice(mention.atIndex + 1 + mention.query.length);
    const next = `${before}@${user.name} ${after}`;
    setBody(next);
    setPicked((prev) => [...prev, { uid: user.uid, name: user.name }]);
    setSel(before.length + user.name.length + 2);
  };

  const startMention = () => {
    const at = sel >= 0 && sel <= body.length ? sel : body.length;
    const before = body.slice(0, at);
    const after = body.slice(at);
    const lead = before && !/\s$/.test(before) ? ' @' : '@';
    const next = `${before}${lead}${after}`;
    setBody(next);
    setSel(before.length + lead.length);
  };

  const send = () => {
    const said = body.trim();
    if (!said && !hasStaged) return;
    const mentionedUserIds = reconcileMentionedUsers(said, picked);
    setBody('');
    setPicked([]);
    setSel(0);
    onSend({ body: said, kind: kinds ? kind : 'comment', mentionedUserIds });
  };

  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 6, paddingBottom: 10, backgroundColor: c.room.bg }}>
      {!!line && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, marginLeft: 4 }}>
          {locked && <Ionicons name="lock-closed" size={12} color={c.room.ink2} />}
          <Text style={{ fontFamily: font.medium, fontSize: fs(12), color: c.room.ink2 }}>{line}</Text>
        </View>
      )}
      <View
        style={{
          borderRadius: radius.tile,
          borderWidth: 1,
          borderColor: c.card.border,
          backgroundColor: c.card.bg,
          paddingHorizontal: 10,
          paddingTop: kinds ? 4 : 8,
          paddingBottom: 4,
        }}
      >
        {kinds && (
          <View accessibilityRole="radiogroup" accessibilityLabel={t('mobile.stream.kind_group')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
            {KINDS.map((k) => {
              const on = k.kind === kind;
              const tone = k.kind === 'nudge' ? c.card.tones.due : null;
              return (
                <Pressable
                  key={k.kind}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setKind(k.kind)}
                  style={({ pressed }) => ({
                    minHeight: 44,
                    justifyContent: 'center',
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    backgroundColor: on ? (tone ? tone.band : c.card.bg2) : 'transparent',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ fontFamily: on ? font.bold : font.medium, fontSize: fs(12.5), color: on ? (tone ? tone.text : c.card.ink) : c.card.ink2 }}>
                    {t(k.label)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {hasStaged && (
          <View accessibilityLabel={t('mobile.stream.staged')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 6, paddingBottom: 2 }}>
            {staged!.map((s) => (
              <View
                key={s.key}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingLeft: 10,
                  borderRadius: radius.chip,
                  backgroundColor: c.card.bg2,
                }}
              >
                <Ionicons name={s.kind === 'contact' ? 'person-outline' : 'document-outline'} size={13} color={c.card.ink2} />
                <Text numberOfLines={1} style={{ fontFamily: font.semi, fontSize: fs(12), color: c.card.ink2, maxWidth: 180 }}>
                  {s.label}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('mobile.stream.remove_staged').replace('{name}', s.label)}
                  onPress={() => onUnstage?.(s.key)}
                  style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}
                >
                  <Ionicons name="close" size={16} color={c.card.ink2} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {choosing && (
          <View
            accessibilityLabel={t('mobile.stream.mention_list')}
            style={{ marginTop: 4, borderTopWidth: 1, borderTopColor: c.card.line, paddingTop: 2 }}
          >
            {matches.map((u) => (
              <Pressable
                key={u.uid}
                accessibilityRole="button"
                accessibilityLabel={`@${u.name}`}
                onPress={() => pick(u)}
                style={({ pressed }) => ({
                  minHeight: 44,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingHorizontal: 6,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Ionicons name="at" size={15} color={c.card.ink2} />
                <Text style={{ fontFamily: font.semi, fontSize: fs(14), color: c.card.ink }}>{u.name}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
          {onAttach && (
            <ToolButton icon="attach" label={t('mobile.stream.attach')} onPress={onAttach} />
          )}
          {roster.length > 0 && (
            <ToolButton icon="at" label={t('mobile.stream.mention')} onPress={startMention} />
          )}
          <TextInput
            value={body}
            onChangeText={change}
            onSelectionChange={(e) => setSel(e.nativeEvent.selection.start)}
            placeholder={hint}
            placeholderTextColor={c.card.ink3}
            accessibilityLabel={label}
            multiline
            style={{
              flex: 1,
              minHeight: 44,
              maxHeight: 140,
              paddingVertical: 10,
              paddingHorizontal: 4,
              fontFamily: font.medium,
              fontSize: fs(15),
              color: c.card.ink,
              textAlignVertical: 'top',
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('mobile.stream.send')}
            accessibilityState={{ disabled: !body.trim() && !hasStaged }}
            disabled={!body.trim() && !hasStaged}
            onPress={send}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.card.inverse,
              opacity: !body.trim() && !hasStaged ? 0.35 : pressed ? 0.8 : 1,
            })}
          >
            <Ionicons name="arrow-up" size={20} color={c.card.onInverse} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** An icon tool in the composer's row — 44px like every other tap target. */
function ToolButton({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  const { c } = useV2Theme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={icon} size={20} color={c.card.ink2} />
    </Pressable>
  );
}
