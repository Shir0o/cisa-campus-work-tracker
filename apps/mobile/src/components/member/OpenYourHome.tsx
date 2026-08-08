// Mobile v2 — "Open your home". The one thing a Community member came here to
// do (MOBILE-V2.md, the member app).
//
// The offer is REAL: it writes hospitalityOffers/{uid}, which staff read on the
// full-timer home's "Homes open to students" widget. That matters — an offer
// that never reached anyone would make this copy a lie.
import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import {
  HOSPITALITY_AVAILABILITY,
  hospitalitySummary,
  type HospitalityOffer,
} from '@cisa/core';
import { useV2Theme } from '../../theme/v2';
import { Sech } from '../v2/Widget';

export function OpenYourHome({
  offer,
  onSave,
  onWithdraw,
}: {
  offer: HospitalityOffer | null;
  onSave: (input: { availability: string[]; seats: string; note: string }) => void;
  onWithdraw: () => void;
}) {
  const { c, font, radius, fs } = useV2Theme();
  // Editing opens automatically when there's no offer yet — the empty state IS
  // the form, so a first-time visitor never has to find a button.
  const [editing, setEditing] = React.useState(!offer);
  const [availability, setAvailability] = React.useState<string[]>(offer?.availability ?? []);
  const [seats, setSeats] = React.useState(offer?.seats ?? '');
  const [note, setNote] = React.useState(offer?.note ?? '');

  // The offer arrives a beat after mount (one Firestore round-trip), so seed
  // the draft from it once it lands rather than leaving the form blank.
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (!offer || seeded.current) return;
    seeded.current = true;
    setAvailability(offer.availability);
    setSeats(offer.seats);
    setNote(offer.note);
    setEditing(false);
  }, [offer]);

  const toggle = (key: string) =>
    setAvailability((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  const field = {
    borderWidth: 1.5,
    borderColor: c.card.border,
    borderRadius: radius.note,
    backgroundColor: c.card.field,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: font.medium,
    fontSize: fs(15),
    color: c.card.ink,
  } as const;

  return (
    <View>
      <Sech label="Open your home" />
      <View
        style={{
          backgroundColor: c.widget.bg,
          borderRadius: radius.tile,
          padding: 18,
          gap: 12,
          ...c.widget.shadow,
        }}
      >
        {offer && !editing ? (
          <>
            <Text style={{ fontFamily: font.extra, fontSize: fs(16), color: c.widget.ink }}>
              Your offer is with the team
            </Text>
            <Text
              style={{ fontFamily: font.medium, fontSize: fs(14.5), lineHeight: fs(21), color: c.widget.ink2 }}
            >
              You've opened your home for {hospitalitySummary(offer)}.
            </Text>
            {!!offer.note && (
              <Text
                style={{
                  fontFamily: font.medium,
                  fontSize: fs(14),
                  lineHeight: fs(20),
                  color: c.widget.ink3,
                  backgroundColor: c.widget.tile,
                  borderRadius: radius.note,
                  padding: 12,
                }}
              >
                “{offer.note}”
              </Text>
            )}
            <View style={{ flexDirection: 'row', gap: 20 }}>
              <Pressable
                onPress={() => setEditing(true)}
                hitSlop={8}
                style={({ pressed }) => ({
                  minHeight: 44,
                  justifyContent: 'center',
                  opacity: pressed ? 0.55 : 1,
                })}
              >
                <Text style={{ fontFamily: font.bold, fontSize: fs(13.5), color: c.card.link }}>
                  Update it →
                </Text>
              </Pressable>
              <Pressable
                onPress={onWithdraw}
                hitSlop={8}
                style={({ pressed }) => ({
                  minHeight: 44,
                  justifyContent: 'center',
                  opacity: pressed ? 0.55 : 1,
                })}
              >
                <Text style={{ fontFamily: font.bold, fontSize: fs(13.5), color: c.widget.ink3 }}>
                  Not right now
                </Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text
              style={{ fontFamily: font.medium, fontSize: fs(14.5), lineHeight: fs(21), color: c.widget.ink2 }}
            >
              A shared meal can mean the world to a student far from home. Tell us when you've got
              room and we'll gently connect you with someone.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {HOSPITALITY_AVAILABILITY.map((a) => {
                const on = availability.includes(a.key);
                return (
                  <Pressable
                    key={a.key}
                    onPress={() => toggle(a.key)}
                    style={({ pressed }) => ({
                      minHeight: 44,
                      justifyContent: 'center',
                      paddingHorizontal: 14,
                      borderRadius: radius.chip,
                      borderWidth: 1.5,
                      borderColor: on ? 'transparent' : c.card.border,
                      backgroundColor: on ? c.card.primary : 'transparent',
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Text
                      style={{
                        fontFamily: font.bold,
                        fontSize: fs(13),
                        color: on ? c.card.onPrimary : c.widget.ink2,
                      }}
                    >
                      {a.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              value={seats}
              onChangeText={setSeats}
              placeholder="Room for about 3–4 students"
              placeholderTextColor={c.card.ink3}
              style={field}
            />
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Anything to know? Parking, a good evening to aim for…"
              placeholderTextColor={c.card.ink3}
              multiline
              style={[field, { minHeight: 88, textAlignVertical: 'top' }]}
            />
            <Pressable
              onPress={() => {
                if (availability.length === 0) return;
                onSave({ availability, seats, note });
                setEditing(false);
              }}
              disabled={availability.length === 0}
              style={({ pressed }) => ({
                height: 54,
                borderRadius: radius.button,
                backgroundColor: c.card.warm,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: availability.length === 0 ? 0.45 : pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ fontFamily: font.bold, fontSize: fs(16.5), color: c.card.onWarm }}>
                {offer ? 'Save the offer' : 'Offer to host'}
              </Text>
            </Pressable>
            {!!offer && (
              <Pressable
                onPress={() => setEditing(false)}
                style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontFamily: font.bold, fontSize: fs(13.5), color: c.widget.ink3 }}>
                  Cancel
                </Text>
              </Pressable>
            )}
          </>
        )}
      </View>
    </View>
  );
}
