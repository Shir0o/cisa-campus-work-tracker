# Operations & Deployment Guide

Complete reference for deploying, monitoring, and operating CISA Campus Work Tracker.

---

## Deployment Environments

### Development
- **Web**: `npm run dev` on http://localhost:5173
- **Mobile**: `npx expo start` (Metro bundler)
- **Backend**: Express server at localhost:3000
- **Database**: Firestore emulator (localhost:8080) or live project
- **Real-time DB**: Firebase RTDB emulator or live

### Production
- **Web & backend**: Google Cloud Run (Docker container)
- **Mobile**: Apple App Store + Google Play Store (via Expo EAS Build)
- **Database**: Live Firestore (`sac-campus-hub` project, database `ai-studio-43298cca-4d70-4c5d-bada-c10ab66ab897`)
- **Real-time DB**: Live Firebase RTDB (same project)
- **Backups**: Daily Firestore snapshots (30-day retention, managed by GCP)

---

## Web App Deployment (GCP Cloud Run)

### Prerequisites
- Google Cloud SDK installed and authenticated: `gcloud auth login`
- Project ID set: `gcloud config set project sac-campus-hub`
- Docker installed locally (Cloud Build will upload to Artifact Registry)

### One-Command Deploy

```bash
cd /path/to/repo

# Build the Docker image and deploy to Cloud Run
gcloud run deploy campus-hub \
  --source . \
  --platform managed \
  --region us-west2 \
  --allow-unauthenticated \
  --port 3000
```

**What this does**:
1. Builds Docker image from `Dockerfile` (Node + Vite + Express)
2. Uploads to Artifact Registry
3. Deploys to Cloud Run (serverless container)
4. Routes traffic to port 3000
5. Returns a public HTTPS URL (e.g., `https://campus-hub-xyz123-uw.a.run.app`)

### Secrets & Environment Variables

After deployment, add credentials in Cloud Run console:

1. Go to [Cloud Run Dashboard](https://console.cloud.google.com/run)
2. Click service **`campus-hub`** → **Edit & Deploy New Revision**
3. Under **Variables & Secrets** tab, add:

| Variable | Value | Notes |
|----------|-------|-------|
| `FIREBASE_PROJECT_ID` | `sac-campus-hub` | Firestore project ID |
| `GEMINI_API_KEY` | (from Google Cloud) | API key for AI features |
| `GROUPME_BOT_ID` | (from GroupMe) | GroupMe bot ID |
| `GROUPME_ACC_TOKEN` | (from GroupMe) | GroupMe account token |
| `TWILIO_ACCOUNT_SID` | (from Twilio) | Twilio SID |
| `TWILIO_AUTH_TOKEN` | (from Twilio) | Twilio auth token |

4. Click **Deploy**

### Post-Deployment Checklist

- [ ] Public URL is accessible (check in browser)
- [ ] Firebase Auth configured for domain (add to authorized origins in Firebase Console)
- [ ] Firestore rules are deployed (check console or CI logs)
- [ ] RTDB rules deployed (check `database.rules.json`)
- [ ] Webhook integrations updated with new public URL:
  - GroupMe: `/api/webhook/groupme`
  - Twilio: `/api/webhook/sms`
- [ ] Monitor logs: `gcloud run logs read campus-hub --limit 50`

### Rollback

If deployment breaks:

```bash
# List previous revisions
gcloud run revisions list --service campus-hub

# Rollback to previous revision
gcloud run deploy campus-hub \
  --revision <previous-revision-id> \
  --traffic <previous-revision-id>=100
```

### Cost Optimization

Cloud Run is **serverless** (scales to zero):
- **Pricing**: Pay per request + memory-seconds
- **Typical cost**: ~$5-20/month for low-traffic team app
- **Scaling**: Automatically scales from 0 → thousands of instances
- **Idle**: No cost when not in use

---

## Mobile App Distribution

### Expo EAS Build (Managed)

Expo handles code signing, provisioning profiles, and distribution.

#### Prerequisites
- Expo account (free tier OK for development)
- Apple Developer account (for iOS)
- Google Play Developer account (for Android)
- `eas-cli` installed: `npm install -g eas-cli`

#### Build & Submit iOS

```bash
cd apps/mobile

# Build for iOS (requires Apple Dev account + valid signing cert)
eas build --platform ios

# Follow prompts:
# - Credentials: Let EAS manage them
# - Build type: Choose "release" for App Store
# - Plan: Free tier OK for testing

# Submit to App Store when build completes
eas submit --platform ios
```

#### Build & Submit Android

```bash
# Build for Android
eas build --platform android

# Submit to Play Store when build completes
eas submit --platform android
```

#### Build & Test Web

```bash
# Expo web build (testing in browser)
eas build --platform web

# Or faster: test locally via Metro
npx expo start --web
```

### OTA Updates (Code Push)

Use `expo-updates` to push code changes without full app rebuild:

```bash
# After code changes:
eas update --branch production --message "Fixed login bug"

# Users will see update prompt on next app launch
# Auto-downloaded + applied on next restart
```

**Caveat**: Native modules (Firebase SDK, etc.) still require full rebuild via EAS.

---

## Firestore Management

### Database Info
- **Project**: `sac-campus-hub`
- **Database**: `ai-studio-43298cca-4d70-4c5d-bada-c10ab66ab897`
- **Region**: `nam5` (North America)
- **Console**: [Firestore Dashboard](https://console.cloud.google.com/firestore)

### Backup Strategy

**Automated daily backups** are enabled (GCP managed):
- **Schedule**: Every day at 2:00 AM UTC
- **Retention**: 30 days
- **Location**: Google Cloud Storage (automatic)
- **Restore**: Contact GCP support or use Firebase CLI

#### Manual Backup

```bash
# Export Firestore to Cloud Storage
gcloud firestore export gs://bucket-name/export-$(date +%s)

# Import later
gcloud firestore import gs://bucket-name/export-1234567890
```

### Rules Deployment

Firestore rules are auto-deployed via CI when merged to main:

```bash
# Or deploy manually
firebase deploy --only firestore:rules

# Verify rules deployed
firebase firestore:indexes:list
```

### Index Management

Composite indexes are defined in `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "activities",
      "fields": [
        { "fieldPath": "targetId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

Deploy indexes:
```bash
firebase deploy --only firestore:indexes
```

Firestore will auto-create missing indexes for slow queries (watch emulator logs).

---

## Real-time Database (Board Collaboration)

### Database
- **Path**: `/boardDocsRtdb/{docId}/`
- **Rules**: `database.rules.json`
- **Used for**: Yjs transaction log + awareness (live cursors)

### Rules Deployment

```bash
firebase deploy --only database
```

Verify rules deployed: `firebase database:instances list`

### Monitoring Concurrent Users

RTDB has per-database connection limits (~200K concurrent). Monitor via:
- Firebase Console → Realtime Database → Data
- Cloud Monitoring → Firebase → Real-time Database metrics

---

## Monitoring & Observability

### Logs

#### Web/Backend Logs (Cloud Run)
```bash
# Stream live logs
gcloud run logs read campus-hub --follow

# Limit to last 50 entries
gcloud run logs read campus-hub --limit 50

# Filter by severity
gcloud run logs read campus-hub --filter "severity=ERROR"
```

#### Firestore Logs
```bash
# View Firestore logs
gcloud logging read "resource.type=cloud_firestore_database" --limit 50

# View rules evaluation
gcloud logging read "protoPayload.methodName=google.firestore.v1.Firestore.Write" --limit 50
```

### Metrics

Use Cloud Monitoring dashboard:

1. Go to [Cloud Monitoring](https://console.cloud.google.com/monitoring)
2. Create custom dashboard with metrics:
   - **Cloud Run**: Request count, latency, error rate
   - **Firestore**: Read/write ops, data size, storage
   - **RTDB**: Connections, bandwidth

### Alerting

Set up alerts for:
- **Cloud Run error rate > 5%**: Alert to team Slack
- **Firestore read spike > 10K ops/min**: Investigate query
- **RTDB connection warnings**: May indicate bot/crawler activity

---

## Security Checklist

### Before Going Live
- [ ] Firebase Auth: Email/password configured
- [ ] Firestore rules deployed (not in dev mode)
- [ ] RTDB rules deployed
- [ ] API endpoints require ID token (server validates)
- [ ] Firestore indexes created (no slow queries warning)
- [ ] Cloud Run service not world-writable (IAM roles)
- [ ] Secrets stored in Cloud Run Variables, not in code
- [ ] Webhook integrations verify signatures (Twilio, etc.)
- [ ] CORS configured if needed (should be same-origin)

### Ongoing
- [ ] Review Firestore rules monthly
- [ ] Check IAM roles (least privilege)
- [ ] Monitor API usage (quotas)
- [ ] Update dependencies (`npm audit fix`)
- [ ] Test backups (restore to test project quarterly)

---

## Disaster Recovery

### Scenarios & Responses

#### Scenario: Production database corrupted
1. **Immediate**: Disable app writes (maintenance page)
2. **Restore**: `gcloud firestore import <backup-path>`
3. **Verify**: Query test data in restored database
4. **Cutover**: Switch to restored database (update project config)
5. **Communicate**: Notify team of data loss window

#### Scenario: Firestore rules too restrictive
1. **Temporary**: Relax rules to open access
2. **Debug**: Check user role + rules logic
3. **Fix**: Update rules in code + deploy
4. **Tighten**: Restore proper restrictions

#### Scenario: API endpoints under attack
1. **Immediate**: Enable rate limiting in Cloud Run
2. **Block**: Add attacker IP to Cloud Armor (network policy)
3. **Investigate**: Check logs for pattern
4. **Mitigate**: Add CAPTCHA or API key requirement

#### Scenario: Mobile app crash on production
1. **Immediate**: Push OTA update if code issue (via `eas update`)
2. **Notify**: Users see "update available" prompt
3. **Fallback**: If unfixable, submit new build to App Store (24-48hr review)

---

## Maintenance & Upgrades

### Regular Maintenance

**Weekly**:
- Check logs for errors
- Verify backup jobs ran

**Monthly**:
- Review Firestore rules for unused collections
- Check for unused indexes (drop old ones)
- Update npm dependencies (`npm audit fix`)

**Quarterly**:
- Test disaster recovery (restore to staging database)
- Review IAM roles
- Audit API usage patterns

### Dependency Updates

```bash
# Check for updates
npm outdated

# Update to latest (respects semver)
npm update

# Update major versions (breaking)
npm install <package>@latest

# Audit for vulnerabilities
npm audit fix
```

### Database Migrations

For schema changes (new collection, field rename, etc.):

1. **Test locally** with emulator
2. **Update Firestore rules** (if adding new collection)
3. **Deploy rules** (via CI or `firebase deploy --only firestore:rules`)
4. **Update client code** (app code + @cisa/core types)
5. **Run data migration** if needed (one-time script via Admin SDK)

Example migration:
```typescript
// migration.ts (one-time script)
import admin from 'firebase-admin';

const db = admin.firestore();

async function migrateContactToNewSchema() {
  const batch = db.batch();
  const contacts = await db.collection('contacts').get();

  contacts.docs.forEach((doc) => {
    batch.update(doc.ref, {
      // Rename field
      spiritualBackground: doc.get('belief') || null,
      // Add new field
      mentorId: doc.get('fullTimerId') || null,
    });
  });

  await batch.commit();
  console.log('Migration complete');
}

migrateContactToNewSchema();
```

Run: `npx ts-node migration.ts` (only once!)

---

## Troubleshooting Production Issues

### App won't load (blank screen)
1. Check Cloud Run logs: `gcloud run logs read campus-hub --limit 10`
2. Check browser console for JS errors
3. Verify Firebase config (API key, project ID)
4. Verify Firestore rules allow reads

### Firestore rules blocking writes
1. Check error message: "permission-denied" → rule denied
2. Verify user role: Firebase Console → users/{uid}
3. Check rules logic: Compare rule with user's role + data
4. Test in emulator first before deploying

### Mobile app won't connect to backend
1. Verify API URL is correct (Cloud Run public URL)
2. Check Firebase auth token is valid
3. Verify backend server is running
4. Check network connectivity (WiFi, VPN)

### OTA update stuck
1. Clear app cache: Settings → Apps → Clear Cache
2. Force update: Delete app, reinstall from store
3. Check `expo-updates` config in `app.json`

### High Cloud Run costs
1. Check Cloud Run dashboard for traffic spikes
2. Optimize slow queries (add indexes)
3. Reduce Firestore listener count (unsubscribe when not needed)
4. Set memory to 256MB (default 512MB, may be over-provisioned)

---

## External Integration Setup

### GroupMe Webhooks

1. Go to [GroupMe Admin](https://app.groupme.com/bots)
2. Add bot to group, name it "CISA Tracker"
3. Webhook URL: `https://<campus-hub-url>/api/webhook/groupme`
4. Copy **Bot ID** and **Access Token** to Cloud Run environment
5. Test: Send message to bot (should relay to SMS users)

### Twilio SMS

1. Go to [Twilio Console](https://www.twilio.com/console)
2. Configure phone number webhook:
   - **URL**: `https://<campus-hub-url>/api/webhook/sms`
   - **Method**: POST
3. Copy **Account SID** and **Auth Token** to Cloud Run environment
4. Test: Send SMS to Twilio number (should relay to GroupMe)

### Google Sheets Sync

1. Create service account in Google Cloud Console
2. Download JSON key file
3. Share target Google Sheet with service account email
4. Store key in Cloud Run (via Secret Manager)
5. Reference in `server.ts` for Sheets API calls

---

## Performance Tuning

### Firestore

**Optimize queries**:
- Add composite indexes for multi-field queries
- Avoid inequality filters (scan all docs)
- Use collection group queries sparingly (more expensive)

**Reduce reads**:
- Cache queries in client (localStorage, IndexedDB)
- Unsubscribe from listeners when not needed
- Batch writes to reduce doc count

### Cloud Run

**Tune resource allocation**:
- Memory: 256MB (default is 512MB, often over-provisioned)
- CPU: Shared (default, fine for most cases)
- Concurrency: 80 (default, increase if high traffic)

```bash
gcloud run deploy campus-hub \
  --memory 256M \
  --cpu 1 \
  --concurrency 100 \
  --region us-west2
```

### Mobile App

**Reduce bundle size**:
- Remove unused dependencies (`npm prune`)
- Use dynamic imports for large components
- Tree-shake unused code (Expo does this automatically)

**Improve performance**:
- Lazy-load screens (don't load all at once)
- Cache Firestore data locally (via `localStorage` or `AsyncStorage`)
- Debounce/throttle expensive operations

---

## Runbooks (Step-by-Step)

### Runbook: Deploy New Code to Production

```
1. Merge PR to main (CI runs tests)
2. Wait for CI to pass (green checkmark)
3. Verify no new errors in Cloud Run logs
4. Done! (auto-deployed via main branch hook)

OR manually:
1. gcloud run deploy campus-hub --source .
2. Verify public URL works
3. Check logs for errors
```

### Runbook: Fix Urgent Bug in Production

```
1. Create hotfix branch from main: git checkout -b hotfix/urgent-bug
2. Fix bug + update CHANGELOG.md
3. Commit: git commit -m "Hotfix: [description]"
4. Create PR: Merge hotfix back to main
5. CI runs + deploys
6. Verify fix in production
7. Delete hotfix branch
```

### Runbook: Emergency Rollback

```
1. Identify broken commit in git log
2. Find previous known-good revision: gcloud run revisions list --service campus-hub
3. Rollback: gcloud run deploy campus-hub --revision <good-revision-id> --traffic <good-revision-id>=100
4. Verify public URL works
5. Investigate issue + prepare fix
6. Deploy fixed code
```

### Runbook: Add New Team Member

```
1. Mobile: N/A (pre-built app)
2. Web: Have new member sign up via `/signup`
3. Dashboard: Go to Settings → Members
4. Find new member in "Pending approvals"
5. Click "Approve" (sets role = viewer, approved = true)
6. Send welcome email with link to web app
7. New member can now log in
```

---

## See Also

- [GCLOUD_DEPLOYMENT.md](../GCLOUD_DEPLOYMENT.md) — Detailed GCP setup
- [HYBRID_DEPLOYMENT.md](../HYBRID_DEPLOYMENT.md) — Alternative deployment methods
- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Expo EAS Documentation](https://docs.expo.dev/eas/)
- [Firebase Documentation](https://firebase.google.com/docs)
