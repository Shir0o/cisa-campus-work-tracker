import { vi, describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { signInWithEmailAndPassword, connectAuthEmulator } from 'firebase/auth';
import { connectFirestoreEmulator } from 'firebase/firestore';

// 1. Mock firebase configuration files
vi.mock('../../firebase-applet-config.json', () => ({
  default: {
    apiKey: 'mock-api-key',
    authDomain: 'mock-auth-domain',
    projectId: 'mock-project-id',
    firestoreDatabaseId: 'mock-database-id',
  }
}));

// 2. Define mock objects
const mockAuthUser = {
  uid: 'test-user-uid',
  email: 'test@example.com',
  emailVerified: true,
  isAnonymous: false,
  tenantId: 'test-tenant-id',
  displayName: 'Test User',
  photoURL: 'https://example.com/test.jpg',
  providerData: [
    { providerId: 'google.com', email: 'test@example.com' }
  ]
};

const mockAuth = {
  currentUser: mockAuthUser as any | null,
};

// 3. Mock firebase libraries
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => mockAuth),
  signInWithEmailAndPassword: vi.fn(),
  connectAuthEmulator: vi.fn(),
}));

const mockAddDoc = vi.fn();
const mockSetDoc = vi.fn();
const mockGetDocFromServer = vi.fn();

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  connectFirestoreEmulator: vi.fn(),
  doc: vi.fn((parent, ...paths) => {
    if (parent && typeof parent === 'object' && 'name' in parent) {
      return { path: parent.name + '/' + (paths[0] || 'auto-id') };
    }
    return { path: (paths[0] || '') + '/' + (paths[1] || '') };
  }),
  collection: vi.fn((_db, name) => ({ name })),
  addDoc: (...args: any[]) => mockAddDoc(...args),
  setDoc: (...args: any[]) => mockSetDoc(...args),
  getDocFromServer: (...args: any[]) => mockGetDocFromServer(...args),
  serverTimestamp: vi.fn(() => 'mock-server-timestamp'),
}));

vi.mock('firebase/database', () => ({
  getDatabase: vi.fn(),
}));

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(),
}));

// We will load this dynamically to ensure mocks are set up first
let handleFirestoreError: any;
let logActivity: any;
let sendNotification: any;
let OperationType: any;

beforeAll(async () => {
  const mod = await import('../lib/firebase');
  handleFirestoreError = mod.handleFirestoreError;
  logActivity = mod.logActivity;
  sendNotification = mod.sendNotification;
  OperationType = mod.OperationType;
});

describe('Firebase Service Helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockAuth.currentUser = { ...mockAuthUser };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleFirestoreError', () => {
    it('serializes error details and user auth state correctly', () => {
      const testError = new Error('Permission Denied');
      
      expect(() => {
        handleFirestoreError(testError, OperationType.CREATE, 'contacts/123');
      }).toThrowError(/Permission Denied/);

      expect(console.error).toHaveBeenCalled();
    });

    it('handles non-Error objects in error serialization', () => {
      expect(() => {
        handleFirestoreError('String Error', OperationType.LIST, 'contacts');
      }).toThrowError(/String Error/);
    });

    it('handles null auth user gracefully', () => {
      mockAuth.currentUser = null;
      expect(() => {
        handleFirestoreError(new Error('Auth Error'), OperationType.GET, null);
      }).toThrow();
    });
  });

  describe('logActivity', () => {
    it('adds activity document if user is signed in', async () => {
      const activityPayload = {
        action: 'moved' as const,
        contactId: 'c123',
        contactName: 'John Doe',
        details: 'Moved from New to Contacted',
      };

      mockAddDoc.mockResolvedValueOnce({ id: 'activity-doc-id' });

      await logActivity(activityPayload);

      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'activities' }),
        expect.objectContaining({
          action: 'moved',
          contactId: 'c123',
          contactName: 'John Doe',
          details: 'Moved from New to Contacted',
          userId: 'test-user-uid',
          userName: 'Test User',
          userPhoto: 'https://example.com/test.jpg',
          createdAt: expect.any(String),
        })
      );
    });

    it('falls back to default names and photo URLs if user displayName or photoURL is missing', async () => {
      mockAuth.currentUser = {
        ...mockAuthUser,
        displayName: '',
        photoURL: '',
      } as any;

      mockAddDoc.mockResolvedValueOnce({ id: 'activity-doc-id' });

      await logActivity({
        action: 'created' as const,
        contactId: 'c123',
        contactName: 'John Doe',
      });

      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userName: 'Anonymous',
          userPhoto: '',
        })
      );
    });

    it('returns early and does not log if no current user', async () => {
      mockAuth.currentUser = null;
      await logActivity({
        action: 'created' as const,
        contactId: 'c123',
        contactName: 'John Doe',
      });

      expect(mockAddDoc).not.toHaveBeenCalled();
    });

    it('catches and logs errors gracefully when addDoc fails', async () => {
      mockAddDoc.mockRejectedValueOnce(new Error('Firestore Write Fail'));
      
      await expect(logActivity({
        action: 'created' as const,
        contactId: 'c123',
        contactName: 'John Doe',
      })).resolves.toBeUndefined();

      expect(console.error).toHaveBeenCalledWith('Failed to log activity:', expect.any(Error));
    });
  });

  describe('sendNotification', () => {
    it('sets notification document with correct fields', async () => {
      const notificationPayload = {
        userId: 'test-user-uid',
        title: 'New Contact',
        body: 'A new contact John Doe has been created.',
        type: 'contact_created' as const,
      };

      mockSetDoc.mockResolvedValueOnce(undefined);

      await sendNotification(notificationPayload);

      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: expect.stringMatching(/^notifications\//) }), // matches our mocked doc path
        expect.objectContaining({
          userId: 'test-user-uid',
          title: 'New Contact',
          body: 'A new contact John Doe has been created.',
          type: 'contact_created',
          read: false,
          createdAt: 'mock-server-timestamp',
        })
      );
    });

    it('catches and logs errors gracefully when setDoc fails', async () => {
      mockSetDoc.mockRejectedValueOnce(new Error('Firestore Write Fail'));

      await expect(sendNotification({
        userId: 'test-user-uid',
        title: 'New Contact',
        body: 'A new contact John Doe has been created.',
        type: 'contact_created' as const,
      })).resolves.toBeUndefined();

      expect(console.error).toHaveBeenCalledWith('Failed to send notification:', expect.any(Error));
    });
  });

  describe('module initialization (env-dependent)', () => {
    beforeEach(() => {
      vi.resetModules();
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    it('applies env overrides and wires emulator, e2e sign-in, rtdb, and offline testConnection', async () => {
      vi.stubEnv('VITE_FIREBASE_API_KEY', 'env-api-key');
      vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'env-project-id');
      vi.stubEnv('VITE_FIREBASE_FIRESTORE_DB_ID', 'env-db-id');
      vi.stubEnv('VITE_FIREBASE_DATABASE_URL', 'https://env-rtdb.firebaseio.com');
      vi.stubEnv('VITE_USE_FIREBASE_EMULATOR', 'true');
      vi.stubEnv('VITE_FIREBASE_EMULATOR_HOST', '10.0.0.5');
      vi.stubEnv('VITE_E2E_MODE', 'true');

      mockGetDocFromServer.mockRejectedValue(new Error('the client is offline'));

      const mod = await import('../lib/firebase');

      expect(mod.rtdb).not.toBeNull();
      expect(connectAuthEmulator).toHaveBeenCalledWith(mockAuth, 'http://10.0.0.5:9099', { disableWarnings: true });
      expect(connectFirestoreEmulator).toHaveBeenCalledWith({}, '10.0.0.5', 8080);
      expect(console.error).toHaveBeenCalledWith(
        'Please check your Firebase configuration. Firestore might be offline or project settings misconfigured.'
      );

      expect((window as any).__e2eSignIn).toBeTypeOf('function');
      await (window as any).__e2eSignIn('test@example.com', 'secret');
      expect(signInWithEmailAndPassword).toHaveBeenCalledWith(mockAuth, 'test@example.com', 'secret');
    });
  });
});
