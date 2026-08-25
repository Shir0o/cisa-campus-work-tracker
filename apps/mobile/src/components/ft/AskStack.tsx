// Mobile v2 — "Questions for the team" (#545), the full-timer's side. A
// trainee's question that isn't about a person has no contact to stack it
// under, so each row IS a question; answering *is* the action, and the first
// full-timer to reply takes it off every feed. An unanswered question does NOT
// age — it stays until someone replies, and the waiting is said in words.
import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { askWaitedWords, firstName, type AskStack as AskStackData } from '@cisa/core';
import { useV2Theme } from '../../theme/v2';
import { useLanguage } from '../../lib/LanguageProvider';
import { PersonMark } from '../queue/atoms';
import { Widget, WidgetAction, WidgetRow } from '../v2/Widget';
import { useInboxReads } from '../../lib/data/inboxReads';

export function AskStack({
  stacks,
  unread,
  nameByUid,
  uid,
  onAnswer,
  onScan,
  onToast,
}: {
  stacks: AskStackData[];
  unread: number;
  nameByUid: Record<string, string>;
  uid: string;
  onAnswer: (parentId: string, owner: string, body: string) => void;
  onScan: (id: string) => void;
  onToast: (msg: string) => void;
}) {
  const { c, font, fs } = useV2Theme();
  const { t } = useLanguage();
  const inbox = useInboxReads();
  const [draft, setDraft] = React.useState<Record<string, string>>({});

  if (stacks.length === 0) return null;

  return (
    <Widget label={t('mobile.ask.questions_for_team', 'Questions for the team')} count={unread}>
      {stacks.flatMap((stack) =>
        stack.items.map((m, i) => {
          const who = nameByUid[m.from] || m.fromName || 'Someone';
          const first = firstName(who);
          const read = inbox.isRead(uid, 'ask:' + m.id);
          const d = draft[m.id] ?? '';
          const send = () => {
            const b = d.trim();
            if (!b) return;
            onAnswer(m.id, m.owner, b);
            setDraft((prev) => ({ ...prev, [m.id]: '' }));
            onToast(`${first} will see your answer.`);
          };
          return (
            <WidgetRow key={m.id} first={i === 0 && stack.items[0].id === m.id}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <PersonMark name={who} id={m.from} size={34} radius={11} fontSize={12} />
                <View style={{ flex: 1, opacity: read ? 0.66 : 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    {!read && (
                      <View
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: 4,
                          backgroundColor: c.card.tones.follow.dot,
                        }}
                      />
                    )}
                    <Text
                      style={{
                        flex: 1,
                        fontFamily: font.bold,
                        fontSize: fs(15),
                        lineHeight: fs(20),
                        color: c.widget.ink,
                      }}
                    >
                      {who} asked the team
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontFamily: font.medium,
                      fontSize: fs(13),
                      lineHeight: fs(18),
                      color: c.widget.ink2,
                      marginTop: 4,
                    }}
                  >
                    {m.body}
                  </Text>
                  <Text
                    style={{
                      fontFamily: font.semi,
                      fontSize: fs(11.5),
                      color: c.widget.ink3,
                      marginTop: 3,
                    }}
                  >
                    {askWaitedWords(m)} · nobody's answered yet
                  </Text>
                  <TextInput
                    value={d}
                    onChangeText={(next) => setDraft((prev) => ({ ...prev, [m.id]: next }))}
                    placeholder={`Answer ${first} the way you'd say it out loud.`}
                    placeholderTextColor={c.widget.ink3}
                    multiline
                    style={{
                      minHeight: 44,
                      marginTop: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                      borderRadius: 12,
                      backgroundColor: c.widget.bg,
                      borderWidth: 1,
                      borderColor: c.widget.line,
                      fontFamily: font.semi,
                      fontSize: fs(13.5),
                      color: c.widget.ink,
                    }}
                  />
                  <View style={{ flexDirection: 'row', gap: 18, marginTop: 2 }}>
                    <WidgetAction label={t('mobile.ask.send', 'Send it')} onPress={send} />
                    {!read && (
                      <WidgetAction label={t('mobile.ask.scanned', 'Scanned')} onPress={() => onScan(m.id)} />
                    )}
                  </View>
                </View>
              </View>
            </WidgetRow>
          );
        }),
      )}
    </Widget>
  );
}