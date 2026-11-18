// Mobile v2 — Announcements on the home (cut-or-keep §20). Everyone sees a card
// per announcement they have not marked "Got it"; a Full-timer also gets a small
// box to post one, and under it what they posted this week with who has not got
// it yet. No replies, no page of its own.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ANNOUNCEMENT_MAX_LENGTH, gotItProgress, relTime } from '@cisa/core';
import { useV2Theme } from '../../theme/v2';
import { useLanguage } from '../../lib/LanguageProvider';
import { useAnnouncements } from '../../lib/useAnnouncements';
import { markGotIt, postAnnouncement } from '../../lib/data/announcements';
import { Widget, WidgetAction, WidgetRow, V2TextArea } from '../v2/Widget';

export function AnnouncementsPanel({
  uid,
  name,
  isFullTimer,
  inset,
}: {
  uid: string | null | undefined;
  name: string;
  isFullTimer: boolean;
  /** Sit inside a screen that has no padding of its own: the queue's. */
  inset?: boolean;
}) {
  const { c, font, radius, fs } = useV2Theme();
  const { t } = useLanguage();
  const { open, mine, team } = useAnnouncements(uid, isFullTimer);
  const [body, setBody] = React.useState('');
  const [posting, setPosting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!uid || (open.length === 0 && !isFullTimer)) return null;

  const gotIt = async (id: string) => {
    setError(null);
    try {
      await markGotIt(id, uid);
    } catch {
      setError(t('mobile.announcements.mark_failed'));
    }
  };

  const post = async () => {
    if (!body.trim() || posting) return;
    setPosting(true);
    setError(null);
    try {
      await postAnnouncement({ uid, name }, body);
      setBody('');
    } catch {
      setError(t('mobile.announcements.post_failed'));
    } finally {
      setPosting(false);
    }
  };

  const errorLine = !!error && (
    <Text accessibilityRole="alert" style={{ fontFamily: font.semi, fontSize: fs(12.5), color: c.card.tones.follow.text }}>
      {error}
    </Text>
  );

  return (
    <View style={inset ? { gap: 22, paddingHorizontal: 18, paddingBottom: 14 } : { gap: 22 }}>
      {open.length > 0 && (
        <Widget label={t('mobile.announcements.title')} count={open.length}>
          {open.map((a, i) => (
            <WidgetRow key={a.id} first={i === 0}>
              <Text style={{ fontFamily: font.bold, fontSize: fs(12), color: c.widget.ink3 }}>
                {t('mobile.announcements.from').replace('{name}', a.authorName)}
                {a.createdAt ? ` · ${relTime(a.createdAt)}` : ''}
              </Text>
              <Text
                style={{
                  fontFamily: font.medium,
                  fontSize: fs(15.5),
                  lineHeight: fs(22),
                  color: c.widget.ink,
                  marginTop: 4,
                }}
              >
                {a.body}
              </Text>
              <WidgetAction label={t('mobile.announcements.got_it')} onPress={() => void gotIt(a.id)} />
            </WidgetRow>
          ))}
          {errorLine}
        </Widget>
      )}

      {isFullTimer && (
        <Widget label={t('mobile.announcements.compose_title')}>
          <WidgetRow first>
            <V2TextArea
              value={body}
              onChangeText={(next) => setBody(next.slice(0, ANNOUNCEMENT_MAX_LENGTH))}
              placeholder={t('mobile.announcements.compose_placeholder')}
              minHeight={80}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !body.trim() || posting }}
              disabled={!body.trim() || posting}
              onPress={() => void post()}
              style={({ pressed }) => ({
                marginTop: 10,
                alignSelf: 'flex-start',
                minHeight: 44,
                justifyContent: 'center',
                paddingHorizontal: 20,
                borderRadius: radius.chip,
                backgroundColor: c.card.primary,
                opacity: !body.trim() || posting ? 0.5 : pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ fontFamily: font.bold, fontSize: fs(13.5), color: c.card.onPrimary }}>
                {posting ? t('mobile.announcements.posting') : t('mobile.announcements.post')}
              </Text>
            </Pressable>
            {errorLine}
          </WidgetRow>
        </Widget>
      )}

      {isFullTimer && mine.length > 0 && (
        <Widget label={t('mobile.announcements.yours')}>
          {mine.map((a, i) => {
            const { got, total, missing } = gotItProgress(a, team);
            return (
              <WidgetRow key={a.id} first={i === 0}>
                <Text style={{ fontFamily: font.medium, fontSize: fs(14.5), lineHeight: fs(21), color: c.widget.ink }}>
                  {a.body}
                </Text>
                {team.length > 0 && (
                  <>
                    <Text style={{ fontFamily: font.bold, fontSize: fs(12.5), color: c.widget.ink2, marginTop: 6 }}>
                      {t('mobile.announcements.progress').replace('{got}', String(got)).replace('{total}', String(total))}
                    </Text>
                    {missing.length > 0 && (
                      <Text style={{ fontFamily: font.medium, fontSize: fs(12.5), color: c.widget.ink3, marginTop: 2 }}>
                        {t('mobile.announcements.waiting_on').replace('{names}', missing.map((u) => u.displayName).join(', '))}
                      </Text>
                    )}
                  </>
                )}
              </WidgetRow>
            );
          })}
        </Widget>
      )}
    </View>
  );
}
