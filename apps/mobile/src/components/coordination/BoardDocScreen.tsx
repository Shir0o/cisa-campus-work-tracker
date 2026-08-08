// Mobile v2 — one Board page. The design's `M2BoardDoc`: who it's open to,
// the page itself, and a foot naming who keeps it.
//
// The markdown still renders through react-native-marked (the design uses the
// real Board renderer for the same reason — a page must read as the page), but
// re-themed onto the v2 room instead of the Material palette.
import { Fragment } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from '../ui/SafeArea';
import { useMarkdown } from 'react-native-marked';
import { BOARD_AUDIENCE, audienceOf, boardKeeperFoot, dateLabelOf, weekdayOf, type BoardDoc } from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useBoardDocData } from '../../lib/useBoardDocData';
import { roomForRole, useV2Theme } from '../../theme/v2';
import { Room, V2Empty, V2Screen } from '../v2/Widget';
import { AudiencePill } from './BoardScreen';

export function BoardDocScreen({ docId }: { docId: string }) {
  const { role } = useAuth();
  return (
    <Room room={roomForRole(role)}>
      <BoardDoc docId={docId} />
    </Room>
  );
}

function DocBody({ doc }: { doc: BoardDoc }) {
  const { c, mode, fs } = useV2Theme();
  const elements = useMarkdown(doc.md?.trim() ? doc.md : '_This page is empty._', {
    colorScheme: mode,
    theme: {
      colors: { text: c.card.ink, link: c.card.link, code: c.card.ink2, border: c.card.line },
    },
  });
  return (
    <View>
      {elements.map((element, i) => (
        <Fragment key={`board_doc_${i}`}>{element}</Fragment>
      ))}
    </View>
  );
}

function BoardDoc({ docId }: { docId: string }) {
  const { c, font, radius, fs } = useV2Theme();
  const router = useRouter();
  const data = useBoardDocData(docId);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/coordination'));

  const title = data.doc ? weekdayOf(data.doc.date) || data.doc.title : 'The Board';

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room.bg }}>
      <V2Screen title={title} note={data.doc ? dateLabelOf(data.doc.date) : undefined} onBack={back}>
        {data.error || (!data.loading && !data.doc) ? (
          <V2Empty>{data.error || "This page couldn't be found."}</V2Empty>
        ) : !data.allowed ? (
          <V2Empty>This page isn't open to your role.</V2Empty>
        ) : data.loading || !data.doc ? (
          <ActivityIndicator color={c.room.ink2} style={{ marginTop: 28 }} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 2 }}>
              <AudiencePill doc={data.doc} />
              <Text style={{ fontFamily: font.semi, fontSize: fs(12.5), color: c.room.ink3 }}>
                {BOARD_AUDIENCE[audienceOf(data.doc)].sub}
              </Text>
            </View>

            <View
              style={{
                marginTop: 14,
                paddingHorizontal: 16,
                paddingVertical: 6,
                borderRadius: radius.hero,
                backgroundColor: c.card.bg,
              }}
            >
              <DocBody doc={data.doc} />
            </View>

            <Text
              style={{ fontFamily: font.medium, fontSize: fs(12.5), lineHeight: fs(18), color: c.room.ink3, marginTop: 22 }}
            >
              {boardKeeperFoot(data.keeperName)}
            </Text>
          </>
        )}
      </V2Screen>
    </SafeAreaView>
  );
}
