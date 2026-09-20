import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import {
  sendEmailVerification,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import { useAuth } from '../../lib/AuthProvider';
import { useV2Theme } from '../../theme/v2';
import { useLanguage } from '../../lib/LanguageProvider';
import {
  listEnrolledFactors,
  hasTotpFactor,
  startTotpEnrollment,
  unenrollTotpFactor,
  type MfaFactorInfo,
  type TotpEnrollment,
} from '../../lib/mfa';

const REQUIRES_RECENT_LOGIN = 'auth/requires-recent-login';

/**
 * Mobile mirror of the web app's Settings > Security section. Enrolls/removes
 * a TOTP authenticator factor. React Native has no popup reauth, so Google
 * users are asked to sign out and back in when a recent sign-in is required;
 * email/password users reauthenticate inline.
 */
export function SecuritySection() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { c, font, radius, fs } = useV2Theme();

  const [factors, setFactors] = useState<MfaFactorInfo[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [otp, setOtp] = useState('');
  const [reauthPassword, setReauthPassword] = useState('');
  const [pendingUnenrollUid, setPendingUnenrollUid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);

  const refresh = () => {
    if (user) setFactors(listEnrolledFactors(user));
  };
  useEffect(refresh, [user]);

  const email = user?.email ?? '';
  const emailVerified = !!user?.emailVerified;
  const isGoogle = !!user?.providerData?.some((p) => p.providerId === 'google.com');
  const secondFactorOn = hasTotpFactor(user as never);

  const reauth = async () => {
    if (!user) return;
    if (isGoogle) {
      // No popup reauth on native. Ask them to cycle the session.
      return false;
    }
    if (!email || !reauthPassword) return false;
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(email, reauthPassword));
      return true;
    } catch {
      setFeedback({ kind: 'error', text: 'Could not confirm your identity. Check your password.' });
      return false;
    }
  };

  const startEnroll = async () => {
    if (!user || !emailVerified) return;
    setBusy(true);
    setFeedback(null);
    try {
      const enr = await startTotpEnrollment(user, 'Authenticator');
      setEnrollment(enr);
      setEnrolling(true);
      setShowSecret(false);
      setOtp('');
    } catch (e: any) {
      if (e?.code === REQUIRES_RECENT_LOGIN) {
        const ok = await reauth();
        if (!ok) {
          setFeedback({
            kind: 'error',
            text: isGoogle
              ? 'Sign out and sign back in, then retry.'
              : 'Re-enter your password to confirm your identity.',
          });
        } else {
          await startEnroll();
        }
      } else {
        setFeedback({ kind: 'error', text: 'Could not start setup. Please try again.' });
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmEnroll = async () => {
    if (!enrollment) return;
    setBusy(true);
    setFeedback(null);
    try {
      await enrollment.enroll(otp.trim());
      setEnrolling(false);
      setEnrollment(null);
      setOtp('');
      refresh();
      setFeedback({ kind: 'ok', text: 'Second factor added.' });
    } catch {
      setFeedback({ kind: 'error', text: 'That code did not work. Check your authenticator app.' });
    } finally {
      setBusy(false);
    }
  };

  const removeFactor = async (uid: string) => {
    if (!user) return;
    setBusy(true);
    setFeedback(null);
    try {
      await unenrollTotpFactor(user, uid);
      refresh();
      setFeedback({ kind: 'ok', text: 'Second factor removed.' });
    } catch (e: any) {
      if (e?.code === REQUIRES_RECENT_LOGIN) {
        const ok = await reauth();
        if (ok) {
          await unenrollTotpFactor(user, uid);
          refresh();
          setFeedback({ kind: 'ok', text: 'Second factor removed.' });
        } else if (!isGoogle) {
          setFeedback({ kind: 'error', text: 'Re-enter your password to confirm your identity.' });
        } else {
          setFeedback({ kind: 'error', text: 'Sign out and sign back in, then retry.' });
        }
      } else {
        setFeedback({ kind: 'error', text: 'Could not remove the second factor.' });
      }
    } finally {
      setBusy(false);
      setPendingUnenrollUid(null);
    }
  };

  const textStyle = {
    fontFamily: font.medium,
    fontSize: fs(14),
    lineHeight: fs(21),
    color: c.card.ink2,
  };

  const inputStyle = {
    borderWidth: 1,
    borderColor: c.card.border,
    borderRadius: radius.chip,
    padding: 12,
    fontSize: fs(15),
    color: c.card.ink,
    backgroundColor: c.card.bg,
  };

  return (
    <View style={{ gap: 16, padding: 16, borderRadius: radius.card, backgroundColor: c.card.bg }}>
      <Text style={{ fontFamily: font.bold, fontSize: fs(17), color: c.card.ink }}>Security</Text>

      <View style={{ gap: 10 }}>
        <Text style={{ fontFamily: font.bold, fontSize: fs(14), color: c.card.ink }}>
          Two-step verification {secondFactorOn ? '· On' : '· Off'}
        </Text>
        <Text style={textStyle}>
          {secondFactorOn
            ? 'Your account is protected with an authenticator app on sign-in.'
            : 'Adding a second factor keeps your account safer if your password leaks.'}
        </Text>
      </View>

      {!emailVerified && (
        <View style={{ gap: 10 }}>
          <Text style={textStyle}>
            Verify your email address before adding a second factor.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={async () => {
              setBusy(true);
              setFeedback(null);
              try {
                await sendEmailVerification(user!);
                setFeedback({ kind: 'ok', text: 'Verification email sent.' });
              } catch {
                setFeedback({ kind: 'error', text: 'Could not send the verification email.' });
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
            style={({ pressed }) => ({
              minHeight: 44,
              borderRadius: radius.chip,
              backgroundColor: c.card.react,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed || busy ? 0.7 : 1,
            })}
          >
            <Text style={{ fontFamily: font.bold, fontSize: fs(13.5), color: c.card.ink }}>
              Verify email
            </Text>
          </Pressable>
        </View>
      )}

      {enrolling && enrollment ? (
        <View style={{ gap: 12 }}>
          <Text style={textStyle}>
            Open your authenticator app (Google Authenticator or similar), add this account using the secret below,
            then enter the 6-digit code.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowSecret((v) => !v)}
            style={{ minHeight: 40, justifyContent: 'center' }}
          >
            <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.card.ink }}>
              {showSecret ? 'Hide secret' : "Can't scan? Enter the secret manually"}
            </Text>
          </Pressable>
          {showSecret && (
            <Text selectable style={{ ...textStyle, fontFamily: 'monospace' }}>
              {enrollment.secretKey}
            </Text>
          )}
          <TextInput
            value={otp}
            onChangeText={(x) => setOtp(x.replace(/\D/g, ''))}
            placeholder="6-digit code"
            keyboardType="number-pad"
            maxLength={6}
            placeholderTextColor={c.card.ink2}
            style={{ ...inputStyle, textAlign: 'center', letterSpacing: 4 }}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              accessibilityRole="button"
              onPress={confirmEnroll}
              disabled={busy || otp.length !== 6}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 48,
                borderRadius: radius.card,
                backgroundColor: c.card.ink,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed || busy || otp.length !== 6 ? 0.6 : 1,
              })}
            >
              <Text style={{ fontFamily: font.bold, fontSize: fs(14), color: c.card.bg }}>
                {busy ? 'Adding…' : 'Add second factor'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setEnrolling(false);
                setEnrollment(null);
                setOtp('');
              }}
              style={({ pressed }) => ({
                minHeight: 48,
                borderRadius: radius.card,
                backgroundColor: c.card.bg,
                borderWidth: 1.5,
                borderColor: c.card.border,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 16,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontFamily: font.bold, fontSize: fs(14), color: c.card.ink }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {factors.length === 0 ? (
            <Text style={textStyle}>No second factor set up yet.</Text>
          ) : (
            factors.map((f) => (
              <View
                key={f.uid}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderWidth: 1,
                  borderColor: c.card.border,
                  borderRadius: radius.chip,
                  padding: 12,
                }}
              >
                <Text style={{ fontFamily: font.medium, fontSize: fs(14), color: c.card.ink }}>
                  Authenticator app
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setPendingUnenrollUid(f.uid);
                    removeFactor(f.uid);
                  }}
                  disabled={busy}
                  style={({ pressed }) => ({
                    minHeight: 40,
                    paddingHorizontal: 12,
                    borderRadius: radius.chip,
                    backgroundColor: c.card.react,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed || busy ? 0.7 : 1,
                  })}
                >
                  <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: '#DC2626' }}>
                    Remove
                  </Text>
                </Pressable>
              </View>
            ))
          )}

          {!isGoogle && pendingUnenrollUid === null && (
            <TextInput
              value={reauthPassword}
              onChangeText={setReauthPassword}
              placeholder="Password (to confirm)"
              secureTextEntry
              placeholderTextColor={c.card.ink2}
              style={inputStyle}
            />
          )}

          {factors.length === 0 && (
            <Pressable
              accessibilityRole="button"
              onPress={startEnroll}
              disabled={busy || !emailVerified}
              style={({ pressed }) => ({
                minHeight: 48,
                borderRadius: radius.card,
                backgroundColor: c.card.ink,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed || busy || !emailVerified ? 0.6 : 1,
              })}
            >
              <Text style={{ fontFamily: font.bold, fontSize: fs(14), color: c.card.bg }}>
                Set up second factor
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {!!feedback && (
        <Text
          style={{
            fontFamily: font.medium,
            fontSize: fs(12.5),
            color: feedback.kind === 'error' ? '#DC2626' : '#16A34A',
          }}
        >
          {feedback.text}
        </Text>
      )}
    </View>
  );
}