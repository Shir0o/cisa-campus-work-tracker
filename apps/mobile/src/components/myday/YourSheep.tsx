import { Pressable, Text, View } from 'react-native';
import { connectedLabel, type Contact, type Leader, type Stage } from '@cisa/core';
import { AppText, Avatar, Card, IconButton, SectionHead, StatusPill } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { toneForStage } from '../../theme/tokens';

// Your sheep — the people you're personally walking with. Design: mdm-people/mdm-person.
export function YourSheep({
  leaders,
  stages,
  onOpenContact,
  onMessage,
  onOpenPicker,
}: {
  leaders: Leader[];
  stages: Stage[];
  onOpenContact: (contact: Contact) => void;
  onMessage: (contact: Contact) => void;
  onOpenPicker: () => void;
}) {
  const { colors, radius, typography } = useTheme();

  return (
    <View>
      <SectionHead title="Your sheep" action="Your contacts" onAction={onOpenPicker} />
      {leaders.length === 0 ? (
        <Card>
          <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center' }}>
            No contacts in your care yet.
          </AppText>
        </Card>
      ) : (
        <View style={{ gap: 8 }}>
          {leaders.map(({ contact, days }) => {
            const overdue = days >= 7;
            return (
              <Pressable
                key={contact.id}
                onPress={() => onOpenContact(contact)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 13,
                  backgroundColor: pressed ? colors.surfaceVariant : colors.surface,
                  borderWidth: 1,
                  borderColor: colors.outlineVariant,
                  borderRadius: radius.lg,
                  padding: 12,
                })}
              >
                <Avatar name={contact.name} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text
                    numberOfLines={1}
                    style={{ fontFamily: typography.fontSerif, fontSize: 16.5, fontWeight: '500', color: colors.onSurface }}
                  >
                    {contact.name}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {contact.stage ? <StatusPill label={contact.stage} tone={toneForStage(stages, contact.stage)} /> : null}
                    <Text style={{ fontSize: 12.5, color: overdue ? colors.error : colors.onSurfaceVariant }}>
                      {Number.isFinite(days) ? connectedLabel(days) : ''}
                    </Text>
                  </View>
                </View>
                <IconButton name="chatbubble-outline" tone="accent" onPress={() => onMessage(contact)} />
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
