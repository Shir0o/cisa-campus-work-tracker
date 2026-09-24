// Mobile v2 — one Board page. The design's `M2BoardDoc`: who it's open to,
// the page itself, and a foot naming who keeps it.
//
// The markdown still renders through react-native-marked (the design uses the
// real Board renderer for the same reason — a page must read as the page), but
// re-themed onto the v2 room instead of the Material palette.
import { Fragment, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from '../ui/SafeArea';
import { useMarkdown } from 'react-native-marked';
import { BOARD_AUDIENCE, audienceOf, dateLabelOf, firstName, weekdayOf, type BoardDoc } from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useBoardDocData } from '../../lib/useBoardDocData';
import { useLanguage } from '../../lib/LanguageProvider';
import { useTranslate, useTranslateMarkdown } from '../Translate';
import { roomForRole, useV2Theme } from '../../theme/v2';
import { Room, V2Empty, V2Screen } from '../v2/Widget';
import { AudiencePill } from './BoardScreen';
import { DocSkeleton } from '../skeleton/DocSkeleton';

const PUBLIC_APP_URL = 'https://cisa-campus-work-tracker.pages.dev';
const QR_GROUND = '#FFFFFF'; // colour-token-ignore: fixed white ground for QR scan reliability, never themed
const QR_INK = '#0A0A0B'; // colour-token-ignore: maximum-contrast code ink against the fixed white ground
const QR_CAPTION = '#6B6B6B'; // colour-token-ignore: quiet caption on the fixed white ground
const QR_URL = '#9B9B9B'; // colour-token-ignore: quietest line on the fixed white ground

export function BoardDocScreen({ docId }: { docId: string }) {
  const { role } = useAuth();
  return (
    <Room room={roomForRole(role)}>
      <BoardDoc docId={docId} />
    </Room>
  );
}

function DocBody({ doc }: { doc: BoardDoc }) {
  const { c, mode } = useV2Theme();
  const { t } = useLanguage();
  const { translatedText: translatedMarkdown } = useTranslateMarkdown(doc.md?.trim() ? doc.md : '');
  const emptyText = t('coordination.this_page_empty', '_This page is empty._');
  const markdownToRender = doc.md?.trim() ? translatedMarkdown : emptyText;

  const elements = useMarkdown(markdownToRender, {
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
  const { t } = useLanguage();
  const router = useRouter();
  const data = useBoardDocData(docId);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/coordination'));

  const rawTitle = data.doc ? (weekdayOf(data.doc.date) || data.doc.title) : t('mobile.board.title', 'The Board');
  const { translatedText: translatedTitle } = useTranslate(rawTitle);
  const title = translatedTitle || rawTitle;

  const audience = data.doc ? audienceOf(data.doc) : 'team';
  const audienceSub = t(`mobile.board.audience_${audience}_sub`, BOARD_AUDIENCE[audience].sub);

  const keeperFootText = data.keeperName
    ? t('mobile.board.keeper_foot', `${firstName(data.keeperName)} keeps this page. Writing happens on the desktop site — here you're reading.`).replace('{name}', firstName(data.keeperName))
    : t('mobile.board.team_keeper_foot', "The team keeps this page. Writing happens on the desktop site — here you're reading.");

  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);

  const guestKey = data.doc?.guestAccess?.enabled && data.doc?.guestAccess?.key ? data.doc.guestAccess.key : null;
  const guestUrl = guestKey ? `${PUBLIC_APP_URL}/c/${encodeURIComponent(docId)}?key=${encodeURIComponent(guestKey)}` : null;

  const copyGuestLink = async () => {
    if (!guestUrl) return;
    await Clipboard.setStringAsync(guestUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const action = guestUrl
    ? {
        label: t('mobile.board.share_qr', 'QR'),
        onPress: () => setShowQr(true),
      }
    : undefined;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room.bg }}>
      <V2Screen
        title={title}
        note={!action && data.doc ? dateLabelOf(data.doc.date) : undefined}
        action={action}
        onBack={back}
      >
        {data.error || (!data.loading && !data.doc) ? (
          <V2Empty>{data.error || t('mobile.board.not_found', "This page couldn't be found.")}</V2Empty>
        ) : !data.allowed ? (
          <V2Empty>{t('mobile.board.not_allowed', "This page isn't open to your role.")}</V2Empty>
        ) : data.loading || !data.doc ? (
          <DocSkeleton />
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 2 }}>
              <AudiencePill doc={data.doc} />
              <Text style={{ fontFamily: font.semi, fontSize: fs(12.5), color: c.room.ink3 }}>
                {audienceSub}
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
              {keeperFootText}
            </Text>
          </>
        )}
      </V2Screen>

      <Modal visible={showQr && !!guestUrl} animationType="fade" transparent onRequestClose={() => setShowQr(false)}>
        <Pressable
          onPress={() => setShowQr(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <View
            style={{
              backgroundColor: QR_GROUND,
              padding: 24,
              alignItems: 'center',
              borderRadius: radius.tile,
              maxWidth: 320,
              width: '100%',
            }}
          >
            {guestUrl && (
              <QRCode
                value={guestUrl}
                size={220}
                color={QR_INK}
                backgroundColor={QR_GROUND}
              />
            )}
            <Text style={{ fontFamily: font.bold, fontSize: fs(15), color: QR_INK, marginTop: 16 }}>
              {t('mobile.board.share_title', 'Guest Link')}
            </Text>
            <Text style={{ fontFamily: font.medium, fontSize: fs(12), color: QR_CAPTION, marginTop: 4, textAlign: 'center' }}>
              {t('mobile.board.scan_qr_prompt', 'Scan to open this page without an account')}
            </Text>
            <Text style={{ fontFamily: font.medium, fontSize: fs(11), color: QR_URL, marginTop: 4, textAlign: 'center' }} numberOfLines={1}>
              {guestUrl}
            </Text>
            <Pressable
              onPress={copyGuestLink}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.board.copy_link', 'Copy link')}
              style={({ pressed }) => ({
                marginTop: 16,
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: radius.chip,
                backgroundColor: c.room.chip,
                opacity: pressed ? 0.65 : 1,
              })}
            >
              <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.room.ink }}>
                {copied ? t('mobile.board.copied', 'Copied') : t('mobile.board.copy_link', 'Copy link')}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
