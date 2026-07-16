# Domain Models & Data Schema

This page documents the core domain entities, their relationships, and how they're represented in Firestore and TypeScript.

---

## Overview

The **CISA Campus Work Tracker** models a faith-based team's outreach and discipleship work. The core entities are:

- **Users** — team members with roles (Admin, Manager, Operator, Viewer)
- **Contacts** — people being reached or discipled (their stage in the pipeline, interactions, prayers)
- **Prayers** — corporate (team-wide) or personal (user-owned) prayer records
- **Events** — gatherings (Weekly meetings, Small Groups, etc.) with attendance tracking
- **Tasks** — team-assigned or personal to-dos
- **Activities** — audit log of every meaningful action (contact creation, prayer updates, etc.)
- **Feedback** — user-submitted notes for the team to review
- **Notifications** — personal or broadcast messages
- **Board Docs** — coordination pages (Markdown with live collaboration)

See `packages/core/src/types.ts` for TypeScript interfaces.

---

## Type Hierarchy

### User
```typescript
export interface User {
  uid: string;                    // Firebase Auth UID
  email: string;                  // Email address
  displayName: string;            // Full name
  photoURL?: string;              // Avatar URL
  role: 'admin' | 'manager' | 'operator' | 'viewer';
  approved: boolean;              // Full-timers set this; self-registrations default to false
  
  // Metadata
  createdAt?: string;
  updatedAt?: string;
}
```

**Roles** (hierarchy: admin > manager > operator > viewer):
- **Admin**: Full access, user management, team settings
- **Manager**: Team lead; manage contacts, events, feedback, roles
- **Operator**: Hands-on staff; add contacts, log interactions, create tasks/prayers
- **Viewer**: Guest/community; read-only access to shared data, can RSVP and submit feedback

See `packages/core/src/permissions.ts` for role predicates and navigation gates.

### Contact
```typescript
export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;                  // Unverified plain text
  location: string;
  stage: string;                  // Pipeline stage ID (e.g., "interested", "growing", "rooted")
  role: string;                   // Optional: their relationship to team
  tags?: string[];                // Custom labels (e.g., "Club Rush", "Spring '26")
  
  // Spiritual/Personal
  spiritualBackground?: string;   // e.g., "Christian", "Exploring", "Other"
  pronouns?: string;
  year?: string;                  // Year in school
  major?: string;
  interests?: string[];
  prayerRequest?: string;
  
  // Photo & Social
  avatar?: string;                // Photo URL
  instagram?: string;
  howHeard?: string;              // How they found the team
  
  // Metadata
  lastSeen: string;               // ISO date of last interaction or touch
  notes?: string;
  createdAt?: string;
  createdBy?: string;
  createdByName?: string;
  updatedAt?: string;
  updatedBy?: string;
  updatedByName?: string;
  
  // Walking-together
  reviewed?: boolean;             // Has their full-timer reviewed them?
  
  // Computed
  initials: string;               // Derived: first letters of name
  hasNewActivity?: boolean;       // For unread badges
}
```

**Pipeline Stages**: Team-customizable (created in `stages` collection); default includes "Interested", "Growing", "Rooted", etc.

**Last Seen**: Updated when:
- A new interaction is logged on this contact
- The contact is edited
- In the future: when a message is sent to the contact

### Stage
```typescript
export interface Stage {
  id: string;
  label: string;                  // e.g., "Interested"
  color: string;                  // Hex color for UI
  order: number;                  // Sort order in pipeline
}
```

### Prayer
```typescript
export interface Prayer {
  id: string;
  title: string;
  description?: string;
  contactId?: string;             // If tied to a person
  priorty?: 'low' | 'medium' | 'high';
  
  // Status
  status: 'pending' | 'active' | 'answered' | 'archived';
  answered?: boolean;
  answeredAt?: string;            // ISO date when marked answered
  answer?: string;                // Testimony/notes on the answer
  
  // Holds (who's praying for this)
  holds?: Record<string, boolean>;// Map of { [uid]: true } for people holding it
  
  // Metadata
  createdAt?: string;
  createdBy?: string;
  createdByName?: string;
  updatedAt?: string;
}
```

**Corporate vs. Personal**:
- **Corporate prayers**: Stored in `prayers/{id}`, visible to the team, managers manage status
- **Personal prayers**: Stored in `users/{uid}/personalPrayers/{id}`, private to the user, no holds/status

**Answered Archive**: Prayers marked `answered: true` surface on the `/answered` page with their testimonies.

### Event (Gathering)
```typescript
export interface Event {
  id: string;
  name: string;
  gatheringTypeId: string;        // Reference to gatheringTypes/{id}
  date: string;                   // ISO date
  location: string;
  time?: string;                  // HH:mm format
  recurrence?: 'weekly' | 'biweekly' | null;
  
  // Metadata
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
}
```

**Gathering Types**: Team-managed (created in `gatheringTypes` collection); default includes "Weekly", "Small Group", "Conference", etc. Renaming a type remaps all past gatherings.

**Attendance**: Recorded in `events/{eventId}/attendance/{uid}` as:
```typescript
{ status: 'present' | 'late' | 'absent' }
```

**RSVP**: Recorded in `events/{eventId}/rsvps/{uid}` as:
```typescript
{ status: 'going' | 'not-going' | 'maybe' }
```

### Task
```typescript
export interface Task {
  id: string;
  title: string;
  dueDate?: string | null;        // ISO date (optional)
  priority: 'low' | 'medium' | 'high';
  status?: 'pending' | 'completed' | 'canceled';
  
  // Assignment
  assigneeId?: string | null;     // If team-assigned; null = personal task
  assigneeEmail?: string | null;
  createdById?: string | null;    // Who assigned/created it
  createdByName?: string | null;  // Surfaces as "from {name}"
  
  // Context
  contactId?: string | null;      // If tied to a contact
  contactName?: string | null;
  sourceInteractionId?: string | null;  // Logged from an interaction
  sourceDocId?: string | null;    // Logged from a Board page
  sourceDocTitle?: string | null;
  
  // Metadata
  createdAt?: unknown;            // Date task was created
}
```

**Two types**:
- **Team tasks**: Assigned by a manager to an operator; read-only on My Day until completed
- **Personal tasks**: User-owned; fully editable; never shared

### Activity (System Log)
```typescript
export interface Activity {
  id: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  action: string;                 // e.g., "added contact", "logged moment", "answered prayer"
  targetId: string;
  targetName: string;
  targetType: 'contact' | 'event' | 'comment' | 'interaction' | 'prayer';
  type: 'call' | 'email' | 'event' | 'alert' | 'edit' | 'create' | 'comment';
  description?: string;
  createdAt: string;              // ISO timestamp
}
```

**Created by**: Every meaningful write (contact add, prayer update, attendance mark, moment log, etc.) logs an activity.

**Visibility**: Readable by approved users; filtered by role/team on the History page.

**Example**:
```
userId: "ft-001"
userName: "Sarah"
action: "added contact"
targetId: "contact-123"
targetName: "John"
targetType: "contact"
type: "create"
createdAt: "2025-01-15T10:30:00Z"
```

### Feedback
```typescript
export interface Feedback {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  type: string;                   // e.g., "enhancement", "bug", "question"
  kind: string;                   // e.g., "thought", "idea", "issue", "request"
  message: string;
  status: 'new' | 'reviewed' | 'addressed' | 'archived';
  archived: boolean;
  
  // Screenshots & context
  screenshot?: string;            // Base64-encoded image (web only)
  url?: string;                   // Page where feedback was submitted
  userAgent?: string;
  viewport?: string;
  
  // GitHub integration
  githubIssueUrl?: string;        // Auto-created issue URL
  
  // Metadata
  createdAt: string;
  updatedAt?: string;
}
```

**Submission**: Any signed-in user can submit. Server auto-creates a GitHub issue if `GITHUB_TOKEN` is configured.

**Review**: Admin/manager can cycle status, archive, delete, or link to an external issue.

### Notification
```typescript
export interface Notification {
  id: string;
  
  // Recipient
  userId?: string;                // If personal notification
  scope: 'personal' | 'broadcast';// Personal = to one user; broadcast = ALL_ADMINS
  
  // Content
  kind: 'nudge' | 'alert' | 'comment' | 'question';
  title: string;
  message: string;
  actionUrl?: string;             // Link to jump to (e.g., contact detail)
  
  // Status
  read: boolean;
  readAt?: string;
  readBy?: Record<string, string>;// For broadcast: { [uid]: ISO timestamp }
  dismissedBy?: Record<string, string>;  // For broadcast: { [uid]: ISO timestamp }
  
  // Metadata
  createdAt: string;
}
```

**Two streams**:
- **Personal**: Direct to one user (e.g., "Someone added a contact you're walking with")
- **Broadcast**: Sent to `ALL_ADMINS` custom claim; any admin can set aside for themselves

### Board Doc (Coordination Notes)
```typescript
export interface BoardDoc {
  id: string;
  title: string;
  content: string;                // Markdown + embedded Y.js edits
  audience: 'team' | 'trainees' | 'everyone';  // Who can see it
  
  // Metadata
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}
```

**Audience**:
- **team** (managers only): Internal strategy, sensitive decisions
- **trainees** (trainees+): Team updates, guidance
- **everyone** (public): Global announcements, team calendar

**Live collaboration**: Uses Yjs + RTDB for cursor positions and conflict-free edits.

### User Preferences
```typescript
export interface UserPreferences {
  uid: string;
  selectedContactIds?: string[];  // "Your contacts" on My Day (picker)
  theme?: 'light' | 'dark' | 'system';
  inboxReadState?: Record<string, boolean>;  // Per-item read status
}
```

**Local storage** on the client for instant preference updates; Firestore for persistence.

### Season
```typescript
export interface Season {
  season: 'spring' | 'summer' | 'fall' | 'winter';
  year: number;
  clubRushActive: boolean;        // Are we in Club Rush intake mode?
}
```

Stored in `settings/season`. Auto-derived from today's date; team can override. Surfaces as "Spring '26" in the UI.

### Invitation
```typescript
export interface Invitation {
  email: string;                  // Document ID
  role: 'manager' | 'operator' | 'viewer';
  createdAt: string;
  createdBy: string;
  approved: boolean;              // False until user accepts signup
}
```

Sent by a manager; user signs up with matching email/role; auto-deletes after acceptance.

---

## Firestore Collection Hierarchy

```
firestore
├── users/{uid}
│   ├── personalPrayers/{prayerId}
│   ├── threads/{threadId}        [DEPRECATED: moving to contacts/{id}/threads]
│   └── [other subcollections]
│
├── contacts/{contactId}
│   ├── threads/{threadId}        # Walking-together messages
│   └── [future: interactions as subcollection]
│
├── prayers/{prayerId}            # Corporate prayers
│   ├── holds/{uid}               # Who's holding it
│   └── [comments when implemented]
│
├── events/{eventId}              # Gatherings
│   ├── rsvps/{uid}
│   └── attendance/{uid}
│
├── tasks/{taskId}
├── feedback/{feedbackId}
├── activities/{activityId}
├── notifications/{userId}/{notificationId}
├── boardDocs/{docId}
├── boardNotes/{noteId}           # Archive records
├── boardDocsRtdb/ [in RTDB]       # Live collaboration state
├── gatheringTypes/{typeId}
├── stages/{stageId}
├── invitations/{email}
├── userPreferences/{uid}
└── settings/{docId}              # Team-wide config (season, etc.)
```

---

## Firestore Indexes

**Composite indexes** (auto-created or manually added):

| Collection | Fields | Purpose |
|-----------|--------|---------|
| `activities` | `targetId`, `createdAt` | Contact Activity tab timeline |
| `prayers` | `status`, `createdAt` | Prayer dashboard filter |
| `contacts` | `stage`, `lastSeen` | Directory filtering + sorting |
| `tasks` | `assigneeId`, `dueDate` | My Day task list |
| `events` | `date` (descending) | Attendance filtering |

Add these manually in Firestore Console if queries fail with "missing index" errors.

---

## Real-Time Database (RTDB)

Used **only** for Board document live collaboration:

```
boardDocsRtdb/{docId}/
├── edits/         # Y.js transaction log (binary)
└── awareness/     # Cursor positions + user presence
```

See `src/lib/yjsRtdbProvider.ts` for the Yjs provider implementation.

---

## Data Flow & Mutation Patterns

### Create a Contact
1. Web/mobile calls `addContact(db, contactData)`
2. Data layer writes to `contacts/{id}` in Firestore
3. Firestore rules validate shape and role
4. Activity logged: `activities/{id}` with action="added contact"
5. If added by trainee: notification sent to their full-timer
6. `lastSeen` timestamp auto-set to `now()`

### Mark Prayer as Answered
1. User clicks "Mark Answered" on prayer card
2. Calls `updatePrayerStatus(db, prayerId, { answered: true, answer: userTestimony })`
3. Firestore writes: `prayers/{prayerId}` with `status: 'answered'`, `answer`, `answeredAt`
4. Activity logged with action="answered prayer"
5. Self-notification sent: "You answered a prayer"
6. Prayer surfaces on `/answered` page

### Log an Attendance Mark
1. Operator taps attendance roster: present → late → absent → present
2. Calls `cycleAttendanceStatus(db, eventId, contactId, currentStatus)`
3. Firestore writes/updates: `events/{eventId}/attendance/{uid}`
4. Activity logged: action="updated attendance for {event name} to {status} for {contact name}"
5. Event "who we've missed" list updates in real-time

---

## Common Queries (Firestore)

| Use Case | Query | Notes |
|----------|-------|-------|
| Load My Day | `contacts` (all, subscribed) + `prayers` (status-filtered) | Real-time listeners |
| Directory search | `contacts` (all, then client-side filter) | Full scan; consider pagination |
| Prayer holds | `prayers/{id}/holds` (exists check) | Count = number holding |
| Event RSVPs | `events/{id}/rsvps` | All RSVP statuses for one event |
| User's personal prayers | `users/{uid}/personalPrayers` | Scoped to owner only |
| Activity timeline | `activities` ordered by `createdAt` desc | Contact-specific filter done client-side |
| Team notifications | `notifications/{uid}` (personal) | Broadcast read via custom claim |

---

## Validation & Constraints

### In Firestore Rules
- **User email**: String, size ≤ 128, email format
- **Contact name**: Non-empty string
- **Prayer title**: Non-empty string
- **Task priority**: One of `['low', 'medium', 'high']`
- **Event date**: ISO date format
- **Role**: One of `['admin', 'manager', 'operator', 'viewer']`
- **Attendance status**: One of `['present', 'late', 'absent']`

### In TypeScript (client-side)
- **Phone number**: Formatted on blur; validated regex
- **Email**: Basic validation before submit
- **Dates**: Parsed and formatted via `date-fns`

---

## Platform-Specific Storage

| Data | Web | Mobile | Sync |
|------|-----|--------|------|
| User auth token | Cookies + localStorage | AsyncStorage | Firebase refreshes |
| User preferences (theme, contacts) | localStorage | AsyncStorage | Synced to Firestore |
| Inbox read state | localStorage | AsyncStorage | Best-effort; Firestore is source of truth |
| Real-time subscriptions | Browser tabs share Firestore SDK | Expo app has single instance | N/A |

---

## Data Migration & Versioning

See `MIGRATION.md` for the full schema evolution history. Recent changes:

- **Legacy doc normalization** (Phase 2): Personal prayers migrated from root to `users/{uid}/personalPrayers`
- **Walking-together threads**: Moved from user's threads to `contacts/{id}/threads` (in progress)
- **Board audience**: Added in Phase 2; retrofitted to existing docs with default `'team'`
- **Season & Club Rush**: Added in Phase 2; stored in `settings/season`

---

## Next Steps

- See **[Architecture](/openwiki/architecture.md)** for system design
- See **[Workflows](/openwiki/workflows.md)** for how users interact with these models
- See **[Firebase Setup](/openwiki/firebase-setup.md)** for security rules and indexes
