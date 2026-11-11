// The one composer box (ADR 0033, C1–C5), phone edition: the audience line
// above it, then one box holding the staged attachments, the words, the @ and
// attach tools, and send. Every message is a plain comment: an @mention is the
// only "for you" signal, and while the draft names someone a quiet line above
// the box says who will get it on their list. It holds its own draft; sending
// clears it.
//
// @mention candidates are the stream's own (ADR 0007) and the picked ones
// reconcile against the body as sent — a name edited out notifies nobody. A
// hand-typed "@Firstname" still only highlights in the body (display only).
// There is no keyboard shortcut hint: "⌘↵ to post" means nothing on a touch
// screen (see DRIFT.md row 44).
import { useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { joinNames } from '@cisa/core';
import { useLanguage } from '../../lib/LanguageProvider';
import { useV2Theme } from '../../theme/v2';
import { MULTILINE_FIELD_MAX_HEIGHT, useFieldReveal, type Revealable } from '../ui/KeyboardField';
import {
  extractMentionCandidate,
  filterMentionCandidates,
  reconcileMentionedUsers,
  type MentionUser,
} from '../../lib/mentions';

/** A file or contact card staged to go with the next post (C5). */
export interface StreamStagedItem {
  key: string;
  label: string;
  kind: 'contact' | 'file';
}

export function StreamComposer({
  audience,
  locked,
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
  /** A lock before the audience line — the Full-timers stream. */
  locked?: boolean;
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
  onSend: (input: { body: string; mentionedUserIds: string[] }) => void;
}) {
  const { c, font, radius, fs } = useV2Theme();
  const { t } = useLanguage();
  const reveal = useFieldReveal();
  const field = useRef<TextInput>(null);
  const [body, setBody] = useState('');
  const [sel, setSel] = useState(0);
  const [picked, setPicked] = useState<Array<{ uid: string; name: string }>>([]);

  const roster = candidates ?? [];
  const hasStaged = !!staged && staged.length > 0;
  // Who the draft names, as it stands: a name picked and then edited out is
  // nobody's (ADR 0007).
  const named = reconcileMentionedUsers(body, picked);
  const namedLine =
    named.length > 0
      ? t('mobile.stream.mention_list_line').replace(
          '{names}',
          joinNames(
            named.map((uid) => (picked.find((p) => p.uid === uid)?.name || '').trim().split(/\s+/)[0]),
            t('mobile.stream.names_and'),
          ),
        )
      : null;

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
    const at = Math.min(Math.max(sel, 0), body.length);
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
    onSend({ body: said, mentionedUserIds });
  };

  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 6, paddingBottom: 10, backgroundColor: c.room.bg }}>
      {!!audience && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, marginLeft: 4 }}>
          {locked && <Ionicons name="lock-closed" size={12} color={c.room.ink2} />}
          <Text style={{ fontFamily: font.medium, fontSize: fs(12), color: c.room.ink2 }}>{audience}</Text>
        </View>
      )}
      {!!namedLine && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, marginLeft: 4 }}>
          <Ionicons name="at" size={12} color={c.room.ink2} />
          <Text style={{ fontFamily: font.medium, fontSize: fs(12), color: c.room.ink2 }}>{namedLine}</Text>
        </View>
      )}
      <View
        style={{
          borderRadius: radius.tile,
          borderWidth: 1,
          borderColor: c.card.border,
          backgroundColor: c.card.bg,
          paddingHorizontal: 10,
          paddingTop: 8,
          paddingBottom: 4,
        }}
      >
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
            ref={field}
            value={body}
            onChangeText={change}
            onSelectionChange={(e) => setSel(e.nativeEvent.selection.start)}
            onFocus={() => reveal?.(field.current as unknown as Revealable | null)}
            placeholder={placeholder}
            placeholderTextColor={c.card.ink3}
            accessibilityLabel={label}
            multiline
            // Same Android composing-region hazard as V2TextArea (#1514):
            // autocorrect on a controlled multiline field makes backspace in
            // the middle delete the wrong character.
            autoCorrect={false}
            style={{
              flex: 1,
              minHeight: 44,
              maxHeight: MULTILINE_FIELD_MAX_HEIGHT,
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
