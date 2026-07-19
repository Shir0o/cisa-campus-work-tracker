import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BOARD_AUDIENCE, type Audience } from '@cisa/core';
import { useTheme } from '../../theme/ThemeProvider';
import { toneColors, type ToneKey } from '../../theme/tokens';

// A page's visibility pill — icon + label, matching web's AudienceBadge
// (CoordinationNotes.tsx). Reuses BOARD_AUDIENCE's icon key + a small tone map
// (ToneKey is already identical to board.ts's own Tone type) rather than a new
// pill primitive, since Chip has no icon slot.
const AUDIENCE_ICON: Record<'lock' | 'users' | 'globe', keyof typeof Ionicons.glyphMap> = {
  lock: 'lock-closed-outline',
  users: 'people-outline',
  globe: 'globe-outline',
};

const AUDIENCE_TONE: Record<Audience, ToneKey> = {
  team: 'violet',
  trainees: 'amber',
  everyone: 'teal',
};

export function AudienceBadge({ audience }: { audience: Audience }) {
  const { colors, radius } = useTheme();
  const meta = BOARD_AUDIENCE[audience];
  const { fg, soft } = toneColors(colors, AUDIENCE_TONE[audience]);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: soft,
        borderRadius: radius.full,
        paddingHorizontal: 10,
        paddingVertical: 4,
        alignSelf: 'flex-start',
      }}
    >
      <Ionicons name={AUDIENCE_ICON[meta.icon]} size={12} color={fg} />
      <Text style={{ color: fg, fontSize: 12, fontWeight: '600' }}>{meta.label}</Text>
    </View>
  );
}
