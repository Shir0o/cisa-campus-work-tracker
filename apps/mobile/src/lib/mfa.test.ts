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
} from './mfa';

jest.mock('firebase/auth', () => ({
  getMultiFactorResolver: jest.fn(),
  multiFactor: jest.fn(),
  TotpMultiFactorGenerator: {
    FACTOR_ID: 'totp',
    assertionForSignIn: jest.fn(),
    assertionForEnrollment: jest.fn(),
    generateSecret: jest.fn(),
  },
}));

const mockMultiFactor = multiFactor as jest.Mock;
const mockGetMultiFactorResolver = getMultiFactorResolver as jest.Mock;
const mockAssertionForSignIn = (TotpMultiFactorGenerator.assertionForSignIn as jest.Mock);
const mockAssertionForEnrollment = (TotpMultiFactorGenerator.assertionForEnrollment as jest.Mock);
const mockGenerateSecret = (TotpMultiFactorGenerator.generateSecret as jest.Mock);

const mockSecret = {
  secretKey: 'SECRETKEY123',
  generateQrCodeUrl: jest.fn(),
};

const fakeFactor = (over: Record<string, unknown> = {}) => ({
  uid: 'factor-1',
  factorId: 'totp',
  displayName: 'My phone',
  enrollmentTime: '2026-01-01T00:00:00Z',
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('mfa helpers', () => {
  it('isMultiFactorRequired matches only the multi-factor-required code', () => {
    expect(isMultiFactorRequired({ code: MFA_REQUIRED_CODE })).toBe(true);
    expect(isMultiFactorRequired({ code: 'auth/invalid-credential' })).toBe(false);
    expect(isMultiFactorRequired(null)).toBe(false);
    expect(isMultiFactorRequired('nope')).toBe(false);
  });

  it('factorInfoFromMultiFactor maps with null fallbacks', () => {
    expect(factorInfoFromMultiFactor(fakeFactor())).toEqual({
      uid: 'factor-1',
      factorId: 'totp',
      displayName: 'My phone',
      enrollmentTime: '2026-01-01T00:00:00Z',
    });
    const out = factorInfoFromMultiFactor({ uid: 'u', factorId: 'totp' });
    expect(out.displayName).toBeNull();
    expect(out.enrollmentTime).toBeNull();
  });

  it('extractMfaChallenge returns null for non-MFA errors and builds one for MFA', () => {
    expect(extractMfaChallenge({} as never, { code: 'auth/wrong-password' })).toBeNull();

    const resolver = { hints: [fakeFactor()], resolveSignIn: jest.fn() };
    mockGetMultiFactorResolver.mockReturnValue(resolver);
    const challenge = extractMfaChallenge({} as never, { code: MFA_REQUIRED_CODE });
    expect(challenge?.resolver).toBe(resolver);
    expect(challenge?.hints[0]).toEqual(expect.objectContaining({ uid: 'factor-1', factorId: 'totp' }));
  });

  it('listEnrolledFactors / hasTotpFactor reflect enrolled factors', () => {
    mockMultiFactor.mockReturnValue({ enrolledFactors: [fakeFactor()] });
    expect(listEnrolledFactors({ uid: 'u' } as never)).toHaveLength(1);
    expect(hasTotpFactor({ uid: 'u' } as never)).toBe(true);

    mockMultiFactor.mockReturnValue({ enrolledFactors: [fakeFactor({ factorId: 'phone' })] });
    expect(hasTotpFactor({ uid: 'u' } as never)).toBe(false);
  });

  it('resolveTotpSignIn builds the sign-in assertion and resolves', async () => {
    const assertion = { kind: 'signin' };
    mockAssertionForSignIn.mockReturnValue(assertion);
    const resolveSignIn = jest.fn().mockResolvedValue({ user: { uid: 'u' } });
    const cred = await resolveTotpSignIn({ resolveSignIn } as never, 'factor-1', '123456');
    expect(mockAssertionForSignIn).toHaveBeenCalledWith('factor-1', '123456');
    expect(resolveSignIn).toHaveBeenCalledWith(assertion);
    expect(cred).toEqual({ user: { uid: 'u' } });
  });

  it('startTotpEnrollment produces a QR url and an enroll closure', async () => {
    const mfUser = { getSession: jest.fn().mockResolvedValue({ s: 1 }), enroll: jest.fn().mockResolvedValue(undefined) };
    mockMultiFactor.mockReturnValue(mfUser);
    mockGenerateSecret.mockResolvedValue(mockSecret);
    mockSecret.generateQrCodeUrl.mockReturnValue('otpauth://totp/?secret=x');
    mockAssertionForEnrollment.mockReturnValue({ kind: 'enroll' });

    const enr = await startTotpEnrollment({ uid: 'u', email: 'a@b.c' } as never, 'Full-timer');
    expect(mockSecret.generateQrCodeUrl).toHaveBeenCalledWith('a@b.c', 'CISA Campus Work Tracker');
    expect(enr.secretKey).toBe('SECRETKEY123');

    await enr.enroll('654321');
    expect(mockAssertionForEnrollment).toHaveBeenCalledWith(mockSecret, '654321');
    expect(mfUser.enroll).toHaveBeenCalledWith(expect.anything(), 'Full-timer');
  });

  it('unenrollTotpFactor removes by uid and completedSecondFactor reads the claim', async () => {
    const mfUser = { unenroll: jest.fn().mockResolvedValue(undefined) };
    mockMultiFactor.mockReturnValue(mfUser);
    await unenrollTotpFactor({ uid: 'u' } as never, 'factor-9');
    expect(mfUser.unenroll).toHaveBeenCalledWith('factor-9');

    expect(completedSecondFactor({ signInSecondFactor: 'totp' })).toBe(true);
    expect(completedSecondFactor({ signInSecondFactor: 'phone' })).toBe(false);
    expect(completedSecondFactor(null)).toBe(false);
  });
});