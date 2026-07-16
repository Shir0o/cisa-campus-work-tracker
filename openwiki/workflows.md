# Workflows & Common Tasks

This guide walks through the most common development tasks: adding a feature to both web and mobile, debugging data issues, and handling real-time sync.

---

## Feature: Add a New Domain Concept (Example: "Prayer Holds")

A "prayer hold" is when someone commits to praying for a specific person. This involves:
- **Data model**: Contact → Person holding prayer → Duration
- **UI**: Toggle "I'm holding {person} in prayer" on a contact card
- **Real-time sync**: Show who's holding each person across all team members
- **Firestore rules**: Only approved users can add/remove holds

### Step 1: Define Types in @cisa/core

**File: `packages/core/src/types.ts`**
```typescript
export interface PrayerHold {
  id: string;
  contactId: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  startedAt: string;
  endedAt?: string; // null if ongoing
}
```

**File: `packages/core/src/prayerHolds.ts`** (new file)
```typescript
import { Contact, User } from './types';

// Pure derivation (no Firebase)
export function activePrayerHolds(
  holds: PrayerHold[],
  now: Date = new Date()
): PrayerHold[] {
  return holds.filter(h => !h.endedAt || new Date(h.endedAt) > now);
}

export function holdersForContact(
  contactId: string,
  holds: PrayerHold[]
): PrayerHold[] {
  return holds.filter(h => h.contactId === contactId);
}
```

### Step 2: Add Unit Tests

**File: `packages/core/test/prayerHolds.test.ts`** (new file)
```typescript
import { describe, it, expect } from 'vitest';
import { activePrayerHolds, holdersForContact } from '../src/prayerHolds';
import { PrayerHold } from '../src/types';

describe('Prayer Holds', () => {
  const mockHolds: PrayerHold[] = [
    {
      id: '1',
      contactId: 'c1',
      userId: 'u1',
      userName: 'Alice',
      startedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      endedAt: undefined,
    },
    {
      id: '2',
      contactId: 'c1',
      userId: 'u2',
      userName: 'Bob',
      startedAt: new Date().toISOString(),
      endedAt: new Date(Date.now() - 1000).toISOString(), // Expired
    },
  ];

  it('should only return active holds', () => {
    const active = activePrayerHolds(mockHolds);
    expect(active).toHaveLength(1);
    expect(active[0].userName).toBe('Alice');
  });

  it('should filter holds by contact', () => {
    const holders = holdersForContact('c1', mockHolds);
    expect(holders).toHaveLength(2);
  });
});
```

Run: `cd packages/core && npm test`

### Step 3: Add Firestore Data Layer

**File: `packages/core/src/data/prayerHolds.ts`** (new file)
```typescript
import {
  Firestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { PrayerHold } from '../types';

export function subscribePrayerHolds(
  db: Firestore,
  onSuccess: (holds: PrayerHold[]) => void,
  onError: (error: Error) => void
) {
  const q = query(
    collection(db, 'prayerHolds'),
    where('endedAt', '==', null) // Only active
  );

  return onSnapshot(
    q,
    (snap) => {
      const holds = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
      } as PrayerHold));
      onSuccess(holds);
    },
    onError
  );
}

export async function startPrayerHold(
  db: Firestore,
  contactId: string,
  userId: string,
  userName: string,
  userPhoto?: string
) {
  return addDoc(collection(db, 'prayerHolds'), {
    contactId,
    userId,
    userName,
    userPhoto,
    startedAt: serverTimestamp(),
    endedAt: null,
  });
}

export async function endPrayerHold(db: Firestore, holdId: string) {
  return updateDoc(doc(db, 'prayerHolds', holdId), {
    endedAt: serverTimestamp(),
  });
}
```

### Step 4: Update Firestore Rules

**File: `firestore.rules`** (add to the collection rules section)
```
match /prayerHolds/{holdId} {
  function isValidHold(data) {
    return data.keys().hasAll(['contactId', 'userId', 'userName', 'startedAt']) &&
           data.contactId is string &&
           data.userId is string &&
           data.userName is string;
  }

  allow read: if isApprovedUser();
  
  allow create: if isApprovedUser() && isValidHold(incoming());
  
  allow update: if isOwner(resource.data.userId) && incoming().keys().hasOnly(['endedAt']);
  
  allow delete: if isOwner(resource.data.userId) || isManager();
}
```

Run: `npm test` (includes `firestore.rules.test.ts`)

### Step 5: Web App UI

**File: `src/components/ContactCard.tsx`** (modify existing file)
```typescript
import { usePrayerHolds } from '@/lib/prayerHolds'; // New hook

export function ContactCard({ contact }: { contact: Contact }) {
  const { holds, toggleHold, loading } = usePrayerHolds(contact.id);
  const yourHold = holds.find(h => h.userId === currentUser.uid);

  return (
    <div className="card">
      {/* ... existing card content ... */}
      
      <button
        onClick={() => toggleHold(contact.id)}
        disabled={loading}
        className={yourHold ? 'bg-amber-100' : 'bg-gray-100'}
      >
        {yourHold ? '🙏 Holding' : 'Hold in prayer'}
      </button>

      {/* Show other holders */}
      <div className="text-xs text-gray-500">
        {holds.map(h => h.userName).join(', ')} holding
      </div>
    </div>
  );
}
```

**File: `src/lib/prayerHolds.ts`** (new file - platform-specific wrapper)
```typescript
import { useEffect, useState } from 'react';
import { db } from './firebase';
import {
  subscribePrayerHolds,
  startPrayerHold,
  endPrayerHold,
} from '@cisa/core/src/data/prayerHolds';
import { useAuth } from '@/components/AuthProvider';

export function usePrayerHolds(contactId: string) {
  const [holds, setHolds] = useState([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    return subscribePrayerHolds(
      db,
      (data) => setHolds(data.filter(h => h.contactId === contactId)),
      (error) => console.error('Failed to load holds:', error)
    );
  }, [contactId, user]);

  const toggleHold = async (contactId: string) => {
    if (!user) return;
    setLoading(true);

    try {
      const yourHold = holds.find(h => h.userId === user.uid);
      if (yourHold) {
        await endPrayerHold(db, yourHold.id);
      } else {
        await startPrayerHold(db, contactId, user.uid, user.displayName || 'Unknown');
      }
    } catch (err) {
      console.error('Failed to toggle hold:', err);
    } finally {
      setLoading(false);
    }
  };

  return { holds, toggleHold, loading };
}
```

### Step 6: Mobile App UI

**File: `apps/mobile/src/components/ContactCard.tsx`** (analogous to web)
```typescript
import { usePrayerHolds } from '@cisa/core/src/hooks/usePrayerHolds'; // Reuse?
// OR implement a mobile-specific version:

export function ContactCard({ contact }: { contact: Contact }) {
  const { holds, toggleHold } = usePrayerHolds(contact.id);
  const yourHold = holds.find(h => h.userId === currentUser.uid);

  return (
    <View className="p-4 bg-white rounded">
      {/* ... existing card content ... */}

      <Pressable
        onPress={() => toggleHold(contact.id)}
        style={[
          styles.button,
          yourHold && styles.buttonActive,
        ]}
      >
        <Text>{yourHold ? '🙏 Holding' : 'Hold in prayer'}</Text>
      </Pressable>
    </View>
  );
}
```

**File: `apps/mobile/src/lib/data/prayerHolds.ts`** (mobile-specific data hook)
```typescript
import { useEffect, useState } from 'react';
import { db } from './firebase';
import { subscribePrayerHolds } from '@cisa/core/src/data/prayerHolds';

export function usePrayerHolds(contactId: string) {
  const [holds, setHolds] = useState([]);

  useEffect(() => {
    return subscribePrayerHolds(
      db,
      (data) => setHolds(data.filter(h => h.contactId === contactId)),
      (error) => console.error('Hold subscription failed:', error)
    );
  }, [contactId]);

  // ... toggle logic ...
  
  return { holds, toggleHold };
}
```

### Step 7: Update CHANGELOG.md

**File: `CHANGELOG.md`** (add under `[Unreleased]`)
```
### Added
- **Prayer Holds**: Team members can now commit to holding a person in prayer. Added `/prayerHolds` Firestore collection, web + mobile UI for toggling holds, and a "who's holding" display card. Shared pure logic in `@cisa/core/src/prayerHolds.ts` with full unit test coverage.
```

### Step 8: Test Everything

```bash
# Test shared logic
cd packages/core && npm test

# Test web app
npm test -- ContactCard.test.tsx
npm run lint
npm run typecheck

# Test mobile
cd apps/mobile && npm test

# Manual testing
npm run dev                 # Web
npx expo start              # Mobile
```

---

## Fix: "permission_denied" Error When Creating a Contact

### Symptoms
- User sees a modal to add a contact
- Clicks "Create"
- Toast says "Error: permission_denied"
- Contact wasn't created; no error in browser console

### Diagnosis

**Step 1: Check Firestore rules**
```
firestore.rules contains:
match /contacts/{contactId} {
  allow create: if isOperator();  // <- User must be operator+
}
```

**Step 2: Check user's role**
Go to Firebase Console → Firestore → `users/{uid}` document. Inspect the `role` field.
- If role is `viewer`: Cannot create contacts (only `operator` can)
- If user doc doesn't exist: Not approved yet

**Step 3: Verify app has the right user context**
```typescript
// In browser console:
const user = await auth.currentUser;
console.log(user.uid);

// Then check Firestore:
// Go to users/{uid} and inspect { role, approved }
```

### Solution

**Option A: Upgrade the user's role**
1. Open Firebase Console
2. Navigate to `users/{uid}`
3. Change `role` from `viewer` to `operator`
4. Refresh browser; try again

**Option B: Verify permissions logic in code**
If the user *should* have access, check:
1. Is the Firestore rule correct? (Should it check `isApprovedUser()` instead of `isOperator()`?)
2. Is the role stored correctly in the user doc?
3. Did the rule deployment succeed? (Check CI logs or re-run `npm run test` which includes rules tests)

**Option C: Add defensive error handling in UI**
```typescript
try {
  await addContact(db, contactData);
} catch (error: any) {
  if (error.code === 'permission-denied') {
    showError('Only team members can add contacts. Please ask an admin to approve your account.');
  } else {
    showError('Failed to create contact: ' + error.message);
  }
}
```

---

## Debug: Real-time Sync Not Working

### Symptoms
- I log a moment (interaction) on my laptop
- A teammate is viewing the same contact on their phone
- The new interaction doesn't appear on their screen until they refresh

### Diagnosis

**Step 1: Check if subscriptions are active**
```typescript
// Web: src/components/ContactDetailsModal.tsx
useEffect(() => {
  console.log('Subscribing to interactions for contact', contactId);
  const unsubscribe = onSnapshot(
    query(collection(db, 'interactions'), where('contactId', '==', contactId)),
    (snap) => {
      console.log('Got snap:', snap.docs.map(d => d.data()));
      setInteractions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    },
    (error) => {
      console.error('Subscription error:', error);
    }
  );
  return unsubscribe;
}, [contactId]);
```

Open DevTools → Console and check:
- Does "Subscribing to interactions for contact" appear?
- Do updates log when you add an interaction from another browser tab?

**Step 2: Check Firestore rules**
```
match /interactions/{interactionId} {
  allow read: if isApprovedUser();  // <- Both users must pass this
}
```

If one user is not approved, they won't see the update. Check both users' role in `users/{uid}`.

**Step 3: Check network tab**
- Open DevTools → Network → WebSocket
- Look for `firestore.googleapis.com` connections
- If you see a broken connection icon, Firestore can't reach the server
- If the connection is open but no messages flow, the subscription might not be sending updates

### Solution

**Option A: Re-check subscription dependencies**
```typescript
// Wrong: subscription never fires again if contactId changes
useEffect(() => {
  return subscribeInteractions(contactId);
}, []); // <- Missing dependency!

// Right: re-subscribe if contactId changes
useEffect(() => {
  return subscribeInteractions(contactId);
}, [contactId]); // <- Include dependency
```

**Option B: Verify Firestore rules allow the read**
```typescript
// In firestore.rules test:
it('should allow approved users to read interactions', () => {
  expect(db.document('interactions/1234')).allowed.read();
});
```

Run: `npm test -- firestore.rules.test.ts`

**Option C: Log the actual data being written**
```typescript
// In server.ts or cloud function handling the interaction:
app.post('/api/log-interaction', async (req, res) => {
  const docRef = await db.collection('interactions').add({
    ...req.body,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log('Wrote interaction:', docRef.id, req.body);
  res.json({ id: docRef.id });
});
```

Check the Express server logs. Did the write succeed?

---

## Extend: Add a New Firestore Collection & Sync to Both Apps

Example: "Announcement" collection (team-wide messages, read-only for non-managers).

### Step 1: Define Firestore Schema

**In `firestore.rules`:**
```
match /announcements/{announcementId} {
  function isValidAnnouncement(data) {
    return data.keys().hasAll(['title', 'body', 'authorId', 'createdAt']) &&
           data.title is string && data.title.size() <= 256 &&
           data.body is string && data.body.size() <= 5000;
  }

  allow read: if isApprovedUser();
  allow create, update, delete: if isManager();
}
```

### Step 2: Create Data Layer (Shared)

**File: `packages/core/src/data/announcements.ts`:**
```typescript
import { Firestore, collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { PrayerHold } from '../types'; // Reuse or define new Announcement type

export interface Announcement {
  id: string;
  title: string;
  body: string;
  authorId: string;
  createdAt: string;
}

export function subscribeAnnouncements(
  db: Firestore,
  onSuccess: (announcements: Announcement[]) => void,
  onError: (error: Error) => void
) {
  const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snap) => {
      const announcements = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
      } as Announcement));
      onSuccess(announcements);
    },
    onError
  );
}
```

### Step 3: Create Web Hook

**File: `src/lib/announcements.ts`:**
```typescript
import { useEffect, useState } from 'react';
import { db } from './firebase';
import { subscribeAnnouncements, Announcement } from '@cisa/core/src/data/announcements';

export function useAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    return subscribeAnnouncements(
      db,
      (data) => {
        setAnnouncements(data);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );
  }, []);

  return { announcements, loading, error };
}
```

### Step 4: Create Mobile Hook

**File: `apps/mobile/src/lib/data/announcements.ts`:**
(Same as web, or even better, just import + re-export from `@cisa/core`!)

### Step 5: Use in Components

**Web: `src/components/AnnouncementBanner.tsx`:**
```typescript
export function AnnouncementBanner() {
  const { announcements } = useAnnouncements();
  const latest = announcements[0];

  if (!latest) return null;

  return (
    <div className="bg-blue-50 p-4 rounded">
      <h3 className="font-bold">{latest.title}</h3>
      <p>{latest.body}</p>
    </div>
  );
}
```

**Mobile: `apps/mobile/src/components/AnnouncementBanner.tsx`:**
```typescript
export function AnnouncementBanner() {
  const { announcements } = useAnnouncements();
  const latest = announcements[0];

  if (!latest) return null;

  return (
    <View className="bg-blue-50 p-4 rounded-lg">
      <Text className="font-bold text-lg">{latest.title}</Text>
      <Text className="text-gray-700">{latest.body}</Text>
    </View>
  );
}
```

Both implementations use the **exact same data subscription logic**!

---

## Refactor: Move Web-Only Logic to @cisa/core

If you find yourself duplicating Firestore hooks across web and mobile, move the pure logic to `@cisa/core/src/data/` and create thin platform-specific wrappers.

### Pattern

**Shared:** `@cisa/core/src/data/myFeature.ts` (injected db handle)
```typescript
export function subscribeMyFeature(db: Firestore, onSuccess, onError) {
  // Pure Firestore SDK calls
}

export async function updateMyFeature(db: Firestore, id: string, data: MyFeatureUpdate) {
  // Pure update logic
}
```

**Web wrapper:** `src/lib/myFeature.ts`
```typescript
export function useMyFeature() {
  const [data, setData] = useState();
  const { db } = useFirebase();
  
  useEffect(() => {
    return subscribeMyFeature(db, setData, handleError);
  }, []);

  return { data };
}
```

**Mobile wrapper:** `apps/mobile/src/lib/data/myFeature.ts`
```typescript
export function useMyFeature() {
  const [data, setData] = useState();
  const db = useFirebaseDb();
  
  useEffect(() => {
    return subscribeMyFeature(db, setData, handleError);
  }, []);

  return { data };
}
```

Or even better: **No mobile wrapper** — both apps import the hook from the shared package!

---

## Best Practices Summary

1. **Always test pure logic first** — Write `@cisa/core` tests before UI
2. **Share what you can** — Move Firestore calls to `@cisa/core/src/data/`
3. **Keep UI thin** — Components should mostly compose shared hooks + render
4. **Update Firestore rules first** — Implement security before writing client code
5. **Add to CHANGELOG** — Write a concise entry describing the feature
6. **Run full test suite** — `npm test` (web + core), `cd packages/core && npm test`, `cd apps/mobile && npm test`
7. **Lint before push** — `npm run lint`, `npm run typecheck`
