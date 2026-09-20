import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getMultiFactorResolver,
  multiFactor,
  TotpMultiFactorGenerator,
} from 'firebase/auth';
import {
  isMultiFactorRequired,
  factorInfoFromMultiFactor,
  extractMfaChallenge,
  listEnrolledFactors,
  hasTotpFactor,
  resolveTotpSignIn,
  startTotpEnrollment,
  unenrollTotpFactor,
  completedSecondFactor,
  MFA_REQUIRED_CODE,
} from '../lib/mfa';

const mocks = vi.hoisted(() => ({
  mockAssertionForSignIn: vi.fn(),
  mockAssertionForEnrollment: vi.fn(),
  mockGenerateSecret: vi.fn(),
  mockResolveSignIn: vi.fn(),
  mockGetSession: vi.fn(),
  mockEnroll: vi.fn(),
  mockUnenroll: vi.fn(),
}));

const {
  mockAssertionForSignIn,
  mockAssertionForEnrollment,
  mockGenerateSecret,
  mockResolveSignIn,
  mockGetSession,
  mockEnroll,
  mockUnenroll,
} = mocks;

vi.mock('firebase/auth', () => ({
  getMultiFactorResolver: vi.fn(),
  multiFactor: vi.fn(),
  TotpMultiFactorGenerator: {
    FACTOR_ID: 'totp',
    assertionForSignIn: mocks.mockAssertionForSignIn,
    assertionForEnrollment: mocks.mockAssertionForEnrollment,
    generateSecret: mocks.mockGenerateSecret,
  },
}));

const mockSecret = {
  secretKey: 'SECRETKEY123',
  generateQrCodeUrl: vi.fn(),
  generateTotpVerificationInfo: vi.fn(),
};

const fakeFactor = (over: Partial<{ uid: string; factorId: string; displayName: string | null; enrollmentTime: string | null }> = {}) => ({
  uid: 'factor-1',
  factorId: 'totp',
  displayName: 'My phone',
  enrollmentTime: '2026-01-01T00:00:00Z',
  ...over,
});

describe('mfa helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isMultiFactorRequired', () => {
    it('returns true for the multi-factor-auth-required code', () => {
      expect(isMultiFactorRequired({ code: MFA_REQUIRED_CODE })).toBe(true);
    });

    it('returns false for other error codes', () => {
      expect(isMultiFactorRequired({ code: 'auth/invalid-credential' })).toBe(false);
    });

    it('returns false for non-errors and null', () => {
      expect(isMultiFactorRequired(null)).toBe(false);
      expect(isMultiFactorRequired('nope')).toBe(false);
      expect(isMultiFactorRequired(undefined)).toBe(false);
    });
  });

  describe('factorInfoFromMultiFactor', () => {
    it('maps a factor to the plain shape with null fallbacks', () => {
      const out = factorInfoFromMultiFactor(fakeFactor());
      expect(out).toEqual({
        uid: 'factor-1',
        factorId: 'totp',
        displayName: 'My phone',
        enrollmentTime: '2026-01-01T00:00:00Z',
      });
    });

    it('defaults missing displayName and enrollmentTime to null', () => {
      const out = factorInfoFromMultiFactor({ uid: 'u', factorId: 'totp' });
      expect(out.displayName).toBeNull();
      expect(out.enrollmentTime).toBeNull();
    });
  });

  describe('extractMfaChallenge', () => {
    it('returns null when the error is not a multi-factor requirement', () => {
      expect(extractMfaChallenge({} as never, { code: 'auth/wrong-password' })).toBeNull();
    });

    it('builds a resolver-backed challenge with mapped hints', () => {
      const resolver = { hints: [fakeFactor(), fakeFactor({ uid: 'factor-2', factorId: 'phone' })], resolveSignIn: mockResolveSignIn };
      (getMultiFactorResolver as any).mockReturnValue(resolver);

      const challenge = extractMfaChallenge({} as never, { code: MFA_REQUIRED_CODE });

      expect(getMultiFactorResolver).toHaveBeenCalled();
      expect(challenge).not.toBeNull();
      expect(challenge!.hints).toEqual([
        expect.objectContaining({ uid: 'factor-1', factorId: 'totp' }),
        expect.objectContaining({ uid: 'factor-2', factorId: 'phone' }),
      ]);
      expect(challenge!.resolver).toBe(resolver);
    });
  });

  describe('listEnrolledFactors / hasTotpFactor', () => {
    it('returns the enrolled factors mapped to plain shape', () => {
      const user = { uid: 'u' };
      (multiFactor as any).mockReturnValue({ enrolledFactors: [fakeFactor(), fakeFactor({ factorId: 'phone' })] });
      const out = listEnrolledFactors(user as never);
      expect(out).toHaveLength(2);
      expect(out[0].factorId).toBe('totp');
    });

    it('hasTotpFactor is true only when a totp factor is enrolled', () => {
      const user = { uid: 'u' };
      (multiFactor as any).mockReturnValue({ enrolledFactors: [fakeFactor()] });
      expect(hasTotpFactor(user as never)).toBe(true);

      (multiFactor as any).mockReturnValue({ enrolledFactors: [fakeFactor({ factorId: 'phone' })] });
      expect(hasTotpFactor(user as never)).toBe(false);
    });
  });

  describe('resolveTotpSignIn', () => {
    it('builds the sign-in assertion for the factor and resolves the sign-in', async () => {
      const assertion = { kind: 'totp-sign-in' };
      mockAssertionForSignIn.mockReturnValue(assertion);
      mockResolveSignIn.mockResolvedValue({ user: { uid: 'signed-in' } });

      const resolver = { resolveSignIn: mockResolveSignIn };
      const cred = await resolveTotpSignIn(resolver as never, 'factor-1', '123456');

      expect(mockAssertionForSignIn).toHaveBeenCalledWith('factor-1', '123456');
      expect(mockResolveSignIn).toHaveBeenCalledWith(assertion);
      expect(cred).toEqual({ user: { uid: 'signed-in' } });
    });
  });

  describe('startTotpEnrollment', () => {
    it('generates a secret, a QR url, and an enroll closure that commits the factor', async () => {
      const user = { uid: 'u', email: 'a@b.c' };
      const mfUser = { getSession: mockGetSession, enroll: mockEnroll };
      (multiFactor as any).mockReturnValue(mfUser);
      mockGetSession.mockResolvedValue({ session: 's' });
      mockGenerateSecret.mockResolvedValue(mockSecret);
      mockSecret.generateQrCodeUrl.mockReturnValue('otpauth://totp/?secret=x');
      const assertion = { kind: 'totp-enroll' };
      mockAssertionForEnrollment.mockReturnValue(assertion);
      mockEnroll.mockResolvedValue(undefined);

      const enrollment = await startTotpEnrollment(user as never, 'Full-timer');
      expect(mfUser.getSession).toHaveBeenCalled();
      expect(mockGenerateSecret).toHaveBeenCalledWith({ session: 's' });
      expect(mockSecret.generateQrCodeUrl).toHaveBeenCalledWith('a@b.c', 'CISA Campus Work Tracker');
      expect(enrollment.secretKey).toBe('SECRETKEY123');
      expect(enrollment.qrCodeUrl).toBe('otpauth://totp/?secret=x');

      await enrollment.enroll('654321');
      expect(mockAssertionForEnrollment).toHaveBeenCalledWith(mockSecret, '654321');
      expect(mfUser.enroll).toHaveBeenCalledWith(assertion, 'Full-timer');
    });
  });

  describe('unenrollTotpFactor', () => {
    it('removes the factor by uid', async () => {
      const mfUser = { unenroll: mockUnenroll };
      (multiFactor as any).mockReturnValue(mfUser);
      mockUnenroll.mockResolvedValue(undefined);
      await unenrollTotpFactor({ uid: 'u' } as never, 'factor-9');
      expect(mfUser.unenroll).toHaveBeenCalledWith('factor-9');
    });
  });

  describe('completedSecondFactor', () => {
    it('is true only when the session completed a totp second factor', () => {
      expect(completedSecondFactor({ signInSecondFactor: 'totp' })).toBe(true);
      expect(completedSecondFactor({ signInSecondFactor: 'phone' })).toBe(false);
      expect(completedSecondFactor({ signInSecondFactor: null })).toBe(false);
      expect(completedSecondFactor(null)).toBe(false);
    });
  });
});