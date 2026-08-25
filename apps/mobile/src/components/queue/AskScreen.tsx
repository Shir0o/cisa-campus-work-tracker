// Mobile v2 — "Ask the team" (#545). A trainee's question that isn't about a
// person. Asking and reading are ONE list: the composer at the top, your
// questions newest-first under it, each answer inline. Nothing to resolve,
// nothing to mark — a question with a reply is just a question with a reply.
// Every full-timer sees every question; any of them can answer, from My Day.
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  askQuestionsBy,
  askRepliesOf,
  askWaitedWords,
  firstName,
  type AskMessage,
} from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useLanguage } from '../../lib/LanguageProvider';
import { useV2Theme } from '../../theme/v2';
import {
  addAsk,
  subscribeMyAsks,
} from '../../lib/data/asks';
import { V2Screen, V2TextArea, V2Empty } from '../v2/Widget';
import { PrimaryButton } from '../queue/atoms';

/** The composer + a question with its inline answers. Reused under the list. */
function AskItem({ m, replies, me }: { m: AskMessage; replies: AskMessage[]; me: string }) {
  const { c, font, fs } = useV2Theme();
  const answered = replies.length > 0;
  return (
    <View
      style={{
        backgroundColor: c.card.bg,
        borderRadius: 18,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginTop: 10,
      }}
    >
      <Text style={{ fontFamily: font.semi, fontSize: fs(15), lineHeight: fs(21), color: c.card.ink }}>
        {m.body}
      </Text>
      {!answered ? (
        <Text style={{ fontFamily: font.medium, fontSize: fs(12.5), lineHeight: fs(18), color: c.card.ink3, marginTop: 8 }}>
          No answer yet · {askWaitedWords(m)}. It's with the whole team, not one person.
        </Text>
      ) : (
        <View style={{ marginTop: 10, gap: 8 }}>
          {replies.map((r) => (
            <View
              key={r.id}
              style={{
                backgroundColor: c.card.field,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <Text style={{ fontFamily: font.semi, fontSize: fs(14), lineHeight: fs(20), color: c.card.ink }}>
                {r.body}
              </Text>
              <Text style={{ fontFamily: font.medium, fontSize: fs(12), color: c.card.ink3, marginTop: 4 }}>
                {r.fromName || 'Someone'}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** The trainee's "Ask the team" screen — pushed from the ☰ drawer. */
export function AskScreen() {
  const { c, font, fs } = useV2Theme();
  const { uid, user } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [asks, setAsks] = React.useState<AskMessage[]>([]);
  const [body, setBody] = React.useState('');

  React.useEffect(() => {
    if (!uid) return;
    return subscribeMyAsks(uid, setAsks);
  }, [uid]);

  const mine = React.useMemo(() => (uid ? askQuestionsBy(asks, uid) : []), [asks, uid]);

  const send = () => {
    const b = body.trim();
    if (!b || !uid) return;
    void addAsk({ from: uid, fromName: user?.displayName || 'A trainee', body: b });
    setBody('');
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.room.bg }}>
      <V2Screen title={t('mobile.ask.title', 'Ask the team')} onBack={() => router.back()}>
        {/* Composer at the top */}
        <View
          style={{
            backgroundColor: c.card.bg,
            borderRadius: 18,
            padding: 16,
          }}
        >
          <V2TextArea
            value={body}
            onChangeText={setBody}
            placeholder={t('mobile.ask.placeholder', 'What do you want to ask? Say it how you\'d say it out loud.')}
            minHeight={96}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 }}>
            <Text style={{ fontFamily: font.medium, fontSize: fs(12), color: c.card.ink3, flex: 1 }}>
              {t('mobile.ask.anyone_can_answer', 'Every full-timer sees this. Any of them can answer.')}
            </Text>
            <PrimaryButton title={t('mobile.ask.ask', 'Ask')} onPress={send} />
          </View>
        </View>

        {mine.length === 0 ? (
          <V2Empty>
            {t('mobile.ask.empty', 'Nothing asked yet. The questions that don\'t belong on anyone\'s page — how to start a conversation at the club table, what to say when you\'re stuck — live here.')}
          </V2Empty>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {mine.map((m) => (
              <AskItem key={m.id} m={m} replies={askRepliesOf(asks, m.id)} me={uid ?? ''} />
            ))}
          </ScrollView>
        )}
      </V2Screen>
    </SafeAreaView>
  );
}