// Mobile v2 — "a note from the team". The design calls this "a note from the
// person who cares for you"; there is no student↔full-timer care relationship
// in this schema (see memberHome.ts's substitution note), so it names whoever
// actually wrote, and the copy promises nothing more than that.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { memberAgo, firstName, type MemberNote } from '@cisa/core';
import { useV2Theme } from '../../theme/v2';
import { PersonMark } from '../queue/atoms';

export function NoteFromTeam({
  note,
  onWriteBack,
}: {
  note: MemberNote;
  onWriteBack: () => void;
}) {
  const { c, font, radius, shadow } = useV2Theme();
  return (
    <View
      style={{
        backgroundColor: c.card,
        borderRadius: radius.tile,
        padding: 18,
        ...shadow.soft,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
        <PersonMark name={note.fromName} id={note.fromUid} size={36} radius={12} fontSize={13} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: font.extra, fontSize: 15, color: c.cardInk }}>
            A note from {firstName(note.fromName)}
          </Text>
          <Text style={{ fontFamily: font.medium, fontSize: 12.5, color: c.cardInk3, marginTop: 2 }}>
            {memberAgo(note.at)}
          </Text>
        </View>
      </View>
      <Text
        style={{
          fontFamily: font.medium,
          fontSize: 15,
          lineHeight: 22,
          color: c.said,
          marginTop: 12,
        }}
      >
        {note.body}
      </Text>
      <Pressable
        onPress={onWriteBack}
        hitSlop={8}
        style={({ pressed }) => ({
          minHeight: 44,
          justifyContent: 'center',
          opacity: pressed ? 0.55 : 1,
        })}
      >
        <Text style={{ fontFamily: font.bold, fontSize: 13.5, color: c.link }}>Write back →</Text>
      </Pressable>
    </View>
  );
}
