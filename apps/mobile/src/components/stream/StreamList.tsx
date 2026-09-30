// A phone stream's body: the core model's items — day dividers, the "New"
// line, rows — drawn in order, oldest first (G4–G6). It does not scroll
// itself; the screen that holds it owns the scroll and the pinned composer.
// Rendered as a sibling list (no wrapper box) so each row's onLayout y is
// measured against the same parent — read-on-view needs that (announcements).
import { Text, View } from 'react-native';
import type { StreamItem, StreamMessage } from '@cisa/core';
import { useLanguage } from '../../lib/LanguageProvider';
import { useV2Theme } from '../../theme/v2';
import { dayLabel } from './format';
import { StreamRowView, type StreamRowProps } from './StreamRow';

export function StreamList<M extends StreamMessage>({
  items,
  ...events
}: Omit<StreamRowProps<M>, 'row'> & { items: StreamItem<M>[] }) {
  return (
    <>
      {items.map((item, i) =>
        item.type === 'row' ? (
          <StreamRowView key={item.message.id} row={item} {...events} />
        ) : item.type === 'day' ? (
          <Divider key={`day-${item.day}`} label={<DayText day={item} />} />
        ) : (
          <Divider key={`new-${i}`} label={<NewText />} accent />
        ),
      )}
    </>
  );
}

function DayText({ day }: { day: Extract<StreamItem, { type: 'day' }> }) {
  const { t, language } = useLanguage();
  const { c, font, fs } = useV2Theme();
  return <Text style={{ fontFamily: font.semi, fontSize: fs(11.5), color: c.card.ink2 }}>{dayLabel(day, t, language)}</Text>;
}

function NewText() {
  const { t } = useLanguage();
  const { c, font, fs } = useV2Theme();
  return <Text style={{ fontFamily: font.bold, fontSize: fs(11.5), color: c.card.link }}>{t('mobile.stream.new')}</Text>;
}

/** A hairline either side of a short label. */
export function Divider({ label, accent }: { label: React.ReactNode; accent?: boolean }) {
  const { c } = useV2Theme();
  const line = { flex: 1, height: 1, backgroundColor: accent ? c.card.link : c.card.line };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, marginBottom: 6 }}>
      <View style={line} />
      {label}
      <View style={line} />
    </View>
  );
}
