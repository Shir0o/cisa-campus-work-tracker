// Bottom sheet to select and add a collaborator to a contact.
import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { firstName, roleLabel, type AppUser, type Contact } from '@cisa/core';
import { Sheet } from '../ui';
import { useV2Theme, v2SheetChrome, type V2Room } from '../../theme/v2';
import { PersonMark } from '../queue/atoms';
import { Room, V2Empty } from '../v2/Widget';
import { useLanguage } from '../../lib/LanguageProvider';

interface AddCollaboratorSheetProps {
  visible: boolean;
  contact: Contact | null;
  teamMembers: AppUser[];
  room: V2Room;
  onAdd: (staffId: string, staffName: string) => void;
  onClose: () => void;
}

export function AddCollaboratorSheet(props: AddCollaboratorSheetProps) {
  return (
    <Room room={props.room}>
      <AddCollaboratorSheetBody {...props} />
    </Room>
  );
}

function AddCollaboratorSheetBody({
  visible,
  contact,
  teamMembers,
  room,
  onAdd,
  onClose,
}: AddCollaboratorSheetProps) {
  const { c, font, radius, fs } = useV2Theme();
  const { t } = useLanguage();

  const candidates = useMemo(() => {
    if (!contact) return [];
    const founders = contact.founders || [];
    const coCreators = contact.coCreators || [];
    return teamMembers.filter((m) => !founders.includes(m.uid) && !coCreators.includes(m.uid));
  }, [contact, teamMembers]);

  if (!contact) return null;

  return (
    <Sheet visible={visible} onClose={onClose} maxHeightRatio={0.8} {...v2SheetChrome(c)}>
      <Room room={room}>
        <View style={{ paddingHorizontal: 18, paddingTop: 4, paddingBottom: 24 }}>
          <Text style={{ fontFamily: font.extra, fontSize: fs(20), letterSpacing: -0.5, color: c.card.ink }}>
            {t('mobile.contact.who_else_can_see')}
          </Text>
          <Text style={{ fontFamily: font.semi, fontSize: fs(13), lineHeight: fs(18), color: c.card.ink3, marginTop: 7 }}>
            {t('mobile.contact.add_someone')}
          </Text>

          <View style={{ gap: 8, marginTop: 16 }}>
            {candidates.length === 0 ? (
              <V2Empty>{t('settings.no_matches') || 'No teammates available'}</V2Empty>
            ) : (
              candidates.map((member) => (
                <Pressable
                  key={member.uid}
                  onPress={() => {
                    onAdd(member.uid, member.displayName || member.email || 'Unknown User');
                    onClose();
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    minHeight: 56,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: radius.note,
                    backgroundColor: c.card.bg2,
                    borderWidth: 1,
                    borderColor: c.card.border,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <PersonMark name={member.displayName || member.email} id={member.uid} size={36} radius={18} fontSize={13} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: font.bold, fontSize: fs(14.5), color: c.card.ink }}>
                      {member.displayName || member.email}
                    </Text>
                    <Text style={{ fontFamily: font.semi, fontSize: fs(12), color: c.card.ink3 }}>
                      {roleLabel(member.role)}
                    </Text>
                  </View>
                </Pressable>
              ))
            )}
          </View>
        </View>
      </Room>
    </Sheet>
  );
}
