// Mobile v2 — The Board. The design's `M2Board` (views/mobile/screens2.jsx):
// the pages the team keeps, grouped, each row a date block · title · one line
// about it · who it's open to.
//
// Read-only, for every role. The design mounts no editor inside the phone at
// all — writing a page (and pinning, and Trash) is desktop work, which is what
// the foot line says out loud. That retires the admin WebView fork this screen
// used to route into.
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from '../ui/SafeArea';
import {
  AUDIENCE_TONE_KEY,
  BOARD_AUDIENCE,
  audienceOf,
  dayNum,
  firstName,
  weekdayShort,
  type BoardDoc,
} from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useLanguage } from '../../lib/LanguageProvider';
import { Translate } from '../Translate';
import { boardLeaderName, useBoardListData } from '../../lib/useBoardListData';
import { roomForRole, useV2Theme } from '../../theme/v2';
import { Kicker } from '../queue/atoms';
import { Room, V2Empty, V2Screen } from '../v2/Widget';
import { SkeletonList } from '../skeleton/SkeletonList';

export function BoardScreen() {
  const { role } = useAuth();
  return (
    <Room room={roomForRole(role)}>
      <Board />
    </Room>
  );
}

/** The tier a page is open to, as a pill in the room's own palette. */
export function AudiencePill({ doc }: { doc: Pick<BoardDoc, 'audience'> }) {
  const { c, font, radius, fs } = useV2Theme();
  const { t } = useLanguage();
  const audience = audienceOf(doc);
  const tone = c.card.tones[AUDIENCE_TONE_KEY[audience]];
  const label = t(`mobile.board.audience_${audience}`, BOARD_AUDIENCE[audience].label);
  return (
    <View
      style={{
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: radius.chip,
        backgroundColor: tone.band,
      }}
    >
      <Text style={{ fontFamily: font.bold, fontSize: fs(10.5), color: tone.text }}>
        {label}
      </Text>
    </View>
  );
}

function BoardRow({ doc, leaderName }: { doc: BoardDoc; leaderName: string | null }) {
  const { c, font, radius, fs } = useV2Theme();
  const { t } = useLanguage();
  const router = useRouter();
  const leaderLeading = leaderName
    ? t('mobile.board.leader_leading', `${firstName(leaderName)} leading`).replace('{name}', firstName(leaderName))
    : null;
  const line = [doc.time, doc.place, leaderLeading]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={() => router.push(`/coordination/${doc.id}`)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
        minHeight: 68,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginTop: 9,
        borderRadius: radius.row,
        backgroundColor: c.card.bg,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <View style={{ width: 42, alignItems: 'center' }}>
        <Text style={{ fontFamily: font.extra, fontSize: fs(17), letterSpacing: -0.5, color: c.card.ink }}>
          {dayNum(doc.date)}
        </Text>
        <Text
          style={{ fontFamily: font.bold, fontSize: fs(9.5), color: c.card.ink3, marginTop: 4 }}
        >
          {weekdayShort(doc.date).toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: font.bold, fontSize: fs(15), lineHeight: fs(19), color: c.card.ink }} numberOfLines={2}>
          <Translate text={doc.title} />
        </Text>
        {!!line && (
          <Text
            style={{ fontFamily: font.semi, fontSize: fs(12.5), lineHeight: fs(17), color: c.card.ink3, marginTop: 3 }}
            numberOfLines={1}
          >
            {line}
          </Text>
        )}
      </View>
      <AudiencePill doc={doc} />
    </Pressable>
  );
}

function Board() {
  const { c, font, fs } = useV2Theme();
  const { t } = useLanguage();
  const router = useRouter();
  const data = useBoardListData();

  // The Board is a drawer row for the trainee and a More row for the full-timer
  // — never a tab, so there is always something to go back to.
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const countNote = data.total === 0
    ? t('mobile.board.count_zero', 'No pages')
    : data.total === 1
      ? t('mobile.board.count_one', '1 page')
      : t('mobile.board.count_many', '{count} pages').replace('{count}', String(data.total));

  const sectionTitle = (rawTitle: string) => {
    if (rawTitle === 'Pinned') return t('mobile.board.pinned', 'Pinned');
    if (rawTitle === 'This week') return t('mobile.board.this_week', 'This week');
    if (rawTitle === 'Earlier') return t('mobile.board.earlier', 'Earlier');
    return rawTitle;
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room.bg }}>
      <V2Screen title={t('mobile.board.title', 'The Board')} note={countNote} onBack={back}>
        <Text
          style={{ fontFamily: font.medium, fontSize: fs(13.5), lineHeight: fs(19), color: c.room.ink3, marginBottom: 6 }}
        >
          {t('mobile.board.subtitle', 'What the team talked through, and what came out of it. Open a page to read it.')}
        </Text>

        {data.loading ? (
          <SkeletonList rows={6} style={{ marginTop: 20 }} />
        ) : data.error ? (
          <V2Empty>{data.error}</V2Empty>
        ) : data.sections.length === 0 ? (
          <V2Empty>{t('mobile.board.empty', 'Nothing open to you right now.')}</V2Empty>
        ) : (
          data.sections.map((section) => (
            <View key={section.title} style={{ marginTop: 20 }}>
              <Kicker onRoom>{sectionTitle(section.title)}</Kicker>
              {section.data.map((doc) => (
                <BoardRow key={doc.id} doc={doc} leaderName={boardLeaderName(doc, data.names)} />
              ))}
            </View>
          ))
        )}

        <Text
          style={{ fontFamily: font.medium, fontSize: fs(12.5), lineHeight: fs(18), color: c.room.ink3, marginTop: 26 }}
        >
          {t('mobile.board.foot', 'Pages are written and kept on the desktop site.')}
        </Text>
      </V2Screen>
    </SafeAreaView>
  );
}
