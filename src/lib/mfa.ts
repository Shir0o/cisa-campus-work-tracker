import {
  Auth,
  User,
  MultiFactorResolver,
  MultiFactorError,
  getMultiFactorResolver,
  multiFactor,
  TotpMultiFactorGenerator,
} from 'firebase/auth';

/**
 * TOTP multi-factor helpers, shared by the web app and (mirrored) mobile app.
 *
 * Firebase TOTP MFA is intentionally NOT exercised by the Auth emulator — the
 * emulator only supports SMS MFA — so every function here is either pure or a
 * thin wrapper over the firebase/auth API, keeping the flow unit-testable with
 * a mocked module. The factor choice (TOTP over SMS) is an ADR'd decision:
 * TOTP works identically on web and React Native with the JS SDK, is free, and
 * needs no reCAPTCHA (which would otherwise fight the same-origin __/auth proxy).
 */

export const MFA_REQUIRED_CODE = 'auth/multi-factor-auth-required';
export const TOTP_FACTOR_ID = 'totp';
export const MFA_APP_NAME = 'CISA Campus Work Tracker';

export interface MfaFactorInfo {
  uid: string;
  factorId: string;
  displayName: string | null;
  enrollmentTime: string | null;
}

export interface PendingMfaChallenge {
  resolver: MultiFactorResolver;
  hints: MfaFactorInfo[];
}

export function isMultiFactorRequired(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === MFA_REQUIRED_CODE
  );
}

export function factorInfoFromMultiFactor(
  info: { uid: string; factorId: string; displayName?: string | null; enrollmentTime?: string | null },
): MfaFactorInfo {
  return {
    uid: info.uid,
    factorId: info.factorId,
    displayName: info.displayName ?? null,
    enrollmentTime: info.enrollmentTime ?? null,
  };
}

export function extractMfaChallenge(auth: Auth, error: unknown): PendingMfaChallenge | null {
  if (!isMultiFactorRequired(error)) return null;
  const resolver = getMultiFactorResolver(auth, error as MultiFactorError);
  return { resolver, hints: resolver.hints.map(factorInfoFromMultiFactor) };
}

export function listEnrolledFactors(user: User): MfaFactorInfo[] {
  try {
    return multiFactor(user).enrolledFactors.map(factorInfoFromMultiFactor);
  } catch {
    // `multiFactor()` needs a fully-real Auth User; a stale/partial reference
    // (or a test double) is not one, so treat it as having no enrolled factors.
    return [];
  }
}

export function hasTotpFactor(user: User): boolean {
  return listEnrolledFactors(user).some((f) => f.factorId === TOTP_FACTOR_ID);
}

export async function resolveTotpSignIn(
  resolver: MultiFactorResolver,
  factorUid: string,
  otp: string,
) {
  const assertion = TotpMultiFactorGenerator.assertionForSignIn(factorUid, otp);
  return resolver.resolveSignIn(assertion);
}

export interface TotpEnrollment {
  secretKey: string;
  qrCodeUrl: string;
  /** Commits enrollment with the one-time code the user reads off their authenticator. */
  enroll: (otp: string) => Promise<void>;
}

export async function startTotpEnrollment(user: User, displayName: string): Promise<TotpEnrollment> {
  const mfUser = multiFactor(user);
  const session = await mfUser.getSession();
  const secret = await TotpMultiFactorGenerator.generateSecret(session);
  const qrCodeUrl = secret.generateQrCodeUrl(user.email ?? user.uid, MFA_APP_NAME);
  return {
    secretKey: secret.secretKey,
    qrCodeUrl,
    enroll: async (otp: string) => {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, otp);
      await mfUser.enroll(assertion, displayName);
    },
  };
}

export async function unenrollTotpFactor(user: User, factorUid: string): Promise<void> {
  await multiFactor(user).unenroll(factorUid);
}

export function completedSecondFactor(token: { signInSecondFactor?: string | null } | null): boolean {
  return token?.signInSecondFactor === TOTP_FACTOR_ID;
}