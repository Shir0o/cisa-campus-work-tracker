// The phone's attach sheet (ADR 0033, C5): a chat stages reference-data cards
// above the text — the web's AttachDataModal, bounded to the reference reads
// the phone already holds (contacts, gatherings, prayers). Each pick returns
// the same ChatAttachment shape the web writes, so a post renders the same on
// both platforms.
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ChatAttachment } from '@cisa/core';
import { useLanguage } from '../../lib/LanguageProvider';
import { useV2Theme, v2SheetChrome } from '../../theme/v2';
import { Sheet } from '../ui';
import { subscribeContacts } from '../../lib/data/contacts';
import { subscribeEvents } from '../../lib/data/events';
import { subscribeAllPrayers } from '../../lib/data/prayers';

type AttachType = 'contact' | 'event' | 'prayer';
const TYPES: { type: AttachType; label: string }[] = [
  { type: 'contact', label: 'mobile.messages.attach_contact' },
  { type: 'event', label: 'mobile.messages.attach_event' },
  { type: 'prayer', label: 'mobile.messages.attach_prayer' },
];

interface Option {
  id: string;
  name: string;
  subtitle?: string;
}

export function AttachSheet({
  visible,
  onClose,
  onAttach,
}: {
  visible: boolean;
  onClose: () => void;
  onAttach: (attachment: ChatAttachment) => void;
}) {
  const { c, font, radius, fs } = useV2Theme();
  const { t } = useLanguage();
  const [type, setType] = useState<AttachType>('contact');
  const [options, setOptions] = useState<Option[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!visible) return;
    setSearch('');
    if (type === 'contact') {
      return subscribeContacts(
        (list) => setOptions(list.map((x) => ({ id: x.id, name: x.name, subtitle: x.role || x.location }))),
        () => setOptions([]),
      );
    }
    if (type === 'event') {
      return subscribeEvents(
        (list) => setOptions(list.map((x) => ({ id: x.id, name: x.name || x.date, subtitle: x.location || x.date }))),
        () => setOptions([]),
      );
    }
    return subscribeAllPrayers(
      (list) =>
        setOptions(
          list.map((x) => ({
            id: x.id,
            name: x.burden.length > 80 ? `${x.burden.slice(0, 80)}…` : x.burden,
            subtitle: x.status,
          })),
        ),
      () => setOptions([]),
    );
  }, [visible, type]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q) || (o.subtitle ?? '').toLowerCase().includes(q));
  }, [options, search]);

  return (
    <Sheet visible={visible} onClose={onClose} maxHeightRatio={0.85} {...v2SheetChrome(c)}>
      <View style={{ paddingHorizontal: 18, paddingTop: 4, paddingBottom: 24 }}>
        <Text style={{ fontFamily: font.extra, fontSize: fs(20), letterSpacing: -0.5, color: c.card.ink }}>
          {t('mobile.messages.attach_title')}
        </Text>

        <View style={{ flexDirection: 'row', gap: 6, marginTop: 14 }}>
          {TYPES.map((item) => {
            const on = item.type === type;
            return (
              <Pressable
                key={item.type}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setType(item.type)}
                style={({ pressed }) => ({
                  minHeight: 44,
                  justifyContent: 'center',
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  backgroundColor: on ? c.card.inverse : c.card.bg2,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ fontFamily: on ? font.bold : font.semi, fontSize: fs(13), color: on ? c.card.onInverse : c.card.ink2 }}>
                  {t(item.label)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('mobile.messages.attach_search')}
          placeholderTextColor={c.card.ink3}
          accessibilityLabel={t('mobile.messages.attach_search')}
          style={{
            minHeight: 44,
            marginTop: 12,
            paddingHorizontal: 14,
            borderRadius: radius.note,
            backgroundColor: c.card.bg2,
            fontFamily: font.medium,
            fontSize: fs(14),
            color: c.card.ink,
          }}
        />

        <View style={{ gap: 8, marginTop: 14 }}>
          {filtered.length === 0 ? (
            <Text style={{ fontFamily: font.medium, fontSize: fs(13.5), color: c.card.ink3, paddingVertical: 12 }}>
              {t('mobile.messages.attach_empty')}
            </Text>
          ) : (
            filtered.map((o) => (
              <Pressable
                key={`${type}:${o.id}`}
                accessibilityRole="button"
                accessibilityLabel={o.name}
                onPress={() => {
                  onAttach({ type, id: o.id, name: o.name, subtitle: o.subtitle });
                  onClose();
                }}
                style={({ pressed }) => ({
                  minHeight: 56,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: radius.note,
                  backgroundColor: c.card.bg2,
                  borderWidth: 1,
                  borderColor: c.card.border,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Ionicons
                  name={type === 'contact' ? 'person-outline' : type === 'event' ? 'calendar-outline' : 'heart-outline'}
                  size={18}
                  color={c.card.ink2}
                />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={2} style={{ fontFamily: font.bold, fontSize: fs(14), color: c.card.ink }}>
                    {o.name}
                  </Text>
                  {!!o.subtitle && (
                    <Text numberOfLines={1} style={{ fontFamily: font.semi, fontSize: fs(12), color: c.card.ink3 }}>
                      {o.subtitle}
                    </Text>
                  )}
                </View>
              </Pressable>
            ))
          )}
        </View>
      </View>
    </Sheet>
  );
}
