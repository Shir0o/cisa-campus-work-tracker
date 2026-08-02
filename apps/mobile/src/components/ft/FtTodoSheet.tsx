// Mobile v2 — "Something to carry". Handing a to-do to someone on the team (or
// to yourself). Ported from the design's `FtTodoSheet`.
import React from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { duePresetToISO, firstName, type AppUser, type Contact } from '@cisa/core';
import { Sheet } from '../ui';
import { useV2Theme } from '../../theme/v2';
import { PrimaryButton, SecondaryButton } from '../queue/atoms';
import { Room } from '../v2/Widget';

interface FtTodoSheetProps {
  visible: boolean;
  /** Opened from a person's row — prefills the text and links the to-do. */
  contact: Contact | null;
  me: string;
  assignees: AppUser[];
  onClose: () => void;
  onSave: (input: { title: string; assigneeId: string; dueDate: string | null }) => void;
}

/** Bottom sheets portal to the app root, outside the home screen's provider, so
 * this one carries the room itself. */
export function FtTodoSheet(props: FtTodoSheetProps) {
  return (
    <Room room="ft">
      <TodoSheetBody {...props} />
    </Room>
  );
}

const BY_WHEN: { label: string; days: number }[] = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'This week', days: 5 },
];

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { c, font, radius, fs } = useV2Theme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: 15,
        borderRadius: radius.chip,
        borderWidth: 1.5,
        borderColor: on ? c.primary : c.border,
        backgroundColor: on ? c.primary : 'transparent',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text
        style={{
          fontFamily: font.bold,
          fontSize: fs(13.5),
          color: on ? c.onPrimary : c.cardInk2,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { c, font, fs } = useV2Theme();
  return (
    <View style={{ marginTop: 16 }}>
      <Text
        style={{
          fontFamily: font.bold,
          fontSize: fs(10.5),
          letterSpacing: 1.26,
          textTransform: 'uppercase',
          color: c.cardInk3,
          marginBottom: 9,
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

function TodoSheetBody({ visible, contact, me, assignees, onClose, onSave }: FtTodoSheetProps) {
  // Remounted per contact by the caller's `key`, so the draft starts fresh.
  const { c, font, radius, fs } = useV2Theme();
  const [title, setTitle] = React.useState(contact ? `Check in with ${firstName(contact.name)}` : '');
  const [who, setWho] = React.useState(me);
  const [days, setDays] = React.useState(1);

  const save = () => {
    const t = title.trim();
    if (!t) return;
    onSave({ title: t, assigneeId: who, dueDate: duePresetToISO(days) });
  };

  return (
    <Sheet visible={visible} onClose={onClose} maxHeightRatio={0.85} backgroundColor={c.card}>
      <Room room="ft">
        <View style={{ paddingHorizontal: 18, paddingTop: 4, paddingBottom: 24 }}>
          <Text
            style={{
              fontFamily: font.extra,
              fontSize: fs(20),
              letterSpacing: -0.5,
              color: c.cardInk,
            }}
          >
            Something to carry
          </Text>
          <Text
            style={{
              fontFamily: font.semi,
              fontSize: fs(13),
              color: c.cardInk3,
              marginTop: 7,
            }}
          >
            {contact ? `About ${contact.name}` : 'A to-do for the team'}
          </Text>

          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="What needs doing, in plain words…"
            placeholderTextColor={c.cardInk3}
            multiline
            style={{
              marginTop: 16,
              minHeight: 84,
              backgroundColor: c.field,
              borderWidth: 1.5,
              borderColor: c.line,
              borderRadius: radius.note,
              paddingVertical: 14,
              paddingHorizontal: 15,
              fontFamily: font.semi,
              fontSize: fs(15),
              color: c.cardInk,
              textAlignVertical: 'top',
            }}
          />

          <Field label="Who">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Chip label="Me" on={who === me} onPress={() => setWho(me)} />
              {assignees.map((u) => (
                <Chip
                  key={u.uid}
                  label={firstName(u.displayName)}
                  on={who === u.uid}
                  onPress={() => setWho(u.uid)}
                />
              ))}
            </ScrollView>
          </Field>

          <Field label="By when">
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {BY_WHEN.map((d) => (
                <Chip key={d.label} label={d.label} on={days === d.days} onPress={() => setDays(d.days)} />
              ))}
            </View>
          </Field>

          <View style={{ gap: 9, marginTop: 20 }}>
            <PrimaryButton title="Hand it over" onPress={save} />
            <SecondaryButton title="Cancel" onPress={onClose} />
          </View>
        </View>
      </Room>
    </Sheet>
  );
}
