import React, { useState, useEffect, useMemo } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  MET_VIA,
  SIGNUP_YEARS,
  firstName as getFirstName,
  normalizeTagList,
  signUpYearToForm,
  signUpYearValue,
  type Contact,
  type ContactEditFields,
} from '@cisa/core';
import { Sheet } from '../ui';
import { KeyboardAvoidingView } from '../ui/KeyboardAvoidingView';
import { useAuth } from '../../lib/AuthProvider';
import { useLanguage } from '../../lib/LanguageProvider';
import { useStandardTags } from '../../lib/useStandardTags';
import { useV2Theme, v2SheetChrome, type V2Room } from '../../theme/v2';
import { Kicker, PrimaryButton, SecondaryButton } from '../queue/atoms';
import { Room, V2Input, V2TextArea } from '../v2/Widget';
import { updateContact } from '../../lib/data/contacts';

interface EditContactSheetProps {
  visible: boolean;
  contact: Contact | null;
  room: V2Room;
  onSaved: (contactName: string) => void;
  onClose: () => void;
}

/** Bottom sheets portal to the app root, outside the screen's provider, so this
 * one carries the room itself. */
export function EditContactSheet(props: EditContactSheetProps) {
  return (
    <Room room={props.room}>
      <EditContactSheetBody {...props} />
    </Room>
  );
}

function EditContactSheetBody({
  visible,
  contact,
  room,
  onSaved,
  onClose,
}: EditContactSheetProps) {
  const { c, font, radius, fs } = useV2Theme();
  const { user } = useAuth();
  const { t } = useLanguage();
  const standardTags = useStandardTags();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [instagram, setInstagram] = useState('');
  const [metVia, setMetVia] = useState('');
  const [location, setLocation] = useState('');
  const [year, setYear] = useState('');
  const [yearOther, setYearOther] = useState('');
  const [major, setMajor] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState('');
  const [saving, setSaving] = useState(false);

  // Initialize form whenever contact changes or sheet becomes visible
  useEffect(() => {
    if (contact && visible) {
      const parts = (contact.name || '').trim().split(/\s+/);
      const first = parts[0] || '';
      const last = parts.slice(1).join(' ') || '';
      setFirstName(first);
      setLastName(last);
      setPhone(contact.phone || '');
      setEmail(contact.email || '');
      setInstagram(contact.instagram || '');
      setMetVia(contact.metVia || '');
      setLocation(contact.location || '');
      const initialYear = signUpYearToForm(contact.year);
      setYear(initialYear.year);
      setYearOther(initialYear.yearOther);
      setMajor(contact.major || '');
      setNotes(contact.notes || '');
      setTags(contact.tags ? [...contact.tags] : []);
      setCustomTag('');
      setSaving(false);
    }
  }, [contact, visible]);

  const isDirty = useMemo(() => {
    if (!contact) return false;
    const parts = (contact.name || '').trim().split(/\s+/);
    const initialFirst = parts[0] || '';
    const initialLast = parts.slice(1).join(' ') || '';
    const initialPhone = contact.phone || '';
    const initialEmail = contact.email || '';
    const initialInstagram = contact.instagram || '';
    const initialMetVia = contact.metVia || '';
    const initialLocation = contact.location || '';
    const initialNotes = contact.notes || '';
    const initialYear = signUpYearToForm(contact.year);
    const initialTags = contact.tags || [];

    if (firstName.trim() !== initialFirst) return true;
    if (lastName.trim() !== initialLast) return true;
    if (phone.trim() !== initialPhone) return true;
    if (email.trim() !== initialEmail) return true;
    if (instagram.trim() !== initialInstagram) return true;
    if (metVia !== initialMetVia) return true;
    if (location.trim() !== initialLocation) return true;
    if (year !== initialYear.year) return true;
    if (year === 'Other' && yearOther.trim() !== initialYear.yearOther) return true;
    if (major.trim() !== (contact.major || '')) return true;
    if (notes.trim() !== initialNotes) return true;
    if (customTag.trim().length > 0) return true;

    if (tags.length !== initialTags.length) return true;
    const initialSet = new Set(initialTags);
    if (tags.some((tg) => !initialSet.has(tg))) return true;

    return false;
  }, [contact, firstName, lastName, phone, email, instagram, metVia, location, year, yearOther, major, notes, tags, customTag]);

  const handleRequestClose = () => {
    if (isDirty) {
      Alert.alert(
        t('mobile.contact.discard_title') || 'Discard changes?',
        t('mobile.contact.discard_message') || 'You have unsaved changes. Are you sure you want to discard them?',
        [
          { text: t('actions.cancel') || 'Cancel', style: 'cancel' },
          {
            text: t('actions.discard') || 'Discard',
            style: 'destructive',
            onPress: onClose,
          },
        ],
      );
    } else {
      onClose();
    }
  };

  const toggleTag = (tag: string) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const addCustomTag = () => {
    const trimmed = customTag.trim();
    if (!trimmed) return;
    const normalized = normalizeTagList([trimmed]);
    if (normalized.length > 0) {
      setTags((prev) => (prev.includes(normalized[0]) ? prev : [...prev, normalized[0]]));
    }
    setCustomTag('');
  };

  const handleSave = async () => {
    if (!contact) return;
    const cleanFirst = firstName.trim();
    const cleanLast = lastName.trim();
    if (!cleanFirst && !cleanLast) {
      Alert.alert('Name required', 'Please provide a name for this contact.');
      return;
    }

    setSaving(true);
    try {
      let finalTags = [...tags];
      if (customTag.trim()) {
        const normalized = normalizeTagList([customTag.trim()]);
        if (normalized.length > 0 && !finalTags.includes(normalized[0])) {
          finalTags.push(normalized[0]);
        }
      }

      // Only a changed Year, Major, How we met or Address is sent, so saving
      // something else never rewrites an off-list year or stamps an empty
      // field on a record (#1348).
      const yearValue = signUpYearValue({ year, yearOther });
      const majorValue = major.trim();
      const locationValue = location.trim();

      const edits: ContactEditFields = {
        firstName: cleanFirst,
        lastName: cleanLast,
        phone: phone.trim(),
        email: email.trim(),
        instagram: instagram.trim(),
        ...(metVia !== (contact.metVia || '') && { metVia }),
        ...(locationValue !== (contact.location || '') && { location: locationValue }),
        ...(yearValue !== (contact.year || '').trim() && { year: yearValue }),
        ...(majorValue !== (contact.major || '') && { major: majorValue }),
        notes: notes.trim(),
        spiritualBackground: contact.spiritualBackground || '',
        stage: contact.stage || '',
        tags: finalTags,
      };

      await updateContact(contact, edits, {
        uid: user?.uid,
        name: user?.displayName || 'Trainee',
      });

      const fullName = `${cleanFirst} ${cleanLast}`.trim();
      onSaved(fullName || contact.name);
      onClose();
    } catch (e) {
      Alert.alert('Error', 'Failed to update contact. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!contact) return null;

  return (
    <Sheet
      visible={visible}
      onClose={handleRequestClose}
      maxHeightRatio={0.92}
      {...v2SheetChrome(c)}
    >
      <Room room={room}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 18,
              paddingTop: 4,
              paddingBottom: 40,
              gap: 16,
            }}
            keyboardShouldPersistTaps="handled"
          >
            <View>
              <Text
                style={{
                  fontFamily: font.bold,
                  fontSize: fs(22),
                  lineHeight: fs(27),
                  color: c.card.ink,
                }}
              >
                {t('actions.edit') || 'Edit'} {getFirstName(contact.name)}
              </Text>
              <Text
                style={{
                  fontFamily: font.semi,
                  fontSize: fs(13),
                  lineHeight: fs(18),
                  color: c.card.ink3,
                  marginTop: 6,
                }}
              >
                {t('mobile.contact.update_contact_sub')}
              </Text>
            </View>

            {/* Name Fields */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1, gap: 8 }}>
                <Kicker>{t('mobile.contact.first_name')}</Kicker>
                <V2Input
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder={t('mobile.contact.first_name_placeholder')}
                  autoCapitalize="words"
                />
              </View>
              <View style={{ flex: 1, gap: 8 }}>
                <Kicker>{t('mobile.contact.last_name')}</Kicker>
                <V2Input
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder={t('mobile.contact.last_name_placeholder')}
                  autoCapitalize="words"
                />
              </View>
            </View>

            {/* Phone & Email */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1, gap: 8 }}>
                <Kicker>{t('mobile.contact.phone')}</Kicker>
                <V2Input
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="(000) 000-0000"
                  keyboardType="phone-pad"
                />
              </View>
              <View style={{ flex: 1, gap: 8 }}>
                <Kicker>{t('mobile.contact.email')}</Kicker>
                <V2Input
                  value={email}
                  onChangeText={setEmail}
                  placeholder={t('mobile.contact.email_placeholder')}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>

            {/* Instagram & Location */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1, gap: 8 }}>
                <Kicker>{t('mobile.contact.instagram')}</Kicker>
                <V2Input
                  value={instagram}
                  onChangeText={setInstagram}
                  placeholder={t('mobile.contact.instagram_placeholder')}
                  autoCapitalize="none"
                />
              </View>
              <View style={{ flex: 1, gap: 8 }}>
                <Kicker>{t('mobile.contact.address_location')}</Kicker>
                <V2Input
                  value={location}
                  onChangeText={setLocation}
                  placeholder={t('mobile.contact.address_placeholder')}
                />
              </View>
            </View>

            {/* Year & Major (#1348): the sign-up list, free text after Other. */}
            <View style={{ gap: 8 }}>
              <Kicker>{t('mobile.contact.year')}</Kicker>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {SIGNUP_YEARS.map((y) => {
                  const selected = year === y;
                  return (
                    <Pressable
                      key={y}
                      onPress={() => setYear(selected ? '' : y)}
                      accessibilityState={{ selected }}
                      style={({ pressed }) => ({
                        paddingHorizontal: 13,
                        paddingVertical: 7,
                        borderRadius: radius.chip,
                        backgroundColor: selected ? c.card.ink : c.card.bg2,
                        opacity: pressed ? 0.75 : 1,
                      })}
                    >
                      <Text
                        style={{
                          fontFamily: font.bold,
                          fontSize: fs(12),
                          color: selected ? c.card.bg : c.card.ink2,
                        }}
                      >
                        {y}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {year === 'Other' && (
                <V2Input
                  value={yearOther}
                  onChangeText={setYearOther}
                  placeholder={t('mobile.contact.year_other_placeholder')}
                />
              )}
            </View>
            <View style={{ gap: 8 }}>
              <Kicker>{t('mobile.contact.major')}</Kicker>
              <V2Input
                value={major}
                onChangeText={setMajor}
                placeholder={t('mobile.contact.major_placeholder')}
              />
            </View>

            {/* How We Met */}
            <View style={{ gap: 8 }}>
              <Kicker>{t('mobile.contact.how_we_met')}</Kicker>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {MET_VIA.map((mv) => {
                  const selected = metVia === mv;
                  return (
                    <Pressable
                      key={mv}
                      onPress={() => setMetVia(selected ? '' : mv)}
                      style={({ pressed }) => ({
                        paddingHorizontal: 13,
                        paddingVertical: 7,
                        borderRadius: radius.chip,
                        backgroundColor: selected ? c.card.ink : c.card.bg2,
                        opacity: pressed ? 0.75 : 1,
                      })}
                    >
                      <Text
                        style={{
                          fontFamily: font.bold,
                          fontSize: fs(12),
                          color: selected ? c.card.bg : c.card.ink2,
                        }}
                      >
                        {mv}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Notes / First Impression */}
            <View style={{ gap: 8 }}>
              <Kicker>{t('mobile.contact.first_impression_notes')}</Kicker>
              <V2TextArea
                value={notes}
                onChangeText={setNotes}
                placeholder={t('mobile.contact.notes_placeholder')}
                minHeight={80}
              />
            </View>

            {/* Tags */}
            <View style={{ gap: 8 }}>
              <Kicker>{t('mobile.contact.tags')}</Kicker>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {standardTags.map((sug) => {
                  const active = tags.includes(sug);
                  return (
                    <Pressable
                      key={sug}
                      onPress={() => toggleTag(sug)}
                      style={({ pressed }) => ({
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: radius.chip,
                        backgroundColor: active ? c.card.ink : c.card.bg2,
                        opacity: pressed ? 0.75 : 1,
                      })}
                    >
                      <Text
                        style={{
                          fontFamily: font.bold,
                          fontSize: fs(12),
                          color: active ? c.card.bg : c.card.ink2,
                        }}
                      >
                        {active ? `✓ ${sug}` : `+ ${sug}`}
                      </Text>
                    </Pressable>
                  );
                })}
                {/* Any custom tags already applied that are not in the standard list */}
                {tags
                  .filter((tg) => !standardTags.includes(tg as any))
                  .map((tg) => (
                    <Pressable
                      key={tg}
                      onPress={() => toggleTag(tg)}
                      style={({ pressed }) => ({
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: radius.chip,
                        backgroundColor: c.card.ink,
                        opacity: pressed ? 0.75 : 1,
                      })}
                    >
                      <Text
                        style={{
                          fontFamily: font.bold,
                          fontSize: fs(12),
                          color: c.card.bg,
                        }}
                      >
                        ✓ {tg}
                      </Text>
                    </Pressable>
                  ))}
              </View>

              {/* Add Custom Tag Input */}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <View style={{ flex: 1 }}>
                  <V2Input
                    value={customTag}
                    onChangeText={setCustomTag}
                    placeholder={t('mobile.contact.add_custom_tag')}
                    autoCapitalize="none"
                    onSubmitEditing={addCustomTag}
                  />
                </View>
                <Pressable
                  onPress={addCustomTag}
                  disabled={!customTag.trim()}
                  style={({ pressed }) => ({
                    minHeight: 44,
                    paddingHorizontal: 16,
                    borderRadius: radius.note,
                    backgroundColor: customTag.trim() ? c.card.ink : c.card.bg2,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <Text
                    style={{
                      fontFamily: font.bold,
                      fontSize: fs(13),
                      color: customTag.trim() ? c.card.bg : c.card.ink3,
                    }}
                  >
                    {t('mobile.contact.add')}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Actions */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title={saving ? t('mobile.contact.saving') : t('mobile.contact.save_details')}
                  tone="deep"
                  disabled={saving}
                  onPress={handleSave}
                />
              </View>
              <View style={{ width: 110 }}>
                <SecondaryButton
                  title={t('actions.cancel') || 'Cancel'}
                  disabled={saving}
                  onPress={handleRequestClose}
                />
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Room>
    </Sheet>
  );
}
