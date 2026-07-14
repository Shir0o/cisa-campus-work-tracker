import { Image, View } from 'react-native';
import type { AnsweredTone, Contact, PrayerRecord } from '@cisa/core';
import { AppText, Card } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { toneColors, type ToneKey } from '../../theme/tokens';

// packages/core's toneForAnsweredId only returns a plain 4-way hash (it can't
// import RN color tokens) — each platform owns this map, same pattern as
// HistoryRow's BUCKET_TONE.
const ANSWERED_TONE_MAP: Record<AnsweredTone, ToneKey> = {
  accent: 'accent',
  violet: 'violet',
  amber: 'amber',
  sage: 'teal',
};

// Matches the web app's AnsweredList.tsx formatDate fallback (an unparsable
// value falls back to "Recently" rather than displaying the raw string).
function formatShortDate(value?: string) {
  if (!value) return 'recently';
  const d = new Date(value);
  if (isNaN(d.getTime())) return 'Recently';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// One card in the Answered wall — a tone-colored photo tile, the contact's
// name, the testimony, and the original burden + asked/answered dates.
// Named "Tile" (not "Card") to avoid colliding with myday/YourPrayers.tsx's
// AnsweredCard, a different (editable) inline testimony callout.
export function AnsweredTile({
  prayer,
  contact,
  tone,
  onPress,
}: {
  prayer: PrayerRecord;
  contact?: Contact;
  tone: AnsweredTone;
  onPress?: () => void;
}) {
  const { colors, radius, spacing, typography } = useTheme();
  const { fg, soft } = toneColors(colors, ANSWERED_TONE_MAP[tone]);
  const name = contact?.name || 'Whole Team';
  const initial = name.trim().charAt(0).toUpperCase();

  return (
    <Card onPress={onPress} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: radius.md,
          backgroundColor: soft,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {contact?.avatar ? (
          <Image source={{ uri: contact.avatar }} style={{ width: 56, height: 56 }} />
        ) : (
          <AppText style={{ fontFamily: typography.fontSerif, fontSize: 22, color: fg }}>{initial}</AppText>
        )}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <AppText variant="label" color={colors.onSurfaceVariant}>
          {name}
        </AppText>
        <AppText variant="heading">{prayer.answer || prayer.burden}</AppText>
        <AppText variant="caption" style={{ fontStyle: 'italic' }} numberOfLines={2}>
          {prayer.burden}
        </AppText>
        <AppText variant="caption">
          asked {formatShortDate(prayer.date)} ·{' '}
          <AppText variant="caption" color={colors.success} style={{ fontWeight: '600' }}>
            answered {formatShortDate(prayer.answeredAt || prayer.updatedAt)}
          </AppText>
        </AppText>
      </View>
    </Card>
  );
}
