# Core Data Access Layer (`packages/core/src/data`)

## Overview
Platform-agnostic Firebase Firestore and Realtime Database data-access layer providing typed reactive subscriptions, query constraints, atomic batch operations, and mutations across contacts, interactions, todos, prayers, chat rooms, attendance, and settings.

## Interface
- `subscribeContacts(db, options, onNext, onError)`: Reactive subscription to contacts collection with role-based `visibleTo` query constraints (`contacts.ts`)
- `subscribeContact(db, contactId, onNext, onError)`: Live document snapshot listener for a single contact (`contacts.ts`)
- `subscribeTouches(db, options, onNext, onError)`: Merged interaction and comment touch feed with tied-subcollection fan-out for trainees (`contacts.ts`)
- `addContact(db, contactData, currentUser)`: Creates contact document stamped with founders, partner co-creators, and denormalized `visibleTo` access list (`contacts.ts`)
- `updateContact(db, contactId, updates, editor)`: Updates core contact profile fields and timestamps (`contacts.ts`)
- `addContactCollaborator(db, contactId, user)`: Appends user to coCreators and recalculates `visibleTo` (`contacts.ts`)
- `removeContactCollaborator(db, contactId, userId, remover)`: Removes collaborator, drops founder status if applicable, reconciles carer ties, and updates `visibleTo` (`contacts.ts`)
- `setContactCarer(db, contactId, carer, isCarer)`: Adds or removes carer in carers array and syncs `visibleTo` (`contacts.ts`)
- `deleteContact(db, contactId)`: Deletes contact document from Firestore (`contacts.ts`)
- `subscribeInteractions(db, contactId, onNext, onError)`: Subscribes to contact interactions ordered chronologically (`interactions.ts`)
- `addInteraction(db, contactId, interaction)`: Writes interaction to subcollection and updates parent contact activity timestamp (`interactions.ts`)
- `updateInteraction(db, contactId, interactionId, updates)`: Updates interaction text, dateTime, and type (`interactions.ts`)
- `deleteInteraction(db, contactId, interactionId)`: Deletes interaction from contact subcollection (`interactions.ts`)
- `addTodo(db, todo, creator)`: Creates task document with Medium priority and Pending status; emits assignment notification (`todos.ts`)
- `updateTodo(db, todoId, updates)`: Updates task title, due date, or assignee; emits reassignment notification (`todos.ts`)
- `setTodoDone(db, todoId, done)`: Toggles task status between Completed and Pending; emits completion notification (`todos.ts`)
- `deleteTodo(db, todoId)`: Deletes task from tasks collection (`todos.ts`)
- `subscribeAllPrayers(db, onNext, onError)`: Subscribes to all team prayers with legacy schema normalization (`prayers.ts`)
- `subscribeContactPrayers(db, contactId, onNext, onError)`: Subscribes to prayers for a specific contact, newest first (`prayers.ts`)
- `addPrayer(db, prayer, author)`: Adds new prayer burden with explicit `teamPrayer` visibility flag (`prayers.ts`)
- `updatePrayerBurden(db, prayerId, burden)`: Updates prayer burden text and modification metadata (`prayers.ts`)
- `updatePrayerStatus(db, prayerId, status, narrative)`: Sets prayer status (`pending`, `answered`, `unanswered`) and answer narrative (`prayers.ts`)
- `subscribeChatRooms(db, userId, onNext, onError)`: Subscribes to chat rooms where user ID is in memberIds, ordered by recency (`chat.ts`)
- `subscribeRoomMessages(db, roomId, onNext, onError)`: Subscribes to messages within a specific chat room (`chat.ts`)
- `getOrCreateDirectChat(db, currentUserId, otherUserId)`: Retrieves existing 1:1 direct chat room or initializes a new room (`chat.ts`)
- `createGroupChat(db, creatorId, memberIds, name)`: Creates multi-user group chat room with system genesis message (`chat.ts`)
- `createAnnouncementChat(db, creatorId, memberIds, name)`: Creates announcement channel with staff-only top-level posting permissions (`chat.ts`)
- `subscribeBoardDocs(db, userRole, onNext, onError)`: Subscribes to active coordination note pages filtered by role audience tier (`board.ts`)
- `subscribeTrashedBoardDocs(db, onNext, onError)`: Subscribes to soft-deleted coordination note pages (admin-only) (`board.ts`)
- `softDeleteBoardDoc(db, rtdb, docId, deleter)`: Marks board doc as deleted in Firestore and removes RTDB live-collab node (`board.ts`)
- `subscribePartners(db, onNext, onError)`: Subscribes to team-wide gospel partner dated pairings (`partners.ts`)
- `savePartners(db, pairings)`: Updates gospel partner arrangements in `settings/partners` (`partners.ts`)
- `setGatheringAttendance(db, gatheringId, contactId, attended)`: Atomic batch write recording contact attendance on gathering event and mirroring legacy contact attendance (`attendance.ts`)
- `subscribePublishedStudyMeetings(db, onNext, onError)`: Subscribes to published Bible study meetings for public reading (`bibleStudy.ts`)
- `subscribeStudyMeetings(db, onNext, onError)`: Subscribes to all study meetings for staff authoring (`bibleStudy.ts`)
- `subscribeNotifications(db, userId, onNext, onError)`: Merges user personal notifications with `ALL_ADMINS` broadcasts (`notifications.ts`)
- `submitSignUp(db, data)`: Anonymous public registration writing contact with Unassigned stage and season tags (`signup.ts`)

## Invariants
- `contactReadConstraints`: Trainee readers must query with `visibleTo` array-contains `<staffId>` or Firestore security rules reject the list query (`contacts.ts`).
- `addContact`: The founding set (`founders`) is permanently stamped at contact creation based on active gospel partners; founders cannot be added later (`contacts.ts`).
- `removeContactCollaborator`: Only Full-timers (`admin`) may remove a founder (`founders`); non-founders are removable by any collaborator with sharing rights (`contacts.ts`).
- `addPrayer`: `teamPrayer` boolean is strictly required on every write to prevent accidental team disclosure (`prayers.ts`).
- `subscribeBoardDocs`: Roles with no audience permissions (e.g. viewer) bypass querying entirely to avoid invalid empty `where('audience', 'in', [])` Firestore rejections (`board.ts`).
- `submitSignUp`: Public sign-up submissions always initialize with stage `'Unassigned'` to prevent unvetted leads from entering The Journey pipeline prematurely (`signup.ts`).
- `addTodo`: New tasks always default to `priority: 'medium'` and `status: 'pending'` (`todos.ts`).
- `createRoomWithGenesis`: System genesis messages write `senderId: currentUser.uid` to comply with Firestore security rules requiring authenticated sender ID (`chat.ts`).

## Side Effects
- Reads and writes to Firestore collections (`contacts`, `tasks`, `prayers`, `chatRooms`, `board_docs`, `events`, `settings`, `notifications`) (`contacts.ts`, `todos.ts`, `prayers.ts`, `chat.ts`, `board.ts`, `signup.ts`).
- Removes live collaborative editing nodes from Firebase Realtime Database (`board_docs_rtdb/${docId}`) on soft-delete (`board.ts`).
- Dispatches in-app notification callbacks for assignment, completion, and trainee activity alerts (`contacts.ts`, `todos.ts`).
- Executes multi-document atomic batch updates across `events` and `contacts` collections (`attendance.ts`).

## Verification
- Run: `npm --prefix packages/core test`
