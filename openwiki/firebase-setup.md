# Firebase Setup & Deployment

This guide covers Firestore security rules, authentication, collections, and deployment.

---

## Overview

**CISA Campus Work Tracker** uses Firebase as its backend:

- **Firestore**: Main database (users, contacts, prayers, events, etc.)
- **Realtime Database (RTDB)**: Board document live collaboration (Yjs provider)
- **Firebase Auth**: Email/password authentication
- **Cloud Storage** (optional): Photo uploads
- **Cloud Functions**: Serverless API routes (bundled into Express on Cloud Run)

---

## Firestore Configuration

### Creating a Firestore Project

1. **Go to Firebase Console**: https://console.firebase.google.com/
2. **Create a new project** or select existing
3. **Enable Firestore**:
   - Click "Firestore Database"
   - Start in "Production mode" (secure by default)
   - Select region (us-central1 recommended for US-based teams)
4. **Enable Authentication**:
   - Click "Authentication"
   - Enable "Email/Password" provider
5. **Copy configuration**:
   - Project settings → General → Web apps
   - Copy `firebaseConfig` object

### Environment Setup

```bash
# Copy template
cp .env.example .env

# Fill in Firebase credentials
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_PROJECT_ID=campus-hub
VITE_FIREBASE_AUTH_DOMAIN=campus-hub.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://campus-hub.firebasedatabase.app

# For server-side operations (admin SDK)
# Download service account key from Firebase Console → Project Settings
# and place in firebase-applet-config.json (NOT in git)
```

### Local Firestore Emulator

**Install** (via Firebase CLI):
```bash
npm install -g firebase-tools
firebase init emulators
```

**Start**:
```bash
firebase emulator:start --only firestore,auth
```

**Connect in dev**:
```bash
# .env (dev only)
FIRESTORE_EMULATOR_HOST=localhost:8080
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
```

**UI**: http://localhost:4000 (browse data)

---

## Firestore Collections & Schema

### Users Collection

```
users/{uid}
├── uid (string) — Firebase Auth UID
├── email (string)
├── displayName (string)
├── photoURL (string, optional)
├── role (string) — 'admin' | 'manager' | 'operator' | 'viewer'
├── approved (boolean)
├── createdAt (timestamp)
├── updatedAt (timestamp)
└── Subcollections:
    ├── personalPrayers/{prayerId}
    │   ├── title (string)
    │   ├── status (string)
    │   ├── description (string)
    │   └── [prayer fields]
    └── [other user-scoped collections]
```

### Contacts Collection

```
contacts/{contactId}
├── name (string)
├── email (string)
├── phone (string)
├── location (string)
├── stage (string) — Reference to stages/{stageId}
├── tags (array) — e.g., ["Fall '26", "Club Rush"]
├── spiritualBackground (string, optional)
├── lastSeen (timestamp)
├── createdBy (string) — uid of creator
├── createdAt (timestamp)
└── threads/{threadId}  [Walking-together messages]
    ├── messages/{messageId}
    │   ├── kind (string) — 'note', 'question', 'comment', 'encouragement', 'nudge'
    │   ├── text (string)
    │   ├── authorId (string)
    │   ├── createdAt (timestamp)
    │   └── reactions (map) — { [uid]: emoji }
    └── [thread metadata]
```

### Prayers Collection

```
prayers/{prayerId}
├── title (string)
├── description (string)
├── contactId (string, optional)
├── status (string) — 'pending' | 'active' | 'answered' | 'archived'
├── answered (boolean)
├── answeredAt (timestamp, optional)
├── answer (string, optional) — Testimony text
├── createdBy (string)
├── createdAt (timestamp)
└── holds/{uid}
    └── true (boolean) — Just a marker
```

### Events Collection

```
events/{eventId}
├── name (string)
├── gatheringTypeId (string)
├── date (timestamp)
├── location (string)
├── time (string, optional) — HH:mm
├── recurrence (string, optional) — 'weekly', 'biweekly'
├── createdBy (string)
├── createdAt (timestamp)
├── rsvps/{uid}
│   └── status (string) — 'going' | 'not-going' | 'maybe'
└── attendance/{uid}
    └── status (string) — 'present' | 'late' | 'absent'
```

### Feedback Collection

```
feedback/{feedbackId}
├── userId (string)
├── userEmail (string)
├── userName (string)
├── type (string) — 'enhancement', 'bug', 'question'
├── kind (string) — 'thought', 'idea', 'issue', 'request'
├── message (string)
├── status (string) — 'new' | 'reviewed' | 'addressed' | 'archived'
├── archived (boolean)
├── screenshot (string, optional) — Base64 image
├── url (string, optional)
├── githubIssueUrl (string, optional)
└── createdAt (timestamp)
```

### Other Collections

| Collection | Purpose | Owner |
|-----------|---------|-------|
| `tasks` | Team & personal to-dos | Created by assignor |
| `activities` | Audit trail | System |
| `notifications/{uid}/{notifId}` | Personal + broadcast | System |
| `stages` | Contact pipeline stages | Team |
| `gatheringTypes` | Managed event kinds | Team |
| `invitations/{email}` | Pending sign-ups | Admin |
| `userPreferences/{uid}` | User settings | User |
| `settings/season` | Team season config | Admin |
| `boardDocs/{docId}` | Coordination notes pages | Creator |
| `boardNotes/{noteId}` | Archived learnings | System |

---

## Security Rules

### Overview

**Principle**: Default deny everything, then explicitly allow safe operations.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 0. Default: Deny all
    match /{document=**} {
      allow read, write: if false;
    }
    
    // 1. Define helper functions
    function isSignedIn() { return request.auth != null; }
    function isApprovedUser() { 
      return isSignedIn() && 
             (getStoredUser().approved == true || isSuperAdmin());
    }
    function hasRole(role) {
      return isSignedIn() && getStoredUser().role == role;
    }
    function isAdmin() { return hasRole('admin') || isSuperAdmin(); }
    function isManager() { return isAdmin() || hasRole('manager'); }
    function isOperator() { return isManager() || hasRole('operator'); }
    function isViewer() { return isOperator() || hasRole('viewer'); }
    function isOwner(userId) { return isSignedIn() && request.auth.uid == userId; }
    
    // 2. Define collections
    match /users/{userId} {
      allow get: if isOwner(userId) || isApprovedUser();
      allow list: if isApprovedUser();
      
      allow create: if isOwner(userId) && [role is viewer, email verified, matches invitation]
      allow update: if isOwner(userId) && [only update displayName, photoURL];
      allow update: if isManager();  // Manager can update any field
      allow delete: if isAdmin();
    }
    
    match /contacts/{contactId} {
      allow read: if isApprovedUser();
      allow create: if isManager() || (isOperator() && emailVerified());
      allow update: if isManager() || isOwner(resource.data.createdBy);
      allow delete: if isManager();
    }
    
    match /prayers/{prayerId} {
      allow read: if isApprovedUser();
      allow create: if isApprovedUser();
      allow update: if isManager() || isOwner(resource.data.createdBy);
      allow delete: if isManager();
      
      match /holds/{userId} {
        allow read: if isApprovedUser();
        allow create, delete: if isOwner(userId);
      }
    }
    
    match /events/{eventId} {
      allow read: if isApprovedUser();
      allow create: if isManager();
      allow update: if isManager();
      allow delete: if isManager();
      
      match /attendance/{userId} {
        allow read: if isApprovedUser();
        allow create, update: if isOperator();
      }
      
      match /rsvps/{userId} {
        allow read: if isApprovedUser();
        allow create, update: if isOwner(userId);
      }
    }
    
    match /feedback/{feedbackId} {
      allow create: if isApprovedUser();
      allow read: if isManager() || isOwner(resource.data.userId);
      allow update, delete: if isManager();
    }
    
    match /notifications/{userId}/{notifId} {
      allow read, write: if isOwner(userId);
    }
  }
}
```

### Key Patterns

#### Role Hierarchy
```javascript
isAdmin() > isManager() > isOperator() > isViewer() > unauthenticated
```

#### Ownership Check
```javascript
allow update: if isOwner(resource.data.createdBy)
```

#### Email Verified Requirement
```javascript
allow create: if emailVerified()
```

#### Field-level Validation
```javascript
allow update: if incoming().diff(existing()).affectedKeys().hasOnly(['displayName', 'photoURL'])
```

### Deployment

**Deploy rules from CLI**:
```bash
firebase deploy --only firestore:rules
```

**View deployed rules**:
```bash
firebase rules:list
```

**Rollback** (if something breaks):
```bash
firebase rules:rollback
```

---

## Realtime Database (RTDB) Setup

### Purpose

Used **only** for Board document live collaboration (Yjs conflict-free edits + cursor tracking).

### Configuration

1. **Create RTDB instance**:
   - Firebase Console → Realtime Database
   - Start in "Locked mode"
   - Copy database URL

2. **Set rules** (`database.rules.json`):
   ```json
   {
     "rules": {
       "boardDocsRtdb": {
         "$docId": {
           "edits": {
             ".read": "root.child('users').child(auth.uid).child('approved').val() == true",
             ".write": "root.child('users').child(auth.uid).child('approved').val() == true"
           },
           "awareness": {
             ".read": true,
             ".write": "auth.uid != null"
           }
         }
       }
     }
   }
   ```

3. **Deployment**:
   ```bash
   firebase deploy --only database
   ```

---

## Authentication Setup

### Email/Password Provider

1. **Firebase Console** → Authentication → Sign-in method
2. **Enable** Email/Password
3. **Configure email templates** (optional):
   - Password reset
   - Email verification (optional)

### Custom Claims (for Admin Role)

Server-side only:
```typescript
// server.ts
await getAdminAuth().setCustomUserClaims(uid, { role: 'admin' })
```

Client-side check:
```typescript
// src/lib/firebase.ts
auth.currentUser?.getIdTokenResult().then(idTokenResult => {
  const role = idTokenResult.claims.role || 'viewer'
})
```

### Session Management

**Token refresh**:
```typescript
// Automatic: Firebase SDK refreshes every 1 hour
// Manual: auth.currentUser.getIdToken(true)
```

**Sign out**:
```typescript
await auth.signOut()
// Clears token, redirects to /login
```

---

## Indexes

### Create Composite Indexes

**Firestore Console** → Firestore Database → Indexes

Or deploy via `firestore.indexes.json`:
```json
{
  "indexes": [
    {
      "collectionGroup": "activities",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "targetId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

**Deploy**:
```bash
firebase deploy --only firestore:indexes
```

### Common Indexes Needed

| Collection | Fields | Purpose |
|-----------|--------|---------|
| `activities` | `targetId`, `createdAt` DESC | Contact activity timeline |
| `prayers` | `status`, `createdAt` DESC | Prayer dashboard |
| `contacts` | `stage`, `lastSeen` DESC | Directory filter + sort |
| `events` | `date` DESC | Attendance list |
| `tasks` | `assigneeId`, `dueDate` ASC | My Day tasks |

---

## Backups & Disaster Recovery

### Auto Backups

**Firestore Console** → Backups & Recovery

1. **Create backup schedule**:
   - Frequency: Daily
   - Retention: 30 days
   - Region: Same as database

2. **Automate via gcloud**:
   ```bash
   gcloud firestore backups schedules create default \
     --database=production \
     --retention=30d \
     --recurrence="FREQ=DAILY"
   ```

### Restore from Backup

```bash
# List backups
gcloud firestore backups list

# Restore specific backup
gcloud firestore restore --backup=projects/PROJECT_ID/locations/LOCATION/backups/BACKUP_ID --database=restoration-test
```

### Data Export (Manual Backup)

```bash
gcloud firestore export gs://your-bucket/exports/backup-$(date +%s)
```

---

## Limits & Quotas

| Resource | Limit | Notes |
|----------|-------|-------|
| Document size | 1 MB | Enforce in rules + app |
| Collection size | ~2.5M docs per shard | Not a hard limit; contact support if needed |
| Read ops/day | 50k free | Billed per read query |
| Write ops/day | 20k free | Billed per write (batch = 1 op) |
| Field value size | 1 MB | Enforce in rules |
| Array size | ~20k elements | Soft limit; use subcollection if larger |
| Subcollection depth | Unlimited | Limit to 10+ levels for practical reasons |
| Query result size | 1 MB | Automatically paginated in rules |

**Monitor usage**:
- Firebase Console → Usage tab
- Set budget alerts in Firebase Console

---

## Troubleshooting

### "permission_denied" on Read

1. **Check user exists**: `users/{uid}` doc exists with `approved: true`
2. **Check rules**: Verify rule allows read for user's role
3. **Check email verified**: Some rules require `emailVerified()`
4. **Test with emulator**:
   ```bash
   npm test -- src/test/firestore.rules.test.ts
   ```

### "permission_denied" on Write

1. **Check role**: Verify user's role in `users/{uid}.role`
2. **Check field validation**: Rules may reject certain fields
3. **Check ownership**: Rule may check `createdBy` or `isOwner`
4. **Check batch size**: Don't batch too many writes; Firestore has limits

### Missing Index Error

1. **Copy index URL** from error message
2. **Follow link** to create index automatically
3. **Or run**: `firebase deploy --only firestore:indexes`
4. **Wait** for index to build (can take minutes)

### Offline/Stale Data

1. **Check network**: Offline persistence is on by default
2. **Clear cache**: `navigator.storage.persisted()` in browser console
3. **Force refresh**: `getDoc({ source: 'server' })`

### Cold Start Slow (especially mobile)

1. **Use `listenToMany`**: Subscribe to fewer collections
2. **Paginate**: Load 50 contacts, not 5000
3. **Index**: Ensure composite indexes exist
4. **Cache**: Use localStorage for non-real-time data

---

## Configuration Best Practices

### Secrets Management

**Never commit**:
- `firebase-applet-config.json` (service account)
- `.env` files with real credentials
- API keys (except public-facing VITE_* vars)

**Use environment variables**:
```bash
# .env (local, gitignored)
VITE_FIREBASE_API_KEY=AIza...
GEMINI_API_KEY=AIza...

# Cloud Run (set in Console)
gcloud run services update campus-hub --set-env-vars GEMINI_API_KEY=AIza...
```

### Multi-Environment Setup

```
campus-hub-dev    (dev Firestore)
campus-hub-staging (staging Firestore)
campus-hub-prod   (production Firestore)
```

Switch via `.env`:
```bash
# .env.development
VITE_FIREBASE_PROJECT_ID=campus-hub-dev

# .env.production
VITE_FIREBASE_PROJECT_ID=campus-hub-prod
```

---

## Next Steps

- See **[Data Models](/openwiki/data-models.md)** for collection schemas
- See **[Architecture](/openwiki/architecture.md)** for system design
- See **[Testing Guide](/openwiki/testing.md)** for rules testing
- Read `firestore.rules` directly in the repository for authoritative rules
