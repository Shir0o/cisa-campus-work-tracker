# Mobile Development Guide

This guide covers React Native/Expo development, the mobile app architecture, and how it shares code with the web app.

---

## Overview

**CISA Campus Work Tracker** has a native mobile app built with:
- **React Native** (cross-platform UI primitives)
- **Expo** (managed build and development)
- **Expo Router** (file-based routing, like Next.js)
- **React 18.3** (shared logic framework)
- **Shared `@cisa/core` package** (domain logic, types, data layer)

**Target platforms**: iOS, Android, and web (via Expo web).

**Development flow**:
1. Implement platform-agnostic logic in `packages/core` (no Firebase init, no React Native imports)
2. Implement mobile UI in `apps/mobile` (uses React Native primitives)
3. Share data layer from core via dependency injection

---

## Project Structure

```
apps/mobile/
├── app/                          # Expo router (file-based routing)
│   ├── _layout.tsx              # Root layout (auth gate, theme provider)
│   ├── (tabs)/                  # Bottom tab bar routes
│   │   ├── index.tsx            # Home (dispatches by role)
│   │   ├── people.tsx           # Directory
│   │   ├── log.tsx              # Log a moment (deferred)
│   │   ├── journey.tsx          # The Board (deferred)
│   │   └── prayer.tsx           # Prayer tab
│   │   └── more.tsx             # More screen
│   ├── login.tsx                # Auth entry point
│   ├── signup.tsx               # Public welcome form
│   ├── history.tsx              # Activity timeline
│   ├── attendance.tsx           # Gatherings + roster
│   ├── answered.tsx             # Answered prayers
│   ├── feedback.tsx             # Submit feedback
│   ├── feedback-admin.tsx       # Review feedback (admin)
│   ├── notifications.tsx        # Team notifications
│   ├── search.tsx               # Global search
│   └── settings.tsx             # User settings + team mgmt
│
├── src/
│   ├── components/              # React Native UI components
│   │   ├── myday/               # My Day screen components
│   │   ├── prayer/              # Prayer-specific UI
│   │   ├── people/              # Directory UI
│   │   ├── attendance/          # Gathering/roster UI
│   │   ├── history/             # Activity timeline UI
│   │   ├── feedback/            # Feedback UI
│   │   ├── search/              # Search UI
│   │   ├── settings/            # Settings UI
│   │   └── ui/                  # Reusable primitives (Avatar, Button, etc.)
│   │
│   ├── lib/
│   │   ├── firebase.ts          # Firebase SDK initialization
│   │   ├── useMyDayData.ts      # My Day data hook
│   │   ├── useAuthProvider.ts   # Auth context
│   │   ├── data/                # Thin wrappers over packages/core/data/
│   │   │   ├── contacts.ts      # Firestore subscriptions for contacts
│   │   │   ├── prayers.ts       # Firestore subscriptions for prayers
│   │   │   └── ...              # Other data modules
│   │   └── ...                  # Other utilities
│   │
│   └── navigation/              # Navigation helpers (if not using Expo Router)
│
├── package.json                 # Dependencies (React Native, Expo, @cisa/core)
├── SETUP.md                     # Mobile-specific setup guide
├── app.json                     # Expo configuration
├── metro.config.js              # Metro bundler configuration
└── babel.config.js              # Babel configuration
```

---

## Development Setup

### Prerequisites

- **Node.js 18+**
- **npm or yarn**
- **Xcode** (for iOS; optional, can test on web/Android)
- **Android Studio** (for Android; optional)
- **Expo Go app** (for testing on physical device; free from App Store/Play Store)

### Initial Setup

```bash
cd apps/mobile

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env: Add Firebase config matching root .env

# Start Expo dev server
npm start
```

### Running the App

**Web (fastest for development)**:
```bash
npm start
# Press: w
# Opens http://localhost:8081 in browser
```

**iOS Simulator**:
```bash
npm start
# Press: i
# Requires Xcode
```

**Android Emulator**:
```bash
npm start
# Press: a
# Requires Android Studio
```

**Physical Device**:
```bash
npm start
# Scan QR code with Expo Go app (iOS) or built-in camera (Android)
```

### Hot Reload

Changes to `.js`, `.jsx`, `.ts`, `.tsx` files auto-reload in dev (with state preservation).

To force restart: Press `r` in Metro terminal.

---

## Architecture: Shared Core & Mobile-Specific UI

### The Dependency Injection Pattern

**Core** exports platform-agnostic functions:
```typescript
// packages/core/src/data/contacts.ts
export function subscribeContacts(
  db: Firestore,
  onSuccess: (contacts: Contact[]) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'contacts'),
    (snapshot) => onSuccess(snapshot.docs.map(docToContact)),
    onError
  )
}
```

**Mobile** injects its Firestore instance:
```typescript
// apps/mobile/src/lib/data/contacts.ts (thin wrapper)
import { subscribeContacts as coreSubscribe } from '@cisa/core'
import { db } from './firebase'

export function useContactsData() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  
  useEffect(() => {
    const unsub = coreSubscribe(db, setContacts, (err) => {
      setError(err)
      setLoading(false)
    })
    setLoading(false)
    return unsub
  }, [])
  
  return [contacts, loading, error]
}
```

**Screen** uses the hook:
```typescript
// apps/mobile/app/(tabs)/people.tsx
import { useContactsData } from '../lib/data/contacts'
import { filterAndSortDirectory } from '@cisa/core'

export default function PeopleTab() {
  const [contacts, loading, error] = useContactsData()
  const [searchText, setSearchText] = useState('')
  const [selectedStage, setSelectedStage] = useState<string | undefined>()
  
  const filtered = filterAndSortDirectory(contacts, searchText, selectedStage)
  
  return (
    <View>
      <TextInput 
        placeholder="Search..." 
        onChangeText={setSearchText}
      />
      <FlatList
        data={filtered}
        renderItem={({ item }) => <ContactRow contact={item} />}
      />
    </View>
  )
}
```

**Key principle**: 
- Core = pure logic (functions, types, derivations)
- Mobile = UI (components, hooks, navigation)
- No Firebase imports in core; no React Native imports in core

---

## Routing with Expo Router

### File-Based Routing

URLs map to file paths:

| File | URL | Type |
|------|-----|------|
| `app/_layout.tsx` | (root) | Layout (renders nested routes) |
| `app/(tabs)/_layout.tsx` | (root) | Tab navigation layout |
| `app/(tabs)/index.tsx` | `/` | Home screen |
| `app/(tabs)/people.tsx` | `/people` | Directory |
| `app/settings.tsx` | `/settings` | Settings (pushed route) |
| `app/contact/[id].tsx` | `/contact/123` | Dynamic route (contact detail) |

### Layout Nesting

```
app/
├── _layout.tsx              ← Root: AuthProvider, ThemeProvider
│   ├── (tabs)/              ← Tabs layout: BottomTabNavigator
│   │   ├── _layout.tsx
│   │   ├── index.tsx        ← "/" (home)
│   │   ├── people.tsx       ← "/people"
│   │   ├── prayer.tsx       ← "/prayer"
│   │   └── more.tsx         ← "/more"
│   ├── login.tsx            ← "/login"
│   ├── signup.tsx           ← "/signup" (exempt from auth gate)
│   └── history.tsx          ← "/history" (pushed from /more)
```

### Authentication Gate

```typescript
// apps/mobile/app/_layout.tsx
import { useAuthState } from '../src/lib/useAuthState'

export default function RootLayout() {
  const { user, loading } = useAuthState()
  
  if (loading) return <SplashScreen />
  
  if (!user) {
    // Redirect unauthenticated users to /login
    // Exemptions: /signup (public form)
    return <Stack>
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="signup" options={{ headerShown: false }} />
    </Stack>
  }
  
  // User authenticated: show main app
  return <Tabs />
}
```

### Linking & Navigation

```typescript
// Programmatic navigation
import { router } from 'expo-router'

router.push('/settings')
router.push('/contact/123')
router.back()

// URL-based navigation (deep linking)
// https://app.example.com/prayer
// Opens /prayer screen
```

---

## Mobile vs. Web Differences

| Aspect | Web | Mobile |
|--------|-----|--------|
| **Routing** | React Router v7 (code-based) | Expo Router (file-based) |
| **UI Lib** | Custom React + Tailwind | React Native (native primitives) |
| **Icons** | lucide-react | @expo/vector-icons |
| **Navigation** | URL bar + Back button | Tab bar + native back |
| **Storage** | localStorage | AsyncStorage (built-in) |
| **Phone input** | HTML `<input type="tel">` | TextInput with custom format |
| **Screenshots** | html2canvas-pro | N/A (not implemented) |
| **Notifications** | Desktop Notifications API | Expo Push Notifications (deferred) |
| **Address bar** | Users see URL | No address bar (limitations) |
| **Auth** | Google Sign-In option | Email/password only |

### Layout Differences

**My Day (web)**: Desktop-first, complex 2-column layout with sidebar
**My Day (mobile)**: Single-column vertical stack, role-based landing dispatcher

---

## Building for Production

### Using Expo EAS

**Expo EAS** is the managed build service for iOS/Android.

#### Setup

```bash
cd apps/mobile

# Log in to Expo account
npx eas login

# Configure project
npx eas build:configure

# This creates eas.json with build profiles
```

#### Build for iOS

```bash
# Requires Apple Developer account ($99/year)
npx eas build --platform ios

# Output: .ipa file ready for App Store
```

#### Build for Android

```bash
# Requires Google Play Developer account ($25 one-time)
npx eas build --platform android

# Output: APK or AAB (for Play Store)
```

#### Submit to App Stores

```bash
# Automated submission (optional)
npx eas submit --platform ios
npx eas submit --platform android

# Manual submission:
# - App Store Connect (iOS)
# - Google Play Console (Android)
```

### Over-the-Air (OTA) Updates

Update code without resubmitting to app stores:

```bash
# Update app.json: bump version
# "version": "1.0.1"

# Publish OTA update
npx expo publish

# Or use expo-updates (more control)
npx eas update --channel production
```

Users get the update:
- **On app launch** (after existing session ends)
- **Opt-in** (can ignore update prompt)

---

## Testing Mobile

### Unit Tests

Same as web:
```bash
cd apps/mobile
npm test
```

Uses Vitest + React Native Testing Library.

### Manual Testing Checklist

- [ ] Auth: Sign up → Login → Sign out
- [ ] My Day: Load data, verify role-based landing
- [ ] Directory: Search, filter by stage, add contact
- [ ] Prayer: Add, hold, mark answered
- [ ] Attendance: Mark attendance, view "who we've missed"
- [ ] History: View activity, filter by kind/person
- [ ] Settings: Edit profile, view team members (admin only)
- [ ] Offline: Toggle airplane mode, verify UI gracefully shows stale data
- [ ] Themes: Test light/dark mode toggle

### E2E Testing (Playwright)

```bash
npm run test:e2e
```

Runs against Expo web (localhost:8081 by default).

---

## Debugging

### Console Logs

```typescript
console.log('Debug:', value)  // Visible in Metro terminal
console.warn('Warning:', value)
console.error('Error:', value)
```

View in:
- **Metro terminal**: `npm start` output
- **Device**: Shake device → Toggle Remote JS Debugging

### React DevTools

```bash
npm install -D @react-devtools/core

# Then in Metro terminal
# Logs will show "React Native DevTools connected"
```

### Firestore Emulator

```bash
# In separate terminal
firebase emulator:start --only firestore,auth

# Set in .env (mobile)
FIRESTORE_EMULATOR_HOST=localhost:8080
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
```

### Network Debugging

```bash
# Flipper (optional)
npx react-native init --skip-ios --skip-android

# Or use Expo DevTools:
# Shake device → "Show DevTools"
# Tab: "Network"
```

---

## Phase Rollout Strategy

Mobile app was built in phases to ensure feature parity with web:

### Phase 1 (Complete) ✅
- Shared core data layer
- My Day cockpit
- Role-gated navigation
- Basic auth

### Phase 2 (Complete) ✅
- Landing dispatcher (role-based home)
- Quick Add (new contact)
- Prayer tab
- People (Directory) tab
- History (Looking back)
- Answered prayers archive
- Walking-together threads

### Phase 3 (Complete) ✅
- Settings (profile, team management, appearance)
- Global Search (people + history + quick actions)
- Feedback (submit + admin review)
- Notifications (personal + broadcast)
- Sign-up (public form)
- Gatherings/Attendance (with roster)

### Phase 4 (Deferred) ⏸️
- Board (Coordination Notes) — Edit/delete, full feature parity
- Messages/Chat — Separate team communication channel
- Google Sheets export
- Slack integration

### Post-Launch (Future)
- Push notifications
- Photo uploads
- Voice memos
- Offline mode improvements

---

## Common Tasks

### Add a New Screen

1. **Create route file**:
   ```typescript
   // apps/mobile/app/contact/[id].tsx
   import { useLocalSearchParams } from 'expo-router'
   
   export default function ContactDetail() {
     const { id } = useLocalSearchParams<{ id: string }>()
     return <View><Text>Contact: {id}</Text></View>
   }
   ```

2. **Add nav gating** (if restricted):
   ```typescript
   // apps/mobile/app/_layout.tsx
   import { canAccessRoute } from '@cisa/core'
   
   if (!canAccessRoute('contact', userRole)) {
     return null  // Don't render route
   }
   ```

3. **Navigate to it**:
   ```typescript
   router.push(`/contact/${contactId}`)
   ```

### Add a Data Hook

1. **Create wrapper** in `apps/mobile/src/lib/data/`:
   ```typescript
   export function useContactDetail(id: string) {
     const [contact, setContact] = useState<Contact | null>(null)
     const [loading, setLoading] = useState(true)
     const [error, setError] = useState<Error | null>(null)
     
     useEffect(() => {
       const unsub = subscribeContact(db, id, (c) => {
         setContact(c)
         setLoading(false)
       }, setError)
       return unsub
     }, [id])
     
     return { contact, loading, error }
   }
   ```

2. **Use in component**:
   ```typescript
   const { contact, loading, error } = useContactDetail('123')
   ```

### Update Shared Logic

1. **Modify** `packages/core/src/{feature}.ts`
2. **Write tests** in `packages/core/test/`
3. **Both web and mobile** automatically use updated logic
4. **No duplicated code** ✅

---

## Performance Tips

### Optimize FlatList Rendering

```typescript
<FlatList
  data={contacts}
  renderItem={({ item }) => <ContactRow contact={item} />}
  keyExtractor={(item) => item.id}
  maxToRenderPerBatch={20}        // Render in batches
  updateCellsBatchingPeriod={50}  // Batch updates
  removeClippedSubviews={true}    // Hide off-screen items
/>
```

### Lazy Load Images

```typescript
import FastImage from 'react-native-fast-image'

<FastImage
  source={{ uri: contact.avatar }}
  style={{ width: 50, height: 50 }}
  onLoad={() => setLoaded(true)}
/>
```

### Memoize Components

```typescript
import { memo } from 'react'

const ContactRow = memo(({ contact }) => (
  <View>
    <Text>{contact.name}</Text>
  </View>
))

export default ContactRow
```

### Profile Performance

```bash
# Profiler in Expo DevTools (shake → DevTools → Profiler)
# Shows frame rate and render times
```

---

## Troubleshooting

### "Module not found: @cisa/core"

```bash
# Ensure core is installed and symlinked
cd packages/core && npm link
cd apps/mobile && npm link @cisa/core
```

### "Firestore permission denied"

1. Check user role: `users/{uid}.role`
2. Check Firestore emulator (if in dev)
3. Check rules: `firestore.rules`
4. Test with emulator: `npm test -- src/test/firestore.rules.test.ts`

### "Metro bundle error"

```bash
# Clear Metro cache
npx expo start --clear

# Or manually
rm -rf .expo node_modules
npm install
npx expo start
```

### "Build fails with EAS"

```bash
# Check build logs
eas build --platform ios --status

# Full output
eas build --platform ios --verbose
```

---

## Next Steps

- See **[Architecture](/openwiki/architecture.md)** for system design
- See **[Testing Guide](/openwiki/testing.md)** for unit test patterns
- Check `apps/mobile/SETUP.md` for environment setup
- Run `npm start` and press `w` to test locally
