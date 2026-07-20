import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Contact } from '@cisa/core';
import { AppText } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { openCall, openEmail, openMessage } from '../../lib/messaging';

// Contact Detail's header/hero — back bar, avatar/name/tags, comm tiles, and
// the two primary quick actions. Design oracle: ContactDetailsModal.tsx's
// isMobile branch (back bar + hero block + comm tiles + two primary buttons).
export function ContactHeader({
  contact,
  canEdit,
  onBack,
  onEdit,
  onLogInteraction,
  onAddPrayer,
}: {
  contact: Contact;
  canEdit: boolean;
  onBack: () => void;
  onEdit: () => void;
  onLogInteraction: () => void;
  onAddPrayer: () => void;
}) {
  const { colors, radius, spacing, typography } = useTheme();

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: colors.outlineVariant, paddingBottom: spacing.md }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
        }}
      >
        <Pressable onPress={onBack} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 }}>
          <Ionicons name="chevron-back" size={18} color={colors.onSurfaceVariant} />
          <AppText variant="body" color={colors.onSurfaceVariant}>
            Back
          </AppText>
        </Pressable>
        {canEdit ? (
          <Pressable
            onPress={onEdit}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 6,
              borderRadius: radius.full,
              borderWidth: 1,
              borderColor: colors.outlineVariant,
            }}
          >
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.onSurfaceVariant }}>Edit</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 14, paddingHorizontal: spacing.lg, paddingTop: 6 }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: colors.primaryContainer,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: colors.onPrimaryContainer, fontWeight: '600', fontSize: 20 }}>{contact.initials}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text
            numberOfLines={1}
            style={{ fontFamily: typography.fontSerif, fontSize: 22, fontWeight: '500', color: colors.onSurface }}
          >
            {contact.name}
          </Text>
          {contact.tags && contact.tags.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {contact.tags.map((t) => (
                <View
                  key={t}
                  style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full, backgroundColor: colors.surfaceVariant }}
                >
                  <Text style={{ fontSize: 10, fontWeight: '700', color: colors.onSurfaceVariant, textTransform: 'uppercase' }}>{t}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <AppText variant="caption" numberOfLines={1}>
            {[contact.role, contact.location].filter(Boolean).join(' · ')}
          </AppText>
        </View>
      </View>

      {contact.phone || contact.email ? (
        <View style={{ flexDirection: 'row', gap: 20, paddingHorizontal: spacing.lg, paddingTop: 12 }}>
          {contact.phone ? <CommTile icon="call" label="Call" onPress={() => openCall(contact.phone)} /> : null}
          {contact.phone ? <CommTile icon="chatbubble" label="Text" onPress={() => openMessage(contact.phone)} /> : null}
          {contact.email ? <CommTile icon="mail" label="Email" onPress={() => openEmail(contact.email)} /> : null}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: spacing.lg, paddingTop: 14 }}>
        <Pressable
          onPress={onLogInteraction}
          style={{
            flex: 1,
            minHeight: 44,
            borderRadius: radius.md,
            backgroundColor: colors.primary,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.onPrimary} />
          <Text style={{ color: colors.onPrimary, fontWeight: '600', fontSize: 14 }}>Log interaction</Text>
        </Pressable>
        <Pressable
          onPress={onAddPrayer}
          style={{
            flex: 1,
            minHeight: 44,
            borderRadius: radius.md,
            backgroundColor: colors.stageVioletSoft,
            borderWidth: 1,
            borderColor: colors.stageViolet,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <Ionicons name="heart-outline" size={16} color={colors.stageViolet} />
          <Text style={{ color: colors.stageViolet, fontWeight: '600', fontSize: 14 }}>Prayer</Text>
        </Pressable>
      </View>
    </View>
  );
}

function CommTile({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', gap: 4 }}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: colors.surfaceContainerHigh,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={18} color={colors.onSurfaceVariant} />
      </View>
      <Text style={{ fontSize: 11, color: colors.onSurfaceVariant }}>{label}</Text>
    </Pressable>
  );
}
