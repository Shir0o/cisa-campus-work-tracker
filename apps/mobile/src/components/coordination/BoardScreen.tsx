// Mobile v2 — The Board. The design's `M2Board` (views/mobile/screens2.jsx):
// the pages the team keeps, grouped, each row a date block · title · one line
// about it · who it's open to.
//
// Read-only, for every role. The design mounts no editor inside the phone at
// all — writing a page (and pinning, and Trash) is desktop work, which is what
// the foot line says out loud. That retires the admin WebView fork this screen
// used to route into.
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from '../ui/SafeArea';
import {
  AUDIENCE_TONE_KEY,
  BOARD_AUDIENCE,
  audienceOf,
  boardCountNote,
  boardRowLine,
  dayNum,
  weekdayShort,
  type BoardDoc,
} from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { boardLeaderName, useBoardListData } from '../../lib/useBoardListData';
import { roomForRole, useV2Theme } from '../../theme/v2';
import { Kicker } from '../queue/atoms';
import { Room, V2Empty, V2Screen } from '../v2/Widget';

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
  const audience = audienceOf(doc);
  const tone = c.tones[AUDIENCE_TONE_KEY[audience]];
  return (
    <View
      style={{
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: radius.chip,
        backgroundColor: tone.band,
      }}
    >
      <Text style={{ fontFamily: font.bold, fontSize: fs(10.5), letterSpacing: 0.3, color: tone.text }}>
        {BOARD_AUDIENCE[audience].label}
      </Text>
    </View>
  );
}

function BoardRow({ doc, leaderName }: { doc: BoardDoc; leaderName: string | null }) {
  const { c, font, radius, fs } = useV2Theme();
  const router = useRouter();
  const line = boardRowLine(doc, leaderName);

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
        backgroundColor: c.card,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <View style={{ width: 42, alignItems: 'center' }}>
        <Text style={{ fontFamily: font.extra, fontSize: fs(17), letterSpacing: -0.5, color: c.cardInk }}>
          {dayNum(doc.date)}
        </Text>
        <Text
          style={{ fontFamily: font.bold, fontSize: fs(9.5), letterSpacing: 0.9, color: c.cardInk3, marginTop: 4 }}
        >
          {weekdayShort(doc.date).toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: font.bold, fontSize: fs(15), lineHeight: fs(19), color: c.cardInk }} numberOfLines={2}>
          {doc.title}
        </Text>
        {!!line && (
          <Text
            style={{ fontFamily: font.semi, fontSize: fs(12.5), lineHeight: fs(17), color: c.cardInk3, marginTop: 3 }}
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
  const router = useRouter();
  const data = useBoardListData();

  // The Board is a drawer row for the trainee and a More row for the full-timer
  // — never a tab, so there is always something to go back to.
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room }}>
      <V2Screen title="The Board" note={boardCountNote(data.total)} onBack={back}>
        <Text
          style={{ fontFamily: font.medium, fontSize: fs(13.5), lineHeight: fs(19), color: c.roomInk3, marginBottom: 6 }}
        >
          What the team talked through, and what came out of it. Open a page to read it.
        </Text>

        {data.loading ? (
          <ActivityIndicator color={c.roomInk2} style={{ marginTop: 28 }} />
        ) : data.error ? (
          <V2Empty>{data.error}</V2Empty>
        ) : data.sections.length === 0 ? (
          <V2Empty>Nothing open to you right now.</V2Empty>
        ) : (
          data.sections.map((section) => (
            <View key={section.title} style={{ marginTop: 20 }}>
              <Kicker onRoom>{section.title}</Kicker>
              {section.data.map((doc) => (
                <BoardRow key={doc.id} doc={doc} leaderName={boardLeaderName(doc, data.names)} />
              ))}
            </View>
          ))
        )}

        <Text
          style={{ fontFamily: font.medium, fontSize: fs(12.5), lineHeight: fs(18), color: c.roomInk3, marginTop: 26 }}
        >
          Pages are written and kept on the desktop site.
        </Text>
      </V2Screen>
    </SafeAreaView>
  );
}
