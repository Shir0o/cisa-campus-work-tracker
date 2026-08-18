import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Dimensions } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { Sheet } from '../ui/Sheet';
import { useAuth } from '../../lib/AuthProvider';
import { FEEDBACK_KINDS, kindToType } from '@cisa/core';
import type { FeedbackKind } from '@cisa/core';

interface FeedbackSheetProps {
  visible: boolean;
  onClose: () => void;
  targetRef?: React.RefObject<any>;
}

export function FeedbackSheet({ visible, onClose, targetRef }: FeedbackSheetProps) {
  const { user } = useAuth();
  const [kind, setKind] = useState<FeedbackKind>('thought');
  const [message, setMessage] = useState('');
  const [screenshot, setScreenshot] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (visible && targetRef?.current) {
      setErrorMsg(null);
      setSubmitted(false);
      // Capture background screen before user interacts with sheet
      captureRef(targetRef, {
        format: 'jpg',
        quality: 0.65,
        result: 'base64',
      })
        .then((base64) => {
          if (base64) {
            setScreenshot(`data:image/jpeg;base64,${base64}`);
          }
        })
        .catch((err) => {
          console.warn('Failed to capture screen view shot:', err);
          setScreenshot('');
        });
    } else if (!visible) {
      setScreenshot('');
    }
  }, [visible, targetRef]);

  const handleSubmit = async () => {
    if (!message.trim() || submitting) return;

    setSubmitting(true);
    setErrorMsg(null);

    const type = kindToType(kind);
    const { width, height } = Dimensions.get('window');

    const payload = {
      userId: user?.uid || 'anonymous',
      userEmail: user?.email?.toLowerCase() || 'anonymous',
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

      const response = await fetch('/api/feedback', {
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

  return (
    <Sheet visible={visible} onClose={handleClose}>
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 4 }}>Leave a note</Text>
        <Text style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
          Ideas, friction, appreciation — all welcome.
        </Text>

        {submitted ? (
          <View style={{ alignItems: 'center', paddingVertical: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8 }}>We got your note!</Text>
            <Text style={{ fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 16 }}>
              Thank you for sharing your feedback.
            </Text>
            <Pressable
              onPress={handleClose}
              style={{
                backgroundColor: '#5C17E5',
                paddingVertical: 10,
                paddingHorizontal: 20,
                borderRadius: 20,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Done</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', marginBottom: 8 }}>Kind of note</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {FEEDBACK_KINDS.map((k) => {
                  const selected = kind === k.id;
                  return (
                    <Pressable
                      key={k.id}
                      onPress={() => setKind(k.id)}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: selected ? '#5C17E5' : '#ccc',
                        backgroundColor: selected ? '#5C17E5' : '#fff',
                      }}
                    >
                      <Text style={{ color: selected ? '#fff' : '#333', fontSize: 13, fontWeight: '600' }}>
                        {k.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', marginBottom: 6 }}>Message</Text>
              <TextInput
                multiline
                numberOfLines={4}
                value={message}
                onChangeText={setMessage}
                placeholder="Tell us what's on your mind..."
                style={{
                  borderWidth: 1,
                  borderColor: '#ccc',
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 14,
                  minHeight: 90,
                  textAlignVertical: 'top',
                }}
              />
            </View>

            {errorMsg && (
              <Text style={{ color: '#d32f2f', fontSize: 13 }}>{errorMsg}</Text>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
              <Pressable
                onPress={handleClose}
                disabled={submitting}
                style={{ paddingVertical: 10, paddingHorizontal: 16 }}
              >
                <Text style={{ color: '#666', fontWeight: '600', fontSize: 14 }}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={handleSubmit}
                disabled={submitting || !message.trim()}
                style={{
                  backgroundColor: submitting || !message.trim() ? '#999' : '#5C17E5',
                  paddingVertical: 10,
                  paddingHorizontal: 20,
                  borderRadius: 20,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {submitting && <ActivityIndicator color="#fff" size="small" />}
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>
                  {submitting ? 'Sending…' : 'Send'}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </Sheet>
  );
}
