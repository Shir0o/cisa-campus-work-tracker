import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Dimensions, Platform } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { Sheet } from '../ui/Sheet';
import { useAuth } from '../../lib/AuthProvider';
import { useLanguage } from '../../lib/LanguageProvider';
import { useV2Theme } from '../../theme/v2';
import {
  FEEDBACK_KINDS,
  kindMeta,
  kindToType,
  MAX_SCREENSHOT_CHARS,
  MAX_SCREENSHOT_DIMENSION,
  SCREENSHOT_QUALITY_LADDER,
} from '@cisa/core';
import type { FeedbackKind } from '@cisa/core';

interface FeedbackSheetProps {
  visible: boolean;
  onClose: () => void;
  targetRef?: React.RefObject<any>;
}

const getApiUrl = () => {
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/+$/, '');
  }
  return Platform.OS === 'web' ? '' : 'https://cisa-campus-work-tracker.pages.dev';
};

export function FeedbackSheet({ visible, onClose, targetRef }: FeedbackSheetProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { c, font, radius, fs } = useV2Theme();
  const [kind, setKind] = useState<FeedbackKind>('thought');
  const [message, setMessage] = useState('');
  const [screenshot, setScreenshot] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setScreenshot('');
      return;
    }

    setErrorMsg(null);
    setSubmitted(false);

    if (!targetRef?.current) return;

    let cancelled = false;

    // Capture the background screen before the user interacts with the sheet.
    // The result is admin-only context stored on the Firestore doc; it never
    // reaches GitHub (ADR 0018 decision 7). Walk the quality ladder until the
    // encoded string fits the size ceiling, and give up rather than store a
    // capture Firestore rules would reject.
    (async () => {
      const { width, height } = Dimensions.get('window');
      const longestEdge = Math.max(width, height);
      const scale = longestEdge > MAX_SCREENSHOT_DIMENSION ? MAX_SCREENSHOT_DIMENSION / longestEdge : 1;

      for (const quality of SCREENSHOT_QUALITY_LADDER) {
        try {
          const base64 = await captureRef(targetRef, {
            format: 'jpg',
            quality,
            result: 'base64',
            width: Math.round(width * scale),
            height: Math.round(height * scale),
          });
          if (cancelled) return;
          if (!base64) continue;

          const dataUrl = `data:image/jpeg;base64,${base64}`;
          if (dataUrl.length <= MAX_SCREENSHOT_CHARS) {
            setScreenshot(dataUrl);
            return;
          }
        } catch (err) {
          console.warn('Failed to capture screen view shot:', err);
          if (!cancelled) setScreenshot('');
          return;
        }
      }

      if (!cancelled) {
        console.warn('Screenshot exceeded the size ceiling at every quality; sending without one.');
        setScreenshot('');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, targetRef]);

  const handleSubmit = async () => {
    if (!message.trim() || submitting) return;

    setSubmitting(true);
    setErrorMsg(null);

    const type = kindToType(kind);
    const { width, height } = Dimensions.get('window');

    const payload = {
      userId: user?.uid || 'anonymous',
      userName: user?.displayName || 'Anonymous User',
      type,
      kind,
      message: message.trim(),
      screenshot,
      url: 'Mobile App',
      userAgent: 'CISA Campus Mobile App (React Native)',
      viewport: `${Math.round(width)}x${Math.round(height)}`,
    };

    try {
      let token: string | null = null;
      if (user && typeof (user as any).getIdToken === 'function') {
        try {
          token = await (user as any).getIdToken();
        } catch {
          /* optional token */
        }
      }

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const url = `${getApiUrl()}/api/feedback`;
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      setSubmitted(true);
      setMessage('');
    } catch (err: any) {
      console.error('Failed to submit mobile feedback:', err);
      setErrorMsg('Failed to send feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setSubmitted(false);
    setMessage('');
    setScreenshot('');
    setErrorMsg(null);
    onClose();
  };

  const currentPlaceholder = kindMeta(kind).placeholder;

  return (
    <Sheet visible={visible} onClose={handleClose}>
      <View style={{ padding: 18 }}>
        <Text style={{ fontFamily: font.extra, fontSize: fs(20), color: c.card.ink, marginBottom: 4 }}>
          {t('mobile.feedback.leave_a_note', "Tell us how it's going")}
        </Text>
        <Text style={{ fontFamily: font.medium, fontSize: fs(13), color: c.card.ink3, marginBottom: 16 }}>
          {t('mobile.feedback.all_welcome', 'An idea, a snag, a thank-you — it goes straight to the team.')}
        </Text>

        {submitted ? (
          <View style={{ alignItems: 'center', paddingVertical: 24 }}>
            <Text style={{ fontFamily: font.bold, fontSize: fs(18), color: c.card.ink, marginBottom: 8 }}>
              {t('feedback.we_got_your_note', 'We got your note!')}
            </Text>
            <Text style={{ fontFamily: font.medium, fontSize: fs(14), color: c.card.ink2, textAlign: 'center', marginBottom: 20 }}>
              {t('feedback.saved_body', 'Thank you for taking the time to share your thoughts with the team.').replace('{name}', user?.displayName ?? 'there')}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={handleClose}
              style={({ pressed }) => ({
                backgroundColor: c.card.inverse,
                paddingVertical: 11,
                paddingHorizontal: 24,
                borderRadius: radius.button,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Text style={{ fontFamily: font.bold, color: c.card.onInverse, fontSize: fs(14) }}>
                {t('common.done', 'Done')}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            <View>
              <Text style={{ fontFamily: font.bold, fontSize: fs(12.5), color: c.card.ink2, marginBottom: 8 }}>
                {t('feedback.kind_of_note', 'What kind of note')}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {FEEDBACK_KINDS.map((k) => {
                  const selected = kind === k.id;
                  return (
                    <Pressable
                      key={k.id}
                      accessibilityRole="button"
                      onPress={() => setKind(k.id)}
                      style={({ pressed }) => ({
                        paddingVertical: 8,
                        paddingHorizontal: 14,
                        borderRadius: radius.button,
                        borderWidth: 1.5,
                        borderColor: selected ? c.card.ink : c.card.line,
                        backgroundColor: selected ? c.card.inverse : c.card.bg,
                        opacity: pressed ? 0.75 : 1,
                      })}
                    >
                      <Text
                        style={{
                          fontFamily: selected ? font.bold : font.medium,
                          color: selected ? c.card.onInverse : c.card.ink,
                          fontSize: fs(13),
                        }}
                      >
                        {k.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <TextInput
                multiline
                numberOfLines={4}
                value={message}
                onChangeText={setMessage}
                placeholder={currentPlaceholder}
                placeholderTextColor={c.card.ink3}
                style={{
                  borderWidth: 1,
                  borderColor: c.card.line,
                  borderRadius: radius.tile,
                  padding: 14,
                  fontSize: fs(14),
                  fontFamily: font.medium,
                  color: c.card.ink,
                  backgroundColor: c.card.bg,
                  minHeight: 100,
                  textAlignVertical: 'top',
                }}
              />
            </View>

            {errorMsg && (
              <Text style={{ fontFamily: font.medium, color: '#DC2626', fontSize: fs(13) }}>{errorMsg}</Text>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 4 }}>
              <Pressable
                accessibilityRole="button"
                onPress={handleClose}
                disabled={submitting}
                style={({ pressed }) => ({
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderRadius: radius.button,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Text style={{ fontFamily: font.bold, color: c.card.ink3, fontSize: fs(14) }}>
                  {t('common.cancel', 'Not now')}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={handleSubmit}
                disabled={submitting || !message.trim()}
                style={({ pressed }) => ({
                  backgroundColor: submitting || !message.trim() ? c.card.line : c.card.inverse,
                  paddingVertical: 10,
                  paddingHorizontal: 22,
                  borderRadius: radius.button,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                {submitting && <ActivityIndicator color={c.card.onInverse} size="small" />}
                <Text
                  style={{
                    fontFamily: font.bold,
                    color: submitting || !message.trim() ? c.card.ink3 : c.card.onInverse,
                    fontSize: fs(14),
                  }}
                >
                  {submitting ? t('feedback.sending', 'Sending…') : t('feedback.send', 'Send it')}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </Sheet>
  );
}

