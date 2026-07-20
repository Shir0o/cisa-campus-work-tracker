import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Contact, Stage } from '@cisa/core';
import { AppText, InlineInput } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';

// Contact Detail's Overview tab — info grid, tag add/remove, notes,
// timestamps. Design oracle: ContactDetailsModal.tsx's "overview" tab body.
export function OverviewTab({
  contact,
  stages,
  canEditTags,
  onAddTag,
  onRemoveTag,
}: {
  contact: Contact;
  stages: Stage[];
  canEditTags: boolean;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
}) {
  const { colors, radius, spacing, typography } = useTheme();
  const [addingTag, setAddingTag] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const tags = contact.tags ?? [];
  const stageLabel = stages.some((s) => s.label === contact.stage) ? contact.stage : 'Unassigned';

  const commitTag = () => {
    const val = tagInput.trim();
    if (val && !tags.includes(val)) onAddTag(val);
    setTagInput('');
    setAddingTag(false);
  };

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.md }}>
        <InfoRow icon="mail-outline" label="Email Address" value={contact.email || 'Not provided'} />
        <InfoRow icon="call-outline" label="Phone Number" value={contact.phone || 'Not provided'} />
        <InfoRow icon="location-outline" label={tags.includes('New Sign Up') ? 'Residence Hall' : 'First Met'} value={contact.location || 'Not recorded'} />
        <InfoRow icon="briefcase-outline" label="Stage" value={stageLabel || 'Unassigned'} />
        {contact.spiritualBackground ? (
          <InfoRow icon="sparkles-outline" label="Spiritual Background" value={contact.spiritualBackground} />
        ) : null}
      </View>

      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="pricetag-outline" size={16} color={colors.primary} />
          <AppText variant="caption">Tags</AppText>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          {tags.map((tag) => (
            <View
              key={tag}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: radius.full,
                backgroundColor: colors.surfaceContainerHighest,
                borderWidth: 1,
                borderColor: colors.outlineVariant,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '500', color: colors.onSurfaceVariant }}>{tag}</Text>
              {canEditTags ? (
                <Pressable onPress={() => onRemoveTag(tag)} hitSlop={6}>
                  <Ionicons name="close" size={12} color={colors.onSurfaceVariant} />
                </Pressable>
              ) : null}
            </View>
          ))}
          {canEditTags ? (
            addingTag ? (
              <InlineInput
                autoFocus
                value={tagInput}
                onChangeText={setTagInput}
                onBlur={commitTag}
                onSubmitEditing={commitTag}
                placeholder="new tag…"
                style={{ height: 30, width: 120, paddingVertical: 4 }}
              />
            ) : (
              <Pressable
                onPress={() => setAddingTag(true)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: radius.full,
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: colors.outlineVariant,
                }}
              >
                <Ionicons name="add" size={12} color={colors.onSurfaceVariant} />
                <Text style={{ fontSize: 12, fontWeight: '500', color: colors.onSurfaceVariant }}>add</Text>
              </Pressable>
            )
          ) : null}
        </View>
      </View>

      <View
        style={{
          padding: spacing.lg,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceContainerLow,
          borderWidth: 1,
          borderColor: colors.outlineVariant,
          gap: 8,
        }}
      >
        <Text style={{ fontFamily: typography.fontSerif, fontSize: 16, fontWeight: '500', color: colors.onSurface }}>What we know</Text>
        <AppText variant="body" color={colors.onSurfaceVariant}>
          {contact.notes || 'No notes recorded for this contact yet.'}
        </AppText>
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: colors.outlineVariant, paddingTop: spacing.sm, gap: 2 }}>
        <AppText variant="caption">Last seen {contact.lastSeen || '—'}</AppText>
        <AppText variant="caption" color={colors.onSurfaceVariant}>
          Added {contact.createdAt ? new Date(contact.createdAt).toLocaleDateString() : '—'}
        </AppText>
      </View>
    </View>
  );
}

function InfoRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  const { colors, radius } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceContainerHigh,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={17} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="caption">{label}</AppText>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.onSurface }}>{value}</Text>
      </View>
    </View>
  );
}
